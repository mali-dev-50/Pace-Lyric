import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Karaoke performance recorder.
 *
 * Plays the decoded backing track through a Web Audio graph alongside the
 * live microphone, captures the MIX as mono PCM, and encodes it to MP3 in the
 * browser. The visible <audio> player is never rerouted — we play a decoded
 * AudioBuffer instead — so normal playback elsewhere stays untouched.
 *
 * Only the backing track is sent to the speakers (not the mic), so with
 * headphones there's no echo/feedback in the recording.
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

export interface Take {
  blob: Blob;
  url: string;
  duration: number;
}

interface StartOpts {
  startAt?: number;
  onTick?: (t: number) => void;
  onComplete?: () => void;
}

export class KaraokeRecorder {
  private mic?: MediaStream;
  private nodes: AudioNode[] = [];
  private trackSource?: AudioBufferSourceNode;
  private chunks: Float32Array[] = [];
  private length = 0;
  private sampleRate = 44100;
  private raf = 0;
  private t0 = 0;
  recording = false;

  async start(buffer: AudioBuffer, opts: StartOpts = {}): Promise<void> {
    const c = getCtx();
    await c.resume();
    this.sampleRate = c.sampleRate;
    this.chunks = [];
    this.length = 0;

    // microphone
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const micSource = c.createMediaStreamSource(this.mic);

    // backing track (decoded buffer)
    const trackSource = c.createBufferSource();
    trackSource.buffer = buffer;

    // mix mic + track for capture
    const mix = c.createGain();
    micSource.connect(mix);
    trackSource.connect(mix);
    // only the track is monitored on the speakers (avoids mic echo)
    trackSource.connect(c.destination);

    // capture the mix as mono PCM
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
      e.outputBuffer.getChannelData(0).fill(0); // stay silent on this branch
    };
    mix.connect(processor);
    const silent = c.createGain();
    silent.gain.value = 0;
    processor.connect(silent);
    silent.connect(c.destination);

    this.trackSource = trackSource;
    this.nodes = [micSource, mix, processor, silent];

    const startAt = Math.max(0, opts.startAt ?? 0);
    this.t0 = c.currentTime - startAt;
    this.recording = true;
    trackSource.start(0, startAt);

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

  async stop(): Promise<Take> {
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
    const blob = await encodeMp3(pcm, this.sampleRate);
    return { blob, url: URL.createObjectURL(blob), duration: this.length / this.sampleRate };
  }
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
    // yield periodically so the UI stays responsive on long takes
    if (i % (block * 250) === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const end = enc.flush();
  if (end.length > 0) out.push(new Uint8Array(end));
  // Uint8Array chunks are valid BlobParts at runtime; cast past the
  // stricter ArrayBufferLike vs ArrayBuffer generic in recent TS lib types.
  return new Blob(out as unknown as BlobPart[], { type: "audio/mpeg" });
}
