---
name: autoresearch-goal
description: Durable professor-critic research workflow over Codex goal mode without reviving deprecated omq autoresearch
---

# Autoresearch Goal

Use this workflow when a research mission should be bound to Codex goal-mode focus while OMQ remains the durable state owner. This is for research projects that need Codex goal-mode management plus professor/critic-style validation; it is not the default answer for ordinary pre-planning best-practice lookup.

## Boundary
- Do **not** use or revive the deprecated `omq autoresearch` direct launch surface.
- Do **not** claim shell commands mutate hidden Codex `/goal` state.
- Do **not** edit upstream `../../codex` or add dependencies.
- Use `get_goal`, `create_goal`, and `update_goal({status: "complete"})` only through the active Codex thread when those tools are available.

## Artifacts
`omq autoresearch-goal` writes:
- `.omq/goals/autoresearch/<slug>/mission.json`
- `.omq/goals/autoresearch/<slug>/rubric.md`
- `.omq/goals/autoresearch/<slug>/ledger.jsonl`
- `.omq/goals/autoresearch/<slug>/completion.json`

## Flow
1. Create the mission and professor-critic rubric:
   `omq autoresearch-goal create --topic "..." --rubric "..." --critic-command "..."`
2. Emit the model-facing handoff:
   `omq autoresearch-goal handoff --slug <slug>`
3. In the active Codex thread, call `get_goal`; call `create_goal` only if no active goal exists and the printed payload is the intended objective.
4. Research iteratively against the rubric. Record every critic outcome:
   `omq autoresearch-goal verdict --slug <slug> --verdict <pass|fail|blocked> --evidence "..."`
5. Completion is blocked until professor-critic validation records `verdict=pass`. After the mission audit passes, call `update_goal({status: "complete"})`, call `get_goal` again, then run:
   `omq autoresearch-goal complete --slug <slug> --codex-goal-json <get_goal-json-or-path>`
6. Treat the completion command as read-only reconciliation plus durable OMQ state update; hooks and shell commands must not mutate Codex goal state.

## Completion gate
A passing professor-critic artifact and a matching complete Codex `get_goal` snapshot are required. Assistant prose, partial tests, or a failed/blocked verdict are not sufficient.
