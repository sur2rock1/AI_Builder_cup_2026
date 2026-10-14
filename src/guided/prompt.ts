// ─────────────────────────────────────────────────────────────────
// Guided mode — what the tutor is told.
//
//   guidedBoardBlock(script)   replaces the standard "THE BOARD" block in the
//                              system prompt (everything else in the persona
//                              is unchanged).
//   beatInstruction / lineInstruction / askInstruction / asideInstruction /
//   resumeInstruction          what the guided tools return to the tutor.
//
// The method is a chalkboard teacher's: say it, write it, explain it, next line.
// The tutor is handed ONE small thing at a time, so it has nothing to compress.
// ─────────────────────────────────────────────────────────────────

import type { Beat, BoardItem, BoardLine, GuidedBoardState, GuidedScript } from './types';
import { DEFAULT_PACE, paceGuidance, type Pace } from './pace';
import { describeMarks, stripMarks } from './marks';

export function guidedBoardBlock(script: GuidedScript): string {
  const outline = script.beats
    .map((b, i) => `  ${i + 1}. ${b.id} (${b.kind})${b.lines ? ` - ${b.lines.length} lines, written one by one` : ''}${b.ask || b.lines?.some((l) => l.ask) ? ' - asks a question' : ''}`)
    .join('\n');
  return `THE BOARD (guided lesson)
You are teaching from a prepared lesson for this concept: "${script.title}". It is a list of BEATS (outline below).
The board is ONE page that only grows: nothing is ever wiped. The learner reads it while you talk.
Teach like a good chalkboard teacher talking to a child: warm, conversational, flowing ("So...", "Now look at this...", "See the 3 here?").
The board holds a short note; YOUR VOICE holds the explanation. Talk while you write, using the suggested wording almost word for word - it has been written to flow from one line to the next.
Do NOT read the board text aloud and then explain it again - say each idea ONCE, and never repeat or re-introduce what the previous line already said.
VOICE: keep exactly the same calm, steady, friendly voice, pace and energy from the first line to the last. No sudden excitement, no change of
volume or pitch from line to line, no exclamations like "Great!" or "Awesome!" between lines. Never skip a step: every number on the board must come
from a line above it, and you say where it came from. When a line has chalk marks (underline, circle, colour, label), point at them as they
appear ("I'm underlining the 3 - that's our ones"): the learner sees the mark and hears what it means.

HOW A BEAT WORKS
 1. Call advance_beat to start the next beat. It tells you what the beat adds to the board and what to do.
 2. Some beats are written LINE BY LINE. For those, call next_line: it writes ONE line and tells you what to say.
    Say that line aloud, explain it in one sentence, then call next_line again. One line per call - never call it twice in a row without speaking.
 3. If next_line tells you to ASK, nothing is written yet: the answer is held back. Ask, then STOP and wait for the learner.
    When they answer: assess_child_reasoning, follow what it says, and then call next_line - it writes the answer on the board while you confirm it.
    Never give the answer yourself before they have had a real try.
 4. Other beats write their items as you talk. Speak as soon as advance_beat returns and talk through each item as it appears.
    If the beat has a question, ask it and wait; once settled, fill_slot writes their answer, then advance_beat.

WHEN THE LEARNER INTERRUPTS OR ASKS SOMETHING ELSE
 - Stop and answer THEM. Do not brush it off and do not say "we'll get to that".
 - If the answer needs working or a fact worth keeping, put it on the board line by line with write_aside
   (the first call also passes their question). Say each line as you write it, exactly as in the lesson.
   A one-word reply ("yes", "that's right") needs no board.
 - When their question is answered, check briefly that it helped, then call resume_lesson. It tells you exactly where you stopped.
   Say in one sentence where we were, then carry on from that point - do not restart the beat.

RULES
 - FLOW: a real teacher does not stop after every statement. Never end a turn with a check-in question of your own and never wait for a reply
   unless the lesson itself tells you to ask. Say the line, explain it in a sentence, and move straight on to the next call.
   An occasional rhetorical tag inside your flow is natural; just do not pause for an answer.
   This lesson's own questions (the lines that ask) are the ONLY checks of understanding: they replace the general "check understanding after every chunk" habit.
   Check in on your own only if the learner has been silent for a long time, sounds unsure, or says they are lost.
   While you are TEACHING (everything before the practice questions) just explain: no quizzing, no asking what they think. The questions come later, in the practice, and they are written on the board.
   After EVERY tool result you must speak (or call the next tool). Never go silent waiting for the learner unless the lesson told you to ask a question.
 - Never call advance_beat while a question is unanswered or lines of the beat are still unwritten.
 - If the learner does not know, say that is fine, teach the point a different way, call record_confusion_signal, and ask once more.
   After that give the answer plainly (call next_line to write it) and move on - never leave them stuck and never stop.
 - Tool calls pause your voice: call the tool BEFORE you speak about the line, never mid-sentence.
 - Never mention beats, lines, slots, tools or the lesson plan to the learner.
 - The learner sets the pace (slow / steady / quick). Each beat tells you the current pace; follow it, and if they say "slow down" or "faster", do that too.
 - What is written in the lesson has been checked. Do not contradict it. If the learner challenges it, look at it together rather than just defending it.
 - Use the standard terms: rise is the change in y, run is the change in x, gradient = rise ÷ run (and the equivalents in other topics).

THIS LESSON
${outline}`;
}

