# EzModo plugin for Claude Code

Work tracking inside Claude Code: the EzModo MCP tools, plus the discipline that
makes an agent actually use them — create a task before you code, toggle steps
as you finish them, capture what you learned, link every commit.

```bash
/plugin marketplace add EasyModeOnly/ezmodo-plugins
/plugin install ezmodo@ezmodo
```

You will need an EzModo API key from https://ezmodo.com/settings/api-keys.
Either run `ezmodo auth login` — the plugin picks up the credential the CLI
stores — or set `EZMODO_API_KEY` in your environment. See
[`plugins/ezmodo/README.md`](plugins/ezmodo/README.md) for what the plugin
contains and how it is configured.

## What is in here

| | |
|---|---|
| **3 skills** | work tracking, link upkeep, database-schema snapshots |
| **4 commands** | `/ezmodo:start`, `:resume`, `:untracked`, `:submit` |
| **2 hooks** | notice an unlinked commit; notice edits with no active task |
| **1 MCP server** | ~96 tools, launched from [`@ezmodo/mcp-server`](https://www.npmjs.com/package/@ezmodo/mcp-server) on npm |

---

## This repository is generated

**Do not edit it, and do not open pull requests against it.** Every file is
copied from the EzModo monorepo by CI on each change, so anything committed here
is overwritten by the next sync without warning.

Issues and pull requests belong upstream. If you cannot reach the monorepo,
open an issue here describing the problem and it will be carried across —
just expect the fix to arrive as a sync commit rather than a merge.
