---
name: EzModo Link Upkeep
description: Use when work touches files belonging to a component or screen, when a task or epic should be attached to a feature/goal/document, and whenever an EzModo response returns linkSuggestions that need accepting or rejecting. Covers resolve_links, preview_links, link provenance (origin and rule), and the rule that derived links beat asserted ones.
---

# EzModo Link Upkeep

Linking the work to what it touched is part of finishing it — the same discipline
as capturing knowledge. The graph stays true as a **side effect of building**,
never as a documentation pass afterwards, because a pass nobody runs leaves a map
nobody trusts.

Most of it is automatic. `link_commit` resolves the commit's files against
`components.source_path` and records those links itself. You do not link those by
hand.

## What you owe

**Before you start:** `resolve_links projectId:"…" paths:[…]`. If it returns a
component you did not expect, your change is broader than you thought — that is
the point of asking first.

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
- **Coarse rollup.** A component backs many features, so "you touched a file in
  area X, therefore feature Y" fires for every feature in that area. Touching one
  config file does not implicate all of them.

Say which it is in the `reason`. That is the signal the linker learns from.

## Provenance — every link records who vouched for it

| `origin` | meaning |
|---|---|
| `auto` | a deterministic, code-grounded rule — the file is *in* that component |
| `inferred` | rolled up or propagated (an ancestor area, a feature via the epic) |
| `accepted` | a machine proposal a human confirmed |
| `manual` | a person asserted it directly |

`rule` names what produced the link (`code.path_to_component`,
`semantic.feature_match`, …) and is the **undo key**: one rule's output can be
reversed without touching anything a human vouched for.

## Derived beats asserted

Everything derived from code stays fresh for free. Everything asserted decays
from the moment it is written. That is an observation, not a preference: links
resolved from `source_path` are accurate today, while hand-drawn edges tend not
to have been touched since the afternoon someone drew them.

Three rules follow:

1. **Prefer a rule to a field.** A task links to every component its work touched
   because the autolinker resolves the files it changed. Asking a human to name
   them produces one component, chosen once, never revisited.
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
the API resolves them against the inventory's routes and names. Two rules,
retractable separately: `code.screen_navigation` (extracted references, both
frameworks) and `code.screen_import` (Dart imports only — pushing a Flutter
screen requires importing its class, whereas a Next.js href imports nothing, so
applying it to the web would produce a map of pure noise).

Run it with `manage_component action:"derive_navigation"`. It is idempotent and
**cannot delete a hand-drawn edge** — reconciliation only touches rows still at
origin `auto` or `inferred`, and reports the rest as `spared`.

**Read the response's `unresolved` list.** A reference no component matched means
a screen is *missing from the inventory*, not that the code has no navigation.
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

When a capability genuinely changes, update its summary and link the components
the work touched. Decisions captured as task knowledge surface on the feature
detail, which is why capturing them is worth the keystrokes.
