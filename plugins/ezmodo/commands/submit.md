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
   40-character SHA above. A short SHA is rejected.
4. **Link suggestions** — check `list_agent_suggestions action:"link"` for this
   task and clear the queue with `resolve_link_suggestions`. Reject with a real
   reason; leaving them pending is the only wrong outcome. See the **EzModo Link
   Upkeep** skill.
5. **Test cases** — only if `autoGenerateTestCases` is true in the project
   context. 3-6 cases covering happy path, edges and errors.
6. **Submit** — `manage_task action:"update"` with `status:"in_review"` and
   `completionNotes`.

The notes are the deliverable. They must say what was done, what was verified
and how, and — explicitly — anything in scope that was **not** done and why.
A summary that omits the gap is worse than none, because the reviewer trusts it.

Do **not** call `manage_task action:"complete"`. A human completes the task.

Anything to include: $ARGUMENTS
