#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const roles = ['explorer', 'librarian', 'oracle', 'designer', 'fixer'];
const hookCli = 'plugins/oh-my-codex-slim/components/orchestrator-hook/cli.cjs';
const jsonFiles = [
  'package.json',
  'marketplace.json',
  '.agents/plugins/marketplace.json',
  'plugins/oh-my-codex-slim/.codex-plugin/plugin.json',
  'plugins/oh-my-codex-slim/hooks/hooks.json'
];
const syntaxFiles = ['scripts/install.mjs', 'scripts/validate.mjs', hookCli];
const openAiYamlFiles = [
  'plugins/oh-my-codex-slim/agents/openai.yaml',
  'plugins/oh-my-codex-slim/skills/oh-my-codex-slim/agents/openai.yaml'
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function runNodeRaw(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input: options.input,
    env: { ...process.env, ...(options.env || {}) }
  });
}

function runNode(args, options = {}) {
  const result = runNodeRaw(args, options);

  if (result.status !== 0) {
    fail(
      `Command failed: node ${args.join(' ')}\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`
    );
  }

  return result;
}

function runNodeExpectFailure(args, options = {}) {
  const result = runNodeRaw(args, options);
  assert(
    result.status !== 0,
    `Command should have failed but exited 0: node ${args.join(' ')}\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`
  );
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

async function validateVersions() {
  const packageJson = JSON.parse(await readText('package.json'));
  const pluginJson = JSON.parse(await readText('plugins/oh-my-codex-slim/.codex-plugin/plugin.json'));
  assert(typeof packageJson.version === 'string' && packageJson.version.length > 0, 'package.json missing version.');
  assert(packageJson.version === pluginJson.version, 'package.json and plugin.json versions must match.');
}

async function validateOpenAiYaml() {
  for (const file of openAiYamlFiles) {
    const text = await readText(file);
    assert(text.includes('interface:'), `${file} must contain interface metadata.`);
    assert(text.includes('default_prompt:'), `${file} must contain default_prompt.`);
  }
}

function requireText(text, needle, file) {
  assert(text.includes(needle), `${file} must contain semantic marker: ${needle}`);
}

async function validatePromptSemantics() {
  const directivePath = 'plugins/oh-my-codex-slim/components/orchestrator-hook/directive.md';
  const skillPath = 'plugins/oh-my-codex-slim/skills/oh-my-codex-slim/SKILL.md';
  const directive = await readText(directivePath);
  const skill = await readText(skillPath);

  assert(directive.length > 4500, 'Directive must be a substantive OMO-slim/Codex orchestration contract.');
  // Markers follow omo-slim's actual orchestrator structure (Role/Agents/Workflow/Communication),
  // adapted for Codex. No invented section names (Intent Gate / Context-Completion Gate / Ask Gate).
  for (const marker of [
    'OMC_SLIM_DIRECTIVE_V1',
    'OMC Slim Orchestrator Context',
    'Understand',
    'Path Selection',
    'Delegation Check',
    'Plan and Parallelize',
    'Validation routing',
    'Verify',
    'Manual QA Gate',
    'Design Handoff',
    'Clarity Over Assumptions',
    'Concise Execution',
    'No Flattery',
    'Honest Pushback',
    'spawn_agent',
    'list_agents',
    'wait_agent',
    'followup_task',
    'send_message',
    'interrupt_agent',
    'task_name',
    'agent_type',
    'lowercase letters, digits, and underscores only',
    'Never simulate native live-agent activity'
  ]) {
    requireText(directive, marker, directivePath);
  }
  for (const forbidden of ['task()', 'background_output', 'bg_', 'ses_', '.omo/notepads', 'Background Job Board', 'Boulder', 'CSV agent jobs']) {
    assert(!directive.includes(forbidden), `${directivePath} must not contain OpenCode-only term: ${forbidden}`);
  }

  for (const [file, text] of [
    [skillPath, skill],
    ...roles.map((role) => [`plugins/oh-my-codex-slim/agents/${role}.toml`, null])
  ]) {
    const fileText = text ?? (await readText(file));
    for (const forbidden of ['task()', 'background_output', 'bg_', 'ses_', '.omo/notepads', 'Background Job Board', 'Boulder', 'CSV agent jobs']) {
      assert(!fileText.includes(forbidden), `${file} must not contain OpenCode-only term: ${forbidden}`);
    }
  }

  assert(skill.length > 2500, 'Skill must be a usable OMO orchestration workflow entry.');
  for (const marker of [
    'Intent Gate',
    'spawn_agent',
    'list_agents',
    'wait_agent',
    'followup_task',
    'agent_type',
    'lowercase letters, digits, and underscores only',
    'Never simulate native live-agent activity',
    'Manual QA Gate',
    'Design Handoff',
    'should I continue'
  ]) {
    requireText(skill, marker, skillPath);
  }

  const readme = await readText('README.md');
  const pluginJsonText = await readText('plugins/oh-my-codex-slim/.codex-plugin/plugin.json');
  const rootMarketplaceText = await readText('marketplace.json');
  const codexMarketplaceText = await readText('.agents/plugins/marketplace.json');
  requireText(readme, 'five OMO-style specialist lanes', 'README.md');
  requireText(readme, 'Runtime multi-agent behavior depends on the Codex host exposing native agent tools', 'README.md');
  requireText(readme, 'collab_agent_spawn_begin', 'README.md');
  requireText(readme, 'A final assistant message that says an agent was spawned is not enough.', 'README.md');
  requireText(pluginJsonText, 'five OMO-style specialist lanes', 'plugins/oh-my-codex-slim/.codex-plugin/plugin.json');
  requireText(rootMarketplaceText, 'five OMO-style specialist lanes', 'marketplace.json');
  requireText(codexMarketplaceText, 'five OMO-style specialist lanes', '.agents/plugins/marketplace.json');
  // omo-slim has no reviewer agent (review = oracle). Guard against re-introducing a reviewer ROLE
  // (agent_type/role enumerations or agent files), while allowing prose like "no reviewer agent".
  assert(!/`reviewer`/.test(directive), 'directive must not list a `reviewer` role.');
  assert(!/`reviewer`/.test(skill), 'skill must not list a `reviewer` role.');
}

function runHook(subcommand, input, env = {}) {
  return runNode([hookCli, 'hook', subcommand], { input, env: { OMC_SLIM_DISABLE: '', ...env } });
}

async function validateHook() {
  // SessionStart: full directive injected once per session.
  const ss = runHook('session-start', JSON.stringify({ hook_event_name: 'SessionStart' }));
  assert(ss.stderr === '', 'SessionStart hook should not write stderr.');
  assert(ss.stdout.endsWith('\n'), 'SessionStart hook output must end with one newline.');
  const ssParsed = JSON.parse(ss.stdout);
  assert(ss.stdout === `${JSON.stringify(ssParsed)}\n`, 'SessionStart output must be exactly one JSON object plus newline.');
  assert(ssParsed.hookSpecificOutput?.hookEventName === 'SessionStart', 'SessionStart output must target SessionStart.');
  assert(
    typeof ssParsed.hookSpecificOutput?.additionalContext === 'string' &&
      ssParsed.hookSpecificOutput.additionalContext.includes('OMC_SLIM_DIRECTIVE_V1'),
    'SessionStart must inject the full directive (OMC_SLIM_DIRECTIVE_V1).'
  );

  // UserPromptSubmit: short per-turn anchor only, NOT a re-stamp of the full directive.
  const ups = runHook('user-prompt-submit', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'Implement this.' }));
  assert(ups.stderr === '', 'UserPromptSubmit hook should not write stderr.');
  const upsParsed = JSON.parse(ups.stdout);
  assert(ups.stdout === `${JSON.stringify(upsParsed)}\n`, 'UserPromptSubmit output must be exactly one JSON object plus newline.');
  assert(upsParsed.hookSpecificOutput?.hookEventName === 'UserPromptSubmit', 'UserPromptSubmit output must target UserPromptSubmit.');
  assert(
    typeof upsParsed.hookSpecificOutput?.additionalContext === 'string' &&
      upsParsed.hookSpecificOutput.additionalContext.includes('OMC_SLIM_ANCHOR_V1'),
    'UserPromptSubmit must inject the short anchor (OMC_SLIM_ANCHOR_V1).'
  );
  assert(
    !upsParsed.hookSpecificOutput.additionalContext.includes('OMC_SLIM_DIRECTIVE_V1'),
    'Per-turn anchor must NOT re-stamp the full directive every turn.'
  );

  // Hook CLI must run from a plugin-cache-like directory without a package.json.
  const pluginCacheLikeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omc-slim-hook-cache-'));
  try {
    const cacheCli = path.join(pluginCacheLikeDir, 'cli.cjs');
    await fs.copyFile(path.join(repoRoot, hookCli), cacheCli);
    await fs.copyFile(
      path.join(repoRoot, 'plugins/oh-my-codex-slim/components/orchestrator-hook/directive.md'),
      path.join(pluginCacheLikeDir, 'directive.md')
    );
    const cacheSs = runNode([cacheCli, 'hook', 'session-start'], {
      input: JSON.stringify({ hook_event_name: 'SessionStart' }),
      env: { OMC_SLIM_DISABLE: '' }
    });
    const cacheParsed = JSON.parse(cacheSs.stdout);
    assert(
      cacheParsed.hookSpecificOutput?.additionalContext?.includes('OMC_SLIM_DIRECTIVE_V1'),
      'Hook CLI must run from a plugin-cache-like directory without package.json.'
    );
  } finally {
    await fs.rm(pluginCacheLikeDir, { recursive: true, force: true });
  }

  // OMC_SLIM_DISABLE (incl. "on") disables both events.
  for (const value of ['1', 'true', 'yes', 'on']) {
    assert(
      runHook('session-start', JSON.stringify({ hook_event_name: 'SessionStart' }), { OMC_SLIM_DISABLE: value }).stdout === '',
      `OMC_SLIM_DISABLE=${value} should disable SessionStart.`
    );
    assert(
      runHook('user-prompt-submit', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'Implement this.' }), { OMC_SLIM_DISABLE: value }).stdout === '',
      `OMC_SLIM_DISABLE=${value} should disable UserPromptSubmit.`
    );
  }

  // Prompt-prefix opt-outs suppress the per-turn anchor.
  for (const prefix of ['[no-omc]', '[omc-off]']) {
    const optedOut = runHook('user-prompt-submit', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: `  ${prefix} skip` }));
    assert(optedOut.stdout === '', `${prefix} prompt should produce empty stdout.`);
  }

  const invalidJson = runHook('user-prompt-submit', '{not json');
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

