import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

/**
 * Thinking levels a discovered model declares when the endpoint does not
 * describe its own. MiniMax's Anthropic-compatible endpoint names these levels
 * in `output_config.effort`, and the value dispatch sends is the level itself.
 */
const DEFAULT_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

/** Where the last sync result is recorded beside this package. */
const STATUS_PATH = fileURLToPath(new URL('./sync-status.json', import.meta.url))

export const Config = z.object({
  /** Profile entry id of the llm-pi-ai plugin that owns the route. */
  settingsNs: z.string().default('llm-pi-ai'),
  /** Provider route to keep in sync. */
  route: z.string().required(),
  /** Endpoint root that serves the model listing. */
  baseURL: z.string().required(),
  /** Wire protocol the endpoint speaks. */
  api: z.string().default('anthropic-messages'),
  /** Models to serve; empty means every advertised model. */
  include: z.array(z.string()).default([]),
  /** Models to leave out even when the endpoint advertises them. */
  exclude: z.array(z.string()).default([]),
  /** Capacity fallback for a model the endpoint does not size. */
  contextWindow: z.number().default(1000000),
  /** Output-cap fallback for a model the endpoint does not size. */
  maxTokens: z.number().default(128000),
  /** Input modalities for a model the endpoint does not describe. */
  input: z.array(z.union(['text', 'image'])).default(['text', 'image']),
  /** Thinking levels a newly discovered model declares. */
  effortLevels: z.array(z.string()).default(DEFAULT_EFFORT_LEVELS),
  /** Whether a newly discovered model asks for adaptive thinking. */
  adaptiveThinking: z.boolean().default(true),
  /** Minutes a successful sync stays fresh before another model call refreshes it. */
  refreshMinutes: z.number().default(360),
  /** Seconds the boot attempt waits for the owning plugin to mount. */
  retrySeconds: z.number().default(15),
})

export const inject = ['llm', 'settings']

/**
 * Keep one llm-pi-ai provider route's model list equal to what the endpoint
 * advertises.
 *
 * The listing is read through the llm service's model discovery, so the
 * credential, the protocol headers, and the listing URL stay owned by the
 * adapter that serves the models. The result is written back through the
 * settings service, which persists the route's `models` field in the profile
 * patch and applies it through the Loader.
 *
 * A model the profile already declares keeps its own fields — capacity,
 * modalities, thinking levels, and wire switches — so a hand-tuned model
 * survives a refresh that only adds or removes models.
 *
 * The settings write runs inside a profile transaction, so it cannot happen
 * while the profile itself is being reloaded; a hot-installed plugin retries on
 * the next model call instead of waiting for the application to restart.
 */
