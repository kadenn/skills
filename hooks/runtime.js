#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_CONFIG = Object.freeze({
  chronos: {
    enabled: true,
    mode: 'default',
    timezone: null,
    trackRepetition: true,
    returnGapMinutes: 30,
    focusMinutes: 60,
    stuckWindowMinutes: 15,
    editLoopCount: 8,
    editLoopMinutes: 30,
    longLoopMinutes: 120,
    historyMinutes: 360,
    stuckAlertCooldownMinutes: 30,
  },
  shipit: { secretScan: true },
});

const SECRET_PATTERNS = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['AWS secret key', /\baws_(?:secret_access_key|secret)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}\b/i],
  ['private key', /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/],
  ['Slack token', /\bxox[abpors]-[A-Za-z0-9-]{10,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['API key assignment', /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_+\/=.-]{24,}["']/i],
];

function readJsonStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function configPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'kadenn-skills', 'config.json');
}

function readConfig() {
  let supplied = {};
  try {
    supplied = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {}
  return {
    chronos: { ...DEFAULT_CONFIG.chronos, ...(supplied.chronos || {}) },
    shipit: { ...DEFAULT_CONFIG.shipit, ...(supplied.shipit || {}) },
  };
}

function stateDir() {
  if (process.env.PLUGIN_DATA) return process.env.PLUGIN_DATA;
  if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'kadenn-skills');
}

function safeSegment(value) {
  return String(value || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
}

function statePath(sessionId) {
  return path.join(stateDir(), `session-${safeSegment(sessionId)}.json`);
}

function ensureStateDir() {
  const dir = stateDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('state path is not a safe directory');
  return dir;
}

function readState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
  } catch {
    return null;
  }
}

