#!/usr/bin/env node
/**
 * PostToolUse(Bash) — after a successful `git commit`, hand the model the full
 * SHA and remind it to link the commit.
 *
 * Two rules in the work-tracking skill are the ones most often forgotten,
 * because nothing enforces them. This is the first: link_commit after every
 * commit. A skill can only ask; a hook can notice.
 *
 * The SHA is resolved HERE rather than left to the model. link_commit rejects
 * anything but a full 40-character hash, and a model that has just seen
 * `[branch 9b5d893]` in the commit output will reach for those seven
 * characters. Supplying `git rev-parse HEAD` removes the guess.
 */

import { execFileSync } from 'child_process';
import { findConfigDir, readActiveSession, readPayload, emit } from './lib.js';

const payload = readPayload();
if (!payload) process.exit(0);

const command = payload.tool_input?.command ?? '';
// `git commit` anywhere in the command line, including `cd x && git commit`.
// Deliberately loose: a missed reminder costs nothing, and the model can see
// for itself whether a commit happened.
if (!/\bgit\s+(?:-\S+\s+)*commit\b/.test(command)) process.exit(0);

// A failed commit has nothing to link.
const response = payload.tool_response ?? {};
if (response.interrupted === true) process.exit(0);

const cwd = payload.cwd ?? process.cwd();
const configDir = findConfigDir(cwd);
if (!configDir) process.exit(0); // Not an EzModo repo — say nothing.

let sha = null;
let subject = null;
let branch = null;
try {
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sha = git(['rev-parse', 'HEAD']);
  subject = git(['log', '-1', '--pretty=%s']);
  branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
} catch {
  process.exit(0); // No git, no HEAD, detached oddity — not worth a message.
}

if (!sha || sha.length !== 40) process.exit(0);

const session = readActiveSession(configDir);
const target = session
  ? `taskId "${session.taskId}" (#${session.taskNumber} — ${session.title})`
  : 'the active task — if there is none, this commit is untracked work; call report_untracked_work';

emit(
  [
    'EzModo: a commit just landed and is not linked yet.',
    '',
    `  sha:     ${sha}`,
    `  branch:  ${branch}`,
    `  message: ${subject}`,
    '',
    `Call manage_task action:"link_commit" against ${target}.`,
    'Use the full 40-character sha above — a shortened one is rejected.',
  ].join('\n')
);
