#!/usr/bin/env node
/**
 * Stop — notice a session ending with a "still on you" list (E-333 #3832).
 *
 * The rule in the work-tracking skill: anything left for a person is a
 * question on the task it holds up (manage_question / manage_decision), not a
 * list in the last message. The habit it replaces is old and strong, so this
 * watches for it: a final message saying "still on you" or "you'll need to"
 * in a session that asked no questions gets sent back once, with a reminder
 * to ask them on the task first.
 *
 * Silent everywhere else, like every hook here: not an EzModo repo, no
 * transcript, a session that did ask, a continuation this hook already caused
 * (`stop_hook_active`), and every time after the first in one session.
 */

import { lstatSync, readFileSync } from 'fs';
import { askReminder } from './ask-check.js';
import { findConfigDir, readPayload } from './lib.js';
import { claimMarker } from './session-marker.js';

// A transcript this large is read no further: a hook must not stall a stop,
// and staying quiet is the safe failure.
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

function readTranscriptFile(file) {
  if (typeof file !== 'string' || !file) return null;
  try {
    const st = lstatSync(file);
    if (!st.isFile() || st.size > MAX_TRANSCRIPT_BYTES) return null;
    return readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

const payload = readPayload();
if (!payload) process.exit(0);
if (payload.stop_hook_active) process.exit(0); // Already sent back once.

const cwd = payload.cwd ?? process.cwd();
if (!findConfigDir(cwd)) process.exit(0); // Not an EzModo repo — say nothing.

const transcript = readTranscriptFile(payload.transcript_path);
if (transcript === null) process.exit(0);

const reason = askReminder({ transcript, lastMessage: payload.last_assistant_message });
if (!reason) process.exit(0);

// Once per session: a reminder on every stop is how a hook gets disabled.
const sessionId = String(payload.session_id ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
if (claimMarker(`ask-${sessionId}`) === 'exists') process.exit(0);

// `decision: "block"` sends the session back with `reason` as its next prompt.
process.stdout.write(JSON.stringify({ decision: 'block', reason }));
process.exit(0);
