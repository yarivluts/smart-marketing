import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, taskRows } from './sprints.mjs';

function fixture(t, rows, archive = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'growthos-sprints-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'TASKS.md'), '# Tasks\n\n' + rows.join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'TASKS-COMPLETED.md'), '# Archive\n' + archive);
  fs.writeFileSync(
    path.join(root, 'SPRINTS.json'),
    JSON.stringify({
      version: 1,
      sprints: [
        { id: '1', status: 'active' },
        { id: '2', status: 'planned' },
      ],
    }),
  );
  return root;
}
const row = (key, sprint, status) =>
  `| ${key} | POST events|entities|measures | 0 | ${sprint} | ${status} | Original notes with | and links. |`;
const read = (root, name) => fs.readFileSync(path.join(root, name), 'utf8');

test('completion archives only selected done tasks, preserving notes and unrelated rows', (t) => {
  const completed = row('KAN-1', '1', 'done');
  const other = row('KAN-2', '2', 'done');
  const backlog = row('KAN-3', '-', 'todo');
  const root = fixture(t, [completed, other, backlog]);
  const result = run(root, ['complete', '1']);
  assert.deepEqual(result.archived, ['KAN-1']);
  assert.ok(read(root, 'TASKS-COMPLETED.md').includes(completed));
  assert.deepEqual(
    taskRows(read(root, 'TASKS.md')).map((r) => r.line),
    [other, backlog],
  );
  assert.equal(JSON.parse(read(root, 'SPRINTS.json')).sprints[0].status, 'completed');
  const archive = read(root, 'TASKS-COMPLETED.md');
  assert.equal(run(root, ['complete', '1']).changed, false);
  assert.equal(read(root, 'TASKS-COMPLETED.md'), archive);
});

test('unfinished and verification-pending tasks prevent implicit completion', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'done'), row('KAN-2', '1', 'verification-pending')]);
  const before = read(root, 'TASKS.md');
  assert.throws(() => run(root, ['complete', '1']), /Unfinished tasks/);
  assert.equal(run(root, ['complete-ready']).changed, false);
  assert.equal(read(root, 'TASKS.md'), before);
  assert.equal(read(root, 'TASKS-COMPLETED.md'), '# Archive\n');
});

test('explicit carry-over preserves open statuses and other sprint work', (t) => {
  const root = fixture(t, [
    row('KAN-1', '1', 'done'),
    row('KAN-2', '1', 'needs-human'),
    row('KAN-3', '2', 'todo'),
  ]);
  run(root, ['complete', '1', '--carry-to', '2']);
  assert.deepEqual(
    taskRows(read(root, 'TASKS.md')).map((r) => [r.key, r.sprint, r.status]),
    [
      ['KAN-2', '2', 'needs-human'],
      ['KAN-3', '2', 'todo'],
    ],
  );
  assert.deepEqual(JSON.parse(read(root, 'SPRINTS.json')).sprints[0].carriedKeys, ['KAN-2']);
});

test('backlog carry-over works and dry-run changes no files', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'blocked-by')]);
  const before = read(root, 'TASKS.md');
  assert.equal(run(root, ['complete', '1', '--carry-to', 'backlog', '--dry-run']).dryRun, true);
  assert.equal(read(root, 'TASKS.md'), before);
  run(root, ['complete', '1', '--carry-to', 'backlog']);
  assert.equal(taskRows(read(root, 'TASKS.md'))[0].sprint, '-');
});

test('complete-ready automatically cleans a finished active sprint', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'done')]);
  assert.equal(run(root, ['complete-ready', '--dry-run']).status, 'completed');
  assert.equal(run(root, ['complete-ready']).status, 'completed');
  assert.equal(run(root, ['complete-ready']).changed, false);
});

test('rejects invalid IDs, carry-over, duplicate rows and malformed statuses before writes', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'todo')]);
  for (const args of [
    ['complete', '../1'],
    ['complete', '1', '--carry-to', '1'],
    ['complete', '1', '--carry-to', '9'],
    ['complete', '1', '--force'],
  ])
    assert.throws(() => run(root, args));
  assert.throws(
    () => taskRows(row('KAN-1', '1', 'done') + '\n' + row('KAN-1', '2', 'done')),
    /Duplicate/,
  );
  assert.throws(() => taskRows(row('KAN-1', '1', 'finished')), /Invalid/);
});

