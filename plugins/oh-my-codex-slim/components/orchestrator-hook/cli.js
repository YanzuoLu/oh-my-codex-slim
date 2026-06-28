#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function isDisabled() {
  const value = process.env.OMC_SLIM_DISABLE;
  return typeof value === 'string' && /^(1|true|yes)$/i.test(value.trim());
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
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const directivePath = path.join(currentDir, 'directive.md');
  const contents = await fs.readFile(directivePath, 'utf8');
  return contents.replace(/\r\n/g, '\n').trim();
}

async function main() {
  if (isDisabled()) {
    return;
  }

  const input = await readStdin();
  const payload = parseHookInput(input);
  if (!payload || payload.hook_event_name !== 'UserPromptSubmit') {
    return;
  }

  const prompt = payload.prompt;
  if (typeof prompt !== 'string' || isPromptOptedOut(prompt)) {
    return;
  }

  const additionalContext = await loadDirective();
  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext
    }
  };

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch((error) => {
  process.stderr.write(`oh-my-codex-slim hook error: ${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 0;
});
