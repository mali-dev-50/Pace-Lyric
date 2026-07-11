import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Karaoke performance recorder — stem-based.
 *
 * During a take we record ONLY the microphone (a clean "voice stem") while the
 * decoded backing track plays for monitoring. Voice and music are kept
 * separate, so the Voice/Music levels can be re-balanced AFTER the take:
 * playback mixes the two stems live, and export renders the mix to MP3 at the
 * chosen levels. Nothing is baked in until you download.
 *
 * The visible <audio> player is never rerouted (we play decoded buffers), and
 * the mic is not monitored on the speakers, so with headphones there's no echo.
 */

let ctx: AudioContext | null = null;
const bufferCache = new Map<string, AudioBuffer>();

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Decode (and cache) the backing track so recording can start instantly. */
export async function prepareTrack(url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const c = getCtx();
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  const buf = await c.decodeAudioData(arr);
  bufferCache.set(url, buf);
  return buf;
}

/** The recorded microphone stem (before mixing). */
export interface VoiceStem {
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
}

interface StartOpts {
  onTick?: (t: number) => void;
  onComplete?: () => void;
  /** Monitor level for the backing track during the take (0..1.5). */
  trackGain?: number;
}

export class KaraokeRecorder {
  private mic?: MediaStream;
  private nodes: AudioNode[] = [];
  private trackSource?: AudioBufferSourceNode;
  private trackGainNode?: GainNode;
  private chunks: Float32Array[] = [];
  private length = 0;
  private sampleRate = 44100;
  private raf = 0;
  private t0 = 0;
  recording = false;

  /** Live-adjust the monitor level of the backing track during recording. */
  setTrackGain(v: number): void {
    if (this.trackGainNode) this.trackGainNode.gain.value = v;
  }

  async start(buffer: AudioBuffer, opts: StartOpts = {}): Promise<void> {
    const c = getCtx();
    await c.resume();
    this.sampleRate = c.sampleRate;
    this.chunks = [];
    this.length = 0;

    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const micSource = c.createMediaStreamSource(this.mic);

    // backing track — monitored only (never captured)
    const trackSource = c.createBufferSource();
    trackSource.buffer = buffer;
    const trackGainNode = c.createGain();
    trackGainNode.gain.value = opts.trackGain ?? 1;
    trackSource.connect(trackGainNode).connect(c.destination);

    // capture the microphone alone as mono PCM
    const processor = c.createScriptProcessor(4096, 2, 1);
    processor.onaudioprocess = (e) => {
      if (!this.recording) return;
      const inb = e.inputBuffer;
      const ch0 = inb.getChannelData(0);
      const ch1 = inb.numberOfChannels > 1 ? inb.getChannelData(1) : ch0;
      const mono = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i += 1) {
        mono[i] = Math.max(-1, Math.min(1, (ch0[i] + ch1[i]) * 0.5));
      }
      this.chunks.push(mono);
      this.length += mono.length;
      e.outputBuffer.getChannelData(0).fill(0);
    };
    micSource.connect(processor);
    const silent = c.createGain();
    silent.gain.value = 0;
    processor.connect(silent);
    silent.connect(c.destination);

    this.trackSource = trackSource;
    this.trackGainNode = trackGainNode;
    this.nodes = [micSource, trackGainNode, processor, silent];

    this.t0 = c.currentTime;
    this.recording = true;
    trackSource.start(0, 0);

    const tick = () => {
      if (!this.recording) return;
      const t = c.currentTime - this.t0;
      opts.onTick?.(t);
      if (t >= buffer.duration) {
        opts.onComplete?.();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): VoiceStem {
    this.recording = false;
    cancelAnimationFrame(this.raf);
    try {
      this.trackSource?.stop();
    } catch {
      /* already stopped */
    }
    [this.trackSource, ...this.nodes].forEach((n) => {
      try {
        n?.disconnect();
      } catch {
        /* ignore */
      }
    });
    this.mic?.getTracks().forEach((t) => t.stop());

    if (this.length === 0) {
      throw new Error(
        "No audio was captured — check that your microphone is connected and allowed."
      );
    }

    const pcm = new Float32Array(this.length);
    let off = 0;
    for (const b of this.chunks) {
      pcm.set(b, off);
      off += b.length;
    }
    this.chunks = [];
    return { pcm, sampleRate: this.sampleRate, duration: this.length / this.sampleRate };
  }
}

/**
 * Live stem playback: plays the voice stem + backing track through independent
 * gain nodes so the Voice/Music faders re-balance in real time. The take runs
 * for the length of the recorded voice.
 */
export class StemPlayer {
  private c: AudioContext;
  private voiceBuf: AudioBuffer;
  private trackBuf: AudioBuffer;
  private voiceGain: GainNode;
  private trackGain: GainNode;
  private vSrc?: AudioBufferSourceNode;
  private tSrc?: AudioBufferSourceNode;
  private startedAt = 0;
  private offset = 0;
  private raf = 0;
  playing = false;
  readonly duration: number;
  onTick?: (t: number) => void;
  onEnded?: () => void;

