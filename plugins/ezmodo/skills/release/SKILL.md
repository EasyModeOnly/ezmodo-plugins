---
name: EzModo Release
description: Use when the user asks to bump versions for a release, runs /ezmodo:release, pastes a release hand-off from the EzModo Release wizard (a version or a release run id), or asks how this repo is versioned. Covers reading each deliverable's versioning settings, editing version files per format, bump groups, git tags, opening the bump PR, finishing a release run's manual bumps, and detecting versioning for deliverables that have none set up.
---

# EzModo Release

A release puts one or more **deliverables** (api, web, cli…) out at a version.
Getting each version onto main is the **bump**, and how to bump is set per
deliverable in its **versioning** settings. This page is the agent path: EzModo
hands the bump to you when the repo isn't connected, or when the user would rather
have you do it.

**Do what the settings say.** Don't guess at a file or a format, and don't bump a
deliverable nobody asked for. If the settings are missing or wrong, offer to fix
them (see *Detect versioning*) rather than working around them.

## The settings

`manage_deliverable action:"list"` returns every deliverable with its
`versioning`:

| Field | Meaning |
|---|---|
| `scheme` | `semver` (prerelease allowed), `date` (with `pattern`: `YYYY.MM.DD`, `YYYY.MM.MICRO`, `YY.WW`…), `number`, `custom` (a `pattern` with `{parts}`, e.g. `r{n}`) |
| `source` | where the version lives: `files`, `tags`, `ezmodo` (EzModo assigns it), `unknown` (CI reports it; nothing to bump) |
| `files` | `[{path, format, key?, pattern?}]` when `source` is `files` |
| `tagPattern` | the tag a release is pushed as, e.g. `cli-v{version}` (`{key}` is the deliverable key). Default `<key>-v<version>` |
| `buildLabel` | how a second build of the same version is named (`build`, `rc`, `store`). CI's concern, not the bump's |
| `repo` | the connected repo and base branch (default: the project's repo, `main`) |
| `bumpWorkflow` | a CI workflow EzModo dispatches to bump. When it is set, prefer `manage_deliverable action:"bump"` over editing by hand |
| `bumpGroup` | deliverables with the same name bump together |

**Bump groups.** Deliverables with the same `bumpGroup`, or that list the same
file, bump **together and to the same version**: this repo's cli, mcp-server and
plugin, for example. Bumping only one member of a group leaves main inconsistent.
If the user names one member, say that the others come along, and bump them all.

## Pick the version

- The user named it, or the run row carries it (`version`).
- Otherwise `manage_deliverable action:"versions"` (`deliverable`) returns the
  last shipped version, the suggested next versions in the deliverable's scheme
  (patch, minor and major for semver) and the hotfix. Offer those. Don't invent
  one.
- Always check it before writing: `manage_deliverable action:"versions"` with
  `check:"<version>"` says whether it fits the scheme and is newer than what
  shipped. Stop on a no.

`manage_deliverable action:"next_version"` **reserves** the version (it starts
the release), so call it only when the user wants EzModo to assign one.

## Bump by source

### `files`

1. **Connected repo first.** `manage_deliverable action:"version_on_main"`
   returns what each file holds on the base branch, and a `repo` when EzModo can
   reach it. When it can, offer `manage_deliverable action:"bump"` with
   `items: [{deliverable, version}, …]`: EzModo opens the PR itself (or
   dispatches the bump workflow) and the run follows it. Do it only when the user
   says so. It never merges.
2. **Otherwise, edit here.** Start from an up-to-date base branch, on a new
   branch named **`release/<key>-v<version>`**. For a group, use the key of its
   first member. A release run matches the merge by that name, so keep it.
3. For each deliverable, change the version in each of its files and nothing
   else (formats below). Then commit **only that deliverable's files**:
   `chore(<key>): bump version to v<version>`. One commit per deliverable,
   because CI counts a commit for one deliverable (#3269). A file shared within
   a group is written once, in the first member's commit.
4. Show the diff: every change should be a single line per file. Then push and
   open the PR with the host's CLI (`gh pr create`, `tea pr create`/`fj`), titled
   `chore(release): bump <key> to <version>, …`. List the files per deliverable
   in the body. **Never merge it.**
5. **Report the bump** right after opening the PR, once per deliverable:
   `manage_deliverable action:"report_bump"` with `deliverable`, `version`,
   the PR's `number` and `url`, `branch`, `commitSha` (that deliverable's
   commit) and `source:"agent"`. With no connected repo no merge webhook
   arrives, so this is the only way the release run and "version on main"
   learn of it. When the user says it merged, report it again with
   `state:"merged"`. A bump committed straight on the base branch is reported
   once, `state:"merged"`. Skip this when EzModo opened the PR itself
   (`manage_deliverable action:"bump"`): it already knows.
6. If the EzModo CLI is installed, `ezmodo release bump <deliverable> <version>`
   makes the same edits and commits, pushes the branch and reports the bump.
   `--open-pr` then opens the PR with `gh` or `tea` on a repo EzModo isn't
   connected to; `--pr` asks EzModo to open it on a connected repo. Use it when the
   user prefers; then only the merged report is left to you.

### `tags`

The version is a git tag, and nothing in the tree changes. Compute the tag
from `tagPattern` (`{version}`, `{key}`) and create it **on the commit being
released**, which is normally the base branch's head after the release's work
merged (`git tag -a <tag> -m "<key> <version>" <sha>`). Pushing a tag usually
starts a release pipeline, so **push only on the user's explicit OK**
(`git push origin <tag>`).

### `ezmodo`

Nothing to commit. CI calls
`GET /api/v1/releases/next-version?project=<id>&deliverable=<key>` and stamps
the build. Tell the user that. `manage_deliverable action:"next_version"` shows
(and reserves) the version if they want to see it now.

### `unknown`

EzModo doesn't know where the version lives. Offer *Detect versioning* first.
Without settings, do not edit files on a guess.

## Formats

Edits are textual. Change the version string where it sits, keep quoting,
spacing and everything else. `key` overrides the default field name.

| `format` | Where the version is (default key) |
|---|---|
| `package_json` / `json` | top-level `"version": "1.6.0"` (`version`). Don't touch the lockfile by hand. If the repo's lockfile records the workspace version, run the package manager to refresh it and say so |
| `pubspec` | `version: 1.6.0+4`. **Keep the `+N` and add one** (`1.5.0+4` → `1.6.0+5`) unless the new version brings its own `+N` |
| `cargo_toml` / `pyproject_toml` | `version = "1.6.0"` (`version`), the first such line, in `[package]` / `[project]` |
| `gradle` | `versionName "1.6.0"` or `versionName = "1.6.0"` (`versionName`) |
| `info_plist` | `<key>CFBundleShortVersionString</key><string>1.6.0</string>` |
| `csproj` | `<Version>1.6.0</Version>` (`Version`) |
| `version_file` | the file's first word (`VERSION`, `version.txt`) |
| `go_const` | `Version = "1.6.0"` or `const Version string = "1.6.0"` (`Version`) |
| `pattern` | the line matching `pattern` with `{version}` in place of the version, e.g. `export const MCP_VERSION = '{version}'` |

If a file doesn't hold a version where its format says, **stop and report it**.
Don't search the file for something that looks like a version. Check the
settings with the user instead.

## A release run's manual bumps

The Release wizard hands off a run id (or `/ezmodo:release <version>`) when
EzModo can't open the bump itself. `manage_release action:"run_status"`
(`runId`) lists the run's deliverables. Rows with `waitingOn: "manual_bump"`
(`bumpState: "manual"`) are yours: bump each at its row's `version`, and rows
with the same `bumpGroup` in one PR. Bumps are sequenced one at a time, so
there's usually one row (or one group) waiting. After opening the PR, report
each row's bump (`manage_deliverable action:"report_bump"`, as in step 5
above) so the run shows the PR, and report it again with `state:"merged"` when
the user merges it: on a repo EzModo can't see, that report is how the run
learns the merge. When the PR merges (matched by its
`release/<key>-v<version>` branch), or CI reports a build of the version, the
run moves on by itself. Answer "how is it going?" with `run_status`, not
from memory.

