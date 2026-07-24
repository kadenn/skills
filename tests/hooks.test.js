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
    trackRepetition: true,
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

test('stuck signal catches repeated failures but ignores ordinary edit bursts', () => {
  const now = Date.now();
  const failed = [0, 1, 2].map((index) => ({
    at: now - ((index + 1) * 60_000),
    signature: 'same',
    label: 'npm test',
    kind: 'command',
    failed: true,
  }));
  assert.match(runtime.findStuckSignal(failed, now), /npm test repeated 3x/);

  const successful = failed.map((entry) => ({ ...entry, failed: false }));
  assert.equal(runtime.findStuckSignal(successful, now), null);

  const edits = [0, 1, 2, 3].map((index) => ({
    at: now - ((index + 1) * 60_000),
    signature: 'file',
    label: 'edit app.js',
    kind: 'edit',
    failed: false,
  }));
  assert.equal(runtime.findStuckSignal(edits, now), null);
});

test('stuck signal requires sustained edit churn before alerting', () => {
  const now = Date.now();
  const edits = [35, 30, 25, 20, 15, 10, 5, 0].map((minutes) => ({
    at: now - (minutes * 60_000),
    signature: 'same-file',
    label: 'edit app.js',
    kind: 'edit',
    failed: false,
  }));
  assert.match(runtime.findStuckSignal(edits, now), /edit app\.js repeated 8x in 35m/);
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

test('stuck signal recognizes a long-running edit loop', () => {
  const now = Date.now();
  const edits = [180, 150, 120, 90, 60, 0].map((minutes) => ({
    at: now - (minutes * 60_000),
    signature: 'same-file',
    label: 'edit parser.js',
    kind: 'edit',
    failed: false,
  }));
  assert.match(runtime.findStuckSignal(edits, now), /edit parser\.js repeated 6x in 3h/);
});

test('stuck alerts are rate limited', () => {
  const now = Date.now();
  assert.equal(runtime.shouldEmitStuckAlert({}, 'same command repeated 3x', now, 30), true);
  assert.equal(runtime.shouldEmitStuckAlert({ lastStuckAlertAt: now - (10 * 60_000) }, 'same command repeated 4x', now, 30), false);
  assert.equal(runtime.shouldEmitStuckAlert({ lastStuckAlertAt: now - (31 * 60_000) }, 'same command repeated 5x', now, 30), true);
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
    trackRepetition: true,
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

test('post-tool hook alerts the agent when a failure loop emerges', () => {
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
    const third = JSON.parse(runHook(toolEvent, stateRoot));
    assert.equal(third.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(third.hookSpecificOutput.additionalContext, /stuck-signal npm test repeated 3x/);
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
