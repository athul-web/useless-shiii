/**
 * Tiny optional sound layer for Phase 3, built entirely on the Web Audio
 * API - no external audio assets. Every call is best-effort: browsers that
 * block/lack Web Audio simply stay silent, never throw into game logic.
 */
let audioCtx = null;

function getContext() {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function tone({ freq, duration = 0.12, type = 'sine', gain = 0.05, delay = 0 }) {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;

    const startAt = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(gain, startAt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  } catch {
    // Sound is a nice-to-have; failures are silently ignored.
  }
}

/** Soft click when a strand is grabbed. */
export function playSelectSound() {
  tone({ freq: 720, duration: 0.06, type: 'sine', gain: 0.04 });
}

/** Soft pluck/pop when a strand is successfully freed. */
export function playFreedSound() {
  tone({ freq: 520, duration: 0.09, type: 'triangle', gain: 0.05 });
  tone({ freq: 780, duration: 0.12, type: 'triangle', gain: 0.04, delay: 0.05 });
}

/** Soft pluck/pop when a strand successfully lands in the bin. */
export function playDepositSound() {
  tone({ freq: 480, duration: 0.08, type: 'triangle', gain: 0.045 });
  tone({ freq: 700, duration: 0.1, type: 'triangle', gain: 0.04, delay: 0.06 });
  tone({ freq: 340, duration: 0.14, type: 'sine', gain: 0.035, delay: 0.11 });
}

/** Short pleasant chime on full completion. */
export function playSuccessSound() {
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    tone({ freq, duration: 0.22, type: 'sine', gain: 0.05, delay: i * 0.09 });
  });
}
