#!/usr/bin/env node
/**
 * PostToolUse(Edit|Write|MultiEdit|NotebookEdit) — notice code being written
 * with no active EzModo task.
 *
 * The second rule nothing enforces: create the task before you edit. The
 * failure it catches is real and common — a "just fix this quickly" request
 * that is three edits deep before anyone notices there is no task, at which
 * point the task gets written from memory instead of from context.
 *
 * Fires ONCE per session. A reminder on every edit would be noise, and noise
 * is how a hook gets disabled.
 */

import {
  findConfigDir,
  readWorktreeSession,
  readPayload,
  emit,
  repoRelativePath,
  isConfigDirPath,
} from './lib.js';
import { safeGit } from './safe-git.js';
import { claimMarker } from './session-marker.js';

const payload = readPayload();
if (!payload) process.exit(0);

const cwd = payload.cwd ?? process.cwd();
const configDir = findConfigDir(cwd);
if (!configDir) process.exit(0); // Not an EzModo repo — say nothing.

// Editing EzModo's own config or session files is not "work on the codebase".
const filePath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path ?? '';
if (filePath) {
  const rel = repoRelativePath(filePath, cwd);
  if (rel === null) process.exit(0); // Outside the repo.
  if (isConfigDirPath(rel)) process.exit(0);
}

// Tracked? Only the per-worktree session in the git dir answers that (E-297
// #3348): the legacy .ezmodo/active-session.json can be committed, so a
// cloned repo could ship one that silences this reminder for good.
let gitDir = null;
try {
  gitDir = safeGit(['rev-parse', '--absolute-git-dir'], cwd);
} catch {
  // Not a git checkout, or git is unavailable: no session can be recorded.
}
if (readWorktreeSession(gitDir)) process.exit(0); // Tracked. Nothing to say.

// Once per session. The marker lives in a private per-user directory, not the
// repo: it is per-session scratch, and writing it into a checkout would be a
// stray file in someone's diff. If it cannot be claimed safely the reminder
// may repeat. Annoying, not broken — better than staying silent about
// untracked work, and better than writing through someone else's symlink.
const sessionId = String(payload.session_id ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
if (claimMarker(`untracked-${sessionId}`) === 'exists') process.exit(0);

emit(
  [
    'EzModo: this repo is tracked, but no task is active and code was just edited.',
    '',
    'Either create the task now (manage_task action:"create" status:"in_progress"),',
    'or — if the work is already underway — call report_untracked_work with the',
    'branch and changed files so it is captured rather than lost. Set origin to',
    '"discovered" or "scope-creep" if it came out of other work.',
    '',
    'This fires once per session.',
  ].join('\n')
);
