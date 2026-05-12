let audioCtx = null;

function createContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

async function getAudioContext() {
  const ctx = createContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
}

// Eagerly create + unlock the context on first user gesture so beeps
// that fire programmatically (timer end) can play on mobile browsers.
if (typeof document !== 'undefined') {
  const unlock = () => {
    createContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  };
  document.addEventListener('click', unlock, { once: false });
  document.addEventListener('touchstart', unlock, { once: false });
  document.addEventListener('keydown', unlock, { once: false });
}

// Short tick played each of the last 3 seconds of a timer
export async function playCountdownBeep() {
  const ctx = await getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 1050;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.005);
  gain.gain.setValueAtTime(0.18, now + 0.06);
  gain.gain.linearRampToValueAtTime(0, now + 0.09);
  osc.start(now);
  osc.stop(now + 0.1);
}

// Long beep played when a timer ends and the next one starts
export async function playTransitionBeep() {
  const ctx = await getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
  gain.gain.setValueAtTime(0.3, now + 0.55);
  gain.gain.linearRampToValueAtTime(0, now + 0.65);
  osc.start(now);
  osc.stop(now + 0.66);
}

// Longer alarm played when all timers finish
export async function playAlarm() {
  const ctx = await getAudioContext();
  const now = ctx.currentTime;

  for (let cycle = 0; cycle < 3; cycle++) {
    const base = now + cycle * 0.9;

    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.connect(g1); g1.connect(ctx.destination);
    osc1.type = 'square';
    osc1.frequency.value = 1050;
    g1.gain.setValueAtTime(0, base);
    g1.gain.linearRampToValueAtTime(0.12, base + 0.01);
    g1.gain.setValueAtTime(0.12, base + 0.15);
    g1.gain.linearRampToValueAtTime(0, base + 0.17);
    osc1.start(base); osc1.stop(base + 0.18);

    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.type = 'square';
    osc2.frequency.value = 1050;
    const t2 = base + 0.25;
    g2.gain.setValueAtTime(0, t2);
    g2.gain.linearRampToValueAtTime(0.12, t2 + 0.01);
    g2.gain.setValueAtTime(0.12, t2 + 0.15);
    g2.gain.linearRampToValueAtTime(0, t2 + 0.17);
    osc2.start(t2); osc2.stop(t2 + 0.18);
  }
}
