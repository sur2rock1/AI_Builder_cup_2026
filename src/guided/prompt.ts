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

export function guidedBoardBlock(script: GuidedScript, pictures: Array<{ ref: string; title: string }> = []): string {
  const outline = script.beats
    .map((b, i) => `  ${i + 1}. ${b.id} (${b.kind})${b.lines ? ` - ${b.lines.length} lines, written one by one` : ''}${b.ask || b.lines?.some((l) => l.ask) ? ' - asks a question' : ''}`)
    .join('\n');
  const pics = pictures.length
    ? `\n\nPICTURES you can put on the board with show_picture (some also appear by themselves as the lesson goes on):\n${pictures.map((p) => `  - ${p.title}`).join('\n')}`
    : '';
  return `THE BOARD (guided lesson)
You are teaching from a prepared lesson for this concept: "${script.title}". It is a list of BEATS (outline below), with a chalkboard the learner watches.
The board is ONE page that only grows: nothing is ever wiped. The board holds short notes and pictures; YOUR VOICE holds the explanation.

HOW TO TEACH IT - A CONVERSATION, NOT A LECTURE
 - Teach like a warm, curious tutor sitting next to one child, in your own natural words. Each line comes with the idea to get across: it is a guide, not a script.
 - Calm and unhurried: short sentences, one idea at a time. Do not read the board text out word for word, and do not repeat what the previous line already said.
 - Bring the learner in as you go. Every so often - about once per beat, and whenever a picture asks something - ask a short, easy question about what
   you have just shown ("Which way do the numbers get smaller?", "What do you notice here?"). Then STOP and wait for their answer, and respond to what
   they actually said (use assess_child_reasoning when it is a real answer to check). Do not ask after every line, and never quiz an idea you have not explained yet.
 - When a line has chalk marks (underline, circle, colour, label), point at them as they appear ("I'm underlining the 3 - that's our ones").
 - Teach THIS child the way that has worked for them. If YOUR PLAN above gives an order of representations, lead each idea with the first one:
   a visual diagram -> put a picture up (show_picture) and talk through it before the words; a worked example -> work one example aloud, step by step,
   before stating the rule; a real-world analogy -> start from something they know (use the interests in the plan). Use the plan's opener near the start,
   and if it lists a mix-up to watch for, check that idea gently when it comes up. The board lines stay the same; HOW you explain them is shaped to the child.

HOW A BEAT WORKS
 1. Call advance_beat to start the next beat. It tells you what the beat adds to the board and what to do.
 2. Some beats are written LINE BY LINE. For those, call next_line: it writes ONE line and gives you the idea for it.
    Explain it in your own words, then call next_line again for the next line. One line per call.
 3. If next_line tells you to ASK, nothing is written yet: the answer is held back. Ask, then STOP and wait for the learner.
    When they answer: assess_child_reasoning (say in representationUsed how you explained the idea before asking), follow what it says, and then call next_line - it writes the answer on the board while you confirm it.
    Never give the answer yourself before they have had a real try.
 4. Other beats write their items as you talk. Speak as soon as advance_beat returns and talk through each item as it appears.
    If the beat has a question, ask it and wait; once settled, fill_slot writes their answer, then advance_beat.

WHEN THE LEARNER SPEAKS - THIS COMES BEFORE EVERYTHING ELSE
 - The learner can talk at any time. The moment they do, stop and listen. Answer THEM - their question, their doubt, their idea - kindly and properly,
   in words a child understands. Do not brush it off, do not say "we'll get to that", and do not carry on with the next line until you have answered.
 - If they ask to SEE something ("show me a picture / a diagram", "I can't see it"), call show_picture and talk them through it.
   You CAN show pictures - never say that you cannot.
 - If the answer needs working or a fact worth keeping, write it on the board with write_aside, one short line per call (pass their question with the
   first line only). A quick spoken reply needs no board.
 - When they are happy, call resume_lesson. It tells you exactly where you stopped: say in a sentence where we were and carry on from there - do not restart the beat.
 - If they ask to be TESTED ("quiz me", "give me a question", "I already understand, can we skip?"), believe them and do it straight away: call
   skip_to_practice. Never say "after this step" or "first let's finish this" - a child who asks twice and is not heard stops trusting you.
   If they then miss a practice question, do not just give the answer: kindly say the bit we skipped explains it, call teach_skipped, teach that part
   briefly and warmly, and the lesson brings you back to the same question to try again.

RULES
 - After EVERY tool result, speak (or call the next tool). The only time you wait in silence is right after you have asked the learner a question.
 - Never call advance_beat while a question is unanswered or lines of the beat are still unwritten.
 - If the learner does not know, say that is fine, explain it a different way (a picture may help), call record_confusion_signal, and ask once more.
   After that give the answer plainly and move on - never leave them stuck and never stop.
 - Call a tool BEFORE you speak about the line it writes, never mid-sentence.
 - Never mention beats, lines, slots, tools or the lesson plan to the learner.
 - The learner sets the pace (slow / steady / quick). Each beat tells you the current pace; follow it, and if they say "slow down" or "faster", do that too.
 - What is written in the lesson has been checked. Do not contradict it. If the learner challenges it, look at it together rather than just defending it.
 - Use the standard terms: rise is the change in y, run is the change in x, gradient = rise ÷ run (and the equivalents in other topics).

THIS LESSON
${outline}${pics}`;
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
  void pace;
  const out = [
    answered
      ? `The learner's answer is now WRITTEN: "${plain}". Confirm it warmly (or, if they got it wrong, gently show why this is right). The idea: ${line.say}`
      : line.annotates
        ? `You are MARKING UP a line that is already on the board ("${plain}"); nothing new is written. The idea: ${line.say}`
        : `WRITTEN NOW: "${plain}". The idea to get across: ${line.say}`,
    marks ? `CHALK MARKS appearing on it: ${marks}. Point at them as you speak ("I'm underlining...").` : '',
    'SPEAK NOW - explain it in your own words: natural, warm, calm, one idea at a time (the idea above is a guide, not a script). '
      + 'Do not read the board text out word for word. If this is a good moment, ask the learner a short question about it and wait for their reply; otherwise carry on.',
    left > 0 ? `When you are ready, call next_line (${left} more line${left === 1 ? '' : 's'} in this beat).` : 'That was the last line of this beat. When you are ready, call advance_beat.',
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
