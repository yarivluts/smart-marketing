# Sprint workflow

This manages repository work, not an end-user website feature. The CLI is the management surface.
`SPRINTS.json` stores planned/active/completed sprint states. The Sprint column in `TASKS.md`
assigns each active story to a sprint; `-` means backlog. `TASKS-COMPLETED.md` retains completed
rows and their original notes. Existing sprints 1-7 start as planned: no historical completion is inferred.

## Commands

```sh
pnpm sprints list
pnpm sprints plan 8
pnpm sprints start 1
pnpm sprints complete 1 --dry-run
pnpm sprints complete 1
pnpm sprints complete-ready
```

Plan future sprint IDs before assigning tasks to them. Start at most one sprint. Mark a task
`done` only after acceptance checks pass and its Jira issue has been synchronized. At the end
of each work run, execute `pnpm sprints complete-ready`: it automatically closes the active
sprint and archives its done rows when no unfinished tasks remain. It is a no-op when there
is no active sprint, the sprint is empty, or unfinished tasks remain. This is a workflow hook,
not a background watcher or a scheduled job.

If a timeboxed sprint ends with unfinished work, explicitly choose its destination:

```sh
pnpm sprints complete 1 --carry-to 2 --dry-run
pnpm sprints complete 1 --carry-to 2
# Alternatively move unfinished work out of any sprint:
pnpm sprints complete 1 --carry-to backlog
```

The destination must be a different, existing unfinished sprint. All unfinished statuses,
including `verification-pending`, `needs-human` and `blocked-by`, carry over with their notes
and status unchanged. Only `done` rows leave the active file. Tasks in other sprints remain
untouched. Completed sprint records retain timestamps and the archived/carried task keys.
Repeated completion does not duplicate history. Completed sprints cannot be restarted.

## Persistence and recovery

Completion writes a transaction journal before updating the archive, active list and sprint
state, in that order. Each file is replaced atomically. If interrupted, rerun the original
completion command; the journal resumes the operation without losing carry-over history or
duplicating tasks. Recovery refuses to overwrite files edited since the interruption.
Resolve such conflicts using the journal's before/after snapshots; do not discard task history.

`.sprint-lock` prevents concurrent CLI mutations. A process crash may leave this lock or a
`*.sprint-tmp` file. Confirm the old process has stopped before removing only that stale lock
or temporary file, then rerun the original command. Keep `.sprint-transaction.json` until
successful recovery. Do not hand-edit completed sprint state or run cleanup during concurrent
manual edits to the task files.

This CLI does not call Jira or close native Jira sprints. Sprint numbers are local planning
IDs, not Jira Agile IDs. Synchronize issue statuses through the existing Jira workflow before
marking local rows done. Jira issues are never deleted by sprint cleanup.

## Verification

`pnpm test:sprints` uses isolated temporary fixtures, including literal pipes in task summaries,
carry-over, blocked work, dry-run, duplicate/conflicting history, interrupted writes and locks.
The root `pnpm test` runs these tests before the existing monorepo suites, including in CI.