function describeItem(it: BoardItem): string {
  switch (it.type) {
    case 'heading': return `heading: ${it.text}`;
    case 'point': return `line: ${stripMarks(it.text)}`;
    case 'rule': return `rule box: ${it.text}`;
    case 'exception': return `watch-out line: ${it.text}`;
    case 'compare': return `${it.side} column${it.title ? ` (${it.title})` : ''}: ${it.text}`;
    case 'work': return `worked lines: ${it.lines.map(stripMarks).join(' | ')}`;
    case 'picture': return `picture: ${it.ref}${it.step && it.step !== 'all' ? ` up to step ${it.step}` : ''}`;
    case 'slot': return `blank for the learner (${it.id}): ${it.label}`;
    case 'line': return `line: ${stripMarks(it.text)}`;
    case 'aside': return `side note: ${it.text}`;
    case 'question': return `question written up: ${stripMarks(it.text)}`;
  }
}

export function beatInstruction(script: GuidedScript, index: number, pace: Pace = DEFAULT_PACE): string {
  const beat: Beat = script.beats[index];
  const out: string[] = [];
  if (beat.lines?.length) {
    out.push(`BEAT ${index + 1} of ${script.beats.length} (${beat.kind}) - written LINE BY LINE (${beat.lines.length} lines).`);
    if (beat.board.length) out.push(`ALREADY ON THE BOARD FOR THIS BEAT: ${beat.board.map(describeItem).join(' ; ')}`);
    out.push(`BACKGROUND (for you only, do not say it aloud): ${beat.say}`);
    out.push(paceGuidance(pace));
    out.push('Do NOT say anything yet. Call next_line now: the first line carries the opening words, so nothing is said twice.');
    return out.join('\n');
  }
  out.push(`BEAT ${index + 1} of ${script.beats.length} (${beat.kind}). SPEAK NOW - start speaking - the board is writing this while you talk.`);
  out.push(`ON THE BOARD (in this order - talk through each as it appears): ${beat.board.map(describeItem).join(' ; ')}`);
  out.push(`GET ACROSS: ${beat.say}`);
  out.push(paceGuidance(pace));
  if (beat.ask) {
    out.push(`THEN ASK: ${beat.ask.prompt}`);
    out.push(`A GOOD ANSWER: ${beat.ask.lookFor}`);
    out.push(`IF THEY MISS: ${beat.ask.onMiss}`);
    out.push(`After they answer: assess_child_reasoning, follow its instruction${beat.ask.slot ? `, then fill_slot("${beat.ask.slot}", their answer in their words)` : ''}, then advance_beat. Do not advance until they have answered.`);
  } else {
    out.push('No question in this beat. When you have got the idea across, call advance_beat.');
  }
  return out.join('\n');
}

