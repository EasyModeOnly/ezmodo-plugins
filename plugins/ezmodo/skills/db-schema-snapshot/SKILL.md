---
name: EzModo DB Schema Snapshot
description: Use after adding or changing a database migration in an EzModo-tracked repo, to refresh the project's db_schema catalog so its ERD stays current. Covers finding the catalog, patch versus replace mode, why replace is expensive on a large schema, and snapshotting every schema namespace rather than just one.
---

# EzModo DB Schema Snapshot

**If your work adds or changes a database migration, snapshotting the schema is
part of your definition of done.** Same discipline as feature and link upkeep:
the ERD stays fresh as a *side effect of building*, so it never goes stale
because nobody documented it separately.

## Find the catalog

```
list_catalogs kind:"db_schema"
```

If none exists, `manage_catalog action:"create" kind:"db_schema"`. A project can
have several — one per database. Pick the one your migration touched. The catalog
detail view renders the ERD from it.

## Snapshot it

```
manage_catalog action:"snapshot"
  catalogId
  mode:"patch"          # for anything incremental — see below
  upsertItems           # only the tables that changed
  removeKeys            # keys of any tables dropped
  source: { sourcePaths: ["<the migration file>"], commitSha: "<sha>",
            note: "<what changed>" }
```

The server merges a patch onto the current version. `source` is what makes the
version link back to the migration that caused it — without it the snapshot is a
picture with no explanation.

**Snapshots are checksum-gated server-side.** Re-running with no structural
change creates no new version and is a cheap no-op, so snapshotting is always
safe. That holds for patches too: a patch setting an item to the value it already
has does nothing.

## Never restate a large schema in replace mode

`mode:"replace"` is for a catalog's **first** snapshot or a genuine full
re-derivation, and it takes the whole `{ columns, items, meta }` blob — for a
db_schema catalog, one item per table (`label` = table name, `group` = schema,
`attributes` = `{columns, primaryKey, indexes, foreignKeys, comment}`), with
`meta` carrying `{engine, schemaName}`.

A full snapshot has to be **generated token by token**. Re-emitting ninety tables
to record a one-column change costs twenty-odd minutes of output and is the path
that hits payload limits. Use `mode:"patch"` with just the changed tables, or a
repo-provided introspect-and-upload command if there is one.

## Prefer the repo's own introspection command, if it has one

Some repos ship a command that introspects the live database and posts the
snapshot straight to the API, so the structure never passes through a tool
argument at all — no tokens, no payload ceiling, and it cannot mis-transcribe a
column. Check the repo's `CLAUDE.md` for one before hand-assembling anything.

## Snapshot every schema namespace, not just one

A database is often not one namespace. If the project uses several — `public`
plus an `analytics` schema, say — a snapshot covering only the first records half
the migration and says nothing about the omission.

**A partial snapshot that reports success is worse than a missing one**, because
the whole promise of this skill is that the ERD cannot go stale. Enumerate the
namespaces the migration touched and include all of them; if a tool takes a list,
pass the list.
