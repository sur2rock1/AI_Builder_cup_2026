/**
 * Audio input and playback manager for Gemini Live API
 * Input: 16 kHz mono 16-bit little-endian PCM sent in ~100ms chunks
 * Output: 24 kHz mono 16-bit little-endian PCM queued for gapless playback
 */

export class AudioManager {
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputProcessor: ScriptProcessorNode | AudioWorkletNode | null = null;
  private mediaStream: MediaStream | null = null;

  private outputAnalyser: AnalyserNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;

  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  private onAudioInputChunk?: (base64PCM: string) => void;
  private onInputLevel?: (level: number) => void;

  constructor(callbacks: {
    onAudioInputChunk: (base64PCM: string) => void;
    onInputLevel?: (level: number) => void;
  }) {
    this.onAudioInputChunk = callbacks.onAudioInputChunk;
    this.onInputLevel = callbacks.onInputLevel;
    this.queueAudioChunk = this.queueAudioChunk.bind(this);
    this.queueAudio = this.queueAudio.bind(this);
    this.flushPlayback = this.flushPlayback.bind(this);
    this.flushAudio = this.flushAudio.bind(this);
    this.start = this.start.bind(this);
    this.startAudio = this.startAudio.bind(this);
    this.stop = this.stop.bind(this);
    this.stopAudio = this.stopAudio.bind(this);
    this.getOutputRMS = this.getOutputRMS.bind(this);
    this.getOutputLevel = this.getOutputLevel.bind(this);
  }

  /**
   * Initializes both input (16kHz) and output (24kHz) audio contexts after user interaction
   */
  async start(): Promise<void> {
    // 1. Request mic permission
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 2. Input AudioContext at 16kHz
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.inputContext = new AudioCtx({ sampleRate: 16000 });
    if (this.inputContext.state === 'suspended') {
      await this.inputContext.resume();
    }

    // 3. Output AudioContext at 24kHz for Gemini Live output
    this.outputContext = new AudioCtx({ sampleRate: 24000 });
    if (this.outputContext.state === 'suspended') {
      await this.outputContext.resume();
    }

    // Setup output analyser for lipsync
    this.outputAnalyser = this.outputContext.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.smoothingTimeConstant = 0.2;
    this.outputAnalyser.connect(this.outputContext.destination);

    // Setup input analyser for mic meter and student nodding
    this.inputAnalyser = this.inputContext.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.3;

    this.inputSource = this.inputContext.createMediaStreamSource(this.mediaStream);
    this.inputSource.connect(this.inputAnalyser);

    // Process input chunks using ScriptProcessorNode for maximum reliability across browsers
    // Buffer size 1024 or 2048 @ 16kHz = ~64ms - 128ms chunks (matches ~100ms requirement)
    const bufferSize = 1024;
    const processor = this.inputContext.createScriptProcessor(bufferSize, 1, 1);
    this.inputProcessor = processor;

    let pcmChunkBuffer: Int16Array[] = [];
    let samplesAccumulated = 0;
    const targetChunkSamples = 1600; // 1600 samples @ 16kHz = exactly 100ms

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const inputData = e.inputBuffer.getChannelData(0);

      // Compute RMS for mic level
      let sum = 0;
      const int16Chunk = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        sum += sample * sample;
        int16Chunk[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      const rms = Math.sqrt(sum / inputData.length);
      if (this.onInputLevel) {
        this.onInputLevel(Math.min(1, rms * 5)); // amplify slightly for visual UI
      }

      pcmChunkBuffer.push(int16Chunk);
      samplesAccumulated += int16Chunk.length;

      // Send when ~100ms accumulated
      if (samplesAccumulated >= targetChunkSamples) {
        const combined = new Int16Array(samplesAccumulated);
        let offset = 0;
        for (const chunk of pcmChunkBuffer) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        pcmChunkBuffer = [];
        samplesAccumulated = 0;

        // Convert to base64
        const uint8 = new Uint8Array(combined.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);

        if (this.onAudioInputChunk) {
          this.onAudioInputChunk(base64);
        }
      }
    };

    this.inputSource.connect(processor);
    processor.connect(this.inputContext.destination);
  }

  /**
   * Enqueue 24kHz raw PCM chunk from Gemini Live into Web Audio for gapless playback
   */
  queueAudioChunk(base64PCM: string): void {
    if (!this.outputContext || !this.outputAnalyser) return;

    try {
      const binaryString = atob(base64PCM);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 16-bit PCM little endian
      const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const audioBuffer = this.outputContext.createBuffer(1, int16.length, 24000);
      const channel = audioBuffer.getChannelData(0);

      for (let i = 0; i < int16.length; i++) {
        channel[i] = int16[i] / 32768.0;
      }

      const source = this.outputContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAnalyser);

      const currentTime = this.outputContext.currentTime;
      const startTime = Math.max(currentTime + 0.015, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
      };
    } catch (err) {
      console.error('[AudioManager] Error queueing audio chunk:', err);
    }
  }

  /**
   * Alias for queueAudioChunk
   */
  queueAudio(base64PCM: string): void {
    this.queueAudioChunk(base64PCM);
  }

  /**
   * Barge-in: immediately flush all queued audio and reset scheduling
   */
  flushPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source might already be finished
      }
    }
    this.activeSources = [];
    if (this.outputContext) {
      this.nextPlayTime = this.outputContext.currentTime;
    }
  }

  /**
   * Alias for flushPlayback
   */
  flushAudio(): void {
    this.flushPlayback();
  }

  /**
   * Alias for start
   */
  async startAudio(): Promise<void> {
    return this.start();
  }

  /**
   * Alias for stop
   */
  stopAudio(): void {
    this.stop();
  }

  /**
   * Returns current output speech volume RMS (0 to 1) for tutor lip sync
   */
  getOutputRMS(): number {
    if (!this.outputAnalyser) return 0;
    const data = new Uint8Array(this.outputAnalyser.frequencyBinCount);
    this.outputAnalyser.getByteTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.min(1, rms * 4); // Scaled for visible mouth movement
  }

  /**
   * Alias for getOutputRMS
   */
  getOutputLevel(): number {
    return this.getOutputRMS();
  }

  /**
   * Stop everything and release mic
   */
  stop(): void {
    this.flushPlayback();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.inputProcessor) {
      this.inputProcessor.disconnect();
      this.inputProcessor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.inputContext && this.inputContext.state !== 'closed') {
      this.inputContext.close();
      this.inputContext = null;
    }
    if (this.outputContext && this.outputContext.state !== 'closed') {
      this.outputContext.close();
      this.outputContext = null;
    }
  }
}
