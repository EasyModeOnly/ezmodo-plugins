/**
 * Shared helpers for the EzModo plugin hooks.
 *
 * The governing rule for everything in this directory: a hook that cannot
 * work must be INVISIBLE, not noisy. These fire after ordinary edits and
 * commits, so a hook that throws, blocks, or prints a warning when EzModo is
 * unreachable makes the plugin worse than not having it. Every entry point
 * exits 0, and every failure path here returns a value rather than raising.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

// `.ezmodo/` is current; `.zephly/` is the pre-rebrand name still present in
// existing checkouts. Readers must accept both — see mcp-server/lib/repo-config-dir.js.
const CONFIG_DIRS = ['.ezmodo', '.zephly'];

/** Walk up from `startDir` for the repo's EzModo config dir. Null if none. */
export function findConfigDir(startDir) {
  let dir = startDir;
  for (;;) {
    for (const name of CONFIG_DIRS) {
      if (existsSync(join(dir, name, 'config.json'))) return join(dir, name);
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The task the MCP server currently considers active, or null.
 *
 * This file is not ours to maintain: mcp-server/lib/active-session.js writes it
 * on an in_progress transition and clears it on completion. Reading it rather
 * than tracking state of our own is what keeps the hook honest — it reflects
 * what EzModo actually believes, not what a hook guessed.
 */
export function readActiveSession(configDir) {
  try {
    const raw = readFileSync(join(configDir, 'active-session.json'), 'utf-8');
    const s = JSON.parse(raw);
    return s && s.taskId ? s : null;
  } catch {
    return null;
  }
}

/** Read the hook payload from stdin. Returns null on anything unparseable. */
export function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return null;
  }
}

/** Emit additional context back to the model and exit successfully. */
export function emit(text) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: text,
      },
    })
  );
  process.exit(0);
}
