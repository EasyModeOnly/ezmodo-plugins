#!/usr/bin/env node
/**
 * PostToolUse(Bash|PowerShell) — after a successful `git commit`, hand the
 * model the full SHA and remind it to link the commit.
 *
 * PowerShell is the shell tool Claude Code uses on Windows when Git Bash is
 * absent or CLAUDE_CODE_USE_POWERSHELL_TOOL is set (#3128); its commits need
 * linking as much as Bash's.
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
import { findConfigDir, activeSessionFor, readPayload, emit, resolveCommitDir } from './lib.js';

const payload = readPayload();
if (!payload) process.exit(0);

const command = payload.tool_input?.command ?? '';
// Cheap pre-filter; resolveCommitDir below is the real test.
if (!/\bgit\b[\s\S]*\bcommit\b/.test(command)) process.exit(0);

// A failed commit has nothing to link.
const response = payload.tool_response ?? {};
if (response.interrupted === true) process.exit(0);

// Where the commit RAN, not where the session is (#2658). `cd ../other && git
// commit` used to be reported against the session repo's HEAD and active task.
// Null means the command line could not be read with confidence, and a SHA
// from the wrong repo stated as fact is worse than no reminder, so say nothing.
const cwd = resolveCommitDir(command, payload.cwd ?? process.cwd());
if (!cwd) process.exit(0);
const configDir = findConfigDir(cwd);
if (!configDir) process.exit(0); // Not an EzModo repo — say nothing.

let sha = null;
let subject = null;
let branch = null;
let worktree = null;
let gitDir = null;
try {
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sha = git(['rev-parse', 'HEAD']);
  subject = git(['log', '-1', '--pretty=%s']);
  branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  [worktree, gitDir] = git(['rev-parse', '--show-toplevel', '--absolute-git-dir']).split('\n');
} catch {
  process.exit(0); // No git, no HEAD, detached oddity — not worth a message.
}

if (!sha || sha.length !== 40) process.exit(0);

// The session for THIS worktree (#3195), not whichever one claimed last.
const { session, foreign } = activeSessionFor(configDir, { gitDir, worktree, branch });
const target = session
  ? `taskId "${session.taskId}" (#${session.taskNumber} — ${session.title})`
  : 'the active task — if there is none, this commit is untracked work; call report_untracked_work';
const foreignNote = foreign
  ? [
      '',
      `Not #${foreign.taskNumber} (${foreign.title}): EzModo's active session names it for ` +
        `${foreign.branch ? `branch ${foreign.branch}` : 'another checkout'}, not this worktree. ` +
        'Link the task this commit actually serves.',
    ]
  : [];

emit(
  [
    'EzModo: a commit just landed and is not linked yet.',
    '',
    `  sha:     ${sha}`,
    `  branch:  ${branch}`,
    `  message: ${subject}`,
    '',
    `Call manage_task action:"link_commit" against ${target}.`,
    ...foreignNote,
    'Use the full 40-character sha above — a shortened one is rejected.',
    'Then summarise any manifest.needsSummary paths it returns with update_manifest_entries.',
  ].join('\n')
);
