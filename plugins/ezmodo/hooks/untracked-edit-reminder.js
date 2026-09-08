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

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative, isAbsolute } from 'path';
import { findConfigDir, readActiveSession, readPayload, emit } from './lib.js';

const payload = readPayload();
if (!payload) process.exit(0);

const cwd = payload.cwd ?? process.cwd();
const configDir = findConfigDir(cwd);
if (!configDir) process.exit(0); // Not an EzModo repo — say nothing.

// Editing EzModo's own config or session files is not "work on the codebase".
const filePath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path ?? '';
if (filePath) {
  const rel = isAbsolute(filePath) ? relative(cwd, filePath) : filePath;
  if (rel.startsWith('..')) process.exit(0); // Outside the repo.
  if (/(^|\/)\.(ezmodo|zephly)\//.test(rel)) process.exit(0);
}

if (readActiveSession(configDir)) process.exit(0); // Tracked. Nothing to say.

// Once per session. The marker lives in the OS temp dir, not the repo: it is
// per-session scratch, and writing it into a checkout would be a stray file in
// someone's diff.
const sessionId = String(payload.session_id ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
const markerDir = join(tmpdir(), 'ezmodo-plugin-hooks');
const marker = join(markerDir, `untracked-${sessionId}`);
if (existsSync(marker)) process.exit(0);
try {
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(marker, new Date().toISOString());
} catch {
  // If the marker cannot be written the reminder may repeat. Annoying, not
  // broken — better than staying silent about untracked work.
}

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
