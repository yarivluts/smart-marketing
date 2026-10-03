import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const statuses = new Set([
  'todo',
  'in-progress',
  'done',
  'verification-pending',
  'needs-human',
  'blocked-by',
]);
const rowPattern = /^(\| (KAN-\d+) \| .*? \| (?:\d+|-) \| )(\d+|-)( \| ([a-z-]+) \| .*)$/;
const header =
  '# Completed GrowthOS tasks\n\nArchived on sprint completion. Original task notes are preserved.\n\n| KAN | Story | Phase | Sprint | Status | Notes |\n| --- | --- | --- | --- | --- | --- |\n';

export function taskRows(text) {
  const seen = new Set();
  return text.split(/\r?\n/).flatMap((line) => {
    if (!/^\| KAN-/.test(line)) return [];
    const match = rowPattern.exec(line);
    if (!match || !statuses.has(match[5]))
      throw new Error(`Invalid task row: ${line.slice(0, 100)}`);
    if (seen.has(match[2])) throw new Error(`Duplicate task: ${match[2]}`);
    seen.add(match[2]);
    return [
      {
        key: match[2],
        sprint: match[3],
        status: match[5],
        line,
        prefix: match[1],
        suffix: match[4],
      },
    ];
  });
}

function sprintId(value) {
  if (!/^[1-9]\d*$/.test(value ?? '')) throw new Error('Sprint ID must be a positive integer.');
  return value;
}

function readWorkspace(root) {
  const tasks = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
  const archivePath = path.join(root, 'TASKS-COMPLETED.md');
  const archiveExists = fs.existsSync(archivePath);
  const archive = archiveExists ? fs.readFileSync(archivePath, 'utf8') : header;
  const stateText = fs.readFileSync(path.join(root, 'SPRINTS.json'), 'utf8');
  const state = JSON.parse(stateText);
  if (state.version !== 1 || !Array.isArray(state.sprints))
    throw new Error('Invalid SPRINTS.json.');
  const ids = new Set();
  for (const sprint of state.sprints) {
    sprintId(sprint.id);
    if (ids.has(sprint.id) || !['planned', 'active', 'completed'].includes(sprint.status)) {
      throw new Error('Duplicate sprint or invalid sprint status.');
    }
    ids.add(sprint.id);
  }
  if (state.sprints.filter((s) => s.status === 'active').length > 1)
    throw new Error('Only one sprint can be active.');
  const rows = taskRows(tasks);
  const archived = taskRows(archive);
  if (archived.some((r) => r.status !== 'done'))
    throw new Error('Archive contains an unfinished task.');
  for (const row of rows) {
    if (row.sprint !== '-' && !ids.has(row.sprint))
      throw new Error(`Unknown sprint ${row.sprint} for ${row.key}.`);
    if (state.sprints.some((s) => s.id === row.sprint && s.status === 'completed')) {
      throw new Error(
        `Completed sprint ${row.sprint} contains active task ${row.key}; reassign it before continuing.`,
      );
    }
    const duplicate = archived.find((a) => a.key === row.key);
    // Identical duplicates are safe to resume after archive-first write interruption.
    if (duplicate && (row.status !== 'done' || duplicate.line !== row.line)) {
      throw new Error(`Conflicting archived task ${row.key}; reconcile it before continuing.`);
    }
  }
  return { tasks, archive, archiveExists, state, stateText, rows, archived };
}

