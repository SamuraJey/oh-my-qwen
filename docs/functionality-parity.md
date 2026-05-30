# oh-my-qwen functionality status

This document records the current Qwen-native workflow surface for `oh-my-qwen`.

Run the machine-readable/current CLI view with:

```bash
omq compat --json
omq compat
```

## Findings

`oh-my-qwen` is aligned with the approved Qwen-native MVP:

- standalone npm package with `omq` bin;
- no `qwen-code` fork or patching;
- generated Qwen extension under `~/.qwen/extensions/oh-my-qwen` or `.qwen/extensions/oh-my-qwen`;
- Qwen settings hooks are marker-owned and reversible;
- `.omq/` state root;
- interactive `omq` launch with direct/inside-tmux/detached-tmux policy;
- `omq exec` over `qwen -p --output-format stream-json`;
- MCP servers `omq_state`, `omq_memory`, and `omq_wiki` for `.omq` workflow state, memory, and wiki tools;
- Qwen-native commands/skills/agents for the default workflow shape plus generated adapters for packaged workflow skills.

## Status matrix

| Area | Current state |
| --- | --- |
| package + CLI | implemented: `oh-my-qwen`, `omq`, Node >=22 |
| setup/uninstall | implemented: generated extension + marker-owned Qwen settings hooks |
| doctor/probe/status | implemented: Node/qwen/settings/extension/hook/disabled-hook reporting |
| native hook bridge | implemented for Qwen hook events with `hookSpecificOutput.hookEventName` |
| interactive launch | implemented: `omq`/`omq launch` direct, inside-tmux, detached-tmux fallback, `OMQ_LAUNCH_POLICY` |
| exec harness | implemented for JSON/stream-json parsing and `--approval-mode` forwarding |
| packaged workflow skills | implemented: first-party workflow skills are directly packaged under `skills/workflows` and generated as Qwen skill/command adapters; generic/user skills are not included |
| deep-interview / ralplan / goal | partial: commands, skills, routing context, durable artifacts exist; full autonomous consensus execution is future work |
| team | partial: external-process plan exists; tmux/worktree run/status is future work |
| MCP state/memory/wiki/trace | partial: `omq_state`, `omq_memory`, and `omq_wiki` expose state, memory, and wiki tools through official SDK stdio servers; trace tooling is future work |
| HUD/notifications/auth/quota/update/cleanup | planned or not yet applicable; operator-polish surfaces come after core workflow stability |
| experimental `qwen serve` | planned opt-in only; do not make MVP depend on it |

## Qwen experimental/develop surface policy

Local Qwen Code docs mark `qwen serve` as **Stage 1 experimental**. It may become useful for future long-running team/session orchestration because it exposes daemon capabilities, sessions, SSE events, approval-mode mutation, tool toggles, workspace init, and MCP restart routes.

For now `oh-my-qwen` treats `qwen serve` as:

1. detectable with `omq qwen-features --json`;
2. allowed only as an explicit future bridge/prototype;
3. not required for setup, hooks, or `omq exec`;
4. not safe as the default team runtime until daemon restart/session/permission semantics are strong enough for the target workflow.

The stable default remains headless Qwen:

```bash
qwen -p "..." --output-format stream-json
```
