#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLE_NAMES = ['explorer', 'librarian', 'oracle', 'designer', 'fixer'];

// Official Codex layout: `[agents.<name>]` holds config_file + description; the role's
// config_file TOML layer holds developer_instructions. These descriptions are omo-slim's
// verbatim agent descriptions ("Role guidance shown to Codex when choosing/spawning").
const ROLE_DESCRIPTIONS = {
  explorer: "Fast codebase search and pattern matching. Use for finding files, locating code patterns, and answering 'where is X?' questions.",
  librarian: 'External documentation and library research. Use for official docs lookup, GitHub examples, and understanding library internals.',
  oracle: 'Strategic technical advisor. Use for architecture decisions, complex debugging, code review, simplification, and engineering guidance.',
  designer: 'UI/UX design, review, and implementation. Use for styling, responsive design, component architecture and visual polish.',
  fixer: 'Fast implementation specialist. Receives complete context and task spec, executes code changes efficiently.'
};

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usage() {
  return `oh-my-codex-slim native subagent setup

Usage:
  oh-my-codex-slim [install|setup] [--dry-run] [--codex-home <path>]
  oh-my-codex-slim rollback [--codex-home <path>] [--backup <path>]

Commands:
  install, setup       Replace native Codex agent TOMLs/config with the OMC Slim managed role set.
  rollback             Restore the latest or selected OMC Slim backup.

Options:
  --dry-run            Print planned setup changes without writing files.
  --codex-home <path>  Use a specific Codex home. Defaults to CODEX_HOME or ~/.codex.
  --backup <path>      Roll back from a specific backup directory.
  --help, -h           Show this help.
`;
}

function parseArgs(argv) {
  const options = {
    command: null,
    codexHome: null,
    backup: null,
    dryRun: false,
    help: false
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--codex-home') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new UsageError('Missing value for --codex-home.');
      }
      options.codexHome = value;
      index += 1;
    } else if (arg === '--backup') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new UsageError('Missing value for --backup.');
      }
      options.backup = value;
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new UsageError(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    throw new UsageError(`Unexpected arguments: ${positionals.join(' ')}`);
  }

  options.command = positionals[0] || 'install';
  if (!['install', 'setup', 'rollback'].includes(options.command)) {
    throw new UsageError(`Unknown subcommand: ${options.command}`);
  }
  if (options.command !== 'rollback' && options.backup) {
    throw new UsageError('--backup is only valid with rollback.');
  }
  if (options.command === 'rollback' && options.dryRun) {
    throw new UsageError('--dry-run is only valid with install/setup.');
  }

  return options;
}

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (inputPath === '~') {
    return os.homedir();
  }
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function resolveCodexHome(flagValue) {
  const home = flagValue || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.resolve(expandHome(home));
}

function resolveBackupPath(backupPath) {
  return path.resolve(expandHome(backupPath));
}

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
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

