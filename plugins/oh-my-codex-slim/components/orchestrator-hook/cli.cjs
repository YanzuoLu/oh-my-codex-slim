#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

// omo-slim's per-turn reminder (PHASE_REMINDER), ported to Codex: the only change
// from omo's verbatim text is "hook-driven completion" -> "agent completion"
// (omo's term is OpenCode-internal; on Codex the model waits with wait_agent).
const PHASE_REMINDER =
  '<internal_reminder>!IMPORTANT! Scheduler workflow: plan lanes/dependencies → ' +
  'dispatch background specialists → track task IDs → wait for agent completion → ' +
  'reconcile terminal results → verify. Do not poll running jobs, consume ' +
  'running-job output, or advance dependent work. !END!</internal_reminder>';

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
    // Full orchestrator directive, loaded once per session (omo delivers it via the
    // OpenCode system channel; on Codex the official plugin pattern is SessionStart).
    emit('SessionStart', await loadDirective());
    return;
  }

  if (eventName === 'UserPromptSubmit') {
    // Inject the per-turn anchor ONLY in the root orchestrator session. Codex also fires
    // UserPromptSubmit for a spawned subagent's initial task, but that payload carries
    // agent_id/agent_type (the root session's payload omits both). Skip subagents so the
    // orchestrator scheduler reminder never pollutes specialist contexts.
    const isSubagent =
      payload && (typeof payload.agent_id === 'string' || typeof payload.agent_type === 'string');
    if (!isSubagent) {
      // Short per-turn reminder, mirroring omo-slim's PHASE_REMINDER.
      emit('UserPromptSubmit', PHASE_REMINDER);
    }
    return;
  }
}

main().catch((error) => {
  process.stderr.write(`oh-my-codex-slim hook error: ${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 0;
});
