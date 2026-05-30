# Architecture

`oh-my-qwen` is a sidecar harness for Qwen Code.

## Boundaries

- Qwen-specific IO lives under `src/qwen/*`.
- Workflow semantics live under `src/workflows/*` and `src/hooks/*`.
- Generated Qwen extension files are produced by `src/qwen/extension-manifest.ts`.
- Marker-owned settings merge/uninstall is implemented by `src/qwen/settings.ts`.

## Durable state

State is written under `.omq/`:

```text
.omq/
├── config.json
├── state/modes/*.json
├── plans/
├── context/
├── goals/
├── reviews/
├── logs/
├── runtime/tmux-env/
└── backups/
```