  constructor(voice: VoiceStem, track: AudioBuffer, voiceGain: number, trackGain: number) {
    this.c = getCtx();
    this.voiceBuf = this.c.createBuffer(1, voice.pcm.length, voice.sampleRate);
    this.voiceBuf.getChannelData(0).set(voice.pcm);
    this.trackBuf = track;
    this.voiceGain = this.c.createGain();
    this.voiceGain.gain.value = voiceGain;
    this.trackGain = this.c.createGain();
    this.trackGain.gain.value = trackGain;
    this.voiceGain.connect(this.c.destination);
    this.trackGain.connect(this.c.destination);
    this.duration = voice.duration;
  }

  setVoiceGain(v: number): void {
    this.voiceGain.gain.value = v;
  }
  setTrackGain(v: number): void {
    this.trackGain.gain.value = v;
  }

  async play(): Promise<void> {
    if (this.playing) return;
    await this.c.resume();
    if (this.offset >= this.duration - 0.01) this.offset = 0;

    this.vSrc = this.c.createBufferSource();
    this.vSrc.buffer = this.voiceBuf;
    this.vSrc.connect(this.voiceGain);
    this.tSrc = this.c.createBufferSource();
    this.tSrc.buffer = this.trackBuf;
    this.tSrc.connect(this.trackGain);

    this.startedAt = this.c.currentTime;
    this.vSrc.start(0, Math.min(this.offset, this.voiceBuf.duration));
    if (this.offset < this.trackBuf.duration) this.tSrc.start(0, this.offset);
    this.playing = true;

    const tick = () => {
      if (!this.playing) return;
      const t = this.offset + (this.c.currentTime - this.startedAt);
      if (t >= this.duration) {
        this.stopSources();
        this.playing = false;
        this.offset = 0;
        this.onTick?.(this.duration);
        this.onEnded?.();
        return;
      }
      this.onTick?.(t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause(): void {
    if (!this.playing) return;
    this.offset += this.c.currentTime - this.startedAt;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stopSources();
  }

  seek(t: number): void {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.offset = Math.max(0, Math.min(t, this.duration));
    this.onTick?.(this.offset);
    if (wasPlaying) void this.play();
  }

  private stopSources(): void {
    try {
      this.vSrc?.stop();
    } catch {
      /* ignore */
    }
    try {
      this.tSrc?.stop();
    } catch {
      /* ignore */
    }
    this.vSrc?.disconnect();
    this.tSrc?.disconnect();
  }

  dispose(): void {
    this.pause();
    this.voiceGain.disconnect();
    this.trackGain.disconnect();
  }
}

/** Render voice + track at the given levels to a mixed-down MP3 blob. */
export async function renderMixToMp3(
  voice: VoiceStem,
  track: AudioBuffer,
  micGain: number,
  trackGain: number
): Promise<Blob> {
  const n = voice.pcm.length;
  const tL = track.getChannelData(0);
  const tR = track.numberOfChannels > 1 ? track.getChannelData(1) : tL;
  const mixed = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = voice.pcm[i] * micGain;
    const m = i < tL.length ? ((tL[i] + tR[i]) * 0.5) * trackGain : 0;
    mixed[i] = Math.max(-1, Math.min(1, v + m));
  }
  return encodeMp3(mixed, voice.sampleRate);
}

/** Render the isolated voice stem (no backing track) at the given level to MP3. */
export async function renderVoiceToMp3(voice: VoiceStem, micGain: number): Promise<Blob> {
  const out = new Float32Array(voice.pcm.length);
  for (let i = 0; i < voice.pcm.length; i += 1) {
    out[i] = Math.max(-1, Math.min(1, voice.pcm[i] * micGain));
  }
  return encodeMp3(out, voice.sampleRate);
}

/**
 * Serialize a voice stem to a mono 16-bit PCM WAV blob for durable storage in
 * IndexedDB. WAV (not MP3) keeps the stem lossless so it can be re-mixed and
 * re-exported any number of times without generational quality loss.
 */
export function voiceStemToWav(voice: VoiceStem): Blob {
  const { pcm, sampleRate } = voice;
  const bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < pcm.length; i += 1, off += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Decode a stored WAV blob back into a voice stem for playback/export. */
export async function decodeVoiceStem(blob: Blob): Promise<VoiceStem> {
  const c = getCtx();
  const arr = await blob.arrayBuffer();
  const buf = await c.decodeAudioData(arr);
  const pcm = new Float32Array(buf.getChannelData(0));
  return { pcm, sampleRate: buf.sampleRate, duration: buf.duration };
}

async function encodeMp3(pcm: Float32Array, sampleRate: number): Promise<Blob> {
  const enc = new Mp3Encoder(1, sampleRate, 128);
  const int16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    const s = pcm[i];
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const out: Uint8Array[] = [];
  const block = 1152;
  for (let i = 0; i < int16.length; i += block) {
    const buf = enc.encodeBuffer(int16.subarray(i, i + block));
    if (buf.length > 0) out.push(new Uint8Array(buf));
    if (i % (block * 250) === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const end = enc.flush();
  if (end.length > 0) out.push(new Uint8Array(end));
  return new Blob(out as unknown as BlobPart[], { type: "audio/mpeg" });
}
