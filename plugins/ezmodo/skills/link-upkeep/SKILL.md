---
name: EzModo Link Upkeep
description: Use when work touches files a feature owns, when a task or epic should be attached to a feature/goal/document, when a feature's code paths or a project's screens catalog need upkeep, and whenever an EzModo response returns linkSuggestions that need accepting or rejecting. Covers resolve_links, preview_links, feature code paths, link provenance (origin and rule), derived navigation, and the rule that derived links beat asserted ones.
---

# EzModo Link Upkeep

Linking the work to what it touched is part of finishing it — the same discipline
as capturing knowledge. The graph stays true as a **side effect of building**,
never as a documentation pass afterwards, because a pass nobody runs leaves a map
nobody trusts.

Most of it is automatic. Features own code paths, and `link_commit` resolves the
commit's files against them and records those links itself. You do not link
those by hand.

## What you owe

**Before you start:** `resolve_links projectId:"…" paths:[…]`. It returns the
features that own those paths: `features.owned` link on their own,
`features.shared` are paths several features claim and need you to pick. A
feature you did not expect means your change is broader than you thought — that
is the point of asking first. `unmatchedPaths` owned by no feature are a gap in
the map (see **Feature code paths** below), not something to link by hand.

**When creating work by hand:** pass `links: [{targetType, targetId}]` directly
on `manage_task` / `manage_epic`. Work that is not linked at creation usually
never gets linked.

**Before submitting:** your last `manage_task` response carries
`linkSuggestions` — proposals the linker was not confident enough to record on
its own. Each has a `suggestionId`. Clear them all in one call:

```
resolve_link_suggestions accept:[…] reject:[{id, reason}]
```

**Rejecting with a reason is a real answer** and teaches the linker. Leaving them
pending is the only wrong outcome.

If the response carries a `linkSuggestionsNote` saying the list may be partial,
get the authoritative set first with `list_agent_suggestions action:"link"
entityType:"task" entityId:"…"`. The semantic rules finish a beat after the
deterministic ones, so an inline list can legitimately show fewer than are
queued. That query is **bidirectional**: it returns a suggestion whether your
task is the entity the proposal is about or the one it points at. A zero there is
a genuine zero — do not go hunting for a broken resolver.

**To look without writing:** `preview_links` returns the same proposals and
changes nothing.

## Judging a suggestion

A semantic match on shared vocabulary is not a relationship. Two common false
positives, both worth rejecting with the reason spelled out:

- **Word overlap.** A packaging change that mentions "client" is not part of a
  client-SDK feature.
- **Shared plumbing.** A path several features claim (a router, a shared UI
  kit) makes "you touched this file, therefore feature Y" fire for every one of
  them. Touching one shared file does not implicate all of them — accept the
  feature the work actually advanced and reject the rest.

Say which it is in the `reason`. That is the signal the linker learns from.

## Provenance — every link records who vouched for it

| `origin` | meaning |
|---|---|
| `auto` | a deterministic, code-grounded rule — the file is under a path that feature owns |
| `inferred` | propagated (a feature via the epic, an epic via its tasks) |
| `accepted` | a machine proposal a human confirmed |
| `manual` | a person asserted it directly |

`rule` names what produced the link (`code.path_to_feature`,
`semantic.feature_match`, …) and is the **undo key**: one rule's output can be
reversed without touching anything a human vouched for.

## Derived beats asserted

Everything derived from code stays fresh for free. Everything asserted decays
from the moment it is written. That is an observation, not a preference: links
resolved from `source_path` are accurate today, while hand-drawn edges tend not
to have been touched since the afternoon someone drew them.

Three rules follow:

1. **Prefer a rule to a field.** A task links to every feature whose code it
   touched because the autolinker resolves the files it changed. Asking a human
   to name them produces one feature, chosen once, never revisited.
2. **Never let an assertion and a derivation disagree silently.** Links are the
   single truth; `origin` records which mechanism vouched for each edge.
3. **Retract only what you asserted.** A mechanism takes back its own edges *by
   rule*, never by pair — and never one another mechanism has since corroborated.
   Deleting an edge you did not create is how a "cleanup" destroys someone's
   work.

## Derived navigation

`navigates_to` edges between screens are derived, not drawn. The manifest
generator extracts navigation references per file — Next.js `<Link href>` /
`router.push`, Flutter `Navigator.push` class names, GoRouter `context.go` — and
the API resolves them against the routes and names of the project's screens
catalog (`kind:"screens"` — one per project, its items keyed by source path). Two rules,
retractable separately: `code.screen_navigation` (extracted references, both
frameworks) and `code.screen_import` (Dart imports only — pushing a Flutter
screen requires importing its class, whereas a Next.js href imports nothing, so
applying it to the web would produce a map of pure noise).

Run it with `manage_catalog action:"sync_screens" projectId:"…"`: it syncs the
screens catalog with the manifest, then re-derives navigation. It is idempotent
and **cannot delete a hand-drawn edge** — reconciliation only touches rows still at
origin `auto` or `inferred`, and reports the rest as `spared`.

**Read the response's `navigation.unresolved` list.** A reference no screen
matched means a screen is *missing from the catalog*, not that the code has no
navigation.
Manual edges remain the right answer for navigation no rule can see, and `origin`
is what protects them.

## Features are a separate axis

A **feature** is a durable, user-facing capability — a noun. Epics and tasks are
work — verbs. Features **link** to work; they do not own it.

The test: would a PM or user call it "a feature of the app"? "Push
notifications" → yes. "Refactor auth middleware" → no, that is an epic.

Before proposing a new feature, search for the existing one (`search_features`,
semantic and org-scoped). The compendium tracks the capability **map**, not every
change — do not create a feature per task or per epic. If a feature link is
governance-required on this project, a create will be rejected until you supply
`featureId`; find the capability rather than inventing one to satisfy the check.

When a capability genuinely changes, update its summary. Decisions captured as
task knowledge surface on the feature detail, which is why capturing them is
worth the keystrokes.

## Feature code paths

A feature **owns** the repo-relative files and folders that make it up,
per project: `manage_feature action:"paths" featureId:"…" paths:[{projectId,
sourcePath}]` (`pathsMode` `add` by default, or `remove` / `replace`), read back
with `get_feature includePaths:true`. A file resolves to the feature owning its
longest matching path — exact prefix, never a glob.

- **Own what is characteristic** of the capability: its screens, its service
  package, its routes.
- **Leave shared plumbing unowned** (`web/src/components/ui`, a central router).
  A path owned by several features only ever produces suggestions, so claiming
  shared code for every feature that uses it just fills the review queue.
- **When you build a new capability**, add its paths as part of finishing it —
  otherwise the next task touching those files links to nothing.

Paths nobody owns yet may be listed for review on the project's Features page
(assign each to a feature or dismiss it). Screens are not features: they live in
the project's screens catalog and link to the features they belong to.
