/**
 * Shared helpers for the EzModo plugin hooks.
 *
 * The governing rule for everything in this directory: a hook that cannot
 * work must be INVISIBLE, not noisy. These fire after ordinary edits and
 * commits, so a hook that throws, blocks, or prints a warning when EzModo is
 * unreachable makes the plugin worse than not having it. Every entry point
 * exits 0, and every failure path here returns a value rather than raising.
 */

import { existsSync, lstatSync, readFileSync } from 'fs';
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

// The legacy per-repo session file in `.ezmodo/`, and the per-worktree one in
// the worktree's git dir (#3195). Same names as mcp-server/lib/active-session.js.
const SESSION_FILENAME = 'active-session.json';
const WORKTREE_SESSION_FILENAME = 'ezmodo-active-session.json';

// A session file is a few hundred bytes. Anything far larger is not one.
const MAX_SESSION_BYTES = 64 * 1024;
// EzModo ids are UUIDs or Firestore-style keys. A taskId is handed to the model
// as an argument to call with, so it must be an id and nothing else.
const TASK_ID = /^[A-Za-z0-9_-]{1,128}$/;

function readSessionFile(file) {
  try {
    if (lstatSync(file).size > MAX_SESSION_BYTES) return null;
    const s = JSON.parse(readFileSync(file, 'utf-8'));
    return s && typeof s.taskId === 'string' && TASK_ID.test(s.taskId) ? s : null;
  } catch {
    return null;
  }
}

/**
 * The task the MCP server considers active in the worktree whose git dir is
 * `gitDir`, or null.
 *
 * Not ours to maintain: mcp-server/lib/active-session.js writes it on an
 * in_progress transition and clears it on completion. Reading it rather than
 * tracking state of our own is what keeps the hook honest.
 *
 * Only the per-worktree file counts (E-297 #3348). The legacy
 * `.ezmodo/active-session.json` sits in the working tree, where some repos
 * commit it, so a clone can carry a planted one: it must not be able to switch
 * the untracked-edit reminder off. A file inside the git dir cannot arrive
 * with a clone or a pull.
 */
export function readWorktreeSession(gitDir) {
  return gitDir ? readSessionFile(join(gitDir, WORKTREE_SESSION_FILENAME)) : null;
}

/**
 * The active session for a commit made in one particular checkout (#3195,
 * E-297 #3348).
 *
 * Returns `{ session, hint, foreign }`:
 *
 * - `session`: `<gitDir>/ezmodo-active-session.json`, written for this
 *   worktree and no other. The only source trusted to name the taskId to link.
 * - `hint`: the legacy `.ezmodo/active-session.json` when there is no
 *   `session` and it does not name another checkout. It is in the working
 *   tree, so it may have been committed by anyone; the caller shows it as an
 *   unverified pointer and never as the taskId to call with.
 * - `foreign`: a legacy session naming another worktree (by `worktree`, or by
 *   `branch` from a server that recorded only that), so the caller can say it
 *   is not this commit's task.
 */
export function activeSessionFor(configDir, { gitDir, worktree, branch } = {}, p = path) {
  const own = readWorktreeSession(gitDir);
  if (own) return { session: own, hint: null, foreign: null };

  const legacy = readSessionFile(join(configDir, SESSION_FILENAME));
  if (!legacy) return { session: null, hint: null, foreign: null };

  let elsewhere = false;
  if (legacy.worktree && worktree) {
    elsewhere = p.resolve(String(legacy.worktree)) !== p.resolve(worktree);
  } else if (legacy.branch && branch) {
    elsewhere = legacy.branch !== branch;
  }
  return elsewhere
    ? { session: null, hint: null, foreign: legacy }
    : { session: null, hint: legacy, foreign: null };
}

// C0/C1 controls, line and paragraph separators, and bidi overrides/isolates:
// anything that could start a new line in the model's context or reorder what
// it reads.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/**
 * Repository-supplied text made safe to show the model: one line, no control
 * characters, at most `max` characters. Session titles, commit subjects and
 * branch names come from files and commits anyone with push access writes.
 */
export function sanitizeText(value, max = 120) {
  const flat = String(value ?? '').replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** `sanitizeText`, as a double-quoted literal so it reads as data. */
export function quoted(value, max = 120) {
  return JSON.stringify(sanitizeText(value, max));
}

/** A task number as `#N`, or `#?` when the value is not a positive integer. */
export function taskRef(taskNumber) {
  return Number.isInteger(taskNumber) && taskNumber > 0 ? `#${taskNumber}` : '#?';
}

// git commit's summary line: `[branch (root-commit) 9b5d893] subject`.
const COMMIT_SUMMARY = /^\[[^\]\n]* ([0-9a-f]{7,40})\]/gm;

/**
 * Whether the shell tool's response shows that a commit with full hash `sha`,
 * committed at `committedAt` (unix seconds), landed in this command (E-297
 * #3348).
 *
 * Claude Code's PostToolUse payload for Bash carries `stdout`, `stderr`,
 * `interrupted` and the background/timeout fields, but no exit code (a
 * command that fails outright is reported as a tool error, for which
 * PostToolUseFailure exists). That is not enough on its own, because
 * `git commit … ; echo done` exits 0 when the commit failed, and
 * the hook would then hand over the PREVIOUS commit's SHA as if it were new.
 * So:
 *
 * - interrupted, backgrounded or timed-out commands, and any explicit error or
 *   non-zero exit field a future payload might carry, are failures;
 * - if stdout shows git's `[branch sha]` summary line, one of them must name
 *   HEAD;
 * - if it shows none (`-q`, output redirected), HEAD must have been committed
 *   within the last `maxAgeSeconds`.
 */
