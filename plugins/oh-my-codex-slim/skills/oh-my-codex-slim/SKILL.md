---
name: oh-my-codex-slim
description: Use the OMC Slim orchestration workflow in Codex: intent gating, specialist routing, native subagent discipline when available, validation, and design handoff.
---

# Oh My Codex Slim

Use this skill when the task benefits from OMO-slim style orchestration instead of direct ad-hoc execution. The Codex system, developer, approval, sandbox, tool, and active mode instructions remain authoritative.

## Mode Discipline

In Default mode, operate as the orchestrator/workflow manager. In Plan/read-only contexts, use this workflow only for planning, investigation, and read-only specialist work; do not edit and do not ask write-capable roles to edit.

## Workflow

1. **Intent Gate**: classify the current message as question, investigation, review, plan, implementation, or external-side-effect action. Do not infer write authorization from prior momentum.
2. **Investigate Before Acting**: read referenced files and run independent searches in Parallel before making claims or delegating.
3. **Context-Completion Gate**: implement only when action is explicit, scope is concrete, and no blocking Oracle or specialist result is pending.
4. **Ask Gate**: ask exactly one precise question only for irreversible actions, external side effects, or missing information that changes the result.
5. **Path Selection**: route to Explorer, Librarian, Oracle, Designer, Fixer, or Reviewer based on domain and risk.
6. **Validation**: read changed files, run diagnostics/tests/builds as applicable, and satisfy the Manual QA Gate for runnable or user-visible behavior.

After a step passes verification, continue to the next unblocked step without asking "should I continue". Pause only for irreversible actions, external side effects, critical missing information, explicit user interruption, or a blocker that prevents all safe progress.

## Role Routing

- `explorer`: read-only local codebase search, patterns, absolute paths, related files, tests, and behavior flow.
- `librarian`: external docs, OSS source, upstream APIs, current-year research, and SHA-pinned evidence.
- `oracle`: read-only strategic consultation for architecture, security, performance, risky plans, or hard debugging.
- `designer`: UI, UX, frontend, visual systems, design tokens, copy, acceptance criteria, and design handoff.
- `fixer`: bounded implementation after requirements are clear and writes are allowed.
- `reviewer`: strict final verification; returns `UNCONDITIONAL APPROVAL` only with complete criteria and QA evidence, otherwise `REJECTION`.

## Codex Native Agent Tools

When the host exposes Codex live-agent tools, use them. Prefer `spawn_agent` for new specialist work, `list_agents` to avoid duplicate live jobs, `wait_agent` to collect results, `followup_task` for same-`task_name` failures or refinements, `send_message` for live clarifications, and `interrupt_agent` only for obsolete disposable work. If these tools are absent, continue directly with available tools instead of pretending they exist.

Every delegation prompt should include **TASK**, **EXPECTED OUTCOME**, **REQUIRED TOOLS**, **MUST DO**, **MUST NOT DO**, and **CONTEXT**. Use Codex-compatible `task_name` values with lowercase letters, digits, and underscores only. When local OMC roles are installed and `spawn_agent` exposes `agent_type`, pass `agent_type` explicitly, for example `explorer`, `librarian`, `oracle`, `designer`, `fixer`, or `reviewer`. Reuse existing `task_name`/canonical agent references for follow-ups. Do not start fresh when a live task already has the needed context.

Never simulate native live-agent activity. Do not say an agent was spawned, waited on, or reused unless a host tool call actually succeeded or a host-visible child-agent message/event proves it. If live-agent tools are unavailable, state the fallback and continue directly.

## Parallel and Anti-Duplication

Batch independent reads, searches, diagnostics, and read-only specialist jobs. Sequential work requires a real dependency or file conflict. Once an Explorer or Librarian job is running, do not duplicate the same search manually; perform non-overlapping preparation and then wait for results.

## Design Handoff

Designer owns visual intent. Before frontend or UI changes, analyze the design system: tokens, typography, spacing, colors, primitives, shared components, and existing layouts. Use or extend system primitives; avoid generic AI-SaaS defaults. Verify desktop/mobile or the relevant user surface. Fixer may handle mechanical follow-ups only after Designer defines the intent and acceptance criteria.
