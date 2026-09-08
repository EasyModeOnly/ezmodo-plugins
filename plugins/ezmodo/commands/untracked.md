---
description: Retroactively capture work already in progress that has no EzModo task
argument-hint: [what the work was, if the diff does not make it obvious]
---

Capture the current uncommitted work as a task.

Current branch: !`git rev-parse --abbrev-ref HEAD`
Changed files: !`git status --porcelain`

Use `report_untracked_work` with:

- `projectId` from `get_current_project_context()`
- `title` — concise, describing what was actually done
- `description` — what and **why**. Do not restate the branch or file list; they
  are appended automatically as evidence.
- `changedFiles` — the paths above
- `branch` — as above
- `componentIds` — resolve the changed paths with `resolve_links` rather than
  guessing; untracked work often spans more than one area, which is part of why
  it went untracked
- `origin`:
  - `discovered` — found while working on another task (set `discoveredDuringTaskId`)
  - `scope-creep` — went beyond the active task's scope (set `discoveredDuringTaskId`)
  - `rework` — redoing prior work
  - `untracked` — unplanned standalone work (the default)

If there is an active task in this session, prefer `discovered` or
`scope-creep` and link it — the discovery chain is the point of the
classification.

The new task comes back `in_progress` and becomes the active one. Track against
it for the rest of the work.

Extra context from the user, if any: $ARGUMENTS
