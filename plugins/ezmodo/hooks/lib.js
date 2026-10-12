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
import path, { dirname, join } from 'path';

// The repo's EzModo config dir. The pre-rebrand config dir is no longer read
// (#2843) — same as mcp-server/lib/repo-config-dir.js.
const CONFIG_DIR = '.ezmodo';

/** Walk up from `startDir` for the repo's EzModo config dir. Null if none. */
export function findConfigDir(startDir) {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, CONFIG_DIR, 'config.json'))) return join(dir, CONFIG_DIR);
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
 *
 * This reads only the legacy per-repo file, with no regard to which worktree
 * wrote it — right for "is ANY task active?", wrong for "which task is THIS
 * commit's?". For the latter use activeSessionFor.
 */
export function readActiveSession(configDir) {
  return readSessionFile(join(configDir, SESSION_FILENAME));
}

// The legacy per-repo session file in `.ezmodo/`, and the per-worktree one in
// the worktree's git dir (#3195). Same names as mcp-server/lib/active-session.js.
const SESSION_FILENAME = 'active-session.json';
const WORKTREE_SESSION_FILENAME = 'ezmodo-active-session.json';

function readSessionFile(file) {
  try {
    const s = JSON.parse(readFileSync(file, 'utf-8'));
    return s && s.taskId ? s : null;
  } catch {
    return null;
  }
}

/**
 * The active session for a commit made in one particular checkout (#3195).
 *
 * `.ezmodo/` is usually untracked, so a worktree under the repo has no config
 * of its own and `findConfigDir` lands on the MAIN checkout's — whose
 * `active-session.json` is shared by every worktree and names whichever task
 * was claimed last. So, in order:
 *
 * 1. `<gitDir>/ezmodo-active-session.json`: written for this worktree and no
 *    other, trusted as is.
 * 2. The legacy `.ezmodo/active-session.json`, trusted only when it does not
 *    name another checkout: its `worktree` must match, or, from a server that
 *    recorded only a `branch`, the branch must. A file with neither predates
 *    both fields and is trusted, as it always was.
 *
 * Returns `{ session, foreign }`: `session` is the task to suggest, or null;
 * `foreign` is a legacy session rejected for naming another checkout, so the
 * caller can say so rather than present it as this commit's task.
 */
