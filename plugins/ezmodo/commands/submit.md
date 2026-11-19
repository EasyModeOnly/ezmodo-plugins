---
description: Finish the active EzModo task — steps, knowledge, commit links, then in_review
argument-hint: [anything to note in the completion summary]
---

Close out the active task.

HEAD: !`git rev-parse HEAD`
Recent commits: !`git log --oneline -5`

Work through, in order:

1. **Steps** — `toggleSteps` for everything now done. If work happened that no
   step covered, `addStep` it first rather than leaving it unrecorded. If a step
   was deliberately not done, leave it open and say why in the notes.
2. **Knowledge** — `addKnowledge` for anything the next session would have to
   rediscover: root causes (`fact`), decisions and what they rejected
   (`decision`), blockers (`fact`). Specific: file paths, function names, exact
   error messages.
3. **Commits** — `link_commit` for every commit not yet linked, using the full
   40-character SHA above. A short SHA is rejected. Then write summaries for any
   `manifest.needsSummary` paths it returns with `update_manifest_entries`.
4. **Link suggestions** — check `list_agent_suggestions action:"link"` for this
   task and clear the queue with `resolve_link_suggestions`. Reject with a real
   reason; leaving them pending is the only wrong outcome. See the **EzModo Link
   Upkeep** skill.
5. **How to verify, as test cases.** The reviewer checks your work against the
   task's linked test cases and records Pass/Fail before approving. Create 1-3
   manual cases (`manage_test_case action:"create"`, `originTaskId` = this
   task) whose `steps` tell a person exactly what to do and what they should
   see, without reading the code. Update existing linked cases rather than
   duplicating them. Skip only when nothing is observable (a pure refactor),
   and say so in the notes. If `autoGenerateTestCases` is true in the project
   context, also write the 3-6 case suite (happy path, edges, errors).
6. **How it works** — write it yourself. Call `manage_task
   action:"how_it_works_context"` first: it returns the task's `intent` and
   `sources[]`, the only refs the server accepts. Then `manage_task
   action:"apply_how_it_works"` with `markdown` saying what the change does now,
   and `sources` whose claims cite refs copied from `sources[].ref`. Check the
   response for claims it marked `unverified` and fix them. Last task of an epic, or the work changed what a feature does? Do
   the same for the epic or feature. Never `generate_how_it_works` — that bills
   the user for what you can write. See the **EzModo Work Tracking** skill.
7. **Anything left for a person? Ask it on the task.** Each thing only a
   person can do or decide becomes a question, not a line in your last
   message: `manage_decision action:"create"` with `taskId`, `question`,
   `choices` and a `recommendation` when there are options;
   `manage_question action:"create"` with `kind` `todo` (and a deep `link` to
   the exact place), `question` or `approval` otherwise. `blocking:true` if
   the task can't go on without it. If you are asking only because the API
   can't do something, file that gap as a task too and name it in the
   question. See the **EzModo Work Tracking** skill, "Things only a person
   can do".
8. **Submit** — `manage_task action:"update"` with `status:"in_review"` and
   `completionNotes`. The notes are stored with the submission and shown on
   the reviewer's row. If this is a resubmission after review feedback, say
   how each point of the feedback was handled.
9. **Report** — your final message names the questions you asked (kind and
   title, one per line) and links the person's Inbox
   (`https://ezmodo.com/<orgSlug>/inbox?tab=questions`), plus any API-gap task you filed.
   Never end with a "Still on you:" or "You'll need to…" list.

The notes are the deliverable. They must say what was done, what was verified
and how, and — explicitly — anything in scope that was **not** done and why.
A summary that omits the gap is worse than none, because the reviewer trusts it.

Do **not** call `manage_task action:"complete"`. A human completes the task.

Anything to include: $ARGUMENTS
