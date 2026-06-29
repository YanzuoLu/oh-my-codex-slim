# Oh My Codex Slim

Oh My Codex Slim is a Codex-oriented OMO-slim orchestration port. The marketplace plugin installs the orchestrator prompt hook and a set of ported OMO skills (simplify, deepwork, reflect, codemap, clonedeps, worktrees). The setup step registers five OMO-style specialist lanes as Codex agents — explorer, librarian, oracle, designer, and fixer — by managing the user-level `[agents.*]` configuration; Codex's built-in `default`/`worker` agents remain available alongside them. As in omo-slim, code review is the oracle lane; there is no separate reviewer agent. The orchestration workflow itself lives in the SessionStart directive, mirroring omo-slim (which has no separate workflow-entry skill).

> Versions `< 0.2.1` were not fully faithful to omo-slim or validated against the Codex harness (earlier builds re-stamped the full directive every turn, shipped an invented `reviewer` agent, named tools Codex does not expose, and added a compaction hook that could not inject context). Re-run the setup command to migrate; it backs up your existing config and agents first.

## Prerequisites

- Codex CLI
- Node.js >= 18, required by the plugin hook runtime
- Bun, required for the one-line GitHub setup command below
- Tested with `codex-cli 0.142.3`

## Install

```sh
codex plugin marketplace add YanzuoLu/oh-my-codex-slim
codex plugin add oh-my-codex-slim@oh-my-codex-slim
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.2.3 oh-my-codex-slim install
```

The third step is required because Codex marketplace plugins do not currently auto-register, disable, or replace native `[agents.*]` configuration. `oh-my-codex-slim install` creates a timestamped backup, removes existing top-level agent TOMLs under `$CODEX_HOME/agents/`, writes the five managed role TOMLs, and rewrites the `[agents.*]` tables in `config.toml` to declare those five roles. Codex's compiled-in `default`/`worker` agents are not file- or config-defined, so they remain available; setup only manages the user agent layer.

Runtime multi-agent behavior depends on the Codex host exposing native agent tools such as `spawn_agent`, `wait_agent`, `resume_agent`, and `close_agent`, and on the model actually using those tools. When those tools are absent or not called, the hook and skill still provide the OMO-slim orchestration contract for direct Codex execution.

Live-agent smoke tests are host/model-compliance dependent. Treat them as passed only when host-visible evidence proves delegation occurred, such as Codex JSONL `collab_agent_spawn_begin`/`collab_agent_spawn_end` events or child-thread output. A final assistant message that says an agent was spawned is not enough.

The setup leaves non-TOML files under `$CODEX_HOME/agents/` in place. It removes only top-level `*.toml` files there before writing the managed OMC role files.

## Local development install

From this checkout:

```sh
codex plugin marketplace add /Users/ol125/Documents/oh-my-codex-slim
codex plugin add oh-my-codex-slim@oh-my-codex-slim
bun scripts/install.mjs install
# or: node scripts/install.mjs install
```

The Codex marketplace manifest used by current Codex CLI lives at `.agents/plugins/marketplace.json`. A root `marketplace.json` is also kept for compatibility with lightweight local marketplace examples.

## Setup safety, dry run, and rollback

Setup writes only inside `$CODEX_HOME`:

- `$CODEX_HOME/agents/{explorer,librarian,oracle,designer,fixer}.toml`
- `$CODEX_HOME/config.toml` sections like `[agents.explorer] config_file = "./agents/explorer.toml"`
- backups under `$CODEX_HOME/omc-slim-backups/<timestamp>/`

It preserves unrelated config tables/lines, creates a backup before replacement, and does not enable plugins, trust hooks, set feature flags, or change permissions/sandbox/network settings.

Preview without writing:

```sh
bun scripts/install.mjs install --dry-run
node scripts/install.mjs install --dry-run
```

Use a custom Codex home:

```sh
bun scripts/install.mjs install --codex-home /path/to/.codex
```

Roll back to the latest backup:

```sh
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.2.3 oh-my-codex-slim rollback
```

Roll back to a specific backup:

```sh
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.2.3 oh-my-codex-slim rollback --backup /path/to/.codex/omc-slim-backups/<timestamp>
```

From a local checkout, `bun scripts/install.mjs rollback` and `node scripts/install.mjs rollback` are equivalent.

`setup` is accepted as an alias for `install`.

## What it does