async function topLevelTomls(dir) {
  if (!(await pathExists(dir))) {
    return [];
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.toml'))
    .map((entry) => entry.name)
    .sort();
}

async function backupDirs(codexHome) {
  const root = path.join(codexHome, 'omc-slim-backups');
  if (!(await pathExists(root))) {
    return [];
  }
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function validateInstaller() {
  const tempCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'omc-slim-validate-'));
  const agentsDir = path.join(tempCodexHome, 'agents');
  const configPath = path.join(tempCodexHome, 'config.toml');
  const legacyConfig = [
    'profile = "keep"',
    '',
    '[tools]',
    'mode = "preserve"',
    '',
    '[agents.legacy]',
    'config_file = "./agents/legacy.toml"',
    'note = "remove this table"',
    '',
    '[workspace]',
    'root = "unchanged"',
    ''
  ].join('\n');
  const legacyAgent = 'name = "legacy"\ndescription = "legacy agent"\n';

  try {
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(configPath, legacyConfig, 'utf8');
    await fs.writeFile(path.join(agentsDir, 'legacy.toml'), legacyAgent, 'utf8');
    await fs.writeFile(path.join(agentsDir, 'notes.txt'), 'keep me\n', 'utf8');

    const dryRunBefore = JSON.stringify(await snapshotFiles(tempCodexHome));
    runNode(['scripts/install.mjs', '--dry-run', '--codex-home', tempCodexHome]);
    const dryRunAfter = JSON.stringify(await snapshotFiles(tempCodexHome));
    assert(dryRunAfter === dryRunBefore, 'Dry run must not write or remove files.');

    runNode(['scripts/install.mjs', '--codex-home', tempCodexHome]);

    const backupsAfterInstall = await backupDirs(tempCodexHome);
    assert(backupsAfterInstall.length === 1, 'First replacement must create exactly one backup.');
    const backupPath = path.join(tempCodexHome, 'omc-slim-backups', backupsAfterInstall[0]);
    assert(await pathExists(path.join(backupPath, 'config.toml')), 'Backup must include prior config.toml.');
    assert(await pathExists(path.join(backupPath, 'agents', 'legacy.toml')), 'Backup must include prior agents directory.');

    const expectedTomls = roles.map((role) => `${role}.toml`).sort();
    assert(
      JSON.stringify(await topLevelTomls(agentsDir)) === JSON.stringify(expectedTomls),
      'Install must leave exactly the five OMC top-level agent TOMLs.'
    );
    assert(await pathExists(path.join(agentsDir, 'notes.txt')), 'Non-TOML files under agents/ must be preserved.');
    assert(!(await pathExists(path.join(agentsDir, 'legacy.toml'))), 'Legacy top-level TOML must be removed.');

    for (const role of roles) {
      const source = await readText(`plugins/oh-my-codex-slim/agents/${role}.toml`);
      const installed = await fs.readFile(path.join(agentsDir, `${role}.toml`), 'utf8');
      assert(installed === source, `Installed ${role}.toml must match bundled source.`);
    }

    const config = await fs.readFile(configPath, 'utf8');
    assert(config.includes('profile = "keep"'), 'Unrelated root config must be preserved.');
    assert(config.includes('[tools]'), 'Unrelated [tools] table must be preserved.');
    assert(config.includes('[workspace]'), 'Unrelated [workspace] table must be preserved.');
    assert(!config.includes('[agents.legacy]'), 'Legacy agent table must be removed from config.');
    const agentTables = [...config.matchAll(/^\[agents\.([^\]]+)]/gm)].map((match) => match[1]).sort();
    assert(JSON.stringify(agentTables) === JSON.stringify([...roles].sort()), 'Config must contain exactly OMC agent tables.');
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
    assert((await backupDirs(tempCodexHome)).length === 1, 'Second installer run must not create a new backup.');

    const missingBackupBefore = JSON.stringify(await snapshotFiles(tempCodexHome));
    runNodeExpectFailure([
      'scripts/install.mjs',
      'rollback',
      '--codex-home',
      tempCodexHome,
      '--backup',
      path.join(tempCodexHome, 'omc-slim-backups', 'not-a-backup')
    ]);
    const missingBackupAfter = JSON.stringify(await snapshotFiles(tempCodexHome));
    assert(missingBackupAfter === missingBackupBefore, 'Missing rollback backup must not modify files.');

    const invalidBackupDir = path.join(tempCodexHome, 'omc-slim-backups', 'invalid-manifest');
    await fs.mkdir(invalidBackupDir, { recursive: true });
    await fs.writeFile(path.join(invalidBackupDir, 'manifest.json'), '{}\n', 'utf8');
    const invalidBackupBefore = JSON.stringify(await snapshotFiles(tempCodexHome));
    runNodeExpectFailure([
      'scripts/install.mjs',
      'rollback',
      '--codex-home',
      tempCodexHome,
      '--backup',
      invalidBackupDir
    ]);
    const invalidBackupAfter = JSON.stringify(await snapshotFiles(tempCodexHome));
    assert(invalidBackupAfter === invalidBackupBefore, 'Invalid rollback backup must not modify files.');

    runNode(['scripts/install.mjs', 'rollback', '--codex-home', tempCodexHome]);
    assert((await fs.readFile(configPath, 'utf8')) === legacyConfig, 'Rollback must restore prior config.toml.');
    assert((await fs.readFile(path.join(agentsDir, 'legacy.toml'), 'utf8')) === legacyAgent, 'Rollback must restore legacy agent.');
    assert((await fs.readFile(path.join(agentsDir, 'notes.txt'), 'utf8')) === 'keep me\n', 'Rollback must restore prior non-TOML file.');
    assert(
      JSON.stringify(await topLevelTomls(agentsDir)) === JSON.stringify(['legacy.toml']),
      'Rollback must restore prior top-level TOML set.'
    );
  } finally {
    await fs.rm(tempCodexHome, { recursive: true, force: true });
  }
}