Don't call `manage_release action:"start"` or `"stop_run"` yourself. Start a run
only on the user's explicit instruction, after showing them
`manage_release action:"preview_run"`'s plan and checks.

## Detect versioning

For deliverables whose `source` is `unknown`, or when the user asks "how is this
repo versioned?":

1. `manage_deliverable action:"list"` gives each deliverable's `paths`, the
   folders that belong to it.
2. Look in those folders (the repo root for the default deliverable) for version
   files: `package.json`, `pubspec.yaml`, `Cargo.toml`, `pyproject.toml`,
   `build.gradle(.kts)`, `Info.plist`, `*.csproj`, `VERSION`, a Go
   `Version` constant, a source line carrying the version (a pattern). Also
   look for a bump script (`scripts/bump-version.sh` and the like), since the
   files it edits together are a bump group. Run `git tag --list` for tag
   patterns (`cli-v1.5.0` → `{key}-v{version}`), and check whether CI asks
   `releases/next-version` (that's `ezmodo`).
3. Infer the scheme from the versions found: `1.5.0` is semver, `2026.11.16` a
   date with the pattern that matches, a bare integer a number. Use `rc` as the
   build label for packages published to npm (it refuses republishing), and
   `store` for app-store builds.
4. **Propose, don't write.** Show a table: deliverable, scheme, source, files
   (path + format + key or pattern), tag pattern, bump group, and the version
   each file holds now. Flag files that disagree. If you found nothing for a
   deliverable, say so and suggest `ezmodo` (let EzModo number it).
5. After the user confirms, save each with `manage_deliverable action:"update"`
   (`deliverable`, `versioning`). **`versioning` replaces the settings whole**,
   so start from the deliverable's current object and change only what was
   agreed. Then `manage_deliverable action:"version_on_main"` (on a connected
   repo) confirms the files read as expected.

## Never

- Merge a bump PR, push a tag, or start, stop or approve a release without the
  user's explicit instruction.
- Bump a deliverable that wasn't asked for. The exception is the rest of its
  bump group, and you say so.
- Change anything in a version file but the version.
