// Synthesised sound only — no audio files. A WebAudio graph built on the first
// user gesture: a two-oscillator engine whose pitch follows throttle and speed,
// filtered noise for wind, and short chimes, thuds and a crash burst for events.
// Nothing here loads or fetches anything.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);

      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 26;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      // Two seconds of white noise, looped, for the wind.
      const length = context.sampleRate * 2;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = context.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, at, dur, type, vol) {
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(vol, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  return {
    /** Call from any user gesture; also resumes a suspended context. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    /** Continuous engine and wind, called every frame with the plane's state. */
    update(throttle, speed, airborne, running) {
      if (!started || !context) return;
      const now = context.currentTime;
      const target = running ? 0.05 + throttle * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, now, 0.1);
      const base = 46 + throttle * 52 + speed * 0.55;
      engineOsc.frequency.setTargetAtTime(base, now, 0.08);
      engineOsc2.frequency.setTargetAtTime(base * 0.5, now, 0.08);
      windGain.gain.setTargetAtTime(airborne ? Math.min(0.16, speed * 0.0022) : 0, now, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speed * 9, now, 0.15);
    },
    /** A bright two-note chime when a ring is flown. */
    ring() {
      if (!context) return;
      const at = context.currentTime;
      tone(880, at, 0.35, 'sine', 0.22);
      tone(1318.5, at + 0.09, 0.45, 'sine', 0.2);
    },
    /** A soft thud for a good touchdown. */
    thud() {
      if (!context) return;
      const at = context.currentTime;
      tone(110, at, 0.25, 'sine', 0.35);
      tone(55, at, 0.3, 'triangle', 0.3);
    },
    /** A noise burst and low boom for a crash. */
    crash() {
      if (!context) return;
      const at = context.currentTime;
      const length = context.sampleRate * 0.5;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = 0.5;
      source.connect(gain);
      gain.connect(master);
      source.start(at);
      tone(70, at, 0.6, 'sine', 0.4);
    },
    /** A short click for starting and UI moves. */
    click() {
      if (!context) return;
      tone(660, context.currentTime, 0.08, 'square', 0.08);
    },
    /** A low warning buzz when fuel runs low. */
    warning() {
      if (!context) return;
      const at = context.currentTime;
      tone(220, at, 0.18, 'square', 0.1);
      tone(220, at + 0.25, 0.18, 'square', 0.1);
    },
    toggleMute() {
      muted = !muted;
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.05);
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