export function commitConfirmed(
  response,
  { sha, committedAt, now = Date.now() / 1000, maxAgeSeconds = 300 } = {}
) {
  const r = response && typeof response === 'object' ? response : {};
  if (r.interrupted === true || r.is_error === true || r.isError === true) return false;
  if (r.backgroundTaskId != null || r.backgroundedByUser || r.backgroundedByTurnAbort) return false;
  if (r.timedOutAfterMs) return false;
  for (const key of ['exitCode', 'exit_code', 'code', 'returnCode']) {
    if (typeof r[key] === 'number' && r[key] !== 0) return false;
  }
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) return false;

  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  const shown = [...stdout.matchAll(COMMIT_SUMMARY)].map((m) => m[1]);
  if (shown.length > 0) return shown.some((prefix) => sha.startsWith(prefix));

  return Number.isFinite(committedAt) && Math.abs(now - committedAt) <= maxAgeSeconds;
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
 * Splits on UNQUOTED `&&`, `||`, `;`, `|`, a lone `&` and newlines. A lone `&`
 * ends a command in every shell the hook can see it from: it backgrounds one
 * in bash, and it is cmd.exe's sequencing operator and PowerShell's call
 * operator (`& git commit`), so splitting there leaves the git word at the
 * start of its own segment. `2>&1` and `&>` are redirections, not separators.
 *
 * Two kinds of text are dropped because the shell never runs them, and a
 * commit command routinely contains both:
 *
 * - Heredoc bodies (`<<'EOF' … EOF`, quoted or not, `<<-` too). Recognised
 *   only where the shell would see the operator, so a `<<EOF` inside a quote
 *   or a comment does not swallow the lines after it.
 * - Comments: an unquoted `#` at the start of a word, to the end of the line
 *   (bash, zsh, PowerShell). Without this, `git commit -m x # ; cd /tmp/evil ;
 *   git commit` read as three commands, two of which never run (#3348).
 *
 * Not a shell parser — it only has to be right about where one command ends
 * and the next begins, and the caller treats anything it cannot follow as
 * unknown.
 */
export function splitCommands(command) {
  const text = String(command);
  const segments = [];
  let current = '';
  let quote = null;
  let wordStart = true; // the next character would begin a new word
  const heredocs = []; // delimiters whose bodies start after the next newline

  const endSegment = () => {
    segments.push(current);
    current = '';
    wordStart = true;
  };

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
    if (c === '"' || c === '\'') {
      quote = c;
      current += c;
      wordStart = false;
      continue;
    }
    if (c === '\\' && i + 1 < text.length) {
      current += c + text[++i];
      wordStart = false;
      continue;
    }
    if (c === '#' && wordStart) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i++;
      continue;
    }
    if (text.startsWith('<<', i) && text[i + 2] !== '<') {
      const m = /^<<(-?)[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(text.slice(i));
      if (m) {
        heredocs.push(m[3]);
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === '\n') {
      endSegment();
      // Skip each pending heredoc's body, through its terminator line.
      for (const delimiter of heredocs.splice(0)) {
        for (;;) {
          const eol = text.indexOf('\n', i + 1);
          const line = text.slice(i + 1, eol === -1 ? text.length : eol);
          i = eol === -1 ? text.length : eol;
          if (line.trim() === delimiter || eol === -1) break;
        }
      }
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      endSegment();
      i++;
      continue;
    }
    if (c === '&' && text[i - 1] !== '>' && text[i - 1] !== '<' && text[i + 1] !== '>') {
      endSegment();
      continue;
    }
    if (c === ';' || c === '|') {
      endSegment();
      continue;
    }
    current += c;
    wordStart = /[\s()]/.test(c);
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
 * Commands after which the directory can no longer be known statically: they
 * pop a stack we did not see pushed, or run code that can change directory.
 */
const UNKNOWABLE_COMMANDS = new Set([
  'popd', 'pop-location', 'eval', 'source', '.', 'exec', 'invoke-expression', 'iex',
]);

/** `NAME=value`, a shell environment assignment before the command word. */
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

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
 * `cd -`, `popd`, `eval`/`source`, `--git-dir`/`--work-tree` and `GIT_*=`
 * assignments. A segment is a commit only when git is its command word (after
 * any `NAME=value` assignments), and comments are not read as commands
 * (E-297 #3348). When several commits appear, the last one
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
    const all = tokens(segment);
    // The command word is the first word after any `NAME=value` assignments.
    // An assignment of a GIT_* variable (GIT_DIR, GIT_WORK_TREE, …) can point
    // git at another repository entirely, so that cannot be followed.
    let first = 0;
    while (first < all.length && ENV_ASSIGNMENT.test(all[first])) {
      if (/^GIT_/i.test(all[first])) return null;
      first++;
    }
    const words = all.slice(first);
    if (words.length === 0) continue;
    const name = words[0].toLowerCase();

    if (UNKNOWABLE_COMMANDS.has(name)) return null;

    if (CD_COMMANDS.has(name)) {
      const target = cdTarget(words.slice(1), p) ?? '~';
      if (target === '-') return null;
      const expanded = expandPath(target, env);
      if (expanded === null) return null;
      dir = p.resolve(dir, expanded);
      continue;
    }

    // Only a segment whose COMMAND is git can be a commit. `echo git -C /x
    // commit` used to resolve to /x because git appeared somewhere in it.
    if (!GIT_WORD.test(words[0])) continue;
    let at = dir;
    let isCommit = false;
    for (let i = 1; i < words.length; i++) {
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
