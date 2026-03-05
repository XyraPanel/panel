#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';
import { colors } from 'consola/utils';
import { execa } from 'execa';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonCandidates = [
  resolve(process.cwd(), 'package.json'),
  resolve(__dirname, '../../../package.json'),
];

let projectRoot;
let pkg;

for (const candidate of packageJsonCandidates) {
  try {
    pkg = JSON.parse(await readFile(candidate, 'utf8'));
    projectRoot = dirname(candidate);
    break;
  } catch {}
}

if (!pkg || !projectRoot) {
  consola.error('Unable to locate repository package.json for xyra CLI.');
  process.exit(1);
}
const logger = consola.withDefaults({
  tag: 'xyra',
  fancy: process.stdout.isTTY,
  formatOptions: { compact: true },
});
const defaultEcosystemFile = 'ecosystem.config.cjs';
const defaultPm2App = 'xyrapanel';
const accent = colors.redBright;
const accentSoft = colors.red;
const divider = colors.dim('─'.repeat(58));

const coreCommandSummaries = [
  ['deploy', 'Build and reload/start via PM2'],
  ['pm2', 'Process controls (start/reload/logs)'],
  ['build', 'Nuxt build for Nitro output'],
];

const toolingCommandSummaries = [
  ['nuxt dev', 'Nuxt dev server with HMR'],
  ['lint', 'oxlint suite (fix/type-aware)'],
  ['fmt', 'oxfmt formatters'],
  ['test', 'Vitest run/watch/coverage'],
  ['db', 'Drizzle schema helpers'],
  ['pwa', 'PWA asset generation'],
];

const formatCommandList = (entries) => {
  const longest = entries.reduce((max, [label]) => Math.max(max, label.length), 0) + 2;
  return entries
    .map(
      ([label, description]) =>
        `  ${accent(label.padEnd(longest))}${colors.gray('•')} ${description}`,
    )
    .join('\n');
};

const renderRootHelp = () =>
  [
    `${accent('██╗  ██╗ ██╗   ██╗ ██████╗  █████╗ ██████╗  █████╗ ███╗   ██╗███████╗██╗')} ${colors.dim(`v${pkg.version}`)}`,
    `${accent('╚██╗██╔╝ ╚██╗ ██╔╝ ██╔══██╗██╔══██╗██╔══██╗██╔══██╗████╗  ██║██╔════╝██║')} ${colors.dim('by @26bz & contributors')}`,
    accent(' ╚███╔╝   ╚████╔╝  ██████╔╝███████║██████╔╝███████║██╔██╗ ██║█████╗  ██║'),
    accent(' ██╔██╗    ╚██╔╝   ██╔══██╗██╔══██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║'),
    accent('██╔╝ ██╗    ██║    ██║  ██║██║  ██║██║     ██║  ██║██║ ╚████║███████╗███████╗'),
    accent('╚═╝  ╚═╝    ╚═╝    ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝'),
    divider,
    `${accentSoft('Usage')}\n  ${colors.white('xyra <command> [options]')}`,
    '',
    accentSoft('Core workflows'),
    formatCommandList(coreCommandSummaries),
    '',
    accentSoft('Nuxt & tooling'),
    formatCommandList(toolingCommandSummaries),
    '',
    colors.dim('Tip: run `pnpm link --global` to expose xyra everywhere on your VPS.'),
  ].join('\n');

const envArg = {
  type: 'string',
  default: 'env',
  description: 'PM2 environment block to use (env or env_staging)',
};

const nameArg = {
  type: 'string',
  default: defaultPm2App,
  description: 'PM2 process name to target',
};

const ecosystemArg = {
  type: 'string',
  default: defaultEcosystemFile,
  description: 'Path to a PM2 ecosystem config (relative to the repo root)',
};

const resolvePath = (maybeRelative) =>
  maybeRelative.startsWith('/') ? maybeRelative : resolve(projectRoot, maybeRelative);

