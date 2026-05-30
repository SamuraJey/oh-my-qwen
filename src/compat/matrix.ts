export type CompatStatus = 'implemented' | 'partial' | 'planned' | 'not-applicable';

export interface CompatRow {
  area: string;
  ohMyCodexSurface: string;
  ohMyQwenSurface: string;
  status: CompatStatus;
  evidence: string[];
  qwenSurface: string;
  notes: string;
  nextStep?: string;
}

export const COMPAT_ROWS: CompatRow[] = [
  {
    area: 'package-cli',
    ohMyCodexSurface: 'npm package oh-my-codex with bin omx',
    ohMyQwenSurface: 'npm package oh-my-qwen with bin omq',
    status: 'implemented',
    evidence: ['package.json', 'src/cli/omq.ts'],
    qwenSurface: 'external Qwen CLI engine',
    notes: 'Standalone sidecar package; does not fork qwen-code.',
  },
  {
    area: 'setup-uninstall',
    ohMyCodexSurface: 'omx setup/uninstall owns generated Codex artifacts and preserves user hooks',
    ohMyQwenSurface: 'omq setup/uninstall materializes Qwen extension and marker-owned settings hooks',
    status: 'implemented',
    evidence: ['src/cli/setup.ts', 'src/qwen/settings.ts', 'src/qwen/extension.ts', 'src/qwen/__tests__/settings.test.ts'],
    qwenSurface: '~/.qwen or .qwen settings + extensions directory',
    notes: 'Preserves unknown settings/user hooks; removes only --omq-owned=oh-my-qwen entries.',
  },
  {
    area: 'doctor-probe-status',
    ohMyCodexSurface: 'omx doctor/status checks runtime wiring and prerequisites',
    ohMyQwenSurface: 'omq doctor/probe/status reports Node, qwen binary/version, settings, extension, hooks, disableAllHooks',
    status: 'implemented',
    evidence: ['src/qwen/doctor.ts', 'src/qwen/probe.ts'],
    qwenSurface: 'qwen binary, settings.json, extension install state',
    notes: 'Real model auth is still proven by omq exec smoke, matching the OMX false-green boundary.',
  },
  {
    area: 'native-hooks',
    ohMyCodexSurface: 'Codex native hooks + fallbacks for SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop',
    ohMyQwenSurface: 'single qwen-native-hook.js command bridge for Qwen hook events',
    status: 'implemented',
    evidence: ['src/scripts/qwen-native-hook.ts', 'src/hooks/lifecycle.ts', 'src/hooks/__tests__/lifecycle.test.ts'],
    qwenSurface: 'Qwen command hooks configured via settings.json',
    notes: 'Outputs include hookSpecificOutput.hookEventName; PreToolUse uses permissionDecision contract.',
  },
  {
    area: 'extension-skills-agents-commands',
    ohMyCodexSurface: 'skills/prompts/native-agent roles shipped by package/plugin',
    ohMyQwenSurface: 'generated qwen-extension.json, QWEN.md, commands, skills, agents',
    status: 'implemented',
    evidence: ['src/qwen/extension-manifest.ts', 'src/qwen/__tests__/extension.test.ts'],
    qwenSurface: 'Qwen extension commands/skills/agents directories',
    notes: 'Ported as Qwen-native Markdown/frontmatter, not Codex TOML/native-agent files.',
  },
  {
    area: 'exec-harness',
    ohMyCodexSurface: 'omx exec wraps Codex headless execution',
    ohMyQwenSurface: 'omq exec wraps qwen -p --output-format stream-json',
    status: 'implemented',
    evidence: ['src/exec/qwen-exec.ts', 'src/exec/__tests__/qwen-exec.test.ts'],
    qwenSurface: 'qwen headless: -p, --output-format json|stream-json, --approval-mode',
    notes: 'Supports JSON/stream-json parsing, arg forwarding, redacted logs.',
  },
  {
    area: 'workflow-default-flow',
    ohMyCodexSurface: '$deep-interview -> $ralplan -> $ultragoal default flow',
    ohMyQwenSurface: '/deep-interview, /ralplan, /goal generated commands plus omq artifact creators',
    status: 'partial',
    evidence: ['src/workflows/artifacts.ts', 'src/workflows/__tests__/artifacts.test.ts'],
    qwenSurface: 'Qwen commands/skills + hook-injected routing context',
    notes: 'MVP writes durable artifacts and route context; full agent-run consensus automation remains future work.',
    nextStep: 'Implement Qwen-driven Architect/Critic execution lanes over omq exec or qwen serve when stable.',
  },
  {
    area: 'state-model',
    ohMyCodexSurface: '.omx state, mode lifecycle, terminal outcomes, MCP/state surfaces',
    ohMyQwenSurface: '.omq state tree with modes, terminal detection, hook continuation',
    status: 'partial',
    evidence: ['src/state/paths.ts', 'src/state/modes.ts', 'src/hooks/lifecycle.ts'],
    qwenSurface: 'local filesystem state consumed by Qwen hooks',
    notes: 'Covers active/terminal stop semantics; does not yet mirror full OMX transition reconciliation.',
    nextStep: 'Port workflow-transition policy once more Qwen workflows are active.',
  },
  {
    area: 'team-orchestration',
    ohMyCodexSurface: 'omx team tmux/worktree runtime with worker lifecycle',
    ohMyQwenSurface: 'omq team plan creates external-process tmux/worktree plan',
    status: 'partial',
    evidence: ['src/workflows/artifacts.ts'],
    qwenSurface: 'external qwen/omq exec processes; Qwen subagents only for read-only/review lanes',
    notes: 'Matches PRD MVP: write-heavy work should not rely on implicit Qwen fork subagents.',
    nextStep: 'Add omq team run/status around tmux + worktrees.',
  },
  {
    area: 'mcp-memory-wiki-trace',
    ohMyCodexSurface: 'state/memory/wiki/trace MCP servers and CLI wiki surfaces',
    ohMyQwenSurface: 'extension manifest declares omq_state and omq_memory MCP stubs',
    status: 'planned',
    evidence: ['src/mcp/server.ts', 'src/qwen/extension-manifest.ts'],
    qwenSurface: 'Qwen mcpServers configuration',
    notes: 'Stubs are enough for extension shape; full state/memory/wiki tools are not implemented.',
    nextStep: 'Implement state read/write/list tools first, then memory/wiki/trace parity.',
  },
  {
    area: 'qwen-serve-experimental',
    ohMyCodexSurface: 'OMX has long-running runtime/team/session orchestration surfaces',
    ohMyQwenSurface: 'feature probe detects qwen serve; MVP keeps headless as default',
    status: 'planned',
    evidence: ['src/qwen/features.ts', 'docs/functionality-parity.md'],
    qwenSurface: 'experimental qwen serve Stage 1 daemon/capabilities/session HTTP+SSE',
    notes: 'Use only behind explicit opt-in because Qwen docs mark serve Stage 1 experimental and one-workspace-per-daemon.',
    nextStep: 'Prototype optional omq serve-probe/serve-bridge after headless workflows are stable.',
  },
  {
    area: 'auth-quota-hotswap-hud-notifications-update-cleanup',
    ohMyCodexSurface: 'Codex-specific auth/quota, HUD, notifications, update, cleanup, plugin marketplace',
    ohMyQwenSurface: 'not ported in MVP',
    status: 'planned',
    evidence: ['docs/functionality-parity.md'],
    qwenSurface: 'Qwen auth/settings and future extension/plugin lifecycle',
    notes: 'These are lower priority than setup/hooks/exec/workflow state because they are Codex-specific or operator polish.',
    nextStep: 'Add only after Qwen auth/settings contracts are stable and user value is clear.',
  },
];

export function compatSummary(rows: CompatRow[] = COMPAT_ROWS): Record<CompatStatus, number> {
  return rows.reduce<Record<CompatStatus, number>>((acc, row) => {
    acc[row.status] += 1;
    return acc;
  }, { implemented: 0, partial: 0, planned: 0, 'not-applicable': 0 });
}

export function renderCompatMarkdown(rows: CompatRow[] = COMPAT_ROWS): string {
  const lines = [
    '# oh-my-codex ↔ oh-my-qwen functionality parity',
    '',
    '| Area | OMX surface | OMQ status | OMQ/Qwen surface | Evidence | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.area} | ${row.ohMyCodexSurface} | ${row.status} | ${row.ohMyQwenSurface}<br>${row.qwenSurface} | ${row.evidence.map((e) => `\`${e}\``).join('<br>')} | ${row.notes}${row.nextStep ? `<br>Next: ${row.nextStep}` : ''} |`);
  }
  const summary = compatSummary(rows);
  lines.push('', `Summary: ${summary.implemented} implemented, ${summary.partial} partial, ${summary.planned} planned, ${summary['not-applicable']} not-applicable.`);
  return `${lines.join('\n')}\n`;
}