export function activeSessionFor(configDir, { gitDir, worktree, branch } = {}, p = path) {
  if (gitDir) {
    const own = readSessionFile(join(gitDir, WORKTREE_SESSION_FILENAME));
    if (own) return { session: own, foreign: null };
  }
  const legacy = readSessionFile(join(configDir, SESSION_FILENAME));
  if (!legacy) return { session: null, foreign: null };

  let elsewhere = false;
  if (legacy.worktree && worktree) {
    elsewhere = p.resolve(legacy.worktree) !== p.resolve(worktree);
  } else if (legacy.branch && branch) {
    elsewhere = legacy.branch !== branch;
  }
  return elsewhere ? { session: null, foreign: legacy } : { session: legacy, foreign: null };
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
 * Splits on UNQUOTED `&&`, `||`, `;`, `|`, a lone `&` and newlines, and drops
 * heredoc bodies first. A lone `&` ends a command in every shell the hook can
 * see it from: it backgrounds one in bash, and it is cmd.exe's sequencing
 * operator and PowerShell's call operator (`& git commit`), so splitting there
 * leaves the git word at the start of its own segment. `2>&1` and `&>` are
 * redirections, not separators. Both matter for the one input this reads most: a commit command,
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
    if (c === '&' && text[i - 1] !== '>' && text[i - 1] !== '<' && text[i + 1] !== '>') {
      segments.push(current);
      current = '';
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

/** True when `p` is the Windows flavour of node's path module. */
function isWin32(p) {
  return p.sep === '\\';
}

/**
 * The ways a command line can name the home directory: `~`, `$HOME` and
 * `${HOME}` in every shell; `$env:USERPROFILE` / `$env:HOME`
 * (PowerShell) and `%USERPROFILE%` (cmd.exe) too, since a Windows session can
 * run its commands through either.
 */
const HOME_PREFIX =
  /^(?:~|\$\{HOME\}|\$HOME|\$env:(?:USERPROFILE|HOME)|%USERPROFILE%)(?=[\\/]|$)/i;

/**
 * A command-line path made absolute-ready for `p`, or null when it cannot be
 * known statically. Home forms are expanded; any other variable is not.
 *
 * On Windows, a Git Bash path such as `/c/work/infra` is rewritten to
 * `C:\work\infra`. Claude Code runs Bash-tool commands through Git Bash
 * there, while the payload's cwd is a native `C:\…` path; resolving one
 * against the other without this would invent `C:\c\work\infra`.
 */
function expandPath(raw, { path: p, home }) {
  let out = raw.replace(HOME_PREFIX, () => home);
  if (/[$`]/.test(out)) return null;
  if (isWin32(p)) {
    if (/%[^%]+%/.test(out)) return null;
    out = out.replace(/^\/([A-Za-z])(?=\/|$)/, (_, drive) => `${drive.toUpperCase()}:`);
    if (/^[A-Za-z]:$/.test(out)) out += '\\';
  }
  return out;
}

/** Commands that change directory, in bash, cmd.exe and PowerShell (any case). */
const CD_COMMANDS = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location']);

/** `git`, `git.exe`, or a path ending in either (`& "C:\…\git.exe" commit`). */
const GIT_WORD = /(^|[\\/])git(\.exe)?$/i;

/**
 * The target of a directory change, skipping the switches each shell allows
 * before it: cmd.exe's `cd /d D:\x` (drive switch, Windows only — on POSIX
 * `/d` is a directory) and PowerShell's `-Path` / `-LiteralPath`. Undefined
 * means "no argument", which is home in bash.
 */
function cdTarget(args, p) {
  let i = 0;
  if (isWin32(p) && /^\/d$/i.test(args[i] ?? '')) i++;
  if (/^-(?:Path|LiteralPath)$/i.test(args[i] ?? '')) i++;
  return args[i];
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
 *
 * Windows (#3128): the command may come from Git Bash (`cd /c/work`), cmd.exe
 * (`cd /d D:\work`) or PowerShell (`Set-Location -Path C:\work; & git commit`).
 * All three are read, and paths resolve with the platform's path module.
 * `path` and `home` are injectable so tests can exercise the Windows rules on
 * any OS with `path.win32`.
 */
export function resolveCommitDir(command, cwd, { path: p = path, home = homedir() } = {}) {
  if (/`|\$\(/.test(String(command))) return null;
  const env = { path: p, home };

  let dir = cwd;
  let commitDir = null;
  for (const segment of splitCommands(command)) {
    const words = tokens(segment);
    if (words.length === 0) continue;

    if (CD_COMMANDS.has(words[0].toLowerCase())) {
      const target = cdTarget(words.slice(1), p) ?? '~';
      if (target === '-') return null;
      const expanded = expandPath(target, env);
      if (expanded === null) return null;
      dir = p.resolve(dir, expanded);
      continue;
    }

    const gitAt = words.findIndex((w) => GIT_WORD.test(w));
    if (gitAt === -1) continue;
    let at = dir;
    let isCommit = false;
    for (let i = gitAt + 1; i < words.length; i++) {
      const word = words[i];
      if (word === '-C') {
        const expanded = expandPath(words[++i] ?? '', env);
        if (!expanded) return null;
        at = p.resolve(at, expanded);
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

/**
 * `filePath` relative to the repo at `cwd`, always with forward slashes, or null
 * when it lies outside it.
 *
 * Forward slashes because the callers match against `.ezmodo/`: on Windows
 * `path.relative` answers with backslashes, and a `/`-only pattern then never
 * matched there (#3128). Outside covers `..` and, on Windows, a different
 * drive, where `relative` returns an absolute path rather than one with `..`.
 */
export function repoRelativePath(filePath, cwd, p = path) {
  const rel = p.relative(cwd, p.resolve(cwd, filePath));
  if (p.isAbsolute(rel)) return null;
  const posix = rel.split(p.sep).join('/');
  if (posix === '..' || posix.startsWith('../')) return null;
  return posix;
}

/** True for a repo-relative path inside EzModo's own config dir. */
export function isConfigDirPath(rel) {
  return rel === CONFIG_DIR || rel.startsWith(`${CONFIG_DIR}/`) || rel.includes(`/${CONFIG_DIR}/`);
}