export function apply(ctx, config) {
  /** Read one configuration field, tolerating both plain and referenced values. */
  const read = (field, fallback) => {
    const value = config?.[field]
    if (value === undefined) return fallback
    const resolved = typeof value?.get === 'function' ? value.get() : value
    return resolved === undefined ? fallback : resolved
  }

  const logger = ctx.logger
  let retired = false
  let running = false
  let lastOkAt = 0
  let lastStatus
  let timer

  const describeError = (error) => (error instanceof Error ? error.message : String(error))

  /** Record the last sync result where a person can read it. */
  const record = async (status) => {
    lastStatus = status
    try {
      await writeFile(STATUS_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...status }, undefined, 2)}\n`)
    } catch (error) {
      logger.warn(`minimax-model-sync: could not write ${STATUS_PATH}: ${describeError(error)}`)
    }
  }

  /** Read the route profile and the settings revision it was read at. */
  const readRoute = () => {
    const settingsNs = read('settingsNs', 'llm-pi-ai')
    const route = read('route')
    const descriptor = ctx.settings.describe().find(row => row.ns === settingsNs)
    if (descriptor === undefined) return { reason: `plugin entry "${settingsNs}" has no editable configuration` }
    const profile = descriptor.value?.providers?.[route]
    if (profile === undefined) return { reason: `route "${route}" is not configured on "${settingsNs}"` }
    return { profile, revision: descriptor.revision }
  }

  /** Build the route's next model list from the advertised models. */
  const merge = (advertised, current) => {
    const include = read('include', [])
    const exclude = new Set(read('exclude', []))
    const wanted = advertised.filter(model => (include.length === 0 || include.includes(model.id)) && !exclude.has(model.id))
    if (wanted.length === 0) return { reason: 'the endpoint advertises no model this route may serve' }
    const previous = new Map(current.map(model => [model.id, model]))
    const effortLevels = read('effortLevels', DEFAULT_EFFORT_LEVELS)
    const adaptiveThinking = read('adaptiveThinking', true)
    const contextWindow = read('contextWindow', 1000000)
    const maxTokens = read('maxTokens', 128000)
    const input = read('input', ['text', 'image'])
    const models = wanted.map(model => {
      const before = previous.get(model.id)
      const efforts = before?.reasoningEfforts ?? Object.fromEntries(effortLevels.map(level => [level, level]))
      const compat = before?.compat ?? (adaptiveThinking ? { forceAdaptiveThinking: true } : undefined)
      return {
        id: model.id,
        name: model.name ?? before?.name ?? model.id,
        contextWindow: before?.contextWindow ?? model.contextWindow ?? contextWindow,
        maxTokens: before?.maxTokens ?? model.maxTokens ?? maxTokens,
        input: before?.input ?? input,
        reasoningEfforts: efforts,
        ...compat === undefined ? {} : { compat },
      }
    })
    return { models }
  }

  /** Compare the advertised models with the route's list and write the result. */
  const sync = async (trigger) => {
    const settingsNs = read('settingsNs', 'llm-pi-ai')
    const route = read('route')
    const baseURL = read('baseURL')
    const api = read('api', 'anthropic-messages')
    if (!route || !baseURL) return { ok: false, trigger, reason: 'route and baseURL are required' }

    let advertised
    try {
      advertised = await ctx.llm.discoverModels(settingsNs, { provider: route, baseURL, api })
    } catch (error) {
      return { ok: false, trigger, stage: 'discover', reason: describeError(error) }
    }
    if (!Array.isArray(advertised) || advertised.length === 0) {
      return { ok: false, trigger, stage: 'discover', reason: 'the endpoint returned no model' }
    }

    const found = readRoute()
    if (found.profile === undefined) return { ok: false, trigger, stage: 'read', reason: found.reason }
    const current = found.profile.models ?? []
    const merged = merge(advertised, current)
    if (merged.models === undefined) {
      return { ok: false, trigger, stage: 'merge', reason: merged.reason, advertised: advertised.map(model => model.id) }
    }
    if (JSON.stringify(merged.models) === JSON.stringify(current)) {
      return { ok: true, trigger, changed: false, models: merged.models.map(model => model.id) }
    }
    try {
      await ctx.settings.mutate(
        settingsNs,
        [{ op: 'set', path: ['providers', route, 'models'], value: merged.models }],
        found.revision,
      )
    } catch (error) {
      return { ok: false, trigger, stage: 'write', reason: describeError(error), advertised: advertised.map(model => model.id) }
    }
    return { ok: true, trigger, changed: true, models: merged.models.map(model => model.id) }
  }

  /** Run one sync, recording its outcome instead of throwing. */
  const attempt = async (trigger) => {
    if (retired || running) return undefined
    running = true
    let outcome
    try {
      outcome = await sync(trigger)
    } catch (error) {
      outcome = { ok: false, trigger, stage: 'sync', reason: describeError(error) }
    } finally {
      running = false
    }
    await record(outcome)
    if (outcome.ok) {
      lastOkAt = Date.now()
      logger.info(`minimax-model-sync: route "${read('route')}" serves ${outcome.models.join(', ')}`)
    } else {
      logger.warn(`minimax-model-sync: ${outcome.stage ?? 'sync'} failed (${trigger}): ${outcome.reason}`)
    }
    return outcome
  }

  /** Whether a model call should refresh the list. */
  const stale = () => Date.now() - lastOkAt >= read('refreshMinutes', 360) * 60_000

  /**
   * Refresh when the model layer is used. A model call runs outside the profile
   * transaction, which is what a configuration write needs.
   */
  const onStream = () => {
    if (retired || running || !stale()) return
    void attempt('model-call').catch(error => logger.warn(`minimax-model-sync: ${describeError(error)}`))
  }

  /** Run the boot attempt, retrying while the owning plugin is still mounting. */
  const boot = async () => {
    const retrySeconds = Math.max(2, read('retrySeconds', 15))
    for (let tries = 0; tries < 10 && !retired; tries++) {
      const outcome = await attempt('boot')
      if (outcome === undefined || outcome.ok) return
      if (/cannot be nested/u.test(outcome.reason ?? '')) {
        logger.info('minimax-model-sync: the profile is reloading; the list refreshes on the next model call')
        return
      }
      if (outcome.stage === 'discover' && /not (configured|registered)|no editable configuration/u.test(outcome.reason ?? '')) {
        await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000))
        continue
      }
      return
    }
  }

  ctx.on('llm/stream', (_options, next) => {
    onStream()
    return next()
  })

  ctx.effect(() => () => {
    retired = true
    if (timer !== undefined) clearTimeout(timer)
  }, 'minimax-model-sync')

  void boot()
    .catch(error => logger.warn(`minimax-model-sync: ${describeError(error)}`))
    .finally(() => {
      const minutes = read('refreshMinutes', 360)
      if (retired || minutes <= 0) return
      timer = setTimeout(() => {
        void attempt('timer').catch(error => logger.warn(`minimax-model-sync: ${describeError(error)}`))
      }, minutes * 60_000)
      timer.unref?.()
    })
}