function atomicWrite(filename, text) {
  const temporary = `${filename}.sprint-tmp`;
  try {
    fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function recoverTransaction(root, write) {
  const journal = path.join(root, '.sprint-transaction.json');
  if (!fs.existsSync(journal)) return;
  const transaction = JSON.parse(fs.readFileSync(journal, 'utf8'));
  const names = ['TASKS-COMPLETED.md', 'TASKS.md', 'SPRINTS.json'];
  if (
    transaction.version !== 1 ||
    !Array.isArray(transaction.files) ||
    transaction.files.length !== names.length
  ) {
    throw new Error('Invalid sprint transaction journal.');
  }
  for (const [i, file] of transaction.files.entries()) {
    if (
      file.name !== names[i] ||
      typeof file.after !== 'string' ||
      !(file.before === null || typeof file.before === 'string')
    ) {
      throw new Error('Invalid sprint transaction entry.');
    }
    const filename = path.join(root, file.name);
    const current = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : null;
    if (current !== file.before && current !== file.after) {
      throw new Error(
        `Interrupted sprint closure conflicts with edits to ${file.name}; reconcile the journal before retrying.`,
      );
    }
  }
  for (const file of transaction.files) write(path.join(root, file.name), file.after);
  fs.unlinkSync(journal);
}

export function run(root, args, options = {}) {
  const [command = 'list', id, ...flags] = args;
  if (!['list', 'plan', 'start', 'complete', 'complete-ready'].includes(command)) {
    throw new Error(
      'Usage: pnpm sprints list | plan ID | start ID | complete ID [--carry-to ID|backlog] [--dry-run] | complete-ready [--dry-run]',
    );
  }
  const actualFlags = command === 'complete-ready' ? args.slice(1) : flags;
  const dryRun = actualFlags.includes('--dry-run');
  let carry;
  const used = new Set();
  for (let i = 0; i < actualFlags.length; i++) {
    const flag = actualFlags[i];
    if (used.has(flag)) throw new Error(`Repeated option ${flag}`);
    used.add(flag);
    if (flag === '--dry-run' && ['complete', 'complete-ready'].includes(command)) continue;
    if (flag === '--carry-to' && command === 'complete') {
      carry = actualFlags[++i];
      if (carry !== 'backlog') sprintId(carry);
    } else throw new Error(`Unexpected option ${flag}`);
  }
  if (command === 'list' && args.length > 1) throw new Error('list takes no arguments.');
  if (command === 'start' && flags.length) throw new Error('start takes only a sprint ID.');
  if (['plan', 'start', 'complete'].includes(command)) sprintId(id);

  const lockPath = path.join(root, '.sprint-lock');
  let lock;
  try {
    if (command !== 'list' && !dryRun) {
      try {
        lock = fs.openSync(lockPath, 'wx');
      } catch (error) {
        if (error.code === 'EEXIST')
          throw new Error(
            'Another sprint operation holds .sprint-lock. If it crashed, ensure it has stopped before removing that lock.',
          );
        throw error;
      }
      fs.writeFileSync(lock, String(process.pid));
    }
    const write = options.write ?? atomicWrite;
    if (fs.existsSync(path.join(root, '.sprint-transaction.json'))) {
      if (command === 'list' || dryRun)
        throw new Error(
          'Interrupted closure pending. Rerun the original completion command to recover.',
        );
      recoverTransaction(root, write);
    }
    const workspace = readWorkspace(root);
    const { tasks, archive, state, rows, archived } = workspace;
    if (command === 'list') {
      return state.sprints.map((s) => ({
        ...s,
        open: rows.filter((r) => r.sprint === s.id && r.status !== 'done').length,
        readyToArchive: rows.filter((r) => r.sprint === s.id && r.status === 'done').length,
        archived: archived.filter((r) => r.sprint === s.id).length,
      }));
    }
    const now = options.now ?? new Date().toISOString();
    const saveState = () =>
      write(path.join(root, 'SPRINTS.json'), JSON.stringify(state, null, 2) + '\n');
    if (command === 'plan') {
      const existing = state.sprints.find((s) => s.id === id);
      if (existing) return { sprint: id, status: existing.status, changed: false };
      state.sprints.push({ id, status: 'planned' });
      saveState();
      return { sprint: id, status: 'planned' };
    }
    if (command === 'start') {
      if (state.sprints.some((s) => s.status === 'active' && s.id !== id))
        throw new Error('Complete the active sprint first.');
      let sprint = state.sprints.find((s) => s.id === id);
      if (sprint?.status === 'completed')
        throw new Error('Completed sprints cannot be restarted. Use a new sprint ID.');
      if (!sprint) {
        sprint = { id, status: 'planned' };
        state.sprints.push(sprint);
      }
      if (sprint.status === 'active') return { sprint: id, status: 'active', changed: false };
      sprint.status = 'active';
      sprint.startedAt = now;
      saveState();
      return { sprint: id, status: 'active' };
    }
    const sprint =
      command === 'complete-ready'
        ? state.sprints.find((s) => s.status === 'active')
        : state.sprints.find((s) => s.id === id);
    if (!sprint && command === 'complete-ready')
      return { changed: false, reason: 'No active sprint.' };
    if (!sprint) throw new Error(`Unknown sprint ${id}.`);
    if (sprint.status === 'completed')
      return { sprint: sprint.id, status: 'completed', changed: false };
    if (sprint.status !== 'active') throw new Error('Start the sprint before completing it.');
    const selected = rows.filter((r) => r.sprint === sprint.id);
    if (!selected.length && !archived.some((r) => r.sprint === sprint.id)) {
      if (command === 'complete-ready')
        return { sprint: sprint.id, changed: false, reason: 'Empty sprint.' };
      throw new Error('Cannot complete an empty sprint. Assign tasks first.');
    }
    const unfinished = selected.filter((r) => r.status !== 'done');
    if (command === 'complete-ready' && unfinished.length) {
      return { sprint: sprint.id, changed: false, remaining: unfinished.map((r) => r.key) };
    }
    if (carry === sprint.id) throw new Error('Carry-over destination must be a different sprint.');
    if (
      carry &&
      carry !== 'backlog' &&
      !state.sprints.some((s) => s.id === carry && s.status !== 'completed')
    ) {
      throw new Error('Carry-over destination must be an existing unfinished sprint, or backlog.');
    }
    if (unfinished.length && !carry)
      throw new Error(
        `Unfinished tasks: ${unfinished.map((r) => r.key).join(', ')}. Use --carry-to ID or --carry-to backlog.`,
      );
    const completed = selected.filter((r) => r.status === 'done');
    const additions = completed.filter((r) => !archived.some((a) => a.key === r.key));
    const selectedByLine = new Map(selected.map((r) => [r.line, r]));
    const eol = tasks.includes('\r\n') ? '\r\n' : '\n';
    const updatedTasks = tasks
      .split(/\r?\n/)
      .flatMap((line) => {
        const row = selectedByLine.get(line);
        if (!row) return [line];
        if (row.status === 'done') return [];
        return [row.prefix + (carry === 'backlog' ? '-' : carry) + row.suffix];
      })
      .join(eol);
    const outcome = {
      sprint: sprint.id,
      status: 'completed',
      archived: completed.map((r) => r.key),
      carried: unfinished.map((r) => r.key),
      carryTo: carry ?? null,
      dryRun,
    };
    if (dryRun) return outcome;
    // Archive first: interruption can duplicate a row, but cannot lose task history.
    // A retry accepts identical duplicates and finishes removing the active copy.
    const updatedArchive = additions.length
      ? archive.trimEnd() + '\n' + additions.map((r) => r.line).join('\n') + '\n'
      : archive;
    sprint.status = 'completed';
    sprint.completedAt = now;
    sprint.archivedKeys = [
      ...new Set(
        [...archived.filter((r) => r.sprint === sprint.id), ...completed].map((r) => r.key),
      ),
    ];
    sprint.carriedKeys = unfinished.map((r) => r.key);
    sprint.carryTo = carry ?? null;
    const files = [
      ['TASKS-COMPLETED.md', workspace.archiveExists ? archive : null, updatedArchive],
      ['TASKS.md', tasks, updatedTasks],
      ['SPRINTS.json', workspace.stateText, JSON.stringify(state, null, 2) + '\n'],
    ].map(([name, before, after]) => ({ name, before, after }));
    atomicWrite(
      path.join(root, '.sprint-transaction.json'),
      JSON.stringify({ version: 1, files }, null, 2) + '\n',
    );
    recoverTransaction(root, write);
    return outcome;
  } finally {
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.unlinkSync(lockPath);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    console.log(JSON.stringify(run(root, process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