async function ensureFile(path) {
  try {
    await access(path);
  } catch {
    logger.error(`Cannot find ecosystem config at: ${path} (cwd: ${process.cwd()})`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function runBinary(bin, args, options = {}) {
  const command = `${bin} ${args.join(' ')}`;
  logger.start(command);
  try {
    return await execa(bin, args, {
      stdio: 'inherit',
      preferLocal: true,
      cwd: projectRoot,
      ...options,
    });
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

function createPm2Command(name, description, args, buildArgs) {
  return defineCommand({
    meta: { name, description },
    args,
    run: async (ctx) => {
      const cliArgs = await buildArgs(ctx.args);
      await runBinary('pm2', cliArgs);
    },
  });
}

const runPnpmScript = (script, extraArgs = []) => runBinary('pnpm', ['run', script, ...extraArgs]);

const createPnpmCommand = (name, description, script) =>
  defineCommand({
    meta: { name, description },
    run: async () => {
      await runPnpmScript(script);
    },
  });

const buildCommand = defineCommand({
  meta: {
    name: 'build',
    description: 'Run pnpm build to produce the Nitro output',
  },
  run: async () => {
    await runBinary('pnpm', ['run', 'build']);
  },
});

const nuxtCommand = defineCommand({
  meta: {
    name: 'nuxt',
    description: 'Nuxt runtime helpers (dev, preview, generate)',
  },
  subCommands: {
    dev: createPnpmCommand('dev', 'Start Nuxt dev server with HMR', 'dev'),
    preview: createPnpmCommand('preview', 'Preview the production build', 'preview'),
    generate: createPnpmCommand('generate', 'Generate static site output', 'generate'),
  },
});

const lintCommand = defineCommand({
  meta: {
    name: 'lint',
    description: 'Run oxlint checks (optionally fix/type-aware)',
  },
  run: async () => {
    await runPnpmScript('lint');
  },
  subCommands: {
    fix: createPnpmCommand('fix', 'Run oxlint --fix', 'lint:fix'),
    'type-aware': createPnpmCommand('type-aware', 'Type-aware linting', 'lint:type-aware'),
    'type-check': createPnpmCommand(
      'type-check',
      'Type-aware lint + type-check',
      'lint:type-check',
    ),
  },
});

const fmtCommand = defineCommand({
  meta: {
    name: 'fmt',
    description: 'Format codebase with oxfmt',
  },
  run: async () => {
    await runPnpmScript('fmt');
  },
  subCommands: {
    check: createPnpmCommand('check', 'Verify formatting without writing', 'fmt:check'),
  },
});

const testCommand = defineCommand({
  meta: {
    name: 'test',
    description: 'Vitest runners (watch / coverage)',
  },
  run: async () => {
    await runPnpmScript('test');
  },
  subCommands: {
    watch: createPnpmCommand('watch', 'Run Vitest in watch mode', 'test:watch'),
    coverage: createPnpmCommand('coverage', 'Run Vitest with coverage enabled', 'test:coverage'),
  },
});

const dbCommand = defineCommand({
  meta: {
    name: 'db',
    description: 'Drizzle schema migrations',
  },
  subCommands: {
    generate: createPnpmCommand('generate', 'Generate new Drizzle migrations', 'db:generate'),
    push: createPnpmCommand('push', 'Push schema to database', 'db:push'),
  },
});

const pwaCommand = createPnpmCommand('pwa', 'Generate PWA assets', 'generate-pwa-assets');

const deployCommand = defineCommand({
  meta: {
    name: 'deploy',
    description: 'Build the app and reload/start it through PM2',
  },
  args: {
    env: envArg,
    name: nameArg,
    ecosystem: ecosystemArg,
    skipBuild: {
      type: 'boolean',
      default: false,
      description: 'Skip the pnpm build step (useful when artifacts already exist)',
    },
  },
  run: async ({ args }) => {
    const ecosystemPath = resolvePath(args.ecosystem);
    if (!(await ensureFile(ecosystemPath))) return;

    if (!args.skipBuild) {
      await runBinary('pnpm', ['run', 'build']);
    }

    const processName = String(args.name ?? defaultPm2App);
    logger.start(`Reloading PM2 process: ${processName}`);
    try {
      await runBinary('pm2', ['reload', processName, '--env', args.env, '--update-env']);
      logger.success('Reloaded existing PM2 process');
    } catch (error) {
      logger.warn('Reload failed, attempting clean start');
      logger.debug(error);
      await runBinary('pm2', [
        'start',
        ecosystemPath,
        '--env',
        args.env,
        '--only',
        processName,
        '--update-env',
      ]);
      logger.success('PM2 process started');
    }
  },
});

const pm2StartCommand = createPm2Command(
  'start',
  'Start PM2 using the ecosystem config',
  { env: envArg, name: nameArg, ecosystem: ecosystemArg },
  async (args) => {
    const ecosystemPath = resolvePath(args.ecosystem);
    if (!(await ensureFile(ecosystemPath))) throw new Error('Ecosystem file not found');
    const procName = args.name?.trim();
    const envBlock = args.env?.trim();
    if (!procName) throw new Error('PM2 process name is required');
    if (!envBlock) throw new Error('PM2 env must be provided (env or env_production)');
    return ['start', ecosystemPath, '--env', envBlock, '--only', procName, '--update-env'];
  },
);

const pm2ReloadCommand = createPm2Command(
  'reload',
  'Reload the running PM2 process',
  { env: envArg, name: nameArg },
  (args) => {
    const procName = args.name?.trim();
    const envBlock = args.env?.trim();
    if (!procName) throw new Error('PM2 process name is required');
    if (!envBlock) throw new Error('PM2 env must be provided (env or env_production)');
    return ['reload', procName, '--env', envBlock, '--update-env'];
  },
);

const pm2RestartCommand = createPm2Command(
  'restart',
  'Restart the PM2 process',
  { env: envArg, name: nameArg },
  (args) => {
    const procName = args.name?.trim();
    const envBlock = args.env?.trim();
    if (!procName) throw new Error('PM2 process name is required');
    if (!envBlock) throw new Error('PM2 env must be provided (env or env_production)');
    return ['restart', procName, '--env', envBlock, '--update-env'];
  },
);

const pm2StopCommand = createPm2Command(
  'stop',
  'Stop the PM2 process',
  { name: nameArg },
  (args) => {
    const procName = args.name?.trim();
    if (!procName) throw new Error('PM2 process name is required');
    return ['stop', procName];
  },
);

const pm2DeleteCommand = createPm2Command(
  'delete',
  'Delete the PM2 process and its metadata',
  { name: nameArg },
  (args) => {
    const procName = args.name?.trim();
    if (!procName) throw new Error('PM2 process name is required');
    return ['delete', procName];
  },
);

const pm2StatusCommand = createPm2Command(
  'status',
  'Show the PM2 status table',
  {
    name: {
      type: 'string',
      description: 'Optionally filter to a single process name',
      default: '',
    },
  },
  (args) => (args.name ? ['status', args.name] : ['status']),
);

const pm2LogsCommand = createPm2Command(
  'logs',
  'Tail PM2 logs for the process',
  {
    name: nameArg,
    lines: {
      type: 'number',
      default: 50,
      description: 'How many lines to show before tailing',
    },
    timestamp: {
      type: 'boolean',
      default: false,
      description: 'Show timestamps for each log line',
    },
  },
  (args) => {
    const procName = args.name?.trim();
    if (!procName) throw new Error('PM2 process name is required');
    const logArgs = ['logs', procName, '--lines', String(args.lines)];
    if (args.timestamp) {
      logArgs.push('--timestamp');
    }
    return logArgs;
  },
);

const PASTE_SERVICE_URL = 'https://paste.xyrapanel.com/api/pastes';

const pm2PasteLogsCommand = defineCommand({
  meta: {
    name: 'paste-logs',
    description: 'Upload recent PM2 logs to the paste service',
  },
  args: {
    name: nameArg,
    lines: {
      type: 'number',
      default: 400,
      description: 'Lines to pull from PM2 logs',
    },
    stream: {
      type: 'string',
      default: 'both',
      description: 'Select which stream to include: both | out | err',
    },
    source: {
      type: 'string',
      description: 'Optional host label to annotate the paste (e.g. node-04)',
      default: '',
    },
    expires: {
      type: 'string',
      default: '1d',
      description: 'Paste expiration (e.g. 10m, 1h, 6h, 1d, 7d, never)',
    },
  },
  run: async ({ args }) => {
    const processName = String(args.name || defaultPm2App).trim();
    if (!processName) throw new Error('PM2 process name is required');
    const pm2Args = ['logs', processName, '--lines', String(args.lines), '--nostream'];
    logger.start(`Collecting PM2 logs for ${processName}`);
    const { all } = await execa('pm2', pm2Args, { cwd: projectRoot, all: true });
    const raw = all ?? '';

    const filtered = (() => {
      if (args.stream === 'out') return raw.replace(/\n\[.*?\]\s*err.*?(?=\n\[|$)/gms, '');
      if (args.stream === 'err') return raw.replace(/\n\[.*?\]\s*out.*?(?=\n\[|$)/gms, '');
      return raw;
    })();

    const maxBytes = 256 * 1024;
    const bodyContent = filtered.length > maxBytes ? filtered.slice(-maxBytes) : filtered;

    const expiresMap = {
      '10m': 10,
      '1h': 60,
      '6h': 360,
      '1d': 1440,
      '7d': 10080,
      never: null,
    };
    const expiresInMinutes = expiresMap[args.expires] ?? expiresMap['1d'];

    const payload = {
      content: bodyContent,
      source: args.source || undefined,
      expiresInMinutes,
    };

    logger.start(`Uploading logs to paste service: ${PASTE_SERVICE_URL}`);
    const response = await fetch(PASTE_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resultText = await response.text();
    if (!response.ok) {
      logger.error(`Paste upload failed (${response.status}): ${resultText}`);
      process.exitCode = 1;
      return;
    }

    try {
      const json = JSON.parse(resultText);
      logger.success('Paste created');
      console.log(json.url || resultText.trim());
    } catch {
      logger.success('Paste created');
      console.log(resultText.trim());
    }
  },
});

const pm2Command = defineCommand({
  meta: {
    name: 'pm2',
    description: 'PM2 helpers for the XyraPanel deployment',
  },
  subCommands: {
    start: pm2StartCommand,
    reload: pm2ReloadCommand,
    restart: pm2RestartCommand,
    stop: pm2StopCommand,
    delete: pm2DeleteCommand,
    status: pm2StatusCommand,
    logs: pm2LogsCommand,
    'paste-logs': pm2PasteLogsCommand,
  },
});

const rootCommand = defineCommand({
  meta: {
    name: 'xyra',
    version: pkg.version,
    description: 'Xyra CLI',
  },
  subCommands: {
    build: buildCommand,
    deploy: deployCommand,
    pm2: pm2Command,
    nuxt: nuxtCommand,
    lint: lintCommand,
    fmt: fmtCommand,
    test: testCommand,
    db: dbCommand,
    pwa: pwaCommand,
  },
});

const userArgs = process.argv.slice(2);
const wantsRootHelp =
  userArgs.length === 0 || (userArgs.length === 1 && ['--help', '-h'].includes(userArgs[0]));

if (wantsRootHelp) {
  console.log(renderRootHelp());
  process.exit(0);
}

try {
  await runMain(rootCommand);
} catch (error) {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
