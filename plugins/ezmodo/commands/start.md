---
description: Create an EzModo task for what you are about to build, and start it
argument-hint: [what you are about to work on]
---

Start tracked work on: **$ARGUMENTS**

Follow the **EzModo Work Tracking** skill. In short:

1. `get_current_project_context()` — cache the `projectId`, note the components,
   tags and `terminology`.
2. `get_context` with a keyword query drawn from the request above. Read what
   comes back before writing anything: it tells you which files exist, what
   patterns they follow, and what the change will touch.
3. `resolve_links` on the paths you expect to change. A component you did not
   expect means the work is broader than the request sounds.
4. Create the work:
   - **Single scope** (a fix, a small feature, a config or docs change) —
     `manage_task action:"create"` with `status:"in_progress"`, a description
     that says why/where/how, steps that name real files, `componentIds` for
     every component involved, and the right `taskType`.
   - **Multi scope** (spanning areas, or a large refactor) — `manage_epic
     action:"create"` with its child tasks in the same request, ordered by
     dependency.

Then report the task number and web URL and begin. Do not edit anything before
the task exists — a task created afterwards is a task written from memory.

If no `.ezmodo/config.json` is found, say so and stop rather than guessing at a
project.
