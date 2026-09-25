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
   `projectId`. It also returns the tags and `terminology` you need.
   No `.ezmodo/config.json` means this repo is not tracked — say so rather than
   guessing at a project.
3. **Call `get_context` with a keyword query before creating anything.** Use
   what comes back to write a task that names real files, endpoints and
   patterns. A vague task is not worth the call that made it.
4. **Link the feature the work advances** via `links: [{targetType:"feature",
   targetId}]`, found with `search_features`. Code links are derived: features
   own code paths, and the files you touch link the work to their owners.
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

Respect the project's `terminology`: a project can rename epics and tasks, and a
marketing project calls an epic a "Campaign". Write anything a
human reads in those words; keep API field names (`epicId`, `taskId`) as they
are.
<!-- mcp:core:end -->

<!-- mcp:local:start -->
Running against a local checkout, two more:

12. **Link every commit**: `manage_task action:"link_commit"` with the full
    40-character `sha` from `git rev-parse HEAD`. A short SHA is rejected, and
    padding one is not a fix. Linking is also what derives feature links from
    the commit's files — do not link those by hand. It also updates the
    project's context manifest; write a summary for every path in the
    response's `manifest.needsSummary` with `update_manifest_entries`.
13. **Pass `changedFiles`** when creating or updating a task, so the work
    resolves to the features that own those paths.
<!-- mcp:local:end -->

The sections below are the same contract in full.

## Session initialization

1. Check that `.ezmodo/config.json` exists. (A pre-rebrand config directory
   is no longer read; `ezmodo migrate-config` relocates it.) No config means this
   repo is not tracked — say so rather than guessing at a project.
2. Call `get_current_project_context()` and cache the `projectId` for the
   session. It also returns the tags and `terminology` you will need.
3. If the user named an existing task or epic, load it directly with `get_task` /
   `get_epic` and resume via **Context recovery** below.
4. Otherwise create a task before you edit anything.

**Respect the project's `terminology`.** A project can rename epics and tasks,
and their statuses — a marketing project calls an epic a "Campaign". Write anything a human reads in those words. Keep
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
- **`links`** names the feature the work advances (`search_features` finds the
  existing capability). Code links need nothing from you: pass `changedFiles`
  and the files resolve to the features that own them.

## Single-scope work

A bug fix, a small feature, a config change, a docs update — one task:

```
manage_task action:"create"
  projectId       (cached)
  title, description   (informed by get_context)
  steps           (actionable, file-specific)
  links           ([{targetType:"feature", targetId}] — the capability it advances)
  changedFiles    (paths you expect to touch — see below)
  priority        low | medium | high | urgent
  taskType        feature | bug | testing | chore
  status:"in_progress"   (work is starting now)
```

**`changedFiles` is how code gets linked.** Each path resolves to the feature
that owns it through that feature's code paths. A path one feature owns links
automatically; a path several features share comes back as a `linkSuggestion`
for you to accept or reject. A path no feature owns links to nothing — that is a
gap in the feature map, not a reason to invent a feature.

**`taskType` is not cosmetic.** `bug` feeds open-bug counts, milestone
freezes gate on it, and estimation weights past tasks of the same kind. Omitted,
the task is stored as `feature`.

## Multi-scope work

Work spanning several parts of the codebase (api and web, say), or a large
refactor: call `get_context` once per part to find the integration points, then create the epic **with its child
tasks in the same request** — `manage_epic action:"create"` takes a `tasks` array
of up to 40. One request, and a failure part-way can no longer leave an epic with
no tasks. Order the tasks by dependency.

## Choices that need other people: decisions to make

