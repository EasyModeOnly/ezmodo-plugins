/**
 * Once-per-session markers for the plugin hooks (E-297 #3348).
 *
 * The marker used to live in the shared OS temp dir, created with default
 * permissions and written by following whatever was at the path. On a
 * multi-user machine another user could pre-create `ezmodo-plugin-hooks` or
 * plant a symlink at a predictable `untracked-<session>` name and have the
 * hook write through it. The directory is now per user, private, and checked
 * before use; the file is created exclusively and never through a symlink.
 */

import { chmodSync, closeSync, constants, lstatSync, mkdirSync, openSync, writeSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, join } from 'path';

/**
 * The per-user directory markers live in: `$XDG_RUNTIME_DIR` (per user, mode
 * 0700, cleared at logout) when it is set, else `~/.cache/ezmodo/plugin-hooks`.
 */
export function markerDir(env = process.env, home = homedir()) {
  const runtime = env.XDG_RUNTIME_DIR;
  if (runtime && isAbsolute(runtime)) return join(runtime, 'ezmodo-plugin-hooks');
  return join(home, '.cache', 'ezmodo', 'plugin-hooks');
}

/**
 * Create `dir` if needed and confirm it is safe to write in: a real directory
 * (not a symlink), owned by this user, and private to them. Returns false when
 * it is not, and the caller writes nothing.
 */
export function ensurePrivateDir(dir) {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) return false;
    if (typeof process.getuid === 'function') {
      if (st.uid !== process.getuid()) return false;
      if ((st.mode & 0o077) !== 0) chmodSync(dir, 0o700);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Claim the marker `name` for this session. Returns:
 *
 * - `'claimed'`: created now — this is the first time.
 * - `'exists'`: already there — the reminder has fired before.
 * - `'unavailable'`: the directory is unsafe or the file could not be made.
 *
 * Exclusive create (`wx`) makes check-and-claim one step, and `O_NOFOLLOW`
 * refuses a symlink planted at the marker's own name.
 */
export function claimMarker(name, dir = markerDir()) {
  if (!ensurePrivateDir(dir)) return 'unavailable';
  const flags =
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
  let fd;
  try {
    fd = openSync(join(dir, name), flags, 0o600);
  } catch (err) {
    return err && err.code === 'EEXIST' ? 'exists' : 'unavailable';
  }
  try {
    writeSync(fd, new Date().toISOString());
  } catch {
    // An empty marker still marks.
  } finally {
    closeSync(fd);
  }
  return 'claimed';
}
