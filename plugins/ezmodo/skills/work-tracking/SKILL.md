---
name: EzModo Work Tracking
description: Use when starting, resuming, or finishing any coding work in a repository that has an .ezmodo/config.json — creating the task or epic before you edit, toggling steps as you complete them, capturing decisions and root causes as knowledge, linking commits, recovering context on a resumed task, and submitting for review. Also use when work has already started without a task and needs capturing retroactively.
---

# EzModo Work Tracking

**Every piece of work has an EzModo task.** Not because tracking is virtuous, but
because the task is where the next session — or the next person — finds out what
you learned. A task nobody created is context that only exists in a terminal
someone is about to close.

## The core

<!-- mcp:core:start -->
Work in this repository is tracked in EzModo, and the tools for it are on this
MCP server. The contract, in short:

1. **Create the task before you edit, not after.** A task written afterwards is
   a changelog; a task written first is what the next session reads to find out
   what you were doing and why.
2. **Start the session by calling `get_current_project_context()`.** Cache the
   `projectId`. It also returns the components, tags and `terminology` you need.
   No `.ezmodo/config.json` means this repo is not tracked — say so rather than
   guessing at a project.
3. **Call `get_context` with a keyword query before creating anything.** Use
   what comes back to write a task that names real files, endpoints and
   patterns. A vague task is not worth the call that made it.
4. **Name every component the work touches** via `componentIds`. A task spanning
   web and api belongs to both. The list REPLACES the previous set on update.
5. **Set `taskType`** — `feature` | `bug` | `testing` | `chore`. Not cosmetic:
   `bug` feeds open-bug counts, milestone freezes gate on it, and estimation
   weights past tasks of the same kind.
6. **Toggle steps as you finish them**, not in a batch at the end
   (`manage_task action:"update" toggleSteps:[...]`).
7. **Capture knowledge the moment it happens**, not in a summary at the end:
   `addKnowledge` with `fact` for a root cause, `decision` for a choice —
   including what you rejected and why — `reference` for a key file or pattern,
   `context` for progress. Be specific: file paths, function names, exact
   errors. "Fixed a bug in the parser" helps nobody.
8. **Already three edits in with no task?** Call `report_untracked_work` the
   moment you notice, rather than continuing untracked.
9. **Resuming?** `get_task` first, and read ALL of its knowledge items. That is
   where the previous session's reasoning went — do not re-derive it.
10. **Finish at `in_review`** with `completionNotes`, and do NOT call
    `action:"complete"`. A human completes a task after verifying it.
11. **Report what actually happened.** A task moved to `in_review` claiming work
    that was not done is worse than no task, because the next session trusts it.

Respect the project's `terminology`: a project can rename epics, tasks and
components, and a marketing project calls an epic a "Campaign". Write anything a
human reads in those words; keep API field names (`epicId`, `taskId`) as they
are.
<!-- mcp:core:end -->

<!-- mcp:local:start -->
Running against a local checkout, two more:

12. **Link every commit**: `manage_task action:"link_commit"` with the full
    40-character `sha` from `git rev-parse HEAD`. A short SHA is rejected, and
    padding one is not a fix. Linking is also what derives component links from
    the commit's files — do not link those by hand.
13. **Pass `changedFiles`** when creating or updating a task, so the work
    resolves to the components that own those paths.
<!-- mcp:local:end -->

The sections below are the same contract in full.

## Session initialization

1. Check that `.ezmodo/config.json` exists. (A legacy `.zephly/config.json` is
   still read; `ezmodo migrate-config` relocates it.) No config means this repo
   is not tracked — say so rather than guessing at a project.
2. Call `get_current_project_context()` and cache the `projectId` for the
   session. It also returns the components, tags and `terminology` you will need.
3. If the user named an existing task or epic, load it directly with `get_task` /
   `get_epic` and resume via **Context recovery** below.
4. Otherwise create a task before you edit anything.

**Respect the project's `terminology`.** A project can rename epics, tasks and
components, and their statuses — a marketing project calls an epic a "Campaign"
and a component a "Channel". Write anything a human reads in those words. Keep
the API field names (`epicId`, `taskId`) exactly as they are. A null
`terminology` means plain English, not an error.

## Before creating anything, get context

Call `get_context` with a keyword query matching the work topic. Read what comes
back and use it to write a task that is *specific*: which files exist, what
patterns they follow, what depends on what.

This is the difference between a task worth reading later and one that is not:

- **Description** explains **why** (the problem), **where** (specific files and
  endpoints), and **how** (the approach, referencing patterns already in the
  codebase).
- **Steps** name files. "Add rate-limit middleware to the manifest route in
  `api/internal/api/router.go` (line ~243)" — not "Add rate limiter".