Planning an epic keeps turning up choices you should not settle alone ("who
reviews changes?", "do approved plans freeze?"). Don't answer them in your own
chat, and don't bury them in a task description where nobody else sees them.
Put each one **on the epic** as a decision to make:

```
manage_decision action:"create" organizationId:… epicId:…
  title:"Who reviews proposals"
  question:"Who should review changes to the plan?"
  choices:["The owner only", "The owner and editors", "Anyone on the project"]
  recommendation:"The owner and editors, so reviews don't stall when the owner is away."
  requestedFrom:[<user ids of the people whose view is wanted>]
```

Write the question, options and recommendation in plain language a
non-developer can answer. The people named are notified.

- **Tasks that can't start until it's answered:** `action:"hold_task"` with the
  task id. The task is blocked, and released when the decision is made.
- **Your person has a view:** `action:"add_input"` with `choiceId` and a
  one-line `reason`. It counts as their pick and replaces an earlier one.
- **Deciding** (`action:"decide"`) is for the epic's owner or an editor. Only
  decide when your person is one and asked you to; pass `rejectedReasons` so
  the options turned down keep why.
- **What's still open:** `get_decision epicId:… status:"proposed"` shows each
  open decision with everyone's picks.

Approving a plan while decisions are open is allowed, but the save comes back
with a `warnings` sentence. Pass it on to your person rather than dropping it.

**Only the epic's owner, its creator or an org admin can save its plan.** If
your person is none of those, `update_epic_plan` is refused: suggest the change
with `add_epic_comment`, or ask it as a decision to make, instead.

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

Pass `projectId` and `title`, plus `branch` and `changedFiles` when you know
them, and set `origin`:

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
5. **If the task belongs to an epic other people also work on**, call
   `get_epic_activity epicId:…` first. It says, in plain sentences, what
   changed since your person last looked: decisions waiting on their view,
   comments that mention or answer them, decisions made, new plan versions and
   task progress. Tell your person what matters in it before carrying on, and
   read the plan again before changing it. It marks the epic as caught up, so
   the next call only shows newer changes.
6. Continue from there.

## Commit linking

After **every** commit:

```
manage_task action:"link_commit"
  taskId, sha, message, author, branch
```

`sha` must be the full 40-character hash — `git rev-parse HEAD`. A short SHA is
rejected, and padding one is not a fix.

Linking a commit is also what triggers automatic feature linking: the API
resolves the commit's files against the code paths features own and records
those links itself. Do not link those by hand. See the **EzModo Link Upkeep** skill for
what you *do* owe.

### Keeping the context manifest current

`link_commit` also applies the commit to the project's context manifest in the
API, using the commit's git name-status. Deleted files lose their entries,
renames keep their summaries, and new files get an entry. There is no CI job
behind this any more, so this step is the only thing that keeps the manifest
current. The response carries a `manifest` object:

- `needsSummary`: paths whose entry has no summary. Write one for each with
  `update_manifest_entries` (`updates: [{path, summary}]`), in under 200 words
  covering intent, key behaviours, integrations and gotchas. You just wrote the
  file, so you are the cheapest source of that summary that will ever exist.
- `reviewSummary`: modified files that already have a summary. Rewrite one only
  if the commit changed what the file *does*, not merely how.
- `skipped`: the project has no manifest yet. Nothing to do; a full manifest
  comes from the desktop app.

Pass `updateManifest: false` to link a commit without touching the manifest.

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

## Releases

A **milestone** is the release target (v1.4.0). A **release candidate** is one
build of it (`1.4.0-rc.2`, optional commit SHA). When the work you did is going
out:

- Ask `get_release_readiness` (`candidateId` + `environment`) what is blocking
  it, before you claim something is ready. Every row has a reason, and
  `nextAction` names the single next step.
- Tie test runs to the build: `manage_test_suite action:"start_run"` and
  `manage_test_case action:"record_run"` take `releaseCandidateId`. A run with
  no candidate does not count toward a candidate's gates.
- Pipelines report through `manage_release action:"report_check"` /
  `"report_deployment"` (or `ezmodo release report`). Nothing assumes GitHub.
- A promotion or `manage_milestone action:"release"` is **refused** while a
  required gate fails. Do not look for a way around it. Fix the gate, or — only
  when a person has decided the release goes out incomplete — `manage_release
  action:"waive"` with the reason they gave. "Hidden behind flag X" is verified:
  the waiver does not hold while the flag is on in that environment.

## Where this stops

Report what actually happened. A task moved to `in_review` with notes claiming
work that was not done is worse than no task, because the next session trusts it.
If something is blocked, finish everything else and say plainly what is left and
why.
