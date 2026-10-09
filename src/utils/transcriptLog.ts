// Writes what was actually SAID to the server log, interleaved with the board
// tool calls, so a session can be replayed from logs/server-*.log.
//   [transcript] tutor: ...      [transcript] child: ...      [transcript] tool: advance_beat
// Side-channel only: it reads messages that already arrived and never sends anything.

export class TranscriptLog {
  private tutor = '';
  private child = '';
  constructor(private readonly out: (line: string) => void = (l) => console.log(l)) {}

  private flush(): void {
    if (this.child.trim()) this.out(`[transcript] child: ${this.child.trim()}`);
    if (this.tutor.trim()) this.out(`[transcript] tutor: ${this.tutor.trim()}`);
    this.child = '';
    this.tutor = '';
  }

  /** Feed every Live server message, in order. */
  feed(message: any): void {
    try {
      const sc = message?.serverContent;
      const inText = sc?.inputTranscription?.text ?? sc?.inputAudioTranscription?.text;
      const outText = sc?.outputTranscription?.text ?? sc?.outputAudioTranscription?.text;
      if (inText) this.child += inText;
      if (outText) this.tutor += outText;
      for (const call of message?.toolCall?.functionCalls || []) {
        this.flush();
        const a = call.args || {};
        const brief = a.beat_id || a.slot_id ? ` ${a.beat_id || ''}${a.slot_id ? `${a.slot_id}=${String(a.text || '').slice(0, 60)}` : ''}` : '';
        this.out(`[transcript] tool: ${call.name}${brief}`);
      }
      if (sc?.interrupted) { this.out('[transcript] (child interrupted)'); this.flush(); }
      if (sc?.turnComplete) this.flush();
    } catch { /* logging must never affect a lesson */ }
  }
}