async function validateEmptyInstallRollback() {
  const tempCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'omc-slim-empty-'));
  const agentsDir = path.join(tempCodexHome, 'agents');
  const configPath = path.join(tempCodexHome, 'config.toml');

  try {
    runNode(['scripts/install.mjs', 'setup', '--codex-home', tempCodexHome]);
    assert((await backupDirs(tempCodexHome)).length === 1, 'Empty home setup must create one backup manifest.');
    assert(await pathExists(configPath), 'Empty home setup must create config.toml.');
    assert(
      JSON.stringify(await topLevelTomls(agentsDir)) === JSON.stringify(roles.map((role) => `${role}.toml`).sort()),
      'Setup alias must install exactly the five OMC role TOMLs.'
    );

    runNode(['scripts/install.mjs', 'rollback', '--codex-home', tempCodexHome]);
    assert(!(await pathExists(configPath)), 'Rollback after empty setup must remove created config.toml.');
    assert(JSON.stringify(await topLevelTomls(agentsDir)) === JSON.stringify([]), 'Rollback after empty setup must remove OMC role TOMLs.');
  } finally {
    await fs.rm(tempCodexHome, { recursive: true, force: true });
  }
}

async function validateSymlinkRejection() {
  if (process.platform === 'win32') {
    return;
  }

  const configTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'omc-slim-symlink-config-'));
  try {
    const codexHome = path.join(configTemp, 'home');
    const configTarget = path.join(configTemp, 'outside-config.toml');
    await fs.mkdir(codexHome, { recursive: true });
    await fs.writeFile(configTarget, 'do not touch\n', 'utf8');
    await fs.symlink(configTarget, path.join(codexHome, 'config.toml'));
    runNodeExpectFailure(['scripts/install.mjs', '--codex-home', codexHome]);
    assert((await fs.readFile(configTarget, 'utf8')) === 'do not touch\n', 'Config symlink target must not be modified.');
    assert(!(await pathExists(path.join(codexHome, 'omc-slim-backups'))), 'Config symlink rejection must not create backups.');
    assert(!(await pathExists(path.join(codexHome, 'agents'))), 'Config symlink rejection must not create agents/.');
  } finally {
    await fs.rm(configTemp, { recursive: true, force: true });
  }

  const agentsTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'omc-slim-symlink-agents-'));
  try {
    const codexHome = path.join(agentsTemp, 'home');
    const outsideAgents = path.join(agentsTemp, 'outside-agents');
    await fs.mkdir(codexHome, { recursive: true });
    await fs.mkdir(outsideAgents, { recursive: true });
    await fs.writeFile(path.join(outsideAgents, 'legacy.toml'), 'name = "outside"\n', 'utf8');
    await fs.symlink(outsideAgents, path.join(codexHome, 'agents'), 'dir');
    runNodeExpectFailure(['scripts/install.mjs', '--codex-home', codexHome]);
    assert(
      (await fs.readFile(path.join(outsideAgents, 'legacy.toml'), 'utf8')) === 'name = "outside"\n',
      'Agents symlink target must not be modified.'
    );
    assert(!(await pathExists(path.join(codexHome, 'config.toml'))), 'Agents symlink rejection must not create config.toml.');
    assert(!(await pathExists(path.join(codexHome, 'omc-slim-backups'))), 'Agents symlink rejection must not create backups.');
  } finally {
    await fs.rm(agentsTemp, { recursive: true, force: true });
  }
}

