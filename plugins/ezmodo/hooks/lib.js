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
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';

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

/**
 * Split a shell command line into its top-level simple commands.
 *
 * Splits on UNQUOTED `&&`, `||`, `;`, `|` and newlines, and drops heredoc
 * bodies first. Both matter for the one input this reads most: a commit command,
 * whose message routinely contains `&&`, `;` and newlines, and sometimes the
 * words "cd" and "git commit" themselves. Not a shell parser — it only has to
 * be right about where one command ends and the next begins.
 */
export function splitCommands(command) {
  // Heredoc bodies are data. `<<'EOF' … EOF` (quoted or not, `<<-` too).
  const text = String(command).replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g,
    ''
  );

  const segments = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\' && quote === '"' && i + 1 < text.length) {
        current += c + text[++i];
        continue;
      }
      if (c === quote) quote = null;
      current += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }
    if (c === '\\' && i + 1 < text.length) {
      current += c + text[++i];
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      segments.push(current);
      current = '';
      i++;
      continue;
    }
    if (c === ';' || c === '|' || c === '\n') {
      segments.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  segments.push(current);
  return segments.map((seg) => seg.trim().replace(/^[({]+\s*/, '').replace(/\s*[)}]+$/, '').trim())
    .filter(Boolean);
}

/** Whitespace tokens, with quotes removed. Null if a token cannot be known statically. */
function tokens(segment) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** `~` and `$HOME` are knowable; any other variable is not. */
function expandPath(raw) {
  let path = raw;
  if (path === '~' || path.startsWith('~/')) path = homedir() + path.slice(1);
  path = path.replace(/^\$\{?HOME\}?(?=\/|$)/, homedir());
  if (path.includes('$')) return null;
  return path;
}

/**
 * The directory a `git commit` in this command line actually ran in, or null
 * when that cannot be determined with confidence (#2658).
 *
 * Why this exists: the hook used to take the session's cwd from the payload.
 * An agent working in one repo that commits in another — `cd ../infra && git
 * commit` — was handed the FIRST repo's HEAD and active task, stated as fact.
 * That is worse than no reminder at all, because the reminder exists precisely
 * so the SHA is not questioned.
 *
 * Follows `cd`/`pushd` before the commit and `git -C` on it, relative to `cwd`.
 * Returns null — and the hook stays silent — for anything it cannot resolve
 * without running a shell: command substitution, variables other than HOME,
 * `cd -`, `--git-dir`/`--work-tree`. When several commits appear, the last one
 * wins, since its HEAD is the one left standing.
 */
export function resolveCommitDir(command, cwd) {
  if (/`|\$\(/.test(String(command))) return null;

  let dir = cwd;
  let commitDir = null;
  for (const segment of splitCommands(command)) {
    const words = tokens(segment);
    if (words.length === 0) continue;

    if (words[0] === 'cd' || words[0] === 'pushd') {
      const target = words[1] ?? '~';
      if (target === '-') return null;
      const expanded = expandPath(target);
      if (expanded === null) return null;
      dir = resolve(dir, expanded);
      continue;
    }

    const gitAt = words.indexOf('git');
    if (gitAt === -1) continue;
    let at = dir;
    let isCommit = false;
    for (let i = gitAt + 1; i < words.length; i++) {
      const word = words[i];
      if (word === '-C') {
        const expanded = expandPath(words[++i] ?? '');
        if (!expanded) return null;
        at = resolve(at, expanded);
        continue;
      }
      if (word === '-c') {
        i++; // -c key=value takes an argument
        continue;
      }
      if (word.startsWith('--git-dir') || word.startsWith('--work-tree')) return null;
      if (word.startsWith('-')) continue;
      isCommit = word === 'commit';
      break;
    }
    if (isCommit) commitDir = at;
  }
  return commitDir;
}
