export type ChessSoundType =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promote'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'stalemate'
  | 'gameStart'
  | 'gameEnd'
  | 'illegal'
  | 'undo'
  | 'puzzleCorrect'
  | 'notify';

/**
 * Royalty-free (CC0 1.0 Public Domain) chess audio assets served from /public/sounds/.
 * Studio-normalized for low-latency Web Audio API playback with acoustic transient layering.
 */
export const CHESS_SOUND_URLS: Record<ChessSoundType, string> = {
  move: '/sounds/move.mp3',
  capture: '/sounds/capture.mp3',
  castle: '/sounds/castle.mp3',
  check: '/sounds/check.mp3',
  promote: '/sounds/promote.mp3',
  victory: '/sounds/victory.mp3',
  defeat: '/sounds/defeat.mp3',
  draw: '/sounds/draw.mp3',
  stalemate: '/sounds/draw.mp3',
  gameStart: '/sounds/notify.mp3',
  gameEnd: '/sounds/victory.mp3',
  illegal: '/sounds/illegal.mp3',
  undo: '/sounds/move.mp3',
  puzzleCorrect: '/sounds/puzzle-correct.mp3',
  notify: '/sounds/notify.mp3',
};

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
const decodedBufferCache = new Map<string, AudioBuffer>();
const inflightDecodes = new Map<string, Promise<AudioBuffer | null>>();

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.8;
  return Math.max(0, Math.min(1, value));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getWoodNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const decay = Math.exp(-i / (ctx.sampleRate * 0.008));
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  noiseBuffer = buffer;
  return buffer;
}

export function unlockChessAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

async function fetchAndDecodeBuffer(url: string): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined') return null;
  const cached = decodedBufferCache.get(url);
  if (cached) return cached;

  const existingPromise = inflightDecodes.get(url);
  if (existingPromise) return existingPromise;

  const promise = (async (): Promise<AudioBuffer | null> => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return null;
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      decodedBufferCache.set(url, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    } finally {
      inflightDecodes.delete(url);
    }
  })();

  inflightDecodes.set(url, promise);
  return promise;
}

export async function preloadChessSounds(): Promise<void> {
  if (typeof window === 'undefined') return;
  const uniqueUrls = Array.from(new Set(Object.values(CHESS_SOUND_URLS)));
  await Promise.allSettled(uniqueUrls.map((url) => fetchAndDecodeBuffer(url)));
}

/** Adds subtle tactile wood-on-board resonance so moves & captures feel crisp like tournament wood pieces. */
function playTactileWoodLayer(ctx: AudioContext, type: ChessSoundType, volume: number): void {
  const now = ctx.currentTime;
  const vol = clampVolume(volume);

  if (type === 'move' || type === 'capture' || type === 'castle' || type === 'undo') {
    const triggerKnock = (offset: number, centerFreq: number, q: number, level: number) => {
      const src = ctx.createBufferSource();
      src.buffer = getWoodNoiseBuffer(ctx);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(centerFreq, now + offset);
      filter.Q.setValueAtTime(q, now + offset);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0001, level * vol), now + offset);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.045);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now + offset);
    };

    if (type === 'move') {
      triggerKnock(0, 740 + (Math.random() - 0.5) * 60, 2.2, 0.22);
    } else if (type === 'capture') {
      triggerKnock(0, 980 + (Math.random() - 0.5) * 80, 1.8, 0.34);
      triggerKnock(0.018, 420, 1.5, 0.2);
    } else if (type === 'castle') {
      triggerKnock(0, 720, 2.2, 0.22);
      triggerKnock(0.075, 860, 2.4, 0.24);
    } else if (type === 'undo') {
      triggerKnock(0, 560, 2.5, 0.16);
    }
  }
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer, type: ChessSoundType, volume: number): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Natural micro pitch variation on routine moves/captures so repeated pieces never sound mechanical
  if (type === 'move' || type === 'capture') {
    source.playbackRate.setValueAtTime(0.97 + Math.random() * 0.06, ctx.currentTime);
  } else if (type === 'undo') {
    source.playbackRate.setValueAtTime(0.88, ctx.currentTime);
  } else if (type === 'gameStart') {
    source.playbackRate.setValueAtTime(1.06, ctx.currentTime);
  }

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(clampVolume(volume), ctx.currentTime);

  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(0);

  playTactileWoodLayer(ctx, type, volume * 0.55);
}

