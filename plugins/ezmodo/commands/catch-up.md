---
description: Catch up on what happened in this project — completed, blocked, new work, decisions
argument-hint: [how far back, e.g. 3d, 2w, or a date — default 7 days]
---

Catch me up: **$ARGUMENTS**

Call `catch_up` with scope `project` (the default; it uses this checkout's
project). Take `since` from the argument above — a relative duration such as
`3d`, `2w` or `1m`, or a date. With no argument, leave `since` out and the
server covers the last 7 days. If the argument names an epic (`E-12`), use scope
`epic` with its `epicId` instead.

`totals` always counts the whole window. What comes back depends on its size:

- **`items`** — a small window, inline. Use it as is.
- **A file path** under `.ezmodo/catch-up/` plus `highlights` — a large window
  in a checkout. Start from the highlights, then read the file in chunks only as
  far as you need. Do not read it whole.
- **`nextCursor`** — a large window over the remote connector. Pass it back as
  `cursor` for the next page, as far as you need.

ezmodo does not write the summary; you do. Write it for the person, short and
most important first:

1. **Completed** — what shipped or reached `in_review`.
2. **Blocked** — what is stuck, and on what, if the activity says.
3. **New work** — tasks and epics created.
4. **Decisions** — choices recorded, and anything that changed direction.

Name everything by number (#42, E-7) so the person can ask about it. Leave out
what is routine. Say plainly when the window was quiet rather than padding it.

Then offer to drill into anything — `get_task` / `get_epic` by number, never a
search.