test('does not overwrite conflicting archived history', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'done')], row('KAN-1', '2', 'done') + '\n');
  assert.throws(() => run(root, ['complete', '1']), /Conflicting archived task/);
});

test('recovers interrupted closure after tasks were moved, retaining carry-over history', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'done'), row('KAN-2', '1', 'todo')]);
  assert.throws(
    () =>
      run(root, ['complete', '1', '--carry-to', '2'], {
        write: (name, text) => {
          if (name.endsWith('SPRINTS.json')) throw new Error('Simulated interruption');
          fs.writeFileSync(name, text);
        },
      }),
    /Simulated interruption/,
  );
  run(root, ['complete', '1', '--carry-to', '2']);
  assert.equal(taskRows(read(root, 'TASKS-COMPLETED.md')).length, 1);
  assert.deepEqual(JSON.parse(read(root, 'SPRINTS.json')).sprints[0].carriedKeys, ['KAN-2']);
  assert.equal(fs.existsSync(path.join(root, '.sprint-transaction.json')), false);
});

test('recovery refuses to overwrite edits made after interruption', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'done')]);
  assert.throws(() =>
    run(root, ['complete', '1'], {
      write: () => {
        throw new Error('Stopped');
      },
    }),
  );
  fs.appendFileSync(path.join(root, 'TASKS.md'), '\nUser edits\n');
  assert.throws(() => run(root, ['complete', '1']), /conflicts with edits/);
  assert.ok(read(root, 'TASKS.md').includes('User edits'));
});

test('start enforces a single active sprint and cannot reopen completed sprints', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'done')]);
  assert.throws(() => run(root, ['start', '2']), /Complete the active/);
  run(root, ['complete', '1']);
  assert.throws(() => run(root, ['start', '1']), /cannot be restarted/);
  run(root, ['start', '2']);
  assert.equal(run(root, ['list']).find((s) => s.id === '2').status, 'active');
});

test('lock prevents concurrent mutations and CRLF task notes survive', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'done'), row('KAN-2', '2', 'todo')]);
  fs.writeFileSync(path.join(root, 'TASKS.md'), read(root, 'TASKS.md').replaceAll('\n', '\r\n'));
  fs.writeFileSync(path.join(root, '.sprint-lock'), '123');
  assert.throws(() => run(root, ['complete', '1']), /holds .sprint-lock/);
  fs.unlinkSync(path.join(root, '.sprint-lock'));
  run(root, ['complete', '1']);
  assert.ok(read(root, 'TASKS.md').includes('\r\n'));
});

test('plans a future sprint while another is active and rejects empty completion', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'todo')]);
  assert.equal(run(root, ['plan', '8']).status, 'planned');
  run(root, ['complete', '1', '--carry-to', '8']);
  run(root, ['start', '2']);
  assert.equal(run(root, ['complete-ready']).reason, 'Empty sprint.');
  assert.throws(() => run(root, ['complete', '2']), /empty sprint/);
});

test('supports existing Markdown rows without an optional trailing pipe', () => {
  const input = row('KAN-36', '-', 'verification-pending').slice(0, -2);
  const parsed = taskRows(input)[0];
  assert.equal(parsed.sprint, '-');
  assert.equal(parsed.status, 'verification-pending');
  assert.equal(parsed.line, input);
  assert.equal(taskRows(input.replace(' | 0 | ', ' | - | '))[0].sprint, '-');
});

test('does not silently overwrite manual edits made while preparing closure', (t) => {
  const root = fixture(t, [row('KAN-1', '1', 'done')]);
  assert.throws(
    () =>
      run(root, ['complete', '1'], {
        get now() {
          fs.appendFileSync(path.join(root, 'TASKS.md'), '\nConcurrent note\n');
          return '2026-09-12T00:00:00.000Z';
        },
      }),
    /conflicts with edits/,
  );
  assert.ok(read(root, 'TASKS.md').includes('Concurrent note'));
});
