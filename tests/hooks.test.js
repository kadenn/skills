'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const runtime = require('../hooks/runtime.js');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
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
  assert.equal(runtime.parseChronosMode('/chronos on'), 'default');
  assert.equal(runtime.parseChronosMode('chronos off'), null);
});

test('stuck signal requires repeated failures or repeated edits', () => {
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
  assert.match(runtime.findStuckSignal(edits, now), /edit app.js repeated 4x/);
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
