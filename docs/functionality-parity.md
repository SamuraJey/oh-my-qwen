# oh-my-codex ↔ oh-my-qwen functionality parity

This document records the current parity target between `oh-my-codex` and `oh-my-qwen`.

Run the machine-readable/current CLI view with:

```bash
omq compat --json
omq compat
```

## Findings

`oh-my-qwen` is **not** a full `oh-my-codex` clone yet. It is aligned with the approved Qwen-native MVP:

- standalone npm package with `omq` bin;
- no `qwen-code` fork or patching;
- generated Qwen extension under `~/.qwen/extensions/oh-my-qwen` or `.qwen/extensions/oh-my-qwen`;
- Qwen settings hooks are marker-owned and reversible;
- `.omq/` state root;
- `omq exec` over `qwen -p --output-format stream-json`;
- Qwen-native commands/skills/agents for the default workflow shape.

## Parity matrix

| Area | Current state |
| --- | --- |
| package + CLI | implemented: `oh-my-qwen`, `omq`, Node >=22 |
| setup/uninstall | implemented: generated extension + marker-owned Qwen settings hooks |
| doctor/probe/status | implemented: Node/qwen/settings/extension/hook/disabled-hook reporting |
| native hook bridge | implemented for Qwen hook events with `hookSpecificOutput.hookEventName` |
| exec harness | implemented for JSON/stream-json parsing and `--approval-mode` forwarding |
| deep-interview / ralplan / goal | partial: commands, skills, routing context, durable artifacts exist; full autonomous consensus execution is future work |
| team | partial: external-process plan exists; tmux/worktree run/status is future work |
| MCP memory/wiki/trace | planned: manifest declares state/memory stubs; full tools are future work |
| HUD/notifications/auth/quota/update/cleanup | planned or not yet applicable; many are Codex-specific operator surfaces |
| experimental `qwen serve` | planned opt-in only; do not make MVP depend on it |

## Qwen experimental/develop surface policy

Local Qwen Code docs mark `qwen serve` as **Stage 1 experimental**. It is useful for future parity with OMX long-running/team/session orchestration, because it exposes daemon capabilities, sessions, SSE events, approval-mode mutation, tool toggles, workspace init, and MCP restart routes.

For now `oh-my-qwen` treats `qwen serve` as:

1. detectable with `omq qwen-features --json`;
2. allowed only as an explicit future bridge/prototype;
3. not required for setup, hooks, or `omq exec`;
4. not safe as the default team runtime until daemon restart/session/permission semantics are strong enough for the target workflow.

The stable default remains headless Qwen:

```bash
qwen -p "..." --output-format stream-json
```
