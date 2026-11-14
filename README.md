> **This repository has moved into one monorepo.**
>
> The whole MiniMax set — the credit proxy, the daily check-in, the model-list
> sync, the composer quota chip, the MiniMax Code bridge, and the shared grant
> reader — now lives in
> **[`borncode-app/dsh-minimax-kit`](https://github.com/borncode-app/dsh-minimax-kit)**,
> one repository with one Plugins entry.
>
> | this repo | new home |
> |---|---|
> | `dsh-minimax-auth` | `packages/dsh-minimax-auth` |
> | `dsh-minimax-credit` | `packages/dsh-minimax-credit` |
> | `dsh-minimax-checkin` | `packages/dsh-minimax-checkin` |
> | `dsh-minimax-model-sync` | `packages/dsh-minimax-model-sync` |
> | `dsh-minimax-bridge` | `packages/dsh-minimax-bridge` |
> | `dsh-model-quota` | `packages/dsh-model-quota` |
>
> The code and its history are unchanged; only the repository is shared. Install
> `dsh-minimax-kit` instead of the individual bundles. This repository stays
> open so the old links keep working.
<div align="center">
  <img src="icon.svg" alt="" width="72" height="72">
  <h1>dsh-minimax-model-sync</h1>
  <p><b>Keeps a provider route's model list in sync with the provider's own models endpoint.</b></p>
  <p>
    <a href="https://github.com/borncode-app/dsh-minimax-model-sync/releases"><img alt="release" src="https://img.shields.io/github/v/release/borncode-app/dsh-minimax-model-sync?style=flat-square&color=6C4BF6"></a>
    <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-3DA639?style=flat-square"></a>
    <img alt="plugin" src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-6C4BF6?style=flat-square">
    <img alt="row" src="https://img.shields.io/badge/targets-llm--pi--ai-8957e5?style=flat-square">
  </p>
</div>

---

## Where the one-entry kit lives

This plugin, `dsh-minimax-credit`, `dsh-minimax-checkin`, `dsh-model-quota` and
`dsh-minimax-bridge` are also published as one bundle:
**[`dsh-minimax-kit`](https://github.com/borncode-app/dsh-minimax-kit)**.

Install the kit instead if you want the whole MiniMax set from a single
**Plugins** entry. It ships these same packages as separate rows, so the code
here is unchanged and each part keeps its own switch â€” this repository stays
the home of the model-list sync.

## What it does

An `llm-pi-ai` route carries a hand-written list of models. Providers retire and launch models without warning,
so that list drifts: a model disappears and the picker offers a dead route, or a new one exists and you never see it.

This plugin reads the provider's own models endpoint and **rewrites the route's model list** to match â€” with an
explicit `exclude` list for models the endpoint still advertises but you never want.

It is one small row, no UI, no background polling storm: it syncs at boot and then on a slow interval.

## Features

- **Endpoint-driven** â€” Anthropic-compatible roots list at `{baseURL}/v1/models`, OpenAI-compatible at `{baseURL}/models`; both are supported.
- **Reaches into the right entry** â€” `settingsNs` + `route` say exactly which profile entry and provider are rewritten.
- **Exclude list** â€” keeps retired families (the MiniMax M2 line, for example) out even though the endpoint still lists them.
- **Slow refresh** â€” `refreshMinutes: 360` by default; `0` syncs only at start.
- **Status file** â€” `sync-status.json` records the last run: when, why, whether anything changed, and the resulting models.
- **No credentials of its own** â€” it reuses whatever the route already uses.

## Requirements

| | |
|---|---|
| DeepSeek Harness | 0.2.x |
| Runtime | Node 24, supplied by the Harness runtime |
| A route | An existing `llm-pi-ai` provider entry with an API key already configured |

## Install

```bash
git clone https://github.com/borncode-app/dsh-minimax-model-sync.git dsh-minimax-model-sync
```

Then:

```
plugin_manager install_bundle target=C:\path\to\dsh-minimax-model-sync
```

Restart once. The first sync runs at boot; check `sync-status.json` to see what it found.

## Configuration

| field | default | meaning |
|---|---|---|
| `settingsNs` | `llm-pi-ai` | The profile entry whose provider route is kept in sync |
| `route` | `minimax-api` | The provider key inside that entry |
| `baseURL` | `https://api.minimax.io/anthropic` | Root that serves the model listing |
| `api` | `anthropic-messages` | Wire format; decides the `/v1/models` vs `/models` path |
| `exclude` | `MiniMax-M2*` family | Models to leave out even when the endpoint advertises them |
| `refreshMinutes` | `360` | Refresh interval; `0` = only at start |

Point it at another provider by changing all four of `settingsNs` / `route` / `baseURL` / `api` together.

## How it works

```
boot / interval â”€â”€â–¶ GET {baseURL}/v1/models â”€â”€â–¶ subtract `exclude`
                            â”‚
                            â–¼
                  rewrite profile entry models[]
                            â”‚
                            â–¼
                   sync-status.json  (at / ok / trigger / changed / models)
```

The rewrite goes through the profile's own settings path, so the change is visible in the GUI's model picker
without touching your patch file by hand.

## Files

| file | role |
|---|---|
| `index.js` | the sync row: fetch, filter, rewrite, status |
| `cordis.patch.yml` | the bundle patch that inserts the row |
| `locale/{en,th,zh}.json` | UI strings |
| `icon.svg` | plugin icon |

## à¸ à¸²à¸©à¸²à¹„à¸—à¸¢

`llm-pi-ai` route à¸«à¸™à¸¶à¹ˆà¸‡ à¹† à¹€à¸à¹‡à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¹‚à¸¡à¹€à¸”à¸¥à¹„à¸§à¹‰à¹à¸šà¸šà¹€à¸‚à¸µà¸¢à¸™à¸¡à¸·à¸­ à¸žà¸­à¸œà¸¹à¹‰à¹ƒà¸«à¹‰à¸šà¸£à¸´à¸à¸²à¸£à¸›à¸¥à¸”/à¸­à¸­à¸à¹‚à¸¡à¹€à¸”à¸¥à¹ƒà¸«à¸¡à¹ˆ à¸£à¸²à¸¢à¸à¸²à¸£à¸™à¸±à¹‰à¸™à¸à¹‡à¹€à¸£à¸´à¹ˆà¸¡à¹€à¸™à¹ˆà¸² â€”
Plugin à¸™à¸µà¹‰à¹„à¸›à¸­à¹ˆà¸²à¸™ `/v1/models` à¸‚à¸­à¸‡à¸œà¸¹à¹‰à¹ƒà¸«à¹‰à¸šà¸£à¸´à¸à¸²à¸£à¹à¸¥à¹‰à¸§ **à¹€à¸‚à¸µà¸¢à¸™à¸£à¸²à¸¢à¸à¸²à¸£à¹‚à¸¡à¹€à¸”à¸¥à¹ƒà¸™ route à¹ƒà¸«à¹‰à¸•à¸£à¸‡à¸à¸±à¸šà¸‚à¸­à¸‡à¸ˆà¸£à¸´à¸‡**

- à¸£à¸°à¸šà¸¸à¹€à¸›à¹‰à¸²à¸«à¸¡à¸²à¸¢à¸”à¹‰à¸§à¸¢ `settingsNs` + `route` (à¸„à¹ˆà¸²à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™: entry `llm-pi-ai` / route `minimax-api`)
- `exclude` à¸à¸±à¸™à¸•à¸£à¸°à¸à¸¹à¸¥à¸—à¸µà¹ˆà¸›à¸¥à¸”à¸£à¸°à¸§à¸²à¸‡à¹à¸¥à¹‰à¸§à¹à¸•à¹ˆà¸­à¸µà¹€à¸­à¸™à¸”à¹Œà¸žà¸­à¸¢à¸•à¹Œà¸¢à¸±à¸‡ list à¸­à¸¢à¸¹à¹ˆ (à¹€à¸Šà¹ˆà¸™à¸•à¸£à¸°à¸à¸¹à¸¥ M2)
- `refreshMinutes: 360` = à¹€à¸Šà¹‡à¸„à¸—à¸¸à¸ 6 à¸Šà¸±à¹ˆà¸§à¹‚à¸¡à¸‡, à¸•à¸±à¹‰à¸‡ `0` = à¹€à¸Šà¹‡à¸„à¹à¸„à¹ˆà¸•à¸­à¸™à¸šà¸¹à¸•
- à¸œà¸¥à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸”à¸¹à¹„à¸”à¹‰à¸—à¸µà¹ˆ `sync-status.json` (à¹€à¸§à¸¥à¸² / trigger / changed / models)
- à¹„à¸¡à¹ˆà¸¡à¸µ UI à¹à¸¥à¸°à¹„à¸¡à¹ˆà¸¡à¸µ credential à¸‚à¸­à¸‡à¸•à¸±à¸§à¹€à¸­à¸‡ â€” à¹ƒà¸Šà¹‰à¸‚à¸­à¸‡ route à¹€à¸”à¸´à¸¡

## License

[MIT](LICENSE) Â© 2026 BornCode
