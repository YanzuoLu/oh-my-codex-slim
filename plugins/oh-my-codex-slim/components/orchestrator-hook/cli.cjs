#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

// Per-turn role anchor (short). Distinct marker from the full directive so it is
// clearly the lightweight per-turn reminder, not a re-stamp of the whole directive.
// Deliberately Codex-appropriate: no OpenCode scheduler "wait for hook-driven
// completion / do not advance dependent work" semantics (those stall the model on Codex).
const PER_TURN_ANCHOR =
  'OMC_SLIM_ANCHOR_V1 — OMC Slim orchestrator active: gate the current request\'s intent, ' +
  'gather context before acting, delegate to a specialist lane (explorer, librarian, oracle, ' +
  'designer, fixer) when the work fits one, and verify before shipping. Advisory and subordinate ' +
  'to Codex system, developer, approval, sandbox, and active mode instructions.';

function isDisabled() {
  const value = process.env.OMC_SLIM_DISABLE;
  return typeof value === 'string' && /^(1|true|yes|on)$/i.test(value.trim());
}

async function readStdin() {
  if (process.stdin.isTTY) {
    return '';
  }
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function parseHookInput(input) {
  if (!input || input.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function isPromptOptedOut(prompt) {
  return /^\s*(?:\[no-omc]|\[omc-off])/i.test(prompt);
}

async function loadDirective() {
  const directivePath = path.join(__dirname, 'directive.md');
  const contents = await fs.readFile(directivePath, 'utf8');
  return contents.replace(/\r\n/g, '\n').trim();
}

function emit(hookEventName, additionalContext) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } })}\n`);
}

async function main() {
  if (isDisabled()) {
    return;
  }

  const input = await readStdin();
  const payload = parseHookInput(input);
  const eventName = payload && typeof payload.hook_event_name === 'string' ? payload.hook_event_name : null;

  if (eventName === 'SessionStart') {
    // Full orchestrator directive, once per session (persists across turns).
    const additionalContext = await loadDirective();
    emit('SessionStart', additionalContext);
    return;
  }

  if (eventName === 'UserPromptSubmit') {
    const prompt = payload.prompt;
    if (typeof prompt !== 'string' || isPromptOptedOut(prompt)) {
      return;
    }
    // Short per-turn anchor only (not the full directive).
    emit('UserPromptSubmit', PER_TURN_ANCHOR);
    return;
  }
}

main().catch((error) => {
  process.stderr.write(`oh-my-codex-slim hook error: ${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 0;
});
