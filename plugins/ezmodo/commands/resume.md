---
description: Load an EzModo task or epic by number and continue where the last session stopped
argument-hint: <task number, epic number, or id>
---

Resume: **$ARGUMENTS**

Load it **directly** — `get_task` (with `taskNumber` + `projectId`, or `taskId`)
or `get_epic`. Do not search; a number or id is an exact address, and
`search_tasks` / `search_epics` are for when you have neither.

You will need the `projectId` from `get_current_project_context()` to resolve a
task number.

Then, before doing anything:

1. Read **every** knowledge item. That is where the previous session put its
   reasoning — root causes, decisions and what they rejected, blockers.
2. Look for knowledge tagged `progress-checkpoint` for the latest status.
3. Note which steps are already complete. Do not redo them.

Report back: what the task is, what has been done, what the last session
learned that changes how you would approach the rest, and which step you are
picking up. Then continue from there, following the **EzModo Work Tracking**
skill for the rest.

If the task is already `in_review` or `completed`, say so and ask before
reopening it.
