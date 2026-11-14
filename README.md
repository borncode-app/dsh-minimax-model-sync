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
here is unchanged and each part keeps its own switch — this repository stays
the home of the model-list sync.

## What it does

An `llm-pi-ai` route carries a hand-written list of models. Providers retire and launch models without warning,
so that list drifts: a model disappears and the picker offers a dead route, or a new one exists and you never see it.

This plugin reads the provider's own models endpoint and **rewrites the route's model list** to match — with an
explicit `exclude` list for models the endpoint still advertises but you never want.

It is one small row, no UI, no background polling storm: it syncs at boot and then on a slow interval.

## Features

- **Endpoint-driven** — Anthropic-compatible roots list at `{baseURL}/v1/models`, OpenAI-compatible at `{baseURL}/models`; both are supported.
- **Reaches into the right entry** — `settingsNs` + `route` say exactly which profile entry and provider are rewritten.
- **Exclude list** — keeps retired families (the MiniMax M2 line, for example) out even though the endpoint still lists them.
- **Slow refresh** — `refreshMinutes: 360` by default; `0` syncs only at start.
- **Status file** — `sync-status.json` records the last run: when, why, whether anything changed, and the resulting models.
- **No credentials of its own** — it reuses whatever the route already uses.

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
boot / interval ──▶ GET {baseURL}/v1/models ──▶ subtract `exclude`
                            │
                            ▼
                  rewrite profile entry models[]
                            │
                            ▼
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

## ภาษาไทย

`llm-pi-ai` route หนึ่ง ๆ เก็บรายการโมเดลไว้แบบเขียนมือ พอผู้ให้บริการปลด/ออกโมเดลใหม่ รายการนั้นก็เริ่มเน่า —
Plugin นี้ไปอ่าน `/v1/models` ของผู้ให้บริการแล้ว **เขียนรายการโมเดลใน route ให้ตรงกับของจริง**

- ระบุเป้าหมายด้วย `settingsNs` + `route` (ค่าเริ่มต้น: entry `llm-pi-ai` / route `minimax-api`)
- `exclude` กันตระกูลที่ปลดระวางแล้วแต่อีเอนด์พอยต์ยัง list อยู่ (เช่นตระกูล M2)
- `refreshMinutes: 360` = เช็คทุก 6 ชั่วโมง, ตั้ง `0` = เช็คแค่ตอนบูต
- ผลล่าสุดดูได้ที่ `sync-status.json` (เวลา / trigger / changed / models)
- ไม่มี UI และไม่มี credential ของตัวเอง — ใช้ของ route เดิม

## License

[MIT](LICENSE) © 2026 BornCode
