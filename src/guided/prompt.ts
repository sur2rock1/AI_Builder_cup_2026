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

export function guidedBoardBlock(script: GuidedScript): string {
  const outline = script.beats
    .map((b, i) => `  ${i + 1}. ${b.id} (${b.kind})${b.lines ? ` - ${b.lines.length} lines, written one by one` : ''}${b.ask || b.lines?.some((l) => l.ask) ? ' - asks a question' : ''}`)
    .join('\n');
  return `THE BOARD (guided lesson)
You are teaching from a prepared lesson for this concept: "${script.title}". It is a list of BEATS (outline below).
The board is ONE page that only grows: nothing is ever wiped. The learner reads it while you talk.
Teach like a chalkboard teacher: SAY what you write as it appears, in words, then explain it in one sentence. Never skip a step:
every number on the board must come from a line above it, and you say where it came from.

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
 - When their question is answered, check briefly ("Does that help?"), then call resume_lesson. It tells you exactly where you stopped.
   Say in one sentence where we were, then carry on from that point - do not restart the beat.

RULES
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
    case 'point': return `line: ${it.text}`;
    case 'rule': return `rule box: ${it.text}`;
    case 'exception': return `watch-out line: ${it.text}`;
    case 'compare': return `${it.side} column${it.title ? ` (${it.title})` : ''}: ${it.text}`;
    case 'work': return `worked lines: ${it.lines.join(' | ')}`;
    case 'picture': return `picture: ${it.ref}${it.step && it.step !== 'all' ? ` up to step ${it.step}` : ''}`;
    case 'slot': return `blank for the learner (${it.id}): ${it.label}`;
    case 'line': return `line: ${it.text}`;
    case 'aside': return `side note: ${it.text}`;
  }
}

export function beatInstruction(script: GuidedScript, index: number, pace: Pace = DEFAULT_PACE): string {
  const beat: Beat = script.beats[index];
  const out: string[] = [];
  if (beat.lines?.length) {
    out.push(`BEAT ${index + 1} of ${script.beats.length} (${beat.kind}) - written LINE BY LINE (${beat.lines.length} lines).`);
    if (beat.board.length) out.push(`ALREADY ON THE BOARD FOR THIS BEAT: ${beat.board.map(describeItem).join(' ; ')}`);
    out.push(`WHAT THIS BEAT IS FOR: ${beat.say}`);
    out.push(paceGuidance(pace));
    out.push('Say one short sentence to set it up, then call next_line for the first line.');
    return out.join('\n');
  }
  out.push(`BEAT ${index + 1} of ${script.beats.length} (${beat.kind}). Start speaking now - the board is writing this while you talk.`);
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
  const out = [
    answered
      ? `The learner's answer is now WRITTEN: "${line.text}". Confirm it warmly (or, if they got it wrong, gently show why this is right): ${line.say}`
      : `WRITTEN NOW: "${line.text}". SAY IT: ${line.say}`,
    'Read the line aloud in words as it appears, then that one sentence of explanation. Do not add other lines.',
    left > 0 ? `Then call next_line (${left} more line${left === 1 ? '' : 's'} in this beat).` : 'That was the last line of this beat. Then call advance_beat.',
  ];
  if (pace === 'slow') out.push('Slow pace: after explaining, check briefly ("Okay so far?") and wait before the next line.');
  return out.join('\n');
}

/** next_line reached a line whose answer is held back. */
export function askInstruction(line: BoardLine): string {
  return [
    'DO NOT WRITE YET - the next line is the answer, so it stays hidden.',
    `ASK: ${line.ask!.prompt}`,
    'Then STOP and wait for the learner.',
    `A GOOD ANSWER: ${line.ask!.lookFor}`,
    `IF THEY MISS: ${line.ask!.onMiss}`,
    'When they have answered (or you have helped them to it): assess_child_reasoning, follow it, then call next_line - it writes the answer while you confirm it.',
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
