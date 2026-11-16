---
description: Bump versions for a release from each deliverable's version settings, or detect how this repo versions
argument-hint: [version | deliverable version | run id | detect]
---

Release: **$ARGUMENTS**

See the **EzModo Release** skill.

1. `get_current_project_context()`: cache the `projectId`. With no
   `.ezmodo/config.json`, say so and stop.
2. Work out what was asked:
   - **`detect`** (or nothing, when no deliverable has its versioning set up):
     read the repo and propose versioning per deliverable. Write nothing until
     the user confirms, then save each with `manage_deliverable
     action:"update"` and the whole `versioning` object.
   - **A run id**: `manage_release action:"run_status"` with that `runId`. The
     rows with `waitingOn: "manual_bump"` are the ones to bump, at their
     `version`, and the rows sharing a `bumpGroup` go together.
   - **A version** (`1.6.0`): apply it to every deliverable the user names, or
     ask which. **`<deliverable> <version>`** names one.
3. `manage_deliverable action:"list"` and read each deliverable's
   `versioning`. Bump every member of a bump group at the same version: the
   same `bumpGroup`, or a shared file.
4. Check the version with `manage_deliverable action:"versions"`
   (`deliverable`, `check`). Stop on a version that is invalid or not newer.
5. Bump each deliverable according to its `source`:
   - `files`: with a connected repo (`manage_deliverable
     action:"version_on_main"` returns a `repo`), offer `manage_deliverable
     action:"bump"` so EzModo opens the PR. Otherwise edit the files yourself:
     a branch `release/<key>-v<version>`, one commit per deliverable
     with the message "chore(<key>): bump version to v<version>", push, and
     open a PR.
   - `tags`: create the tag from `tagPattern` on the merged commit. Push it
     only when the user says so.
   - `ezmodo`: nothing to commit. CI asks for the version, and
     `manage_deliverable action:"next_version"` shows it.
   - `unknown`: offer `detect` first.
6. Report what you did: the PR link or tag, each file with its old and new
   version, and anything you skipped and why. Do not merge the PR, start a
   release run or approve anything unless the user explicitly asks.