async function lstatOptional(filePath) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function isDirectory(filePath) {
  try {
    return (await fs.lstat(filePath)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function assertNotSymlink(filePath, label) {
  const stat = await lstatOptional(filePath);
  if (stat?.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink: ${filePath}`);
  }
}

async function assertManagedTargetsSafe(codexHome) {
  await assertNotSymlink(path.join(codexHome, 'config.toml'), '$CODEX_HOME/config.toml');
  await assertNotSymlink(path.join(codexHome, 'agents'), '$CODEX_HOME/agents');
}

async function atomicWrite(filePath, contents) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  await fs.writeFile(tempPath, contents, 'utf8');
  await fs.rename(tempPath, filePath);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function nextBackupDir(codexHome) {
  const root = path.join(codexHome, 'omc-slim-backups');
  const baseName = timestamp();
  let candidate = path.join(root, baseName);
  let index = 1;
  while (await pathExists(candidate)) {
    candidate = path.join(root, `${baseName}-${index}`);
    index += 1;
  }
  return candidate;
}

async function copyRecursive(sourcePath, destPath) {
  const stat = await fs.lstat(sourcePath);
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  if (stat.isDirectory()) {
    await fs.mkdir(destPath, { recursive: true });
    for (const entry of await fs.readdir(sourcePath, { withFileTypes: true })) {
      await copyRecursive(path.join(sourcePath, entry.name), path.join(destPath, entry.name));
    }
  } else if (stat.isSymbolicLink()) {
    const target = await fs.readlink(sourcePath);
    await fs.symlink(target, destPath);
  } else if (stat.isFile()) {
    await fs.copyFile(sourcePath, destPath);
  }
}

async function loadSourceAgents(sourceAgentsDir) {
  const sources = new Map();
  for (const role of ROLE_NAMES) {
    const sourcePath = path.join(sourceAgentsDir, `${role}.toml`);
    const contents = await fs.readFile(sourcePath, 'utf8');
    sources.set(role, { sourcePath, contents });
  }
  return sources;
}

function tableName(line) {
  const match = line.match(/^\s*\[([^\[\]][^\]]*)\]\s*(?:#.*)?$/);
  return match ? match[1].trim() : null;
}

function isAnyTableHeader(line) {
  return /^\s*\[+[^\]]+\]+\s*(?:#.*)?$/.test(line);
}

function isAgentSubtable(line) {
  const name = tableName(line);
  return Boolean(name && name.startsWith('agents.'));
}

function removeAgentTables(configText) {
  const lines = configText.replace(/\r\n/g, '\n').split('\n');
  const kept = [];

  for (let index = 0; index < lines.length; ) {
    if (isAgentSubtable(lines[index])) {
      index += 1;
      while (index < lines.length && !isAnyTableHeader(lines[index])) {
        index += 1;
      }
      continue;
    }

    kept.push(lines[index]);
    index += 1;
  }

  while (kept.length > 0 && kept[kept.length - 1].trim() === '') {
    kept.pop();
  }
  return kept.join('\n');
}

function desiredAgentConfigSections() {
  return ROLE_NAMES.map(
    (role) => `[agents.${role}]\nconfig_file = "./agents/${role}.toml"\ndescription = ${JSON.stringify(ROLE_DESCRIPTIONS[role])}`
  ).join('\n\n');
}

function buildConfig(existingText) {
  const base = removeAgentTables(existingText || '');
  const agentSections = desiredAgentConfigSections();
  return base.length > 0 ? `${base}\n\n${agentSections}\n` : `${agentSections}\n`;
}

async function listTopLevelTomls(agentsDir) {
  if (!(await pathExists(agentsDir))) {
    return [];
  }
  if (!(await isDirectory(agentsDir))) {
    throw new Error(`${agentsDir} exists but is not a directory.`);
  }

  const names = [];
  for (const entry of await fs.readdir(agentsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.toml')) {
      names.push(entry.name);
    }
  }
  return names.sort();
}

async function agentsMatchDesired(agentsDir, sourceAgents) {
  const expectedNames = ROLE_NAMES.map((role) => `${role}.toml`).sort();
  const currentNames = await listTopLevelTomls(agentsDir);
  if (currentNames.length !== expectedNames.length) {
    return false;
  }
  for (let index = 0; index < expectedNames.length; index += 1) {
    if (currentNames[index] !== expectedNames[index]) {
      return false;
    }
  }

  for (const role of ROLE_NAMES) {
    const current = await readOptional(path.join(agentsDir, `${role}.toml`));
    if (current !== sourceAgents.get(role).contents) {
      return false;
    }
  }
  return true;
}

async function planInstall({ codexHome, sourceAgents }) {
  await assertManagedTargetsSafe(codexHome);
  const agentsDir = path.join(codexHome, 'agents');
  const configPath = path.join(codexHome, 'config.toml');
  const existingConfig = await readOptional(configPath);
  const nextConfig = buildConfig(existingConfig || '');
  const existingTomls = await listTopLevelTomls(agentsDir);
  const agentsMatch = await agentsMatchDesired(agentsDir, sourceAgents);
  const configMatch = existingConfig === nextConfig;

  return {
    codexHome,
    agentsDir,
    configPath,
    existingConfig,
    nextConfig,
    existingTomls,
    agentsMatch,
    configMatch,
    changed: !agentsMatch || !configMatch
  };
}

function printInstallPlan(plan, dryRun) {
  console.log('oh-my-codex-slim native subagent setup');
  console.log(`Codex home: ${plan.codexHome}`);
  console.log(`Mode: ${dryRun ? 'dry run' : 'install'}`);
  console.log('');

  if (!plan.changed) {
    console.log('Status: unchanged; OMC Slim native agent setup is already installed.');
    return;
  }

  console.log(`${dryRun ? 'Would create' : 'Will create'} backup under: ${path.join(plan.codexHome, 'omc-slim-backups', '<timestamp>')}`);
  console.log(`Agents: ${plan.agentsMatch ? 'unchanged' : 'replace top-level *.toml with explorer, librarian, oracle, designer, fixer'}`);
  if (!plan.agentsMatch && plan.existingTomls.length > 0) {
    console.log(`  Existing top-level TOML files to remove: ${plan.existingTomls.join(', ')}`);
  }
  console.log('  Non-TOML files under agents/ are left in place.');
  console.log(`Config: ${plan.configMatch ? 'unchanged' : 'remove existing [agents.*] tables and append OMC Slim role entries'}`);
  console.log('');
}

async function createBackup(plan) {
  const backupDir = await nextBackupDir(plan.codexHome);
  const configExisted = await pathExists(plan.configPath);
  const agentsDirExisted = await isDirectory(plan.agentsDir);
  await fs.mkdir(backupDir, { recursive: true });

  if (configExisted) {
    await copyRecursive(plan.configPath, path.join(backupDir, 'config.toml'));
  }
  if (agentsDirExisted) {
    await copyRecursive(plan.agentsDir, path.join(backupDir, 'agents'));
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    codexHome: plan.codexHome,
    configExisted,
    agentsDirExisted,
    roles: ROLE_NAMES
  };
  await fs.writeFile(path.join(backupDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return backupDir;
}

async function removeTopLevelTomls(agentsDir) {
  if (!(await pathExists(agentsDir))) {
    return;
  }
  for (const name of await listTopLevelTomls(agentsDir)) {
    await fs.unlink(path.join(agentsDir, name));
  }
}

async function writeAgents(agentsDir, sourceAgents) {
  await fs.mkdir(agentsDir, { recursive: true });
  for (const role of ROLE_NAMES) {
    await atomicWrite(path.join(agentsDir, `${role}.toml`), sourceAgents.get(role).contents);
  }
}

async function install(options) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const sourceAgentsDir = path.join(repoRoot, 'plugins', 'oh-my-codex-slim', 'agents');
  const sourceAgents = await loadSourceAgents(sourceAgentsDir);
  const codexHome = resolveCodexHome(options.codexHome);
  const plan = await planInstall({ codexHome, sourceAgents });

  printInstallPlan(plan, options.dryRun);

  if (options.dryRun) {
    console.log('Dry run complete; no files were written.');
    return;
  }

  if (!plan.changed) {
    return;
  }

  const backupDir = await createBackup(plan);
  console.log(`Created backup: ${backupDir}`);

  if (!plan.agentsMatch) {
    await removeTopLevelTomls(plan.agentsDir);
    await writeAgents(plan.agentsDir, sourceAgents);
    console.log(`Replaced top-level agent TOMLs in ${plan.agentsDir}`);
  }

  if (!plan.configMatch) {
    await atomicWrite(plan.configPath, plan.nextConfig);
    console.log(`Updated ${plan.configPath}`);
  }

  console.log('Install complete.');
}

async function latestBackupDir(codexHome) {
  const root = path.join(codexHome, 'omc-slim-backups');
  if (!(await isDirectory(root))) {
    throw new Error(`No backup directory found under ${root}.`);
  }

  const dirs = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      dirs.push(entry.name);
    }
  }
  dirs.sort();
  for (let index = dirs.length - 1; index >= 0; index -= 1) {
    const candidate = path.join(root, dirs[index]);
    try {
      await loadAndValidateManifest(candidate, codexHome);
      return candidate;
    } catch {
      // Ignore invalid backup directories when choosing the latest usable backup.
    }
  }
  throw new Error(`No valid backups found under ${root}.`);
}

function arraysEqual(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateManifestShape(manifest, backupDir, codexHome) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Invalid backup manifest in ${backupDir}: expected an object.`);
  }
  if (typeof manifest.createdAt !== 'string' || manifest.createdAt.length === 0) {
    throw new Error(`Invalid backup manifest in ${backupDir}: missing createdAt string.`);
  }
  if (typeof manifest.codexHome !== 'string' || manifest.codexHome.length === 0) {
    throw new Error(`Invalid backup manifest in ${backupDir}: missing codexHome string.`);
  }
  if (typeof manifest.configExisted !== 'boolean') {
    throw new Error(`Invalid backup manifest in ${backupDir}: missing configExisted boolean.`);
  }
  if (typeof manifest.agentsDirExisted !== 'boolean') {
    throw new Error(`Invalid backup manifest in ${backupDir}: missing agentsDirExisted boolean.`);
  }
  if (!arraysEqual(manifest.roles, ROLE_NAMES)) {
    throw new Error(`Invalid backup manifest in ${backupDir}: roles must exactly match OMC Slim roles.`);
  }
  if (path.resolve(manifest.codexHome) !== codexHome) {
    throw new Error(`Backup ${backupDir} belongs to a different Codex home: ${manifest.codexHome}`);
  }
}

async function loadAndValidateManifest(backupDir, codexHome) {
  const backupStat = await lstatOptional(backupDir);
  if (!backupStat) {
    throw new Error(`Backup directory does not exist: ${backupDir}`);
  }
  if (backupStat.isSymbolicLink() || !backupStat.isDirectory()) {
    throw new Error(`Backup path is not a directory: ${backupDir}`);
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  const text = await readOptional(manifestPath);
  if (text === null) {
    throw new Error(`Backup directory is missing manifest.json: ${backupDir}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error(`Backup manifest is not valid JSON in ${backupDir}: ${error?.message || String(error)}`);
  }

  validateManifestShape(manifest, backupDir, codexHome);

  if (manifest.configExisted) {
    const backupConfigStat = await lstatOptional(path.join(backupDir, 'config.toml'));
    if (!backupConfigStat || backupConfigStat.isSymbolicLink() || !backupConfigStat.isFile()) {
      throw new Error(`Backup manifest says config.toml existed, but backup config.toml is missing or invalid: ${backupDir}`);
    }
  }
  if (manifest.agentsDirExisted && !(await isDirectory(path.join(backupDir, 'agents')))) {
    throw new Error(`Backup manifest says agents/ existed, but backup is missing agents/: ${backupDir}`);
  }

  return manifest;
}

async function removeRoleTomls(agentsDir) {
  if (!(await pathExists(agentsDir))) {
    return;
  }
  if (!(await isDirectory(agentsDir))) {
    throw new Error(`${agentsDir} exists but is not a directory.`);
  }
  for (const role of ROLE_NAMES) {
    const filePath = path.join(agentsDir, `${role}.toml`);
    if (await pathExists(filePath)) {
      await fs.unlink(filePath);
    }
  }
  try {
    await fs.rmdir(agentsDir);
  } catch (error) {
    if (error?.code !== 'ENOTEMPTY' && error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function rollback(options) {
  const codexHome = resolveCodexHome(options.codexHome);
  const backupDir = options.backup ? resolveBackupPath(options.backup) : await latestBackupDir(codexHome);
  const manifest = await loadAndValidateManifest(backupDir, codexHome);
  const configPath = path.join(codexHome, 'config.toml');
  const agentsDir = path.join(codexHome, 'agents');

  await assertManagedTargetsSafe(codexHome);

  console.log('oh-my-codex-slim rollback');
  console.log(`Codex home: ${codexHome}`);
  console.log(`Backup: ${backupDir}`);
  console.log('');

  if (manifest.configExisted) {
    await fs.mkdir(codexHome, { recursive: true });
    await copyRecursive(path.join(backupDir, 'config.toml'), configPath);
    console.log(`Restored config.toml to ${configPath}`);
  } else {
    await fs.rm(configPath, { force: true });
    console.log(`Removed ${configPath} because no prior config.toml existed.`);
  }

  if (manifest.agentsDirExisted) {
    await fs.rm(agentsDir, { recursive: true, force: true });
    await copyRecursive(path.join(backupDir, 'agents'), agentsDir);
    console.log(`Restored agents directory to ${agentsDir}`);
  } else {
    await removeRoleTomls(agentsDir);
    console.log(`Removed OMC Slim role TOMLs from ${agentsDir} because no prior agents directory existed.`);
  }

  console.log('Rollback complete.');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      console.error('');
      console.error(usage());
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.command === 'rollback') {
    await rollback(options);
  } else {
    await install(options);
  }
}

main().catch((error) => {
  console.error(`oh-my-codex-slim failed: ${error?.message || String(error)}`);
  process.exitCode = 1;
});
