/**
 * What the Stop hook (ask-on-task-reminder.js) reads from a session (E-333
 * #3832): did the last message hand work to the person, and did the session
 * ask any questions on the task?
 *
 * Pure functions over strings, so the tests need no Claude Code session.
 */

// Phrasing that hands work back to the person in the terminal, where nothing
// queues it or links it to the task it holds up. Straight and curly
// apostrophes both: models write either.
const DEFERRAL_PATTERNS = [
  /\bstill on you\b/i,
  /\byou['’]ll need to\b/i,
  /\byou will need to\b/i,
];

/** True when `text` leaves work for the person in the old "still on you" way. */
export function defersToPerson(text) {
  if (typeof text !== 'string' || !text) return false;
  return DEFERRAL_PATTERNS.some((re) => re.test(text));
}

// The asking tools, under any server name the session gave them:
// mcp__plugin_ezmodo_ezmodo__manage_question, mcp__claude_ai_ezmodo__…, or bare.
const ASK_TOOL = /(?:^|__)(manage_question|manage_decision)$/;

/** True when a tool_use block asked a question or a decision to make. */
export function isAsk(block) {
  if (!block || block.type !== 'tool_use' || typeof block.name !== 'string') return false;
  if (!ASK_TOOL.test(block.name)) return false;
  return block.input?.action === 'create';
}

function contentBlocks(entry) {
  const content = entry?.message?.content;
  if (Array.isArray(content)) return content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return [];
}

/**
 * Read a Claude Code transcript (JSONL). Returns `{ asked, lastText }`:
 *
 * - `asked`: the session created a question or a decision to make.
 * - `lastText`: the text of the final assistant turn, i.e. every assistant
 *   entry after the last user entry (a tool result is a user entry, so this
 *   is what was written after the last tool ran).
 *
 * Lines that are not JSON are skipped: a partly written last line must not
 * make the hook speak.
 */
export function readTranscript(jsonl) {
  let asked = false;
  let tail = [];
  for (const line of String(jsonl ?? '').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === 'user') {
      tail = [];
      continue;
    }
    if (entry?.type !== 'assistant') continue;
    for (const block of contentBlocks(entry)) {
      if (isAsk(block)) asked = true;
      if (block?.type === 'text' && typeof block.text === 'string') tail.push(block.text);
    }
  }
  return { asked, lastText: tail.join('\n') };
}

/**
 * The reminder to give, or null for silence.
 *
 * `lastMessage` wins over the transcript's tail when the harness passes one
 * (`last_assistant_message`); the transcript still decides whether anything
 * was asked.
 */
export function askReminder({ transcript, lastMessage }) {
  const { asked, lastText } = readTranscript(transcript);
  const text = typeof lastMessage === 'string' && lastMessage ? lastMessage : lastText;
  if (asked || !defersToPerson(text)) return null;
  return [
    'EzModo: your last message leaves work for the person ("still on you" / "you\'ll need to"),',
    'but this session asked no questions. A list in the terminal is lost when it closes.',
    '',
    'Ask each item on the task it holds up instead:',
    '- options to choose between: manage_decision action:"create" with taskId, question, choices, recommendation',
    '- a step only a person can do, a free-text answer, or an approval elsewhere:',
    '  manage_question action:"create" with taskId, kind (todo | question | approval), title, body, link;',
    '  blocking:true if the task cannot go on without it',
    '- asking only because the API cannot do it? File that gap as a task too.',
    '',
    'Then end with the questions you asked (kind and title) and a link to the person\'s Inbox',
    '(https://ezmodo.com/<orgSlug>/inbox?tab=questions). If nothing actually needs the person, say so and stop.',
  ].join('\n');
}
