/**
 * Running git from a hook, in a repository the hook did not choose (E-297 #3348).
 *
 * The commit hook runs git in whatever directory the command line committed
 * in, which may be a freshly cloned repo nobody has read. A repository's own
 * `.git/config` can make an innocent read run a program: `log.showSignature`
 * with `gpg.program` runs it on `git log`, `core.fsmonitor` on anything that
 * looks at the index, a pager or external diff on output. The audit reproduced
 * the first with a fake gpg. A hook fires without the user doing anything, so
 * every git call here overrides those settings on the command line, which
 * beats every config file.
 */

import { execFileSync } from 'child_process';
import { devNull } from 'os';

/**
 * `-c` overrides placed before every subcommand. Command-line `-c` outranks
 * system, global and repository config alike.
 */
export const GIT_HARDENING = Object.freeze([
  '-c', 'log.showSignature=false',
  '-c', 'core.fsmonitor=false',
  '-c', `core.hooksPath=${devNull}`,
  '-c', 'core.pager=cat',
  '-c', 'diff.external=',
  '-c', 'gpg.program=false',
  '-c', 'gpg.ssh.program=false',
  '-c', 'gpg.x509.program=false',
]);

/** The environment git runs with: no prompts, no pager, no optional locks. */
function gitEnv(env = process.env) {
  const out = { ...env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0' };
  // Inherited from a parent git process, these would redirect every call.
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_EXTERNAL_DIFF', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT']) {
    delete out[name];
  }
  return out;
}

/** The full argv for a hardened git call. Exported for tests. */
export function hardenedArgs(args) {
  return [...GIT_HARDENING, ...args];
}

/**
 * Run `git <args>` in `cwd` with the hardening above and return its trimmed
 * stdout. Throws whatever execFileSync throws; callers treat that as "no
 * answer" and stay silent.
 */
export function safeGit(args, cwd, { bin = 'git', timeout = 5000 } = {}) {
  return execFileSync(bin, hardenedArgs(args), {
    cwd,
    encoding: 'utf-8',
    env: gitEnv(),
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout,
    windowsHide: true,
  }).trim();
}
