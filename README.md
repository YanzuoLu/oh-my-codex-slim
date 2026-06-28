# Oh My Codex Slim

Oh My Codex Slim is a small Codex plugin scaffold for an OMC-style workflow. When the plugin hook is enabled, Codex Default mode receives compact orchestration guidance and can route work across six installed agent roles: explorer, librarian, oracle, designer, fixer, and reviewer.

## What it does

- Adds a `UserPromptSubmit` hook that injects OMC orchestrator guidance as additional context.
- Ships a Codex skill describing the workflow.
- Provides bundled agent role TOML files and a safe installer for `$CODEX_HOME/agents/` plus `[agents.<role>]` config entries.
- Keeps Codex system, developer, approval, sandbox, and mode instructions authoritative.

## What it does not do

- No MCP servers, Council workflow, Companion process, multiplexer/tmux runtime, or OpenCode runtime assumptions.
- No custom Codex TUI mode or keybinding registration.
- No default plugin enable config, hook trust config, dangerous permissions, sandbox changes, network changes, or uncertain feature flags.
- No hardcoded per-role runtime preset in the agent TOML files.

## Install

### Prerequisites

- Node.js >= 18
- Codex CLI
- Tested with `codex-cli 0.142.3`

### GitHub release install

Use this path before the package is published to npm:

```sh
codex plugin marketplace add YanzuoLu/oh-my-codex-slim
codex plugin add oh-my-codex-slim@oh-my-codex-slim
npm exec --yes --package=git+https://github.com/YanzuoLu/oh-my-codex-slim.git#v0.1.0 -- oh-my-codex-slim install
```

If this project is published to npm later, the agent installer can also be run with `npx oh-my-codex-slim install`.

For local development from this checkout:

```sh
codex plugin marketplace add /Users/ol125/Documents/oh-my-codex-slim
codex plugin add oh-my-codex-slim@oh-my-codex-slim
node scripts/install.mjs
```

The Codex marketplace manifest used by current Codex CLI lives at `.agents/plugins/marketplace.json`. A root `marketplace.json` is kept only for compatibility with older lightweight marketplace examples.

Installer options:

```sh
node scripts/install.mjs --dry-run
node scripts/install.mjs --codex-home /path/to/.codex
node scripts/install.mjs --force
```

The installer writes only:

- `$CODEX_HOME/agents/{explorer,librarian,oracle,designer,fixer,reviewer}.toml`
- `$CODEX_HOME/config.toml` sections like `[agents.explorer] config_file = "./agents/explorer.toml"`

It preserves unrelated config, creates backups before modifying existing files, and refuses to overwrite differing agent files unless `--force` is supplied.

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

Use Codex plugin commands to remove the plugin if desired, then manually remove the six copied agent TOML files from `$CODEX_HOME/agents/` and delete the matching `[agents.<role>]` sections from `$CODEX_HOME/config.toml`. Backups created by the installer have `.bak.<timestamp>` suffixes.
