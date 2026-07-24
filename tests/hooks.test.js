'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const runtime = require('../hooks/runtime.js');
const runtimePath = path.join(__dirname, '..', 'hooks', 'runtime.js');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function runHook(input, stateRoot) {
  const result = spawnSync(process.execPath, [runtimePath], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, XDG_STATE_HOME: stateRoot },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('formatMinutes uses compact stable units', () => {
  assert.equal(runtime.formatMinutes(10_000), '<1m');
  assert.equal(runtime.formatMinutes(12 * 60_000), '12m');
  assert.equal(runtime.formatMinutes(75 * 60_000), '1h15m');
});

test('parseChronosMode supports plain and namespaced commands', () => {
  assert.equal(runtime.parseChronosMode('/chronos off'), 'off');
  assert.equal(runtime.parseChronosMode('/kadenn-skills:chronos minimal'), 'minimal');
  assert.equal(runtime.parseChronosMode('/chronos on'), 'always');
  assert.equal(runtime.parseChronosMode('/chronos always'), 'always');
  assert.equal(runtime.parseChronosMode('chronos off'), null);
});

test('time relevance detects meaningful clock prompts without matching ordinary work', () => {
  assert.equal(runtime.isTimeRelevantPrompt('The demo starts at 15:00 and we have 20 minutes.'), true);
  assert.equal(runtime.isTimeRelevantPrompt('I have been stuck here for 3 hours.'), true);
  assert.equal(runtime.isTimeRelevantPrompt('Bu is ne kadar surer?'), true);
  assert.equal(runtime.isTimeRelevantPrompt('Explain the difference between a stack and a queue.'), false);
  assert.equal(runtime.isTimeRelevantPrompt('The current time is 23:58. Explain stacks and queues.'), false);
  assert.equal(runtime.isTimeRelevantPrompt('Add a timeout to the HTTP client.'), false);
});

test('default chronos activation is event driven', () => {
  const now = Date.UTC(2026, 6, 21, 12, 30);
  const config = {
    mode: 'default',
    trackActivity: true,
    returnGapMinutes: 30,
    focusMinutes: 60,
  };
  const state = {
    startedAt: now - (20 * 60_000),
    lastPromptAt: now - (5 * 60_000),
    chronosMode: null,
    timeFocusUntil: null,
    recentTools: [],
  };

  assert.equal(runtime.chronosTrigger(state, config, 'Explain this function.', null, now), null);
  assert.equal(runtime.chronosTrigger(state, config, 'The deadline is in one hour.', null, now), 'time-prompt');
  assert.equal(runtime.chronosTrigger({ ...state, lastPromptAt: now - (31 * 60_000) }, config, 'Continue.', null, now), 'return-gap');
  assert.equal(runtime.chronosTrigger({ ...state, timeFocusUntil: now + 60_000 }, config, 'Continue.', null, now), 'time-focus');
  assert.equal(runtime.chronosTrigger({ ...state, chronosMode: 'always' }, config, 'Continue.', null, now), 'always');
});

test('focus reminders ignore repetition without meaningful elapsed time', () => {
  const now = Date.now();
  const failed = [0, 1, 2].map((index) => ({
    at: now - ((index + 1) * 60_000),
    signature: 'same',
    label: 'npm test',
    kind: 'command',
    failed: true,
  }));
  assert.equal(runtime.findFocusReminder(failed, now), null);

  const edits = Array.from({ length: 20 }, (_, index) => ({
    at: now - (index * 30_000),
    signature: 'file',
    label: 'edit app.js',
    kind: 'edit',
    failed: false,
  }));
  assert.equal(runtime.findFocusReminder(edits, now), null);
});

test('focus reminder is based on elapsed time, not edit count', () => {
  const now = Date.now();
  const edits = [31, 0].map((minutes) => ({
    at: now - (minutes * 60_000),
    signature: 'same-file',
    label: 'edit app.js',
    kind: 'edit',
    failed: false,
  }));
  assert.equal(runtime.findFocusReminder(edits, now), 'editing app.js for 31m');
});

test('editing another file resets the duration-based focus window', () => {
  const now = Date.now();
  const edits = [
    { at: now - (40 * 60_000), signature: 'app', label: 'edit app.js', kind: 'edit', failed: false },
    { at: now - (20 * 60_000), signature: 'parser', label: 'edit parser.js', kind: 'edit', failed: false },
    { at: now, signature: 'app', label: 'edit app.js', kind: 'edit', failed: false },
  ];
  assert.equal(runtime.findFocusReminder(edits, now), null);
});

test('an inactive file focus does not produce a delayed reminder', () => {
  const now = Date.now();
  const edits = [70, 31].map((minutes) => ({
    at: now - (minutes * 60_000),
    signature: 'same-file',
    label: 'edit app.js',
    kind: 'edit',
    failed: false,
  }));
  assert.equal(runtime.findFocusReminder(edits, now), null);
});

test('apply_patch edits are grouped by their actual targets', () => {
  const first = runtime.toolRecord({
    tool_name: 'apply_patch',
    tool_input: { patch: '*** Begin Patch\n*** Update File: src/app.js\n*** End Patch' },
  });
  const second = runtime.toolRecord({
    tool_name: 'apply_patch',
    tool_input: { patch: '*** Begin Patch\n*** Update File: src/parser.js\n*** End Patch' },
  });
  assert.notEqual(first.signature, second.signature);
  assert.equal(first.label, 'edit app.js');
  assert.equal(second.label, 'edit parser.js');
});

test('commands do not break an active file focus window', () => {
  const now = Date.now();
  const activity = [
    { at: now - (31 * 60_000), signature: 'file', label: 'edit app.js', kind: 'edit', failed: false },
    { at: now - (10 * 60_000), signature: 'test', label: 'npm test', kind: 'command', failed: false },
    { at: now, signature: 'file', label: 'edit app.js', kind: 'edit', failed: false },
  ];
  assert.equal(runtime.findFocusReminder(activity, now), 'editing app.js for 31m');
});

test('focus reminders are rate limited', () => {
  const now = Date.now();
  assert.equal(runtime.shouldEmitFocusReminder({}, 'editing app.js for 31m', now, 30), true);
  assert.equal(runtime.shouldEmitFocusReminder({ lastFocusReminderAt: now - (10 * 60_000) }, 'editing app.js for 41m', now, 30), false);
  assert.equal(runtime.shouldEmitFocusReminder({ lastFocusReminderAt: now - (31 * 60_000) }, 'editing app.js for 62m', now, 30), true);
});

test('chronos block includes reliable session context', () => {
  const now = Date.UTC(2026, 6, 21, 12, 30);
  const state = {
    startedAt: now - (20 * 60_000),
    lastPromptAt: now - (5 * 60_000),
    chronosMode: 'default',
    recentTools: [],
  };
  const block = runtime.buildChronosBlock(state, {
    timezone: 'UTC',
    mode: 'default',
    trackActivity: true,
  }, now);
  assert.match(block, /^\[chronos: 2026-07-21 12:30/);
  assert.match(block, /session \+20m/);
  assert.match(block, /last msg \+5m/);
  assert.match(block, /tz UTC/);
});

test('hook stays silent for ordinary prompts and emits for time-sensitive prompts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kadenn-chronos-prompt-test-'));
  try {
    const session = 'smart-prompt';
    runHook({ hook_event_name: 'SessionStart', session_id: session }, stateRoot);
    const ordinary = runHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: session,
      prompt: 'Explain this helper function.',
    }, stateRoot);
    assert.equal(ordinary, '');

    const timed = runHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: session,
      prompt: 'The deploy deadline is in 20 minutes.',
    }, stateRoot);
    const payload = JSON.parse(timed);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(payload.hookSpecificOutput.additionalContext, /^\[chronos:/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('post-tool hook stays silent for rapidly repeated failures', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kadenn-chronos-loop-test-'));
  try {
    const session = 'failure-loop';
    runHook({ hook_event_name: 'SessionStart', session_id: session }, stateRoot);
    const toolEvent = {
      hook_event_name: 'PostToolUse',
      session_id: session,
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_response: { exit_code: 1 },
    };
    assert.equal(runHook(toolEvent, stateRoot), '');
    assert.equal(runHook(toolEvent, stateRoot), '');
    assert.equal(runHook(toolEvent, stateRoot), '');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('post-tool hook emits a soft reminder after 30 minutes on one file', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kadenn-chronos-focus-test-'));
  try {
    const session = 'file-focus';
    runHook({ hook_event_name: 'SessionStart', session_id: session }, stateRoot);
    const statePath = path.join(stateRoot, 'kadenn-skills', `session-${session}.json`);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const previous = runtime.toolRecord({
      tool_name: 'Edit',
      tool_input: { file_path: '/repo/app.js' },
      tool_response: {},
    }, Date.now() - (31 * 60_000));
    state.recentTools = [previous];
    fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`);

    const output = runHook({
      hook_event_name: 'PostToolUse',
      session_id: session,
      tool_name: 'Edit',
      tool_input: { file_path: '/repo/app.js' },
      tool_response: {},
    }, stateRoot);
    const payload = JSON.parse(output);
    const context = payload.hookSpecificOutput.additionalContext;
    assert.equal(payload.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(context, /focus-reminder editing app\.js for 31m/);
    assert.match(context, /continue if progress is clear/);
    assert.doesNotMatch(context, /stuck-signal|stop/i);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('git commit detection avoids unrelated commands', () => {
  assert.equal(runtime.isGitCommitCommand('git commit -m "test"'), true);
  assert.equal(runtime.isGitCommitCommand('git -C ../repo commit -am "test"'), true);
  assert.equal(runtime.isGitCommitCommand('npm test && git commit -m "test"'), true);
  assert.equal(runtime.isGitCommitCommand('printf "git commit"'), false);
  assert.equal(runtime.isGitCommitCommand('git status'), false);
  assert.equal(runtime.commitIncludesTrackedChanges('git commit --all -m test'), true);
  assert.equal(runtime.commitUsesShellCd('cd repo && git commit -m test'), true);
});

test('sensitive filename rules allow templates but block credential files', () => {
  assert.equal(runtime.deniedFilename('.env'), true);
  assert.equal(runtime.deniedFilename('config/.env.local'), true);
  assert.equal(runtime.deniedFilename('.env.example'), false);
  assert.equal(runtime.deniedFilename('certs/client.pem'), true);
  assert.equal(runtime.deniedFilename('docs/credentials-guide.md'), false);
});

test('patch scan checks added lines and never returns the secret value', () => {
  const fakeToken = `ghp_${'A'.repeat(40)}`;
  const patch = [
    'diff --git a/app.js b/app.js',
    '+++ b/app.js',
    `-${fakeToken}`,
    `+const token = "${fakeToken}";`,
  ].join('\n');
  const findings = runtime.scanPatch(patch);
  assert.deepEqual(findings, [{ file: 'app.js', reason: 'GitHub token' }]);
  assert.equal(JSON.stringify(findings).includes(fakeToken), false);
});

test('scanCommit detects staged secret content in a real repository', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kadenn-skills-hook-test-'));
  try {
    git(repo, ['init', '-q']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test User']);
    fs.writeFileSync(path.join(repo, 'safe.txt'), 'safe\n');
    git(repo, ['add', 'safe.txt']);
    git(repo, ['commit', '-qm', 'initial']);

    const fakeToken = `ghp_${'B'.repeat(40)}`;
    fs.writeFileSync(path.join(repo, 'app.js'), `const token = "${fakeToken}";\n`);
    git(repo, ['add', 'app.js']);
    const findings = runtime.scanCommit(repo, false);
    assert.deepEqual(findings, [{ file: 'app.js', reason: 'GitHub token' }]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
