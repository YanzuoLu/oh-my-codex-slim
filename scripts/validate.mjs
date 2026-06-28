#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const roles = ['explorer', 'librarian', 'oracle', 'designer', 'fixer', 'reviewer'];
const hookCli = 'plugins/oh-my-codex-slim/components/orchestrator-hook/cli.js';
const jsonFiles = [
  'package.json',
  'marketplace.json',
  '.agents/plugins/marketplace.json',
  'plugins/oh-my-codex-slim/.codex-plugin/plugin.json',
  'plugins/oh-my-codex-slim/hooks/hooks.json'
];
const syntaxFiles = ['scripts/install.mjs', 'scripts/validate.mjs', hookCli];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input: options.input,
    env: { ...process.env, ...(options.env || {}) }
  });

  if (result.status !== 0) {
    fail(
      `Command failed: node ${args.join(' ')}\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`
    );
  }

  return result;
}

async function readText(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function validateSyntax() {
  for (const file of syntaxFiles) {
    runNode(['--check', file]);
  }
}

async function validateJson() {
  for (const file of jsonFiles) {
    JSON.parse(await readText(file));
  }
}

function runHook(input, env = {}) {
  return runNode([hookCli, 'hook', 'user-prompt-submit'], { input, env: { OMC_SLIM_DISABLE: '', ...env } });
}

async function validateHook() {
  const positive = runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'Implement this.' }));
  assert(positive.stderr === '', 'Positive hook test should not write stderr.');
  assert(positive.stdout.endsWith('\n'), 'Positive hook output must end with one newline.');
  const parsed = JSON.parse(positive.stdout);
  assert(
    positive.stdout === `${JSON.stringify(parsed)}\n`,
    'Positive hook output must be exactly one JSON object plus newline.'
  );
  assert(
    parsed.hookSpecificOutput?.hookEventName === 'UserPromptSubmit',
    'Hook output must target UserPromptSubmit.'
  );
  assert(
    typeof parsed.hookSpecificOutput?.additionalContext === 'string' &&
      parsed.hookSpecificOutput.additionalContext.includes('OMC_SLIM_DIRECTIVE_V1'),
    'Hook output must include directive marker context.'
  );

  for (const value of ['1', 'true', 'yes']) {
    const disabled = runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'Implement this.' }), {
      OMC_SLIM_DISABLE: value
    });
    assert(disabled.stdout === '', `OMC_SLIM_DISABLE=${value} should produce empty stdout.`);
  }

  for (const prefix of ['[no-omc]', '[omc-off]']) {
    const optedOut = runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: `  ${prefix} skip` }));
    assert(optedOut.stdout === '', `${prefix} prompt should produce empty stdout.`);
  }

  const invalidJson = runHook('{not json');
  assert(invalidJson.stdout === '', 'Invalid JSON hook input should produce empty stdout.');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function snapshotFiles(root) {
  const entries = new Map();

  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        entries.set(relativePath, await fs.readFile(absolutePath, 'utf8'));
      }
    }
  }

  await walk(root);
  return [...entries.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function validateInstaller() {
  const tempCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'omc-slim-validate-'));

  try {
    runNode(['scripts/install.mjs', '--dry-run', '--codex-home', tempCodexHome]);
    assert(!(await pathExists(path.join(tempCodexHome, 'agents'))), 'Dry run must not create agents directory.');
    assert(!(await pathExists(path.join(tempCodexHome, 'config.toml'))), 'Dry run must not create config.toml.');

    runNode(['scripts/install.mjs', '--codex-home', tempCodexHome]);

    for (const role of roles) {
      const source = await readText(`plugins/oh-my-codex-slim/agents/${role}.toml`);
      const installed = await fs.readFile(path.join(tempCodexHome, 'agents', `${role}.toml`), 'utf8');
      assert(installed === source, `Installed ${role}.toml must match bundled source.`);
    }

    const config = await fs.readFile(path.join(tempCodexHome, 'config.toml'), 'utf8');
    for (const role of roles) {
      assert(config.includes(`[agents.${role}]`), `config.toml missing [agents.${role}].`);
      assert(
        config.includes(`config_file = "./agents/${role}.toml"`),
        `config.toml missing config_file for ${role}.`
      );
    }

    const before = JSON.stringify(await snapshotFiles(tempCodexHome));
    runNode(['scripts/install.mjs', '--codex-home', tempCodexHome]);
    const after = JSON.stringify(await snapshotFiles(tempCodexHome));
    assert(after === before, 'Second installer run must be idempotent.');
  } finally {
    await fs.rm(tempCodexHome, { recursive: true, force: true });
  }
}

async function validateAgents() {
  const agentsDir = path.join(repoRoot, 'plugins/oh-my-codex-slim/agents');
  const bannedField = /^(model|model_reasoning_effort|service_tier)\s*=/m;
  const requiredFields = ['name', 'description', 'nickname_candidates', 'developer_instructions'];

  for (const role of roles) {
    const file = path.join(agentsDir, `${role}.toml`);
    const text = await fs.readFile(file, 'utf8');
    assert(!bannedField.test(text), `${role}.toml must not set model/reasoning/service tier fields.`);
    for (const field of requiredFields) {
      assert(new RegExp(`^${field}\\s*=`, 'm').test(text), `${role}.toml missing ${field}.`);
    }
  }
}

async function listFiles(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const files = [];

  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }

  await walk(absoluteDir);
  return files;
}

function literalToken(parts) {
  const token = parts.join('');
  return { label: token, test: (text) => text.includes(token) };
}

function regexToken(labelParts, patternParts, flags = '') {
  const label = labelParts.join('');
  const pattern = patternParts.join('');
  return { label, test: (text) => new RegExp(pattern, flags).test(text) };
}

async function validateForbiddenRuntimeConfig() {
  const forbidden = [
    literalToken(['plugin', '_hooks']),
    literalToken(['child', '_agents_md']),
    literalToken(['multi', '_agent_v2']),
    literalToken(['trusted', '_hash']),
    regexToken(['approval', '_policy never'], ['approval', "_policy\\s*=\\s*(?:\"|')never(?:\"|')"]),
    literalToken(['danger', '-full-access']),
    regexToken(['sandbox', '_mode'], ['sandbox', '_mode\\s*=']),
    regexToken(['network', '_access'], ['network', '_access\\s*=']),
    regexToken(['network', ' full access'], ['network', '[-_ ]full[-_ ]access'], 'i')
  ];

  const files = [...(await listFiles('scripts')), ...(await listFiles('plugins'))];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    for (const item of forbidden) {
      assert(!item.test(text), `${path.relative(repoRoot, file)} contains forbidden runtime config marker: ${item.label}`);
    }
  }
}

async function main() {
  await validateSyntax();
  await validateJson();
  await validateHook();
  await validateInstaller();
  await validateAgents();
  await validateForbiddenRuntimeConfig();
  console.log('Validation passed.');
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