function writeState(sessionId, value) {
  const dir = ensureStateDir();
  const target = statePath(sessionId);
  try {
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error('state file is a symlink');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const tmp = path.join(dir, `.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, target);
}

function newState(now = Date.now()) {
  return {
    startedAt: now,
    lastPromptAt: null,
    chronosMode: null,
    timeFocusUntil: null,
    lastStuckAlertAt: null,
    recentTools: [],
  };
}

function emitContext(eventName, text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text,
    },
  }));
}

function emitDeny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

function formatMinutes(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${rest}m` : `${hours}h`;
}

function localStamp(timezone, now = new Date()) {
  const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: resolvedTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    }).formatToParts(now).map((part) => [part.type, part.value]));
    return {
      stamp: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.weekday}`,
      timezone: resolvedTimezone,
    };
  } catch {
    return {
      stamp: now.toISOString().slice(0, 16).replace('T', ' '),
      timezone: 'UTC',
    };
  }
}

function parseChronosMode(prompt) {
  const match = String(prompt || '').match(/^\/(?:kadenn-skills:)?chronos(?:\s+(on|off|default|minimal|strict|always))?\b/i);
  if (!match) return null;
  const mode = (match[1] || 'default').toLowerCase();
  return mode === 'on' ? 'always' : mode;
}

function isTimeRelevantPrompt(prompt) {
  const text = String(prompt || '');
  const clockTerms = /\b(?:deadline|due date|schedule|scheduled|appointment|meeting|demo|launch|deploy window|today|tomorrow|tonight|timezone|elapsed|duration|eta|time remaining|time left|how long|what time|ago|hours?|minutes?|days?|weeks?|bug\u00fcn|yar\u0131n|saat|dakika|hafta|zaman|takvim|toplant\u0131|randevu)\b/i;
  const turkishDuration = /\bne\s+kadar\s+s(?:u|\u00fc)rer\b/i;
  return clockTerms.test(text) || turkishDuration.test(text);
}

function findStuckSignal(recentTools, now = Date.now(), config = {}) {
  const stuckWindowMinutes = config.stuckWindowMinutes ?? 15;
  const editLoopCount = config.editLoopCount ?? 8;
  const editLoopMinutes = config.editLoopMinutes ?? 30;
  const longLoopMinutes = config.longLoopMinutes ?? 120;
  const windowStart = now - (stuckWindowMinutes * 60 * 1000);
  const groups = new Map();
  for (const entry of recentTools || []) {
    if (!entry) continue;
    const list = groups.get(entry.signature) || [];
    list.push(entry);
    groups.set(entry.signature, list);
  }
  let best = null;
  for (const unsorted of groups.values()) {
    const entries = [...unsorted].sort((left, right) => left.at - right.at);
    const recent = entries.filter((entry) => entry.at >= windowStart);
    const recentFailures = recent.filter((entry) => entry.failed).length;
    const immediateFailureLoop = recentFailures >= 3;

    const failures = entries.filter((entry) => entry.failed).length;
    const span = entries.length ? entries.at(-1).at - entries[0].at : 0;
    const sustainedEditLoop = entries[0]?.kind === 'edit'
      && entries.length >= editLoopCount
      && span >= editLoopMinutes * 60 * 1000;
    const longEnough = span >= longLoopMinutes * 60 * 1000;
    const longEditLoop = entries[0]?.kind === 'edit' && entries.length >= 6 && longEnough;
    const longFailureLoop = failures >= 2 && entries.length >= 6 && longEnough;

    let candidate = null;
    if (immediateFailureLoop) {
      candidate = { entries: recent, failures: recentFailures };
    } else if (sustainedEditLoop || longEditLoop || longFailureLoop) {
      candidate = { entries, failures };
    }
    if (candidate && (!best || candidate.entries.length > best.entries.length)) best = candidate;
  }
  if (!best) return null;
  const first = best.entries[0];
  const elapsed = formatMinutes(now - first.at);
  const suffix = best.failures ? `, ${best.failures} failed` : '';
  return `${first.label} repeated ${best.entries.length}x in ${elapsed}${suffix}`;
}

function chronosTrigger(state, config, prompt, requestedMode = null, now = Date.now()) {
  const mode = requestedMode || state.chronosMode || config.mode || 'default';
  if (mode === 'off') return null;
  if (requestedMode) return 'mode-change';
  if (mode === 'always') return 'always';
  if (isTimeRelevantPrompt(prompt)) return 'time-prompt';
  if (mode === 'minimal') return null;
  if (state.timeFocusUntil && state.timeFocusUntil > now) return 'time-focus';
  const returnGapMinutes = config.returnGapMinutes ?? 30;
  if (state.lastPromptAt && now - state.lastPromptAt >= returnGapMinutes * 60 * 1000) {
    return 'return-gap';
  }
  if (config.trackRepetition) {
    const signal = findStuckSignal(state.recentTools, now, config);
    const cooldown = config.stuckAlertCooldownMinutes ?? 30;
    if (shouldEmitStuckAlert(state, signal, now, cooldown)) return 'stuck-signal';
  }
  return null;
}

function shouldEmitStuckAlert(state, signal, now = Date.now(), cooldownMinutes = 30) {
  if (!signal) return false;
  if (!state.lastStuckAlertAt) return true;
  return now - state.lastStuckAlertAt >= cooldownMinutes * 60 * 1000;
}

function buildChronosBlock(state, config, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const { stamp, timezone } = localStamp(config.timezone, now);
  const mode = state.chronosMode || config.mode || 'default';
  const parts = [stamp];
  if (mode !== 'minimal') {
    parts.push(`session +${formatMinutes(nowMs - state.startedAt)}`);
    if (state.lastPromptAt) parts.push(`last msg +${formatMinutes(nowMs - state.lastPromptAt)}`);
  }
  parts.push(`tz ${timezone}`);
  if (mode !== 'default') parts.push(`mode ${mode}`);
  if (mode !== 'minimal' && config.trackRepetition) {
    const signal = findStuckSignal(state.recentTools, nowMs, config);
    if (signal) parts.push(`stuck-signal ${signal} (review progress; continue if productive)`);
  }
  return `[chronos: ${parts.join(' | ')}]`;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

function safeCommandLabel(command) {
  const words = String(command || '').trim().split(/\s+/).slice(0, 2);
  const safe = words.map((word) => word.replace(/[^a-zA-Z0-9_.:@/-]/g, '')).filter(Boolean);
  return safe.length ? safe.join(' ').slice(0, 60) : 'shell command';
}

function toolRecord(input, now = Date.now()) {
  const toolName = input.tool_name || input.toolName || '';
  const toolInput = input.tool_input || input.toolInput || {};
  const response = input.tool_response || input.toolResponse || {};
  const failed = Boolean(response.is_error || response.error || response.exit_code > 0 || response.exitCode > 0);
  if (toolName === 'Bash' || toolName === 'exec_command') {
    const command = toolInput.command || toolInput.cmd || '';
    return {
      at: now,
      signature: `bash:${stableHash(command.replace(/\s+/g, ' ').trim())}`,
      label: safeCommandLabel(command),
      kind: 'command',
      failed,
    };
  }
  const patchText = typeof toolInput === 'string'
    ? toolInput
    : toolInput.patch || toolInput.input || '';
  const patchTargets = [...String(patchText).matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .sort();
  const filePath = toolInput.file_path || toolInput.path || (patchTargets.length === 1 ? patchTargets[0] : '');
  const targetKey = patchTargets.length > 1 ? patchTargets.join('\0') : filePath;
  return {
    at: now,
    signature: `edit:${stableHash(targetKey || toolName)}`,
    label: patchTargets.length > 1 ? `edit ${patchTargets.length} files` : (filePath ? `edit ${path.basename(filePath)}` : 'file edit'),
    kind: 'edit',
    failed,
  };
}

function isGitCommitCommand(command) {
  return /(?:^|[;&|]\s*)(?:env\s+\S+\s+)*git(?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))?\s+commit(?:\s|$)/m.test(String(command || ''));
}

function commitIncludesTrackedChanges(command) {
  return /(?:^|\s)(?:-a|--all)(?:\s|$)/.test(String(command || ''));
}

function commitUsesShellCd(command) {
  const beforeCommit = String(command || '').split(/git(?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))?\s+commit/)[0];
  return /(?:^|[;&|]\s*)cd\s+/.test(beforeCommit);
}

function gitCwd(command, fallbackCwd) {
  const match = String(command || '').match(/git\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s+commit/);
  if (!match) return fallbackCwd;
  const supplied = match[1] || match[2] || match[3];
  return path.resolve(fallbackCwd, supplied);
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || `git ${args[0]} failed`).trim());
  return result.stdout || '';
}

function deniedFilename(file) {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  const base = path.posix.basename(normalized);
  if (/^\.env(?:\..+)?$/.test(base) && !/\.(?:example|sample|template)$/.test(base)) return true;
  if (base === '.npmrc' || base === 'credentials.json') return true;
  if (/\.(?:pem|p12|pfx|key)$/.test(base)) return true;
  if (/^(?:id_rsa|id_ed25519)$/.test(base)) return true;
  return /(?:^|\/)(?:secrets?|credentials)(?:\/|$)/.test(normalized);
}

function scanPatch(patchText) {
  const findings = [];
  let currentFile = null;
  for (const line of String(patchText || '').split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const added = line.slice(1);
    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(added)) findings.push({ file: currentFile || 'unknown', reason: label });
    }
  }
  return uniqueFindings(findings);
}

function uniqueFindings(findings) {
  const seen = new Set();
  const specificFiles = new Set(findings
    .filter((finding) => finding.reason !== 'API key assignment')
    .map((finding) => finding.file));
  return findings.filter((finding) => {
    if (finding.reason === 'API key assignment' && specificFiles.has(finding.file)) return false;
    const key = `${finding.file}:${finding.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scanCommit(cwd, includeTracked) {
  runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  const stagedFiles = runGit(cwd, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
  let files = [...stagedFiles];
  let patchText = runGit(cwd, ['diff', '--cached', '--no-ext-diff', '--unified=0']);
  if (includeTracked) {
    const tracked = runGit(cwd, ['diff', '--name-only', '-z']).split('\0').filter(Boolean);
    files = [...files, ...tracked];
    patchText += `\n${runGit(cwd, ['diff', '--no-ext-diff', '--unified=0'])}`;
  }
  const filenameFindings = files.filter(deniedFilename).map((file) => ({ file, reason: 'sensitive filename' }));
  return uniqueFindings([...filenameFindings, ...scanPatch(patchText)]);
}

function formatDeny(findings) {
  const listed = findings.slice(0, 5).map((finding) => `${finding.reason} in ${finding.file}`).join('; ');
  const more = findings.length > 5 ? `; plus ${findings.length - 5} more` : '';
  return `Shipit blocked this commit because staged content may contain a secret: ${listed}${more}. Remove or unstage the sensitive content, then retry. No credential value was included in this message.`;
}

function handleSessionStart(input) {
  const existing = readState(input.session_id);
  writeState(input.session_id, existing || newState());
}

function handleUserPrompt(input, config, now = Date.now()) {
  if (!config.chronos.enabled) return;
  const state = readState(input.session_id) || newState(now);
  const prompt = input.prompt || input.user_prompt || '';
  const requestedMode = parseChronosMode(prompt);
  if (requestedMode) state.chronosMode = requestedMode;
  const mode = state.chronosMode || config.chronos.mode || 'default';
  if (mode === 'off') {
    state.lastPromptAt = now;
    writeState(input.session_id, state);
    if (requestedMode) emitContext('UserPromptSubmit', '<chronos>disabled for this session</chronos>');
    return;
  }
  const trigger = chronosTrigger(state, config.chronos, prompt, requestedMode, now);
  if (isTimeRelevantPrompt(prompt)) {
    const focusMinutes = config.chronos.focusMinutes ?? 60;
    state.timeFocusUntil = now + focusMinutes * 60 * 1000;
  }
  if (trigger === 'stuck-signal') state.lastStuckAlertAt = now;
  const block = trigger ? buildChronosBlock(state, config.chronos, now) : null;
  state.lastPromptAt = now;
  writeState(input.session_id, state);
  if (block) emitContext('UserPromptSubmit', block);
}

function handlePostTool(input, config, now = Date.now()) {
  if (!config.chronos.enabled || !config.chronos.trackRepetition) return;
  const state = readState(input.session_id) || newState(now);
  const mode = state.chronosMode || config.chronos.mode || 'default';
  if (mode === 'off' || mode === 'minimal') return;
  const longLoopMinutes = config.chronos.longLoopMinutes ?? 120;
  const historyMinutes = Math.max(
    config.chronos.historyMinutes ?? 360,
    longLoopMinutes + 60,
  );
  state.recentTools = [...(state.recentTools || []), toolRecord(input, now)]
    .filter((entry) => entry.at >= now - (historyMinutes * 60 * 1000))
    .slice(-100);
  const signal = findStuckSignal(state.recentTools, now, config.chronos);
  const cooldown = config.chronos.stuckAlertCooldownMinutes ?? 30;
  const alert = shouldEmitStuckAlert(state, signal, now, cooldown);
  if (alert) state.lastStuckAlertAt = now;
  writeState(input.session_id, state);
  if (alert) emitContext('PostToolUse', buildChronosBlock(state, config.chronos, now));
}

function handlePreTool(input, config) {
  if (!config.shipit.secretScan) return;
  const toolName = input.tool_name || input.toolName;
  if (toolName !== 'Bash' && toolName !== 'exec_command') return;
  const toolInput = input.tool_input || input.toolInput || {};
  const command = toolInput.command || toolInput.cmd || '';
  if (!isGitCommitCommand(command)) return;
  if (commitUsesShellCd(command) && !/git\s+-C\s+/.test(command)) {
    emitDeny('Shipit could not safely resolve the repository for a commit preceded by shell cd. Run the commit from the repository working directory or use git -C <path> commit so staged content can be scanned.');
    return;
  }
  try {
    const cwd = gitCwd(command, input.cwd || process.cwd());
    const findings = scanCommit(cwd, commitIncludesTrackedChanges(command));
    if (findings.length) emitDeny(formatDeny(findings));
  } catch (error) {
    emitDeny(`Shipit could not complete the staged-content scan, so it blocked the commit: ${String(error.message || error).slice(0, 240)}`);
  }
}

function main() {
  const input = readJsonStdin();
  const config = readConfig();
  const event = input.hook_event_name || input.hookEventName;
  if (event === 'SessionStart') return handleSessionStart(input);
  if (event === 'UserPromptSubmit') return handleUserPrompt(input, config);
  if (event === 'PostToolUse') return handlePostTool(input, config);
  if (event === 'PreToolUse') return handlePreTool(input, config);
}

if (require.main === module) {
  try {
    main();
  } catch {
    process.exitCode = 0;
  }
}

module.exports = {
  DEFAULT_CONFIG,
  SECRET_PATTERNS,
  buildChronosBlock,
  chronosTrigger,
  commitIncludesTrackedChanges,
  commitUsesShellCd,
  deniedFilename,
  findStuckSignal,
  formatDeny,
  formatMinutes,
  gitCwd,
  isTimeRelevantPrompt,
  isGitCommitCommand,
  localStamp,
  parseChronosMode,
  safeCommandLabel,
  scanCommit,
  scanPatch,
  shouldEmitStuckAlert,
  toolRecord,
  uniqueFindings,
};