function playSynthesizedFallback(type: ChessSoundType, volume: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const volScale = clampVolume(volume);

  const playTone = (
    freq: number,
    endFreq: number,
    duration: number,
    gainLevel: number,
    oscType: OscillatorType = 'triangle',
    startOffset = 0
  ) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = oscType;
    osc.frequency.setValueAtTime(freq, now + startOffset);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + startOffset + duration);

    const targetGain = Math.max(0.0001, gainLevel * volScale);
    gain.gain.setValueAtTime(0.0001, now + startOffset);
    gain.gain.linearRampToValueAtTime(targetGain, now + startOffset + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.02);
  };

  playTactileWoodLayer(ctx, type, volScale);

  switch (type) {
    case 'move':
      playTone(215, 110, 0.065, 0.16, 'triangle');
      break;
    case 'undo':
      playTone(180, 125, 0.06, 0.13, 'triangle');
      break;
    case 'capture':
      playTone(340, 92, 0.09, 0.22, 'sawtooth');
      playTone(165, 72, 0.075, 0.14, 'triangle', 0.015);
      break;
    case 'castle':
      playTone(220, 118, 0.065, 0.15, 'triangle', 0);
      playTone(270, 145, 0.065, 0.15, 'triangle', 0.075);
      break;
    case 'check':
      playTone(620, 460, 0.12, 0.18, 'sine', 0);
      playTone(780, 580, 0.15, 0.16, 'triangle', 0.06);
      break;
    case 'promote':
      playTone(440, 440, 0.085, 0.14, 'sine', 0);
      playTone(554.37, 554.37, 0.085, 0.14, 'sine', 0.07);
      playTone(659.25, 659.25, 0.16, 0.16, 'sine', 0.14);
      break;
    case 'gameStart':
      playTone(392, 392, 0.08, 0.12, 'sine', 0);
      playTone(523.25, 523.25, 0.12, 0.14, 'sine', 0.08);
      break;
    case 'victory':
    case 'gameEnd':
      playTone(392, 392, 0.11, 0.16, 'triangle', 0);
      playTone(523.25, 523.25, 0.13, 0.16, 'triangle', 0.11);
      playTone(659.25, 659.25, 0.26, 0.18, 'triangle', 0.22);
      break;
    case 'defeat':
      playTone(330, 260, 0.15, 0.16, 'triangle', 0);
      playTone(220, 150, 0.26, 0.18, 'triangle', 0.13);
      break;
    case 'draw':
    case 'stalemate':
      playTone(440, 440, 0.11, 0.14, 'sine', 0);
      playTone(493.88, 440, 0.18, 0.14, 'sine', 0.12);
      break;
    case 'puzzleCorrect':
      playTone(523.25, 523.25, 0.09, 0.16, 'sine', 0);
      playTone(659.25, 659.25, 0.09, 0.16, 'sine', 0.085);
      playTone(783.99, 783.99, 0.2, 0.18, 'sine', 0.17);
      break;
    case 'illegal':
      playTone(150, 108, 0.11, 0.14, 'sawtooth', 0);
      break;
    case 'notify':
      playTone(660, 880, 0.085, 0.12, 'sine', 0);
      break;
  }
}

export function resolveSanSoundType(san: string): ChessSoundType {
  if (san.includes('+') || san.includes('#')) return 'check';
  if (san.includes('=')) return 'promote';
  if (san === 'O-O' || san === 'O-O-O') return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}

export function resolveGameResultSoundType(params: {
  result: string;
  winnerId?: string;
  currentUid?: string;
}): ChessSoundType {
  const { result, winnerId, currentUid } = params;
  if (result === '1/2-1/2') return 'draw';
  if (winnerId && currentUid) {
    return winnerId === currentUid ? 'victory' : 'defeat';
  }
  return 'gameEnd';
}

function getDefaultVolume(): number {
  if (typeof window === 'undefined') return 0.8;
  try {
    const raw = window.localStorage.getItem('chess_arena_audio_volume');
    if (raw !== null) {
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed)) return clampVolume(parsed);
    }
  } catch {
    // ignore
  }
  return 0.8;
}

export function playChessSound(type: ChessSoundType, enabled: boolean, volume?: number): void {
  if (!enabled || typeof window === 'undefined') return;
  const vol = clampVolume(volume ?? getDefaultVolume());
  if (vol <= 0) return;

  const url = CHESS_SOUND_URLS[type];
  const ctx = getAudioContext();
  const cached = decodedBufferCache.get(url);

  if (ctx && cached) {
    try {
      playBuffer(ctx, cached, type, vol);
      return;
    } catch {
      // Fall through to HTMLAudioElement fallback
    }
  }

  // Trigger background decode for instant zero-latency playback next time
  void fetchAndDecodeBuffer(url);

  try {
    const audio = new Audio(url);
    audio.volume = vol;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        playSynthesizedFallback(type, vol);
      });
    }
  } catch {
    playSynthesizedFallback(type, vol);
  }
}