- Injects the full orchestrator directive via a `SessionStart` hook scoped to `startup|clear|compact` — at session start, after `/clear`, and again after auto-compaction (Codex re-fires `SessionStart` with `source = compact`). `resume` is intentionally excluded because a resumed session already restores the directive from its saved transcript, so the prompt stays present without duplication or per-turn re-stamping.
- Adds a short per-turn role anchor via a `UserPromptSubmit` hook, equivalent to omo-slim's lightweight per-turn reminder.
- Ships six ported OMO skills (simplify, deepwork, reflect, codemap, clonedeps, worktrees); the orchestration workflow itself lives in the `SessionStart` directive, not a separate workflow skill.
- Registers five OMO-style specialist lanes as Codex agents during setup (explorer, librarian, oracle, designer, fixer) by managing the user `[agents.*]` config and role TOMLs; Codex's built-in `default`/`worker` agents remain available. Code review/QA is the oracle lane.
- Uses Codex native live-agent tools when the host exposes them; does not assume unavailable tools exist.
- Keeps Codex system, developer, approval, sandbox, tool, and active mode instructions authoritative.

## Faithfulness and Codex platform limitations

This is a faithful port of omo-slim's orchestration behavior, constrained by the Codex plugin surface. The following omo-slim mechanisms are intentionally not replicated:

- **No plugin system channel.** omo-slim injects the orchestrator prompt into the OpenCode system channel. Codex command hooks emit a model-visible `developer` message instead, so the directive is delivered at `SessionStart` (matcher `startup|clear|compact`). Auto-compaction rebuilds the conversation history and drops earlier injected developer context, but Codex re-fires `SessionStart` with `source = compact` afterward, so the hook re-injects the full directive at the next turn start. `resume` is excluded because the injected directive is persisted to the session rollout and restored on resume, so re-injecting it there would only duplicate it. The `PreCompact`/`PostCompact` hooks cannot inject context (their output schema has no `additionalContext`), so they are intentionally unused; the per-turn `UserPromptSubmit` anchor additionally re-asserts the role within turns. This restores the orchestrator directive, not the model's lost in-progress work context from a mid-turn compaction.
- **No live Background Job Board.** Codex command hooks cannot observe task call IDs, child sessions, or terminal reconciliation, so omo-slim's *live* job board is not reproduced. The directive still instructs the model to track and reuse spawned agents (mapped to `resume_agent`); what is omitted is the hook-observed runtime task state, not the delegation or session-reuse guidance.
- **No MCP** (context7, grep.app, websearch), **Council**, **multi-model presets**, **Companion**, **Multiplexer/tmux runtime**, or **Interview**.
- **No custom tools.** omo-slim registers `ast_grep_search`/`ast_grep_replace`/`webfetch` via OpenCode's `tool({...})` API. Codex has no equivalent native custom-tool API — a plugin can only add tools by bundling an MCP server — and this port does not bundle one for them. The agent instructions therefore use Codex's real tool surface (`exec_command` with `rg`/`cat`, and `apply_patch`) and do not name those OpenCode-only tools.
- **No per-agent skill-permission filtering** and **no foreground model fallback** (both require OpenCode runtime APIs).

## What it does not do

- No automatic agent setup from marketplace install alone; the setup command registers the five roles explicitly.
- No hook trust config, dangerous permissions, sandbox changes, network changes, or uncertain feature flags.
- No hardcoded per-role model, reasoning effort, or service tier (models are inherited from your Codex config, matching omo-slim's undefined defaults).
- No separate reviewer agent (review is the oracle lane).

## Modes and opt-outs

With the plugin enabled, the orchestrator directive is injected at session start and a short anchor is added each turn. Codex native Plan mode and a configured read-only sandbox/permission profile remain authoritative: the directive is advisory and says to plan only, without write-capable delegation, when the active mode or sandbox requires read-only behavior.

Disable everything (both the session-start directive and the per-turn anchor):

```sh
OMC_SLIM_DISABLE=1 codex
```

`OMC_SLIM_DISABLE` accepts `1`, `true`, `yes`, or `on`. As in omo-slim, there is no per-prompt opt-out; use the environment variable to disable the plugin's injection.

## Uninstall cleanup

Use Codex plugin commands to remove the marketplace plugin. To undo the agent setup, run `oh-my-codex-slim rollback` or manually remove the managed agent TOML files (explorer, librarian, oracle, designer, fixer) from `$CODEX_HOME/agents/` and delete the matching `[agents.<role>]` sections from `$CODEX_HOME/config.toml`. Backups created by setup have `.json` metadata and live under `$CODEX_HOME/omc-slim-backups/`.
