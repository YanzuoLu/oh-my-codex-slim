# Oh My Codex Slim

Oh My Codex Slim is a Codex-oriented OMO-slim orchestration port. The marketplace plugin installs the prompt hook and workflow skill. The setup step is required to replace Codex native subagents with five OMO-style lanes plus a strict Codex ultrawork reviewer mapping: explorer, librarian, oracle, designer, fixer, and reviewer.

## Prerequisites

- Codex CLI
- Node.js >= 18, required by the plugin hook runtime
- Bun, required for the one-line GitHub setup command below
- Tested with `codex-cli 0.142.3`

## Install

```sh
codex plugin marketplace add YanzuoLu/oh-my-codex-slim
codex plugin add oh-my-codex-slim@oh-my-codex-slim
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.1.1 oh-my-codex-slim install
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

- `$CODEX_HOME/agents/{explorer,librarian,oracle,designer,fixer,reviewer}.toml`
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
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.1.1 oh-my-codex-slim rollback
```

Roll back to a specific backup:

```sh
bunx --bun --package git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.1.1 oh-my-codex-slim rollback --backup /path/to/.codex/omc-slim-backups/<timestamp>
```

From a local checkout, `bun scripts/install.mjs rollback` and `node scripts/install.mjs rollback` are equivalent.

`setup` is accepted as an alias for `install`.

## What it does

- Adds a `UserPromptSubmit` hook that injects OMC orchestrator guidance as additional context.
- Ships a Codex skill describing the OMO-slim/Codex workflow.
- Replaces native Codex subagent TOML/config entries with five OMO-style lanes plus a strict Codex ultrawork reviewer mapping during setup.
- Uses Codex native live-agent tools when the host exposes them; does not assume unavailable tools exist.
- Keeps Codex system, developer, approval, sandbox, tool, and active mode instructions authoritative.

## What it does not do

- No MCP servers, Council workflow, Companion process, multiplexer/tmux runtime, or OpenCode runtime assumptions.
- No custom Codex TUI mode or keybinding registration.
- No automatic native agent replacement from marketplace install alone; the setup command performs replacement explicitly.
- No hook trust config, dangerous permissions, sandbox changes, network changes, or uncertain feature flags.
- No hardcoded per-role model, reasoning effort, or service tier.

## Modes and opt-outs

With the plugin enabled, Default-mode prompts receive orchestrator guidance. Codex native Plan/read-only mode remains native: the injected directive is subordinate to the active mode and says to plan only without write-capable delegation when the active instructions require read-only behavior.

Opt out globally:

```sh
OMC_SLIM_DISABLE=1 codex
```

Opt out for one prompt by prefixing it with either:

```text
[no-omc]
[omc-off]
```

## Uninstall cleanup

Use Codex plugin commands to remove the marketplace plugin. To undo native subagent replacement, run `oh-my-codex-slim rollback` or manually remove the six managed agent TOML files from `$CODEX_HOME/agents/` and delete the matching `[agents.<role>]` sections from `$CODEX_HOME/config.toml`. Backups created by setup have `.json` metadata and live under `$CODEX_HOME/omc-slim-backups/`.