/** next_line wrote a line. */
export function lineInstruction(line: BoardLine, answered: boolean, left: number, pace: Pace = DEFAULT_PACE): string {
  const plain = stripMarks(line.text);
  const marks = describeMarks(line.text);
  const out = [
    answered
      ? `The learner's answer is now WRITTEN: "${plain}". Confirm it warmly (or, if they got it wrong, gently show why this is right). Suggested wording: ${line.say}`
      : line.annotates
        ? `You are MARKING UP a line that is already on the board ("${plain}"); nothing new is written. Suggested wording: ${line.say}`
        : `WRITTEN NOW: "${plain}". Suggested wording: ${line.say}`,
    marks ? `CHALK MARKS appearing on it: ${marks}. Point at them as you speak ("I'm underlining...").` : '',
    'SPEAK NOW - never stay silent after a tool result. Say the suggested wording almost word for word, in the same calm, even, warm voice as every other line. '
      + 'Do not add an opening ("Okay", "Great", "So"), a recap, or a second version of the same idea. The learner can see the board: do not read the board text out and then say it again. '
      + 'Then go straight on.',
    left > 0 ? `Then call next_line (${left} more line${left === 1 ? '' : 's'} in this beat).` : 'That was the last line of this beat. Then call advance_beat.',
  ].filter(Boolean);
  return out.join('\n');
}

/** next_line reached a line whose answer is held back. */
export function askInstruction(line: BoardLine): string {
  const written = (line.ask!.board?.trim() || line.ask!.prompt).trim();
  return [
    `THE QUESTION IS NOW WRITTEN ON THE BOARD: "${stripMarks(written)}". The answer is not written yet - it stays hidden until the learner replies.`,
    `SPEAK NOW: ask the learner this question ALOUD, in your own words (do not just read the board): ${line.ask!.prompt}`,
    'Only AFTER you have asked it out loud, stop and wait for the learner. Give them a real chance to think.',
    `A GOOD ANSWER: ${line.ask!.lookFor}`,
    `IF THEY MISS: ${line.ask!.onMiss}`,
    'When they have answered (or you have helped them to it): assess_child_reasoning, follow it, then call next_line - it writes the answer under the question while you confirm it.',
  ].join('\n');
}

export function asideInstruction(): string {
  return 'Written as a side note. Say that line aloud as it appears and explain it in a sentence. '
    + 'Call write_aside again for the next line of your answer, or - once their question is answered - check it helped and call resume_lesson.';
}

/** Where the lesson stopped, so the tutor can pick up exactly there after a side question. */
export function resumeInstruction(script: GuidedScript, state: GuidedBoardState): string {
  if (state.beatIndex < 0) return 'The lesson has not started yet. Call advance_beat to begin.';
  const beat = script.beats[state.beatIndex];
  const where = `You stopped in beat ${state.beatIndex + 1} of ${script.beats.length} (${beat.kind}).`;
  if (beat.lines?.length) {
    const lastWritten = state.lineIndex > 0 ? beat.lines[state.lineIndex - 1] : null;
    const pending = state.pendingAsk ? beat.lines.find((l) => l.id === state.pendingAsk) : null;
    const recap = lastWritten ? `The last line written was "${lastWritten.text}".` : 'No line of this beat is written yet.';
    if (pending?.ask) {
      return `${where} ${recap} You had asked: "${pending.ask.prompt}" - and it is still unanswered.\n`
        + 'Say in one sentence where we were, then ask that question again and wait. When they answer: assess_child_reasoning, then next_line.';
    }
    const left = beat.lines.length - state.lineIndex;
    return `${where} ${recap}\n`
      + (left > 0
        ? `Say in one sentence where we were ("So, back to ..."), then call next_line (${left} line${left === 1 ? '' : 's'} left in this beat).`
        : 'All lines of this beat are written. Say in one sentence where we were, then call advance_beat.');
  }
  const slot = beat.ask?.slot;
  const answered = slot ? !!state.filled[slot] : false;
  if (beat.ask && !answered) {
    return `${where} You were on: ${beat.say}\nThe question still waiting is: "${beat.ask.prompt}". Say in one sentence where we were, then ask it again and wait.`;
  }
  return `${where} That part is done. Say in one sentence where we were, then call advance_beat for the next beat.`;
}

export function finishedInstruction(script: GuidedScript): string {
  return `The prepared lesson on "${script.title}" is finished. Do not call advance_beat again. `
    + 'Ask the learner ONE fresh question of your own on this concept (use the practice questions in the curriculum context), '
    + 'use assess_child_reasoning on the answer, then tell them warmly one thing they did well and one thing worth a second look.';
}

/** First turn of a guided session (replaces composeKickoff, which is for the standard tutor). */
export function guidedKickoff(topic: string): string {
  return `The learner has just joined a one-to-one session on "${topic}". Say one warm sentence of hello, then call advance_beat and start teaching from the first beat. `
    + 'Do not ask the learner what they want to learn - you are leading this lesson. Do not test knowledge before you have taught the idea.';
}
