# Local installation

These instructions install the local `oh-my-qwen` checkout as a global `omq` CLI and materialize the Qwen extension/plugin locally.

## Prerequisites

- Node.js `>=22`
- npm
- Qwen Code CLI installed separately (`qwen` on `PATH`) for real execution smoke tests

`oh-my-qwen` does not fork or modify `qwen-code`.

## Install from local checkout

```bash
cd /home/samuraj/Documents/code/oh-my-qwen
npm install
npm test
npm install -g .
omq version
```

If you do not want a global symlink, use npm prefix:

```bash
PREFIX="$HOME/.local/omq"
npm install -g --prefix "$PREFIX" .
export PATH="$PREFIX/bin:$PATH"
omq version
```

## Install the Qwen extension/plugin files

Project-local installation writes `.qwen/extensions/oh-my-qwen`, `.qwen/settings.json`, and `.omq/` in the current project:

```bash
cd /path/to/your/project
omq setup --scope project --dry-run
omq setup --scope project
omq doctor --scope project
omq --tmux
```

User installation writes under `${QWEN_HOME:-~/.qwen}`:

```bash
omq setup --scope user --dry-run
omq setup --scope user
omq doctor --scope user
```

Inside Qwen Code, optional checks:

```text
/extensions
/skills
/agents
```

## Real execution smoke

```bash
qwen -p "Reply with exactly OMQ-QWEN-OK" --output-format json
omq exec "Reply with exactly OMQ-EXEC-OK"
```

If `qwen` is not on `PATH`, set:

```bash
export QWEN_BIN=/absolute/path/to/qwen
```

## Interactive launch modes

`omq` launches Qwen Code interactively with a tmux-aware policy:

```bash
omq                 # auto policy
omq --tmux          # detached tmux session, then attach
omq --direct        # no tmux
OMQ_LAUNCH_POLICY=tmux omq
OMQ_LAUNCH_POLICY=direct omq
```

Policy behavior:

- inside an existing tmux pane: run Qwen in that pane;
- outside tmux with an attached TTY and tmux available: create/attach an `omq-*` detached tmux session;
- non-interactive or no tmux: run Qwen directly.

## Nessy fork wrapper

If a Qwen-compatible fork binary is named `nessy`:

```bash
omq-nessy --tmux
```

For non-standard locations:

```bash
NESSY_BIN=/absolute/path/to/nessy NESSY_HOME="$HOME/.nessy" omq-nessy
```

The wrapper exports `QWEN_BIN`, `QWEN_HOME`, `NESSY_HOME`, and `OMQ_ENGINE=nessy` before delegating to `omq`.

## Feature/parity checks

```bash
omq compat
omq compat --json
omq qwen-features
omq qwen-features --json
```

`qwen serve` is experimental in the local Qwen docs. Use it only for explicit prototype work, not for the default MVP install.

## Uninstall local extension files

```bash
cd /path/to/your/project
omq uninstall --scope project
# or:
omq uninstall --scope user
```

Uninstall removes only generated `oh-my-qwen` extension files and Qwen hook commands containing `--omq-owned=oh-my-qwen`. User-owned Qwen settings and hooks are preserved.