async function validateAgents() {
  const agentsDir = path.join(repoRoot, 'plugins/oh-my-codex-slim/agents');
  const bannedField = /^(model|model_reasoning_effort|service_tier)\s*=/m;
  const requiredFields = ['name', 'description', 'nickname_candidates', 'developer_instructions'];
  const expectedTomls = roles.map((role) => `${role}.toml`).sort();
  // Markers reflect omo-slim's ACTUAL agent prompt content (faithful port), not invented structure.
  const roleMarkers = {
    explorer: ['fast codebase navigation specialist', '<results>', '<answer>', 'READ-ONLY'],
    librarian: ['research specialist', 'official documentation', 'READ-ONLY'],
    oracle: ['strategic technical advisor and code reviewer', 'YAGNI', 'READ-ONLY'],
    designer: ['frontend UI/UX specialist', 'Design Principles', 'Match Vision to Execution'],
    fixer: ['fast, focused implementation specialist', '<summary>', '<changes>', 'NO delegation']
  };

  assert(
    JSON.stringify(await topLevelTomls(agentsDir)) === JSON.stringify(expectedTomls),
    'Bundled source agent top-level TOMLs must be exactly the five OMC roles.'
  );

  for (const role of roles) {
    const file = path.join(agentsDir, `${role}.toml`);
    const text = await fs.readFile(file, 'utf8');
    assert(text.length > 500, `${role}.toml prompt must be substantially non-trivial.`);
    assert(!bannedField.test(text), `${role}.toml must not set model/reasoning/service tier fields.`);
    for (const field of requiredFields) {
      assert(new RegExp(`^${field}\\s*=`, 'm').test(text), `${role}.toml missing ${field}.`);
    }
    for (const marker of roleMarkers[role]) {
      assert(text.includes(marker), `${role}.toml missing role-specific marker: ${marker}`);
    }
    if (role === 'fixer') {
      assert(!text.includes('Ask Oracle or return'), 'fixer.toml must not regress to direct Oracle orchestration wording.');
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
  await validateVersions();
  await validateOpenAiYaml();
  await validatePromptSemantics();
  await validateHook();
  await validateInstaller();
  await validateEmptyInstallRollback();
  await validateSymlinkRejection();
  await validateAgents();
  await validateForbiddenRuntimeConfig();
  console.log('Validation passed.');
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