- **`componentIds`** covers every component the work touches, from
  `get_current_project_context()`. Not one, all of them.

## Single-scope work

A bug fix, a small feature, a config change, a docs update — one task:

```
manage_task action:"create"
  projectId       (cached)
  title, description   (informed by get_context)
  steps           (actionable, file-specific)
  componentIds    (every component touched — see below)
  priority        low | medium | high | urgent
  taskType        feature | bug | testing | chore
  status:"in_progress"   (work is starting now)
```

**`componentIds` replaces the set on update.** Pass the full list every time; an
empty array clears it. A task spanning web and api belongs to both — the older
single `componentId` could only ever record one of them, which is why it is
deprecated.

**`taskType` is not cosmetic.** `bug` feeds per-area open-bug counts, milestone
freezes gate on it, and estimation weights past tasks of the same kind. Omitted,
the task is stored as `feature`.

## Multi-scope work

A feature spanning several areas, or a large refactor: call `get_context` once
per area to find the integration points, then create the epic **with its child
tasks in the same request** — `manage_epic action:"create"` takes a `tasks` array
of up to 40. One request, and a failure part-way can no longer leave an epic with
no tasks. Order the tasks by dependency.

## During the work

**Toggle each step as you finish it**, not in a batch at the end:

```
manage_task action:"update" toggleStep:{stepId:"step_0", completed:true}
```

Use `toggleSteps` for several at once. Discovered a step you need? `addStep`
before doing the work, not after.

**Capture knowledge as it happens**, not in a summary at the end. The moment any
of these occurs:

| Event | `addKnowledge` |
|---|---|
| Root cause found | `{type:"fact", tags:["root-cause"]}` — name the file and the mechanism |
| Design decision made | `{type:"decision", tags:["design"]}` — and **why**, including what you rejected |
| Key file or pattern found | `{type:"reference", tags:["codebase"]}` |
| Before each commit | `{type:"context", tags:["progress"]}` |
| Blocker or workaround | `{type:"fact", tags:["blocker"]}` |

Be concise but specific: file paths, function names, exact error messages. "Fixed
a bug in the parser" helps nobody; "the parser dropped trailing commas because
`splitArgs` trimmed before splitting" is the whole point of writing it down.

**If the conversation is getting long**, save a checkpoint before you risk losing
it: `{type:"context", tags:["progress-checkpoint"]}` naming which steps are done,
what you are mid-way through, and which files you have changed.

## Work that started without a task

Sometimes a "just fix this quickly" request slips through and you are three edits
in before you notice. **The moment you notice**, call `report_untracked_work`
rather than continuing untracked. It creates the task `in_progress` and returns
it; track against that for the rest of the work.

Pass `projectId` and `title`, plus `branch`, `changedFiles` and `componentId`
when you know them, and set `origin`:

- `discovered` — found while working on another task (with `discoveredDuringTaskId`)
- `scope-creep` — went beyond the active task's scope (with `discoveredDuringTaskId`)
- `rework` — redoing prior work
- `untracked` — unplanned standalone work (the default)

## Context recovery — resuming a task

1. `get_task` with the `taskId` for full state.
2. Skip the steps already completed.
3. Read **all** the knowledge items — that is where the previous session's
   reasoning went.
4. Look for `progress-checkpoint` knowledge for the latest status.
5. Continue from there.

## Commit linking

After **every** commit:

```
manage_task action:"link_commit"
  taskId, sha, message, author, branch
```

`sha` must be the full 40-character hash — `git rev-parse HEAD`. A short SHA is
rejected, and padding one is not a fix.

Linking a commit is also what triggers automatic component linking: the API
resolves the commit's files against `components.source_path` and records those
links itself. Do not link those by hand. See the **EzModo Link Upkeep** skill for
what you *do* owe.

## Completion

1. Check `autoGenerateTestCases` from the project context. If `false`, skip to 3.
2. Write the test cases yourself — you have the context of the change you just
   made. `manage_test_case action:"create"` per case with `projectId`,
   `originTaskId`, `title`, `description`, `category`, `priority`, `steps`
   (`{instruction, expectedResult}`) and any `preconditions`. Aim for 3-6 cases
   covering the happy path, edge cases and error handling.
3. `manage_task action:"update"` with `status:"in_review"` and
   `completionNotes` summarising what was accomplished — including anything you
   did **not** do, and why.
4. **Do not call `manage_task action:"complete"`.** A human reviewer completes
   the task after verifying it.
5. Working under an epic? Update the epic's status when its children are done.

## Where this stops

Report what actually happened. A task moved to `in_review` with notes claiming
work that was not done is worse than no task, because the next session trusts it.
If something is blocked, finish everything else and say plainly what is left and
why.
