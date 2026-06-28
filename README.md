# Oh My Codex Slim

Oh My Codex Slim is a Codex-oriented OMO-slim orchestration port. The marketplace plugin installs the prompt hook and workflow skill. The setup step is required to replace Codex native subagents with five OMO-style specialist lanes: explorer, librarian, oracle, designer, and fixer. As in omo-slim, code review is the oracle lane; there is no separate reviewer agent.

> Versions `< 0.2.0` were not faithfully aligned with omo-slim (they re-stamped the full directive every turn and shipped an invented `reviewer` agent). Re-run the setup command to migrate; it backs up your config and removes the `reviewer` agent.

## Prerequisites

- Codex CLI
- Node.js >= 18, required by the plugin hook runtime
- Bun, required for the one-line GitHub setup command below
- Tested with `codex-cli 0.142.3`

## Install

```sh
codex plugin marketplace add YanzuoLu/oh-my-codex-slim
codex plugin add oh-my-codex-slim@oh-my-codex-slim
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.2.0 oh-my-codex-slim install
```

The third step is required because Codex marketplace plugins do not currently auto-register, disable, or replace native `[agents.*]` configuration. `oh-my-codex-slim install` creates a timestamped backup, removes existing top-level native agent TOMLs, writes the six managed role TOMLs, and rewrites `[agents.*]` config entries to point only at those roles.

Runtime multi-agent behavior depends on the Codex host exposing native agent tools such as `spawn_agent`, `list_agents`, `wait_agent`, and `followup_task`, and on the model actually using those tools. When those tools are absent or not called, the hook and skill still provide the OMO-slim orchestration contract for direct Codex execution.

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
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.2.0 oh-my-codex-slim rollback
```

Roll back to a specific backup:

```sh
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.2.0 oh-my-codex-slim rollback --backup /path/to/.codex/omc-slim-backups/<timestamp>
```

From a local checkout, `bun scripts/install.mjs rollback` and `node scripts/install.mjs rollback` are equivalent.

`setup` is accepted as an alias for `install`.

## What it does

- Injects the full orchestrator directive once per session via a `SessionStart` hook (it persists across turns), mirroring how omo-slim keeps the orchestrator prompt present without re-stamping it every turn.
- Adds a short per-turn role anchor via a `UserPromptSubmit` hook, equivalent to omo-slim's lightweight per-turn reminder.
- Ships a Codex skill describing the OMO-slim/Codex workflow.
- Replaces native Codex subagent TOML/config entries with five OMO-style specialist lanes during setup (explorer, librarian, oracle, designer, fixer). Code review/QA is the oracle lane.
- Uses Codex native live-agent tools when the host exposes them; does not assume unavailable tools exist.
- Keeps Codex system, developer, approval, sandbox, tool, and active mode instructions authoritative.

## Faithfulness and Codex platform limitations

This is a faithful port of omo-slim's orchestration behavior, constrained by the Codex plugin surface. The following omo-slim mechanisms are intentionally not replicated:

- **No plugin system channel.** omo-slim injects the orchestrator prompt into the OpenCode system channel. Codex command hooks can only emit a model-visible `developer` message, so the directive is delivered at `SessionStart`. It persists across normal turns but may be dropped by auto-compaction; the short per-turn anchor re-asserts the role so behavior degrades gracefully.
- **No Background Job Board / live task state.** Codex command hooks cannot observe task call IDs, child sessions, or terminal reconciliation, so omo-slim's job board and `task_id` session-reuse are omitted rather than simulated.
- **No MCP** (context7, grep.app, websearch), **Council**, **multi-model presets**, **Companion**, **Multiplexer/tmux runtime**, or **Interview**.
- **No custom tools.** omo-slim ships `ast_grep_search`/`ast_grep_replace`/`webfetch`; on Codex these are provided by host-native tools instead.
- **No per-agent skill-permission filtering** and **no foreground model fallback** (both require OpenCode runtime APIs).

## What it does not do

- No automatic native agent replacement from marketplace install alone; the setup command performs replacement explicitly.
- No hook trust config, dangerous permissions, sandbox changes, network changes, or uncertain feature flags.
- No hardcoded per-role model, reasoning effort, or service tier (models are inherited from your Codex config, matching omo-slim's undefined defaults).
- No separate reviewer agent (review is the oracle lane).

## Modes and opt-outs

With the plugin enabled, the orchestrator directive is injected at session start and a short anchor is added each turn. Codex native Plan/read-only mode remains authoritative: the directive is advisory and says to plan only, without write-capable delegation, when the active mode requires read-only behavior.

Disable everything (both the session-start directive and the per-turn anchor):

```sh
OMC_SLIM_DISABLE=1 codex
```

`OMC_SLIM_DISABLE` accepts `1`, `true`, `yes`, or `on`.

Opt out of a single prompt's per-turn anchor by prefixing it with either:

```text
[no-omc]
[omc-off]
```

Note: a prompt prefix only suppresses that turn's anchor. It cannot un-inject the session-start directive already delivered earlier in the session; use `OMC_SLIM_DISABLE` to suppress the directive itself.

## Uninstall cleanup

Use Codex plugin commands to remove the marketplace plugin. To undo native subagent replacement, run `oh-my-codex-slim rollback` or manually remove the managed agent TOML files (explorer, librarian, oracle, designer, fixer) from `$CODEX_HOME/agents/` and delete the matching `[agents.<role>]` sections from `$CODEX_HOME/config.toml`. Backups created by setup have `.json` metadata and live under `$CODEX_HOME/omc-slim-backups/`.
