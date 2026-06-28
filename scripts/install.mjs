#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLE_NAMES = ['explorer', 'librarian', 'oracle', 'designer', 'fixer', 'reviewer'];

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usage() {
  return `oh-my-codex-slim installer

Usage:
  oh-my-codex-slim [install] [--dry-run] [--codex-home <path>] [--force]
  node scripts/install.mjs [install] [--dry-run] [--codex-home <path>] [--force]

Options:
  --dry-run            Print planned changes without writing files.
  --codex-home <path>  Use a specific Codex home. Defaults to CODEX_HOME or ~/.codex.
  --force              Back up and replace differing managed agent/config entries.
  --help, -h           Show this help.
`;
}

function parseArgs(argv) {
  const options = {
    command: 'install',
    codexHome: null,
    dryRun: false,
    force: false,
    help: false
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--codex-home') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new UsageError('Missing value for --codex-home.');
      }
      options.codexHome = value;
      i += 1;
    } else if (arg.startsWith('--')) {
      throw new UsageError(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    throw new UsageError(`Unexpected arguments: ${positionals.join(' ')}`);
  }
  if (positionals.length === 1 && positionals[0] !== 'install') {
    throw new UsageError(`Unknown subcommand: ${positionals[0]}`);
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

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
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
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
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

async function nextBackupPath(filePath) {
  const base = `${filePath}.bak.${timestamp()}`;
  let candidate = base;
  let index = 1;
  while (await pathExists(candidate)) {
    candidate = `${base}.${index}`;
    index += 1;
  }
  return candidate;
}

async function backupFile(filePath) {
  const backupPath = await nextBackupPath(filePath);
  await fs.copyFile(filePath, backupPath);
  return backupPath;
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

async function planAgents(sourceAgents, destAgentsDir, force) {
  const plans = [];

  for (const role of ROLE_NAMES) {
    const source = sourceAgents.get(role);
    const destPath = path.join(destAgentsDir, `${role}.toml`);
    const existing = await readOptional(destPath);

    if (existing === null) {
      plans.push({ role, destPath, contents: source.contents, action: 'create' });
    } else if (existing === source.contents) {
      plans.push({ role, destPath, contents: source.contents, action: 'unchanged' });
    } else if (force) {
      plans.push({ role, destPath, contents: source.contents, action: 'overwrite' });
    } else {
      plans.push({
        role,
        destPath,
        contents: source.contents,
        action: 'conflict',
        message: `Agent file exists and differs: ${destPath}. Re-run with --force to back it up and replace it.`
      });
    }
  }

  return plans;
}

function parseTomlValue(line) {
  const match = line.match(/^\s*config_file\s*=\s*(["'])(.*?)\1\s*(?:#.*)?$/);
  return match ? match[2] : null;
}

function findTable(lines, tableName) {
  let start = -1;
  let end = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*\[([^\]]+)]\s*(?:#.*)?$/);
    if (!match) {
      continue;
    }

    const currentName = match[1].trim();
    if (currentName === tableName) {
      start = index;
      end = lines.length;
    } else if (start !== -1) {
      end = index;
      break;
    }
  }

  return start === -1 ? null : { start, end };
}

function planConfig(existingText, configPath, force) {
  const exists = existingText !== null;
  const startingText = existingText ?? '';
  const lines = startingText.replace(/\r\n/g, '\n').split('\n');
  if (startingText === '') {
    lines.length = 0;
  }

  const changes = [];
  const conflicts = [];

  for (const role of ROLE_NAMES) {
    const tableName = `agents.${role}`;
    const expected = `./agents/${role}.toml`;
    const expectedLine = `config_file = "${expected}"`;
    const table = findTable(lines, tableName);

    if (!table) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      lines.push(`[${tableName}]`, expectedLine);
      changes.push(`add [${tableName}]`);
      continue;
    }

    let configLineIndex = -1;
    for (let index = table.start + 1; index < table.end; index += 1) {
      if (/^\s*config_file\s*=/.test(lines[index])) {
        configLineIndex = index;
        break;
      }
    }

    if (configLineIndex === -1) {
      lines.splice(table.start + 1, 0, expectedLine);
      changes.push(`add config_file in [${tableName}]`);
      continue;
    }

    const currentValue = parseTomlValue(lines[configLineIndex]);
    if (currentValue === expected) {
      continue;
    }

    if (!force) {
      conflicts.push(
        `Config entry [${tableName}] has a different config_file in ${configPath}. Re-run with --force to back up config.toml and replace that managed entry.`
      );
      continue;
    }

    lines[configLineIndex] = expectedLine;
    changes.push(`update config_file in [${tableName}]`);
  }

  let nextText = lines.join('\n');
  if (nextText.length > 0 && !nextText.endsWith('\n')) {
    nextText += '\n';
  }

  return {
    configPath,
    exists,
    changes,
    conflicts,
    changed: changes.length > 0,
    nextText
  };
}

function printPlan({ codexHome, agentPlans, configPlan, dryRun, force }) {
  console.log('oh-my-codex-slim installer');
  console.log(`Codex home: ${codexHome}`);
  console.log(`Mode: ${dryRun ? 'dry run' : 'install'}${force ? ' with --force' : ''}`);
  console.log('');
  console.log('Agents:');
  for (const plan of agentPlans) {
    const label = {
      create: 'create',
      unchanged: 'unchanged',
      overwrite: 'backup + overwrite',
      conflict: 'conflict'
    }[plan.action];
    console.log(`- ${label}: ${plan.destPath}`);
  }
  console.log('');
  console.log('Config:');
  if (configPlan.conflicts.length > 0) {
    for (const conflict of configPlan.conflicts) {
      console.log(`- conflict: ${conflict}`);
    }
  }
  if (configPlan.changes.length === 0 && configPlan.conflicts.length === 0) {
    console.log(`- unchanged: ${configPlan.configPath}`);
  } else if (configPlan.changes.length > 0) {
    const action = configPlan.exists ? 'backup + update' : 'create';
    console.log(`- ${action}: ${configPlan.configPath}`);
    for (const change of configPlan.changes) {
      console.log(`  - ${change}`);
    }
  }
  console.log('');
}

async function applyAgentPlans(agentPlans, destAgentsDir) {
  await fs.mkdir(destAgentsDir, { recursive: true });
  for (const plan of agentPlans) {
    if (plan.action === 'create') {
      await atomicWrite(plan.destPath, plan.contents);
      console.log(`Created ${plan.destPath}`);
    } else if (plan.action === 'overwrite') {
      const backupPath = await backupFile(plan.destPath);
      await atomicWrite(plan.destPath, plan.contents);
      console.log(`Backed up ${plan.destPath} to ${backupPath}`);
      console.log(`Updated ${plan.destPath}`);
    }
  }
}

async function applyConfigPlan(configPlan) {
  if (!configPlan.changed) {
    return;
  }

  await fs.mkdir(path.dirname(configPlan.configPath), { recursive: true });
  if (configPlan.exists) {
    const backupPath = await backupFile(configPlan.configPath);
    console.log(`Backed up ${configPlan.configPath} to ${backupPath}`);
  }
  await atomicWrite(configPlan.configPath, configPlan.nextText);
  console.log(`${configPlan.exists ? 'Updated' : 'Created'} ${configPlan.configPath}`);
}

async function install(options) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const sourceAgentsDir = path.join(repoRoot, 'plugins', 'oh-my-codex-slim', 'agents');
  const codexHome = resolveCodexHome(options.codexHome);
  const destAgentsDir = path.join(codexHome, 'agents');
  const configPath = path.join(codexHome, 'config.toml');

  const sourceAgents = await loadSourceAgents(sourceAgentsDir);
  const agentPlans = await planAgents(sourceAgents, destAgentsDir, options.force);
  const existingConfig = await readOptional(configPath);
  const configPlan = planConfig(existingConfig, configPath, options.force);
  const conflicts = [
    ...agentPlans.filter((plan) => plan.action === 'conflict').map((plan) => plan.message),
    ...configPlan.conflicts
  ];

  printPlan({ codexHome, agentPlans, configPlan, dryRun: options.dryRun, force: options.force });

  if (options.dryRun) {
    if (conflicts.length > 0) {
      console.log('Dry run found conflicts; no files were written.');
    } else {
      console.log('Dry run complete; no files were written.');
    }
    return;
  }

  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      console.error(conflict);
    }
    process.exitCode = 1;
    return;
  }

  await applyAgentPlans(agentPlans, destAgentsDir);
  await applyConfigPlan(configPlan);
  console.log('Install complete.');
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

  await install(options);
}

main().catch((error) => {
  console.error(`oh-my-codex-slim install failed: ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
});
