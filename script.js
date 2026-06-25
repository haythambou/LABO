/* ==========================================================================
   LABO DJ MIXER - AUDIO ENGINE & UI CONTROLLER
   ========================================================================== */

// Global Audio Context and Controller State
let audioCtx = null;
let masterGain = null;
let masterAnalyser = null;
const synthTracks = {}; // Holds compiled preset audio buffers: { synthwave, house, techno }
const loadedLocalBuffers = []; // User-uploaded custom tracks

// Deck Instances
let deckA = null;
let deckB = null;

// UI State
let activeKnob = null;
let knobStartY = 0;
let knobStartValue = 0;
let keyboardShortcutsEnabled = true;

// Active Performance Pad Modes: 'hotcue', 'loop', 'sampler', 'padfx'
const activePadModes = { a: 'hotcue', b: 'hotcue' };

// Sound Effects / Sampler Synthesis Node
function playSample(sampleName, deckVol = 1.0) {
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);
  gain.gain.value = deckVol * 0.5;

  const now = audioCtx.currentTime;

  switch (sampleName) {
    case 'kick': {
      // 808 style synthesized kick
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
      gain.gain.setValueAtTime(deckVol * 0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.35);
      break;
    }
    case 'snare': {
      // Noise snare with sine body
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
      gain.gain.setValueAtTime(deckVol * 0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.15);

      // Noise component
      const bufferSize = audioCtx.sampleRate * 0.15;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noiseSource = audioCtx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1000;
      
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(deckVol * 0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      
      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      noiseSource.start(now);
      noiseSource.stop(now + 0.16);
      break;
    }
    case 'hat': {
      // High-passed noise
      const bufferSize = audioCtx.sampleRate * 0.05;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noiseSource = audioCtx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 8000;

      const hatGain = audioCtx.createGain();
      hatGain.gain.setValueAtTime(deckVol * 0.3, now);
      hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      noiseSource.connect(filter);
      filter.connect(hatGain);
      hatGain.connect(audioCtx.destination);
      noiseSource.start(now);
      noiseSource.stop(now + 0.06);
      break;
    }
    case 'clap': {
      // Dual noise bursts
      const playBurst = (delay) => {
        const bufferSize = audioCtx.sampleRate * 0.08;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        
        const noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;

        const clapGain = audioCtx.createGain();
        clapGain.gain.setValueAtTime(deckVol * 0.4, now + delay);
        clapGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.08);

        noiseSource.connect(filter);
        filter.connect(clapGain);
        clapGain.connect(audioCtx.destination);
        noiseSource.start(now + delay);
        noiseSource.stop(now + delay + 0.09);
      };
      playBurst(0);
      playBurst(0.02);
      playBurst(0.04);
      break;
    }
    case 'airhorn': {
      // Classic DJ Airhorn synthesis! Multi-oscillator detuned square waves
      const freqs = [698.46, 739.99, 783.99, 830.61]; // F5, F#5, G5, G#5 clusters
      const oscs = [];
      const hornGain = audioCtx.createGain();
      hornGain.connect(audioCtx.destination);
      hornGain.gain.setValueAtTime(0, now);
      hornGain.gain.linearRampToValueAtTime(deckVol * 0.6, now + 0.05);
      // Volume gating/pulsing effect
      hornGain.gain.setValueAtTime(deckVol * 0.6, now + 0.2);
      hornGain.gain.setValueAtTime(0, now + 0.23);
      hornGain.gain.setValueAtTime(deckVol * 0.5, now + 0.26);
      hornGain.gain.setValueAtTime(0, now + 0.29);
      hornGain.gain.setValueAtTime(deckVol * 0.5, now + 0.32);
      hornGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      const delay = audioCtx.createDelay();
      delay.delayTime.value = 0.15;
      const feedback = audioCtx.createGain();
      feedback.gain.value = 0.4;
      
      hornGain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(audioCtx.destination);

      freqs.forEach((f) => {
        const o = audioCtx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, now);
        // Add manual vibrato
        o.frequency.linearRampToValueAtTime(f + 5, now + 0.2);
        o.frequency.linearRampToValueAtTime(f - 5, now + 0.4);
        o.frequency.linearRampToValueAtTime(f, now + 0.8);
        o.connect(hornGain);
        o.start(now);
        o.stop(now + 1.3);
        oscs.push(o);
      });
      break;
    }
    case 'laser': {
      // Sweeping frequency pitch drops
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(2000, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
      gain.gain.setValueAtTime(deckVol * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.6);
      break;
    }
    case 'rise': {
      // Long sweeping noise swoosh
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 2.0);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(deckVol * 0.5, now + 1.8);
      gain.gain.linearRampToValueAtTime(0, now + 2.0);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 2.1);

      // Noise sweeping bandpass
      const bufferSize = audioCtx.sampleRate * 2.0;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      
      const noiseSource = audioCtx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const sweepFilter = audioCtx.createBiquadFilter();
      sweepFilter.type = 'bandpass';
      sweepFilter.Q.value = 5.0;
      sweepFilter.frequency.setValueAtTime(300, now);
      sweepFilter.frequency.exponentialRampToValueAtTime(4000, now + 2.0);

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.exponentialRampToValueAtTime(deckVol * 0.4, now + 1.8);
      noiseGain.gain.linearRampToValueAtTime(0, now + 2.0);

      noiseSource.connect(sweepFilter);
      sweepFilter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      noiseSource.start(now);
      noiseSource.stop(now + 2.1);
      break;
    }
    case 'drop': {
      // Low sub boom explosion
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 1.2);
      gain.gain.setValueAtTime(deckVol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      
      // Noise splash high end
      const bufferSize = audioCtx.sampleRate * 0.4;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      
      const noiseSource = audioCtx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      
      const nGain = audioCtx.createGain();
      nGain.gain.setValueAtTime(deckVol * 0.4, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      
      noiseSource.connect(filter);
      filter.connect(nGain);
      nGain.connect(audioCtx.destination);
      noiseSource.start(now);
      noiseSource.stop(now + 0.5);

      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 1.4);
      break;
    }
  }
}

// Scratch sound synthesis chirp generator (to blend in real-time scratch feel)
function playScratchChirp(velocity) {
  if (!audioCtx || Math.abs(velocity) < 0.2) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc.type = 'triangle';
  
  // Frequency matches velocity
  const startFreq = 300 + Math.min(Math.abs(velocity) * 120, 1500);
  const endFreq = startFreq * (velocity > 0 ? 1.5 : 0.6);
  
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.06);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(startFreq * 1.2, now);
  filter.frequency.exponentialRampToValueAtTime(endFreq * 1.2, now + 0.06);

  gain.gain.setValueAtTime(Math.min(Math.abs(velocity) * 0.15, 0.25), now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.08);
}


/* ==========================================================================
   OFFLINE SYNTH TRACKS COMPILER (DYNAMIC PRESET GENERATOR)
   ========================================================================== */
async function compileSynthTracks() {
  const sampleRate = 44100;
  
  // Update splash screen text loader
  const updateLoaderText = (txt) => {
    const el = document.getElementById('audio-decoder-loader');
    if (el) el.querySelector('span').innerText = txt;
    const welcomeLoader = document.querySelector('.welcome-loader span');
    if (welcomeLoader) welcomeLoader.innerText = txt;
  };

  // Preset 1: Retro Synthwave (120 BPM)
  updateLoaderText("Synthesizing Retro Synthwave Loop...");
  synthTracks.synthwave = await compileSynthwave(sampleRate);
  
  // Preset 2: Deep Club House (125 BPM)
  updateLoaderText("Synthesizing Deep Club House Loop...");
  synthTracks.house = await compileHouse(sampleRate);
  
  // Preset 3: Warehouse Acid Techno (130 BPM)
  updateLoaderText("Synthesizing Warehouse Acid Techno...");
  synthTracks.techno = await compileTechno(sampleRate);

  updateLoaderText("System fully primed!");
  
  // Hide loading bars and enable Start Button
  const btn = document.getElementById('start-dj-btn');
  if (btn) {
    btn.classList.add('active');
    btn.innerText = "START PERFORMANCE";
  }
}

// Help create white noise for drum components in offline synthesis
function createOfflineNoiseBuffer(offlineCtx, duration) {
  const bufferSize = offlineCtx.sampleRate * duration;
  const buffer = offlineCtx.createBuffer(1, bufferSize, offlineCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// 1. Synthwave Render (BPM: 120, Length: 8 seconds, 16 beats)
async function compileSynthwave(sampleRate) {
  const bpm = 120;
  const beat = 60 / bpm; // 0.5s
  const duration = beat * 16; // 8 seconds
  const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // FX: Master filter
  const masterLowpass = ctx.createBiquadFilter();
  masterLowpass.type = 'lowpass';
  masterLowpass.frequency.value = 16000;
  masterLowpass.connect(ctx.destination);

  // Drum Synthesizer: Kick, Snare, Hihat
  for (let b = 0; b < 16; b++) {
    const time = b * beat;
    
    // Kick on every beat
    const kickOsc = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kickOsc.connect(kickGain);
    kickGain.connect(masterLowpass);
    
    kickOsc.frequency.setValueAtTime(120, time);
    kickOsc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    kickGain.gain.setValueAtTime(0.7, time);
    kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    
    kickOsc.start(time);
    kickOsc.stop(time + 0.16);

    // Snare on 2, 6, 10, 14
    if (b % 4 === 2) {
      const snareOsc = ctx.createOscillator();
      const snareGain = ctx.createGain();
      snareOsc.type = 'triangle';
      snareOsc.frequency.setValueAtTime(170, time);
      snareOsc.frequency.linearRampToValueAtTime(120, time + 0.08);
      
      snareGain.gain.setValueAtTime(0.4, time);
      snareGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      
      snareOsc.connect(snareGain);
      snareGain.connect(masterLowpass);
      snareOsc.start(time);
      snareOsc.stop(time + 0.11);

      // Snare noise
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = createOfflineNoiseBuffer(ctx, 0.15);
      const snareNoiseFilter = ctx.createBiquadFilter();
      snareNoiseFilter.type = 'bandpass';
      snareNoiseFilter.frequency.value = 1200;
      
      const snareNoiseGain = ctx.createGain();
      snareNoiseGain.gain.setValueAtTime(0.3, time);
      snareNoiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      
      noiseSource.connect(snareNoiseFilter);
      snareNoiseFilter.connect(snareNoiseGain);
      snareNoiseGain.connect(masterLowpass);
      noiseSource.start(time);
      noiseSource.stop(time + 0.15);
    }

    // Hi-Hats on off-beats
    const hatTime = time + beat / 2;
    const hatSource = ctx.createBufferSource();
    hatSource.buffer = createOfflineNoiseBuffer(ctx, 0.06);
    const hatFilter = ctx.createBiquadFilter();
    hatFilter.type = 'highpass';
    hatFilter.frequency.value = 7500;
    
    const hatGain = ctx.createGain();
    hatGain.gain.setValueAtTime(0.18, hatTime);
    hatGain.gain.exponentialRampToValueAtTime(0.001, hatTime + 0.05);

    hatSource.connect(hatFilter);
    hatFilter.connect(hatGain);
    hatGain.connect(masterLowpass);
    hatSource.start(hatTime);
    hatSource.stop(hatTime + 0.06);
  }

  // 80s Octave Synth Bassline (Key: E Minor - E, G, A, C)
  // Bass notes sequence on 8th notes (32 notes total)
  const bassNotes = [
    // Meas 1 (E): E1, E2, E1, E2, E1, E2, E1, E2
    28, 40, 28, 40, 28, 40, 28, 40,
    // Meas 2 (G): G1, G2, G1, G2, G1, G2, G1, G2
    31, 43, 31, 43, 31, 43, 31, 43,
    // Meas 3 (A): A1, A2, A1, A2, A1, A2, A1, A2
    33, 45, 33, 45, 33, 45, 33, 45,
    // Meas 4 (C): C1, C2, C1, C2, C1, C2, C1, C2
    24, 36, 24, 36, 24, 36, 24, 36
  ];
  
  function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  const eighthNote = beat / 2;
  for (let i = 0; i < 32; i++) {
    const time = i * eighthNote;
    const freq = midiToFreq(bassNotes[i]);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    // Classic dynamic filter sweep (plucky)
    bassFilter.frequency.setValueAtTime(1000, time);
    bassFilter.frequency.exponentialRampToValueAtTime(180, time + 0.18);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(bassFilter);
    bassFilter.connect(gain);
    gain.connect(masterLowpass);

    osc.start(time);
    osc.stop(time + 0.24);
  }

  // Retro polyphonic synth pad chords (E minor, G major, A minor, C major)
  const padChords = [
    [40, 43, 47, 52], // Em
    [43, 47, 50, 55], // G
    [45, 48, 52, 57], // Am
    [36, 40, 43, 48]  // C
  ];

  for (let m = 0; m < 4; m++) {
    const time = m * 4 * beat;
    const chord = padChords[m];
    
    // Play notes in chord
    chord.forEach((note) => {
      const osc = ctx.createOscillator();
      // Triangle wave for smooth lush pads
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(note + 12), time); // Octave up

      const padGain = ctx.createGain();
      padGain.gain.setValueAtTime(0, time);
      padGain.gain.linearRampToValueAtTime(0.06, time + 0.4); // Slow attack
      padGain.gain.setValueAtTime(0.06, time + 3.4 * beat);
      padGain.gain.linearRampToValueAtTime(0.001, time + 4 * beat); // Release

      const chorusOsc = ctx.createOscillator();
      chorusOsc.type = 'sawtooth';
      chorusOsc.frequency.setValueAtTime(midiToFreq(note + 12) + 1.5, time); // Detuned partner

      osc.connect(padGain);
      chorusOsc.connect(padGain);
      padGain.connect(masterLowpass);
      
      osc.start(time);
      chorusOsc.start(time);
      osc.stop(time + 4 * beat);
      chorusOsc.stop(time + 4 * beat);
    });
  }

  return await ctx.startRendering();
}

// 2. Deep Club House Render (BPM: 125, Length: 7.68s, 16 beats)
async function compileHouse(sampleRate) {
  const bpm = 125;
  const beat = 60 / bpm; // 0.48s
  const duration = beat * 16;
  const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // FX: Subtle compressor filter
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 14000;
  filter.connect(ctx.destination);

  // Drums
  for (let b = 0; b < 16; b++) {
    const time = b * beat;

    // Heavy round thumping kick
    const kick = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kick.frequency.setValueAtTime(140, time);
    kick.frequency.exponentialRampToValueAtTime(40, time + 0.14);
    kickGain.gain.setValueAtTime(0.85, time);
    kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    kick.connect(kickGain);
    kickGain.connect(filter);
    kick.start(time);
    kick.stop(time + 0.19);

    // Clap on 2, 6, 10, 14
    if (b % 4 === 2) {
      const playOffsetClap = (offset) => {
        const hSource = ctx.createBufferSource();
        hSource.buffer = createOfflineNoiseBuffer(ctx, 0.08);
        const hFilter = ctx.createBiquadFilter();
        hFilter.type = 'bandpass';
        hFilter.frequency.value = 1000;
        const hGain = ctx.createGain();
        hGain.gain.setValueAtTime(0.28, time + offset);
        hGain.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.07);
        hSource.connect(hFilter);
        hFilter.connect(hGain);
        hGain.connect(filter);
        hSource.start(time + offset);
        hSource.stop(time + offset + 0.08);
      };
      playOffsetClap(0);
      playOffsetClap(0.025);
    }

    // House Off-beat Open Hat
    const hatTime = time + beat / 2;
    const hat = ctx.createBufferSource();
    hat.buffer = createOfflineNoiseBuffer(ctx, 0.14);
    const hatFilter = ctx.createBiquadFilter();
    hatFilter.type = 'highpass';
    hatFilter.frequency.value = 6500;
    const hatGain = ctx.createGain();
    hatGain.gain.setValueAtTime(0.18, hatTime);
    hatGain.gain.exponentialRampToValueAtTime(0.001, hatTime + 0.12);
    hat.connect(hatFilter);
    hatFilter.connect(hatGain);
    hatGain.connect(filter);
    hat.start(hatTime);
    hat.stop(hatTime + 0.14);

    // Closed Hat ticks on 16ths
    for (let s = 0; s < 4; s++) {
      if (s === 2) continue; // skip open hat slot
      const t = time + s * (beat / 4);
      const cSource = ctx.createBufferSource();
      cSource.buffer = createOfflineNoiseBuffer(ctx, 0.03);
      const cFilter = ctx.createBiquadFilter();
      cFilter.type = 'highpass';
      cFilter.frequency.value = 9000;
      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(0.06, t);
      cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      cSource.connect(cFilter);
      cFilter.connect(cGain);
      cGain.connect(filter);
      cSource.start(t);
      cSource.stop(t + 0.03);
    }
  }

  // Organ-like bassline sequence (Key: A minor - syncopated bouncy)
  const bassRhythm = [
    // Beat 0-3: A1 notes syncopated
    { beat: 0.0, note: 33 }, { beat: 0.75, note: 33 }, { beat: 1.25, note: 33 }, { beat: 2.0, note: 33 }, { beat: 2.75, note: 33 },
    // Beat 4-7: C2 notes
    { beat: 4.0, note: 36 }, { beat: 4.75, note: 36 }, { beat: 5.25, note: 36 }, { beat: 6.0, note: 36 }, { beat: 6.75, note: 36 },
    // Beat 8-11: D2 notes
    { beat: 8.0, note: 38 }, { beat: 8.75, note: 38 }, { beat: 9.25, note: 38 }, { beat: 10.0, note: 38 }, { beat: 10.75, note: 38 },
    // Beat 12-15: G1/E1 note drops
    { beat: 12.0, note: 31 }, { beat: 12.75, note: 31 }, { beat: 13.5, note: 31 }, { beat: 14.25, note: 28 }, { beat: 15.0, note: 33 }
  ];

  function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  bassRhythm.forEach((evt) => {
    const time = evt.beat * beat;
    const freq = midiToFreq(evt.note);
    
    // Organ bass: combine triangle + small sine at 2nd harmonic
    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.setValueAtTime(freq, time);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq / 2, time); // Sub bass octave down!

    const organGain = ctx.createGain();
    organGain.gain.setValueAtTime(0.28, time);
    organGain.gain.exponentialRampToValueAtTime(0.001, time + beat * 0.4);

    tri.connect(organGain);
    sub.connect(organGain);
    organGain.connect(filter);

    tri.start(time);
    sub.start(time);
    tri.stop(time + beat * 0.42);
    sub.stop(time + beat * 0.42);
  });

  // Offbeat Organ Chord Stabs (Am, C, Dm, G)
  const stabs = [
    { beat: 1.5, notes: [45, 48, 52] }, // Am
    { beat: 3.5, notes: [45, 48, 52] },
    { beat: 5.5, notes: [48, 52, 55] }, // C
    { beat: 7.5, notes: [48, 52, 55] },
    { beat: 9.5, notes: [50, 53, 57] }, // Dm
    { beat: 11.5, notes: [50, 53, 57] },
    { beat: 13.5, notes: [43, 47, 50] }, // G
    { beat: 15.5, notes: [45, 48, 52] }  // Resolves back to Am
  ];

  stabs.forEach((evt) => {
    const time = evt.beat * beat;
    evt.notes.forEach((note) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(midiToFreq(note + 12), time);

      const stabFilter = ctx.createBiquadFilter();
      stabFilter.type = 'bandpass';
      stabFilter.frequency.value = 1400;
      stabFilter.Q.value = 3;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.connect(stabFilter);
      stabFilter.connect(gain);
      gain.connect(filter);
      
      osc.start(time);
      osc.stop(time + 0.16);
    });
  });

  return await ctx.startRendering();
}

// 3. Acid Techno Render (BPM: 130, Length: 7.38s, 16 beats)
async function compileTechno(sampleRate) {
  const bpm = 130;
  const beat = 60 / bpm; // 0.4615s
  const duration = beat * 16;
  const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // Wave shaper node to distort elements slightly
  const dist = ctx.createWaveShaper();
  function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
  dist.curve = makeDistortionCurve(30);
  dist.connect(ctx.destination);

  // Drums
  for (let b = 0; b < 16; b++) {
    const time = b * beat;

    // Hard punching industrial kick
    const kick = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kick.frequency.setValueAtTime(150, time);
    kick.frequency.exponentialRampToValueAtTime(38, time + 0.15);
    kickGain.gain.setValueAtTime(0.9, time);
    kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    
    kick.connect(kickGain);
    kickGain.connect(dist);
    kick.start(time);
    kick.stop(time + 0.22);

    // Techno Open Ride cymbal
    const hatTime = time + beat / 2;
    const hat = ctx.createBufferSource();
    hat.buffer = createOfflineNoiseBuffer(ctx, 0.25);
    const hatFilter = ctx.createBiquadFilter();
    hatFilter.type = 'highpass';
    hatFilter.frequency.value = 5000;
    const hatGain = ctx.createGain();
    hatGain.gain.setValueAtTime(0.12, hatTime);
    hatGain.gain.linearRampToValueAtTime(0.08, hatTime + 0.08);
    hatGain.gain.exponentialRampToValueAtTime(0.001, hatTime + 0.22);
    
    hat.connect(hatFilter);
    hatFilter.connect(hatGain);
    hatGain.connect(ctx.destination); // clean, un-distorted highs
    hat.start(hatTime);
    hat.stop(hatTime + 0.25);

    // Fast 16th closed hats (rolling feel)
    for (let s = 0; s < 4; s++) {
      const t = time + s * (beat / 4);
      const hatSource = ctx.createBufferSource();
      hatSource.buffer = createOfflineNoiseBuffer(ctx, 0.04);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 8000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.05 + (s % 2 === 0 ? 0.03 : 0), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

      hatSource.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      hatSource.start(t);
      hatSource.stop(t + 0.04);
    }
  }

  // Squelchy Acid TB-303 Bassline in G minor (Fast 16th notes!)
  const acidNotes = [
    31, 31, 43, 31, 34, 34, 46, 34,
    36, 36, 48, 36, 33, 33, 45, 31
  ];

  function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  const stepTime = beat / 4; // 16th steps
  for (let step = 0; step < 64; step++) {
    const time = step * stepTime;
    const note = acidNotes[step % 16];
    const freq = midiToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    // Squelch Filter
    const filter303 = ctx.createBiquadFilter();
    filter303.type = 'lowpass';
    filter303.Q.value = 16.0; // HIGH RESONANCE!

    // Filter sweep envelope modulated by LFO/time index
    const filterEnvStart = 400 + Math.sin(step / 3) * 600 + (step % 2 === 0 ? 1200 : 0);
    filter303.frequency.setValueAtTime(filterEnvStart, time);
    filter303.frequency.exponentialRampToValueAtTime(180, time + stepTime * 0.85);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.12, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + stepTime * 0.9);

    osc.connect(filter303);
    filter303.connect(gainNode);
    gainNode.connect(dist);

    osc.start(time);
    osc.stop(time + stepTime);
  }

  return await ctx.startRendering();
}


/* ==========================================================================
   WAVEFORM CANVAS RENDERER CLASS
   ========================================================================== */
class WaveformRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.peaksA = [];
    this.peaksB = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.parentElement.clientHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  // Pre-calculate downsampled peaks for drawing
  analyzeBuffer(buffer, deckName) {
    if (!buffer) return;
    const channelData = buffer.getChannelData(0);
    const step = Math.ceil(channelData.length / 1000); // 1000 data points
    const peaks = [];
    
    for (let i = 0; i < channelData.length; i += step) {
      let max = 0;
      for (let j = 0; j < step && i + j < channelData.length; j++) {
        const val = Math.abs(channelData[i + j]);
        if (val > max) max = val;
      }
      peaks.push(max);
    }
    
    if (deckName === 'A') {
      this.peaksA = peaks;
    } else {
      this.peaksB = peaks;
    }
  }

  // Draws both parallel scrolling waveforms center aligned
  draw(timeA, durationA, playingA, timeB, durationB, playingB) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    
    // Clear canvas
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = '#10141e';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const centerPlayhead = w / 2;
    const zoom = 150; // pixels representing 1 second of track duration

    // 1. Draw Deck A Waveform (Top Half)
    if (this.peaksA.length > 0 && durationA > 0) {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
      const ratio = this.peaksA.length / durationA; // points per second
      const currentPoint = timeA * ratio;

      // Draw peaks
      for (let x = 0; x < w; x++) {
        // Offset mapping: center is currentPoint
        const timeOffset = (x - centerPlayhead) / zoom; // seconds offset from playhead
        const targetPoint = Math.floor(currentPoint + timeOffset * ratio);
        
        if (targetPoint >= 0 && targetPoint < this.peaksA.length) {
          const peak = this.peaksA[targetPoint];
          const barHeight = peak * (h / 2.4);
          ctx.fillRect(x, h / 4 - barHeight / 2, 1.2, barHeight);
        }
      }

      // Beat grid ticks (draw tick every beat)
      ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
      const beatLen = 60 / deckA.bpm;
      const startBeat = Math.floor((timeA - (centerPlayhead / zoom)) / beatLen);
      const endBeat = Math.ceil((timeA + (centerPlayhead / zoom)) / beatLen);
      
      for (let b = startBeat; b <= endBeat; b++) {
        const beatTime = b * beatLen;
        const x = centerPlayhead + (beatTime - timeA) * zoom;
        if (x >= 0 && x < w) {
          ctx.fillRect(x, 0, 1.5, h / 2);
        }
      }
    }

    // 2. Draw Deck B Waveform (Bottom Half)
    if (this.peaksB.length > 0 && durationB > 0) {
      ctx.fillStyle = 'rgba(255, 0, 127, 0.8)';
      const ratio = this.peaksB.length / durationB;
      const currentPoint = timeB * ratio;

      for (let x = 0; x < w; x++) {
        const timeOffset = (x - centerPlayhead) / zoom;
        const targetPoint = Math.floor(currentPoint + timeOffset * ratio);
        
        if (targetPoint >= 0 && targetPoint < this.peaksB.length) {
          const peak = this.peaksB[targetPoint];
          const barHeight = peak * (h / 2.4);
          ctx.fillRect(x, (3 * h) / 4 - barHeight / 2, 1.2, barHeight);
        }
      }

      // Beat grid ticks B
      ctx.fillStyle = 'rgba(255, 0, 127, 0.2)';
      const beatLen = 60 / deckB.bpm;
      const startBeat = Math.floor((timeB - (centerPlayhead / zoom)) / beatLen);
      const endBeat = Math.ceil((timeB + (centerPlayhead / zoom)) / beatLen);
      
      for (let b = startBeat; b <= endBeat; b++) {
        const beatTime = b * beatLen;
        const x = centerPlayhead + (beatTime - timeB) * zoom;
        if (x >= 0 && x < w) {
          ctx.fillRect(x, h / 2, 1.5, h / 2);
        }
      }
    }

    // Divider Line
    ctx.strokeStyle = '#222530';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }
}

let waveformRendererInstance = null;


/* ==========================================================================
   DECK OBJECT CLASS
   ========================================================================== */
class DJDeck {
  constructor(name, destNode) {
    this.name = name;
    this.destNode = destNode;
    
    this.buffer = null;
    this.source = null;
    this.isPlaying = false;
    
    // Playback metrics
    this.baseBPM = 128;
    this.bpm = 128;
    this.pitch = 0; // -8 to +8 percent slider
    this.pitchBend = 0;
    this.duration = 0;
    this.pauseOffset = 0;
    this.lastStartTime = 0;
    this.keyLock = false;

    // Loop configuration
    this.loopActive = false;
    this.loopLength = 4; // 1, 2, 4, 8, 16 beats
    this.loopStartPos = 0;

    // Hot Cues array
    this.hotCues = [null, null, null, null, null, null, null, null];

    // Audio node routing
    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    this.trimNode = audioCtx.createGain();
    
    // 3-Band Parametric EQ
    this.eqHi = audioCtx.createBiquadFilter();
    this.eqHi.type = 'highshelf';
    this.eqHi.frequency.value = 3200;
    
    this.eqMid = audioCtx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.Q.value = 1.0;
    this.eqMid.frequency.value = 1000;
    
    this.eqLow = audioCtx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 240;

    // sound color filters: sweep lowpass / highpass
    this.lpf = audioCtx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 20000;

    this.hpf = audioCtx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 10;

    this.volNode = audioCtx.createGain();
    this.volNode.gain.value = 0.8; // default slider

    // Connections
    // Buffer Source -> Analyser -> Trim -> Hi EQ -> Mid EQ -> Low EQ -> LPF -> HPF -> Vol Gain -> Destination (Crossfader)
    this.analyser.connect(this.trimNode);
    this.trimNode.connect(this.eqHi);
    this.eqHi.connect(this.eqMid);
    this.eqMid.connect(this.eqLow);
    this.eqLow.connect(this.lpf);
    this.lpf.connect(this.hpf);
    this.hpf.connect(this.volNode);
    this.volNode.connect(this.destNode);
  }

  // Returns playback rate calculation incorporating pitch sliders and bend nudges
  getRate() {
    // 1 + (Pitch% / 100) + PitchBendNudge%
    return Math.max(0.1, 1 + (this.pitch / 100) + this.pitchBend);
  }

  getCurrentTime() {
    if (!this.isPlaying) return this.pauseOffset;
    
    const elapsed = (audioCtx.currentTime - this.lastStartTime) * this.getRate();
    let current = this.pauseOffset + elapsed;
    
    if (this.duration > 0) {
      if (this.loopActive) {
        const beatDuration = 60 / this.bpm;
        const loopLenSec = this.loopLength * beatDuration;
        const loopEndPos = this.loopStartPos + loopLenSec;
        
        if (current >= loopEndPos) {
          // Loop jump! Calculate how far over they went
          const overflow = (current - this.loopStartPos) % loopLenSec;
          current = this.loopStartPos + overflow;
          // Re-sync starting parameters so visual calculation aligns
          this.pauseOffset = current;
          this.lastStartTime = audioCtx.currentTime;
        }
      } else {
        if (current >= this.duration) {
          current = this.duration;
          this.pause();
          this.pauseOffset = 0; // Reset to start
        }
      }
    }
    return current;
  }

  loadTrack(buffer, name, artist, baseBPM) {
    this.pause();
    this.buffer = buffer;
    this.duration = buffer.duration;
    this.baseBPM = baseBPM;
    this.bpm = baseBPM;
    this.pauseOffset = 0;
    this.hotCues.fill(null);
    this.loopActive = false;
    
    // UI Update
    document.getElementById(`deck-${this.name.toLowerCase()}-title`).innerText = name;
    document.getElementById(`deck-${this.name.toLowerCase()}-artist`).innerText = artist;
    document.getElementById(`deck-${this.name.toLowerCase()}-bpm`).innerText = baseBPM.toFixed(2);
    document.getElementById(`jog-${this.name.toLowerCase()}-bpm-readout`).innerText = Math.round(baseBPM);
    
    // Reset pads visual highlights
    const pads = document.querySelectorAll(`#pads-grid-${this.name.toLowerCase()} .pad`);
    pads.forEach(p => p.classList.remove('active'));

    // Analyze waveform
    if (waveformRendererInstance) {
      waveformRendererInstance.analyzeBuffer(buffer, this.name);
    }
  }

  play() {
    if (this.isPlaying || !this.buffer) return;

    this.isPlaying = true;
    this.lastStartTime = audioCtx.currentTime;

    // Create a new source node
    this.source = audioCtx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.getRate();

    // Loop config (Web Audio native handles loops perfectly, but custom loops bypass native loop if we need complex cue loops)
    // We let our JS scheduler manage loops for precision alignment, but setting native loop works as fallback.
    this.source.loop = false;

    // Reconnect to analyzer
    this.source.connect(this.analyser);

    // Start playback from pauseOffset
    this.source.start(0, this.pauseOffset);

    // Sync button highlight
    document.getElementById(`deck-${this.name.toLowerCase()}-status-led`).classList.add('playing');
    document.getElementById(`deck-${this.name.toLowerCase()}-play`).classList.add('playing');
    document.getElementById(`deck-${this.name.toLowerCase()}-play`).querySelector('.play-icon').classList.add('hidden');
    document.getElementById(`deck-${this.name.toLowerCase()}-play`).querySelector('.pause-icon').classList.remove('hidden');
  }

  pause() {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.pauseOffset = this.getCurrentTime();

    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {}
      this.source = null;
    }

    document.getElementById(`deck-${this.name.toLowerCase()}-status-led`).classList.remove('playing');
    document.getElementById(`deck-${this.name.toLowerCase()}-play`).classList.remove('playing');
    document.getElementById(`deck-${this.name.toLowerCase()}-play`).querySelector('.play-icon').classList.remove('hidden');
    document.getElementById(`deck-${this.name.toLowerCase()}-play`).querySelector('.pause-icon').classList.add('hidden');
  }

  setPlaybackRate(val) {
    this.pitch = val;
    this.bpm = this.baseBPM * (1 + val / 100);
    
    // UI Update
    document.getElementById(`deck-${this.name.toLowerCase()}-bpm`).innerText = this.bpm.toFixed(2);
    document.getElementById(`jog-${this.name.toLowerCase()}-bpm-readout`).innerText = Math.round(this.bpm);
    document.getElementById(`deck-${this.name.toLowerCase()}-pitch-val`).innerText = (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
    
    if (this.source && this.isPlaying) {
      this.source.playbackRate.setValueAtTime(this.getRate(), audioCtx.currentTime);
    }
  }

  // Triggered when pitch bend +/- buttons are clicked or keyboard binds are hit
  applyPitchBend(amount) {
    this.pitchBend = amount;
    if (this.source && this.isPlaying) {
      this.source.playbackRate.setValueAtTime(this.getRate(), audioCtx.currentTime);
    }
    // Return back to neutral after 300ms automatically (nudge behavior)
    if (amount !== 0) {
      setTimeout(() => {
        this.applyPitchBend(0);
      }, 250);
    }
  }

  jumpTo(pos) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.pauseOffset = Math.max(0, Math.min(pos, this.duration));
    if (wasPlaying) {
      this.play();
    }
  }

  // Performance Pads trigger routes
  triggerPad(index, isDown = true) {
    if (!this.buffer) return;
    const mode = activePadModes[this.name.toLowerCase()];
    
    if (mode === 'hotcue') {
      if (isDown) {
        const cuePos = this.hotCues[index];
        const padBtn = document.querySelector(`#pads-grid-${this.name.toLowerCase()} [data-index="${index}"]`);
        
        if (cuePos === null) {
          // Set hot cue
          this.hotCues[index] = this.getCurrentTime();
          padBtn.classList.add('active');
        } else {
          // Jump to hot cue
          this.jumpTo(cuePos);
          if (!this.isPlaying) {
            this.play();
          }
        }
      }
    } else if (mode === 'loop') {
      if (isDown) {
        const loopLengths = [0.5, 1, 2, 4, 8, 16, 32, 64];
        const beats = loopLengths[index] || 4;
        
        const padBtns = document.querySelectorAll(`#pads-grid-${this.name.toLowerCase()} .pad`);
        padBtns.forEach(p => p.classList.remove('active'));

        if (this.loopActive && this.loopLength === beats) {
          // Toggle off
          this.loopActive = false;
        } else {
          // Toggle on
          this.loopActive = true;
          this.loopLength = beats;
          this.loopStartPos = this.getCurrentTime();
          
          const padBtn = document.querySelector(`#pads-grid-${this.name.toLowerCase()} [data-index="${index}"]`);
          padBtn.classList.add('active');
        }
      }
    } else if (mode === 'sampler') {
      if (isDown) {
        const samples = ['kick', 'snare', 'hat', 'clap', 'airhorn', 'laser', 'rise', 'drop'];
        const sample = samples[index];
        
        const padBtn = document.querySelector(`#pads-grid-${this.name.toLowerCase()} [data-index="${index}"]`);
        padBtn.classList.add('active');
        
        playSample(sample, this.volNode.gain.value);
        
        setTimeout(() => {
          padBtn.classList.remove('active');
        }, 120);
      }
    } else if (mode === 'padfx') {
      // Toggle pad effects
      const padBtn = document.querySelector(`#pads-grid-${this.name.toLowerCase()} [data-index="${index}"]`);
      if (isDown) {
        padBtn.classList.add('active');
        this.applyFX(index, true);
      } else {
        padBtn.classList.remove('active');
        this.applyFX(index, false);
      }
    }
  }

  // Clear hot cue
  clearHotCue(index) {
    this.hotCues[index] = null;
    const padBtn = document.querySelector(`#pads-grid-${this.name.toLowerCase()} [data-index="${index}"]`);
    padBtn.classList.remove('active');
  }

  // Apply performance FX
  applyFX(index, active) {
    const now = audioCtx.currentTime;
    switch (index) {
      case 0: // Reverb/Delay Sweep
        this.lpf.frequency.setValueAtTime(active ? 600 : 20000, now);
        break;
      case 1: // Squelch Highpass filter
        this.hpf.frequency.setValueAtTime(active ? 1500 : 10, now);
        break;
      case 2: // Gate roll (stutter)
        if (active) {
          this.loopStartPos = this.getCurrentTime();
          this.loopLength = 0.25; // extremely short beat repeat
          this.loopActive = true;
        } else {
          this.loopActive = false;
        }
        break;
      case 3: // Pitch shift bend (extreme)
        this.pitchBend = active ? 0.35 : 0;
        if (this.source && this.isPlaying) {
          this.source.playbackRate.setValueAtTime(this.getRate(), now);
        }
        break;
    }
  }
}


/* ==========================================================================
   VU LEVEL METER RENDERING
   ========================================================================== */
// VU meter smoothing/decay state (makes it feel less robotic)
const vuState = {
  a: { currentLit: 0, targetLit: 0 },
  b: { currentLit: 0, targetLit: 0 }
};

function updateVUMeters() {
  if (!audioCtx) {
    requestAnimationFrame(updateVUMeters);
    return;
  }

  const renderDeckVU = (deck, meterId, stateKey) => {
    const leds = document.querySelectorAll(`#${meterId} .vu-led`);
    if (!deck || !deck.analyser || leds.length === 0) return;

    // Use (and reuse) a buffer per deck to avoid allocations in the hot path
    if (!deck.__vuDataArray) {
      deck.__vuDataArray = new Uint8Array(deck.analyser.frequencyBinCount);
    }

    // Determine target level from current analyser
    if (!deck.isPlaying) {
      vuState[stateKey].targetLit = 0;
    } else {
      deck.analyser.getByteFrequencyData(deck.__vuDataArray);

      let sum = 0;
      for (let i = 0; i < deck.__vuDataArray.length; i++) sum += deck.__vuDataArray[i];
      const average = sum / deck.__vuDataArray.length;

      const factor = deck.volNode.gain.value; // scale by volume slider
      let litCount = Math.min(10, Math.round((average / 110) * factor * 10));

      // Tiny natural flicker so it doesn't look mathematically perfect
      const flicker = (Math.random() - 0.5) * 0.25; // +/-0.125
      litCount = Math.max(0, Math.min(10, Math.round(litCount + flicker)));

      vuState[stateKey].targetLit = litCount;
    }

    // Smooth movement: fast attack, slower release
    const cur = vuState[stateKey].currentLit;
    const target = vuState[stateKey].targetLit;

    const attackRate = 0.28; // how quickly it rises
    const releaseRate = 0.14; // how quickly it falls

    const delta = target - cur;
    let next;
    if (delta > 0) next = cur + delta * attackRate;
    else next = cur + delta * releaseRate;

    vuState[stateKey].currentLit = next;

    const effectiveLit = Math.max(0, Math.min(10, Math.round(next)));

    leds.forEach((led, idx) => {
      if (10 - idx <= effectiveLit) led.classList.add('lit');
      else led.classList.remove('lit');
    });
  };

  renderDeckVU(deckA, 'vu-meter-a', 'a');
  renderDeckVU(deckB, 'vu-meter-b', 'b');

  requestAnimationFrame(updateVUMeters);
}



/* ==========================================================================
   VINYL ROTATION ANIMATION & SCRATCH CALCULATIONS
   ========================================================================== */
const rotateState = {
  a: { angle: 0, lastTime: 0 },
  b: { angle: 0, lastTime: 0 }
};

function animateVinylJogWheels() {
  const now = performance.now();
  
  const spinDeck = (deck, key, markerId) => {
    const state = rotateState[key];
    const marker = document.getElementById(markerId);
    if (!marker) return;

    if (deck && deck.isPlaying) {
      const dt = (now - state.lastTime) / 1000; // seconds
      const rate = deck.getRate();
      // Rotation: 33.3 RPM (Revolutions Per Minute)
      // 33.3 revs / 60s = 0.555 revs/s = 200 degrees/s
      const rotationSpeed = 200 * rate; 
      state.angle = (state.angle + rotationSpeed * dt) % 360;
      marker.style.transform = `translateX(-50%) rotate(${state.angle}deg)`;
    }
    state.lastTime = now;
  };

  spinDeck(deckA, 'a', 'jog-marker-a');
  spinDeck(deckB, 'b', 'jog-marker-b');

  requestAnimationFrame(animateVinylJogWheels);
}


// Scratch Drag Physics State
const scratchState = {
  a: { isDragging: false, lastAngle: 0, lastTime: 0, speedFactor: 0 },
  b: { isDragging: false, lastAngle: 0, lastTime: 0, speedFactor: 0 }
};

function setupScratchHandler(jogId, deck, key) {
  const jog = document.getElementById(jogId);
  const state = scratchState[key];

  const getAngle = (e) => {
    const rect = jog.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return Math.atan2(clientY - cy, clientX - cx);
  };

  const handleStart = (e) => {
    if (!audioCtx || !deck.buffer) return;
    state.isDragging = true;
    state.lastAngle = getAngle(e);
    state.lastTime = performance.now();
    state.speedFactor = 0;
    
    // Add grabbing visual class
    jog.classList.add('grabbing');

    // Pause playing state temporarily while scratching
    state.wasPlayingBeforeScratch = deck.isPlaying;
    deck.pause();

    if (e.cancelable) e.preventDefault();
  };

  const handleMove = (e) => {
    if (!state.isDragging) return;
    const now = performance.now();
    const currentAngle = getAngle(e);
    const dt = Math.max(1, now - state.lastTime); // milliseconds

    // Calculate angle difference (handle wraps)
    let dAngle = currentAngle - state.lastAngle;
    if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    if (dAngle < -Math.PI) dAngle += 2 * Math.PI;

    // Scratch speed calculation
    const velocity = (dAngle / dt) * 1000; // radians per second
    
    // Trigger scratch synthesizer chirp to mimic physical records
    if (Math.abs(velocity) > 0.6) {
      playScratchChirp(velocity);
    }

    // Scroll audio playhead based on drag direction
    const dragTimeFactor = dAngle * 1.5; // Scale angular movement to audio seconds
    deck.pauseOffset = Math.max(0, Math.min(deck.pauseOffset + dragTimeFactor, deck.duration));
    
    // Spin jog wheel visually
    const angleDeg = (dAngle * 180) / Math.PI;
    rotateState[key].angle = (rotateState[key].angle + angleDeg) % 360;
    document.getElementById(`jog-marker-${key}`).style.transform = `translateX(-50%) rotate(${rotateState[key].angle}deg)`;

    // Play a tiny slice of audio forward
    if (Math.abs(velocity) > 0.1 && deck.buffer) {
      try {
        const miniSliceSource = audioCtx.createBufferSource();
        miniSliceSource.buffer = deck.buffer;
        // set pitch matching scratch velocity speed
        miniSliceSource.playbackRate.value = Math.min(3.0, Math.max(0.2, Math.abs(velocity) * 0.4));
        
        // Pass through filter to make it sound "thin" (scratch EQ)
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 800;

        miniSliceSource.connect(filter);
        filter.connect(deck.analyser);
        
        miniSliceSource.start(0, deck.pauseOffset, 0.05); // Play short 50ms clip
      } catch (err) {}
    }

    state.lastAngle = currentAngle;
    state.lastTime = now;
    
    if (e.cancelable) e.preventDefault();
  };

  const handleEnd = () => {
    if (!state.isDragging) return;
    state.isDragging = false;
    
    // Remove grabbing visual class
    jog.classList.remove('grabbing');

    // If the deck was playing before scratch, resume playing!
    if (state.wasPlayingBeforeScratch) {
      deck.play();
    }
  };

  jog.addEventListener('mousedown', handleStart);
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleEnd);

  // Mobile Touch Support
  jog.addEventListener('touchstart', handleStart, { passive: false });
  window.addEventListener('touchmove', handleMove, { passive: false });
  window.addEventListener('touchend', handleEnd);
}


/* ==========================================================================
   VERTICAL KNOB DRAG INTERACTION HANDLERS
   ========================================================================== */
function setupKnobInteractivity() {
  const knobWrappers = document.querySelectorAll('.knob-wrapper');

  knobWrappers.forEach((wrapper) => {
    const controlName = wrapper.getAttribute('data-control');
    const knobEl = wrapper.querySelector('.knob');
    const readout = wrapper.parentElement.querySelector('.knob-val-text, .knob-value');

    // Get value metadata
    let min, max, val, defVal, suffix;
    
    if (controlName.startsWith('eq-')) {
      // 3-Band EQ parameters
      min = -12; // dB cut
      max = 6;  // dB boost
      defVal = 0;
      suffix = ' dB';
    } else if (controlName.startsWith('filter-')) {
      // Sound Color Filter
      min = -100; // Low pass range
      max = 100;  // High pass range
      defVal = 0;
      suffix = '';
    } else if (controlName.startsWith('gain-')) {
      // Trim/Gain
      min = 0;
      max = 200;
      defVal = 100;
      suffix = '%';
    } else if (controlName === 'master-volume') {
      // Master Volume
      min = 0;
      max = 100;
      defVal = 70;
      suffix = '%';
    }

    // Set default inline variables
    wrapper.dataset.value = defVal;

    const handleMouseDown = (e) => {
      activeKnob = {
        wrapper: wrapper,
        knob: knobEl,
        readout: readout,
        control: controlName,
        min: min,
        max: max,
        suffix: suffix,
        startVal: parseFloat(wrapper.dataset.value)
      };
      
      knobStartY = e.clientY;
      keyboardShortcutsEnabled = false; // Disable keyboard while editing knobs
      
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    };

    wrapper.addEventListener('mousedown', handleMouseDown);
  });

  // Global mouse move and mouse up listeners
  window.addEventListener('mousemove', (e) => {
    if (!activeKnob) return;
    
    const deltaY = knobStartY - e.clientY; // drag up increases value
    const range = activeKnob.max - activeKnob.min;
    
    // Scale factor: full slider drag range of 200px sweeps complete knob parameter range
    const scale = range / 200; 
    let newVal = activeKnob.startVal + deltaY * scale;
    
    // Clamp values
    newVal = Math.max(activeKnob.min, Math.min(activeKnob.max, newVal));
    
    // Round for clean visuals
    if (activeKnob.control.startsWith('eq-') || activeKnob.control.startsWith('filter-')) {
      newVal = Math.round(newVal);
    } else {
      newVal = Math.round(newVal);
    }

    // Update value data attribute
    activeKnob.wrapper.dataset.value = newVal;

    // Apply rotation visually
    // -135deg (min) to +135deg (max)
    const percent = (newVal - activeKnob.min) / (activeKnob.max - activeKnob.min);
    const rotation = -135 + percent * 270;
    activeKnob.knob.style.transform = `rotate(${rotation}deg)`;

    // Update Text display
    let label = newVal;
    if (activeKnob.control.startsWith('filter-')) {
      if (newVal === 0) label = "OFF";
      else if (newVal < 0) label = `LPF ${Math.round(Math.abs(newVal))}%`;
      else label = `HPF ${Math.round(newVal)}%`;
    } else {
      label = (newVal >= 0 && activeKnob.control.startsWith('eq-') ? '+' : '') + newVal + activeKnob.suffix;
    }
    
    if (activeKnob.readout) {
      activeKnob.readout.innerText = label;
    }

    // Apply value changes to Web Audio Node graph parameter
    applyKnobAudioParameter(activeKnob.control, newVal);
  });

  window.addEventListener('mouseup', () => {
    if (activeKnob) {
      activeKnob = null;
      document.body.style.cursor = 'default';
      keyboardShortcutsEnabled = true;
    }
  });
}

// Maps physical drag values to actual audio node parameters
function applyKnobAudioParameter(control, val) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  switch (control) {
    case 'gain-a':
      // Trim A: 0% to 200% -> gain 0.0 to 2.0
      deckA.trimNode.gain.setValueAtTime(val / 100, now);
      break;
    case 'gain-b':
      deckB.trimNode.gain.setValueAtTime(val / 100, now);
      break;

    case 'eq-hi-a':
      // EQ High A: peaking filter gain dB
      deckA.eqHi.gain.setValueAtTime(val, now);
      break;
    case 'eq-mid-a':
      deckA.eqMid.gain.setValueAtTime(val, now);
      break;
    case 'eq-low-a':
      deckA.eqLow.gain.setValueAtTime(val, now);
      break;

    case 'eq-hi-b':
      deckB.eqHi.gain.setValueAtTime(val, now);
      break;
    case 'eq-mid-b':
      deckB.eqMid.gain.setValueAtTime(val, now);
      break;
    case 'eq-low-b':
      deckB.eqLow.gain.setValueAtTime(val, now);
      break;

    case 'filter-a':
      // Color Filter A: -100 (LPF) to +100 (HPF)
      if (val === 0) {
        deckA.lpf.frequency.setValueAtTime(20000, now);
        deckA.hpf.frequency.setValueAtTime(10, now);
      } else if (val < 0) {
        // Lowpass sweep: 20000Hz down to 200Hz
        const percent = Math.abs(val) / 100;
        // logarithmic frequency sweep
        const freq = 20000 * Math.pow(0.01, percent);
        deckA.lpf.frequency.setValueAtTime(freq, now);
        deckA.hpf.frequency.setValueAtTime(10, now);
      } else {
        // Highpass sweep: 10Hz up to 4000Hz
        const percent = val / 100;
        const freq = 10 + 4000 * Math.pow(percent, 2);
        deckA.hpf.frequency.setValueAtTime(freq, now);
        deckA.lpf.frequency.setValueAtTime(20000, now);
      }
      break;

    case 'filter-b':
      if (val === 0) {
        deckB.lpf.frequency.setValueAtTime(20000, now);
        deckB.hpf.frequency.setValueAtTime(10, now);
      } else if (val < 0) {
        const percent = Math.abs(val) / 100;
        const freq = 20000 * Math.pow(0.01, percent);
        deckB.lpf.frequency.setValueAtTime(freq, now);
        deckB.hpf.frequency.setValueAtTime(10, now);
      } else {
        const percent = val / 100;
        const freq = 10 + 4000 * Math.pow(percent, 2);
        deckB.hpf.frequency.setValueAtTime(freq, now);
        deckB.lpf.frequency.setValueAtTime(20000, now);
      }
      break;

    case 'master-volume':
      // Master Gain: 0 to 100% -> gain 0 to 1.0
      masterGain.gain.setValueAtTime(val / 100, now);
      break;
  }
}


/* ==========================================================================
   CROSSFADER AUDIO LOGIC
   ========================================================================== */
let crossfaderGainA = null;
let crossfaderGainB = null;

function setupCrossfaderNodeRouting() {
  crossfaderGainA = audioCtx.createGain();
  crossfaderGainB = audioCtx.createGain();

  // Route fader levels
  crossfaderGainA.connect(masterGain);
  crossfaderGainB.connect(masterGain);

  const faderInput = document.getElementById('crossfader');

  const updateCrossfaderLevels = () => {
    const val = parseFloat(faderInput.value); // -1.0 to 1.0
    const now = audioCtx.currentTime;
    
    // Constant Power mixing curve (no volume dips in center position)
    // val goes from -1 (left, only Deck A) to +1 (right, only Deck B)
    // Translate input to radians (0 to pi/2)
    const angle = ((val + 1) * Math.PI) / 4;
    
    const gainA = Math.cos(angle);
    const gainB = Math.sin(angle);

    crossfaderGainA.gain.setValueAtTime(gainA, now);
    crossfaderGainB.gain.setValueAtTime(gainB, now);
  };

  faderInput.addEventListener('input', updateCrossfaderLevels);
  updateCrossfaderLevels(); // trigger init
}


/* ==========================================================================
   HARDWARE BUTTONS & SLIDERS INTERFACE EVENT MAP
   ========================================================================== */
function mapUIHardwareControls() {
  
  // 1. Play / Pause Deck Toggles
  document.getElementById('deck-a-play').addEventListener('click', () => {
    if (deckA.isPlaying) deckA.pause();
    else deckA.play();
  });

  document.getElementById('deck-b-play').addEventListener('click', () => {
    if (deckB.isPlaying) deckB.pause();
    else deckB.play();
  });

  // 2. Cue Hold / Reset Deck Toggles
  document.getElementById('deck-a-cue').addEventListener('mousedown', () => {
    deckA.jumpTo(deckA.hotCues[0] || 0);
    deckA.play();
  });
  document.getElementById('deck-a-cue').addEventListener('mouseup', () => {
    deckA.pause();
  });
  
  document.getElementById('deck-b-cue').addEventListener('mousedown', () => {
    deckB.jumpTo(deckB.hotCues[0] || 0);
    deckB.play();
  });
  document.getElementById('deck-b-cue').addEventListener('mouseup', () => {
    deckB.pause();
  });

  // 3. Pitch Sliders
  const pitchA = document.getElementById('deck-a-pitch');
  pitchA.addEventListener('input', () => {
    // Note: slider returns string, invert value because slider has high top values but DOM input is left-right
    // Wait, standard range is -8 to 8, slide down is negative speed.
    // Vertical rotate slider maps negative to bottom.
    deckA.setPlaybackRate(parseFloat(pitchA.value));
  });

  const pitchB = document.getElementById('deck-b-pitch');
  pitchB.addEventListener('input', () => {
    deckB.setPlaybackRate(parseFloat(pitchB.value));
  });

  // Pitch bend buttons
  document.getElementById('deck-a-bend-plus').addEventListener('click', () => deckA.applyPitchBend(0.04));
  document.getElementById('deck-a-bend-minus').addEventListener('click', () => deckA.applyPitchBend(-0.04));
  document.getElementById('deck-b-bend-plus').addEventListener('click', () => deckB.applyPitchBend(0.04));
  document.getElementById('deck-b-bend-minus').addEventListener('click', () => deckB.applyPitchBend(-0.04));

  // Key Lock button toggles
  const lockA = document.getElementById('deck-a-keylock');
  lockA.addEventListener('click', () => {
    deckA.keyLock = !deckA.keyLock;
    lockA.classList.toggle('active', deckA.keyLock);
  });

  const lockB = document.getElementById('deck-b-keylock');
  lockB.addEventListener('click', () => {
    deckB.keyLock = !deckB.keyLock;
    lockB.classList.toggle('active', deckB.keyLock);
  });

  // 4. Volume vertical sliders
  const volA = document.getElementById('deck-a-vol');
  volA.addEventListener('input', () => {
    const val = parseFloat(volA.value);
    deckA.volNode.gain.setValueAtTime(val, audioCtx.currentTime);
  });

  const volB = document.getElementById('deck-b-vol');
  volB.addEventListener('input', () => {
    const val = parseFloat(volB.value);
    deckB.volNode.gain.setValueAtTime(val, audioCtx.currentTime);
  });

  // 5. Cue Monitoring Headphones selectors (Visual indicator triggers)
  const monA = document.getElementById('deck-a-cue-mon');
  monA.addEventListener('click', () => {
    monA.classList.toggle('active');
  });

  const monB = document.getElementById('deck-b-cue-mon');
  monB.addEventListener('click', () => {
    monB.classList.toggle('active');
  });

  // 6. BPM Sync Beats Matcher
  document.getElementById('deck-a-sync').addEventListener('click', () => {
    if (!deckA.buffer || !deckB.buffer) return;
    // Set Deck A pitch to match Deck B's active BPM
    const targetBPM = deckB.bpm;
    const pitchOffset = ((targetBPM - deckA.baseBPM) / deckA.baseBPM) * 100;
    deckA.setPlaybackRate(pitchOffset);
    pitchA.value = pitchOffset;
    
    // Quick sync blink animation
    const btn = document.getElementById('deck-a-sync');
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 300);
  });

  document.getElementById('deck-b-sync').addEventListener('click', () => {
    if (!deckA.buffer || !deckB.buffer) return;
    const targetBPM = deckA.bpm;
    const pitchOffset = ((targetBPM - deckB.baseBPM) / deckB.baseBPM) * 100;
    deckB.setPlaybackRate(pitchOffset);
    pitchB.value = pitchOffset;

    const btn = document.getElementById('deck-b-sync');
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 300);
  });

  // 7. Pad Performance Mode Selector Buttons
  const mapPadModeButtons = (deckName, gridId) => {
    const modes = document.querySelectorAll(`.pad-mode-btn[data-deck="${deckName}"]`);
    modes.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        modes.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        const mode = e.target.getAttribute('data-mode');
        activePadModes[deckName] = mode;

        // Redraw pad labels dynamically matching selected mode
        updatePadLabels(deckName, mode, gridId);
      });
    });
  };
  
  mapPadModeButtons('a', 'pads-grid-a');
  mapPadModeButtons('b', 'pads-grid-b');

  // Trigger Pad triggers
  const setupPadTriggerEvents = (gridId, deck) => {
    const grid = document.getElementById(gridId);
    const pads = grid.querySelectorAll('.pad');
    
    pads.forEach((pad) => {
      const idx = parseInt(pad.getAttribute('data-index'));

      // Event listener for mousedown/touchstart
      const start = (e) => {
        deck.triggerPad(idx, true);
        e.preventDefault();
      };
      
      const end = (e) => {
        deck.triggerPad(idx, false);
        e.preventDefault();
      };

      pad.addEventListener('mousedown', start);
      pad.addEventListener('mouseup', end);
      pad.addEventListener('touchstart', start, { passive: false });
      pad.addEventListener('touchend', end, { passive: false });
    });
  };

  setupPadTriggerEvents('pads-grid-a', deckA);
  setupPadTriggerEvents('pads-grid-b', deckB);

  // 8. Track presets browser loader
  const presetRows = document.querySelectorAll('.track-row');
  presetRows.forEach((row) => {
    const trackId = row.getAttribute('data-track-id');
    const bpm = parseFloat(row.getAttribute('data-bpm'));
    const title = row.querySelector('.t-title').innerText;
    const artist = row.querySelector('.t-artist').innerText;

    row.querySelector('.load-a').addEventListener('click', () => {
      if (synthTracks[trackId]) {
        deckA.loadTrack(synthTracks[trackId], title, artist, bpm);
        highlightActivePresetRow(row);
      }
    });

    row.querySelector('.load-b').addEventListener('click', () => {
      if (synthTracks[trackId]) {
        deckB.loadTrack(synthTracks[trackId], title, artist, bpm);
        highlightActivePresetRow(row);
      }
    });
  });
}

function highlightActivePresetRow(row) {
  // Add styling highlights to current playing database row
  row.classList.add('playing');
  // Fade out other rows after time
  setTimeout(() => row.classList.remove('playing'), 2000);
}

// Redraws the performance pad text labels on mode shift
function updatePadLabels(deckKey, mode, gridId) {
  const grid = document.getElementById(gridId);
  const pads = grid.querySelectorAll('.pad');
  const deck = deckKey === 'a' ? deckA : deckB;

  const hotCueKeys = deckKey === 'a' ? ['1','2','3','4','Q','W','E','R'] : ['7','8','9','0','U','I','O','P'];
  const loopLabels = ['1/8 Beat', '1/4 Beat', '1/2 Beat', '1 Beat', '2 Beats', '4 Beats', '8 Beats', '16 Beats'];
  const samplerLabels = ['KICK DRUM', 'SNARE', 'HI-HAT', 'CLAP', 'AIRHORN', 'LASER', 'SWEEP RISE', 'SUB DROP'];
  const fxLabels = ['LPF SWEEP', 'HPF CRUSH', 'GATE STUTTER', 'PITCH SPIN', 'PAD FX 5', 'PAD FX 6', 'PAD FX 7', 'PAD FX 8'];

  pads.forEach((pad, idx) => {
    let mainLabel = "";
    
    if (mode === 'hotcue') {
      const isSet = deck.hotCues[idx] !== null;
      mainLabel = isSet ? `CUE ${idx + 1} *` : `CUE ${idx + 1}`;
      pad.className = `pad pad-color-${deckKey === 'a' ? 'cyan' : 'magenta'}`;
      if (isSet) pad.classList.add('active');
    } else if (mode === 'loop') {
      mainLabel = loopLabels[idx];
      pad.className = `pad pad-color-${deckKey === 'a' ? 'cyan' : 'magenta'}`;
      const isCurrentLoop = deck.loopActive && deck.loopLength === [0.5, 1, 2, 4, 8, 16, 32, 64][idx];
      if (isCurrentLoop) pad.classList.add('active');
    } else if (mode === 'sampler') {
      mainLabel = samplerLabels[idx];
      pad.className = `pad pad-color-${deckKey === 'a' ? 'cyan' : 'magenta'}`;
    } else if (mode === 'padfx') {
      mainLabel = fxLabels[idx];
      pad.className = `pad pad-color-${deckKey === 'a' ? 'cyan' : 'magenta'}`;
    }

    pad.querySelector('span:first-child').innerText = mainLabel;
    pad.querySelector('.pad-sub').innerText = hotCueKeys[idx];
  });
}


/* ==========================================================================
   DRAG AND DROP CUSTOM AUDIO FILE LOADER
   ========================================================================== */
function setupCustomFileDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const loader = document.getElementById('audio-decoder-loader');

  // Trigger file click when uploader is clicked
  dropZone.addEventListener('click', (e) => {
    if (e.target !== fileInput) {
      fileInput.click();
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  const decodeAndAddTracks = (files) => {
    if (files.length === 0) return;
    
    loader.classList.add('active');
    
    let processedCount = 0;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      
      reader.onload = function(evt) {
        audioCtx.decodeAudioData(evt.target.result, (buffer) => {
          
          const cleanName = file.name.replace(/\.[^/.]+$/, ""); // strip extension
          const loadedBufferObj = {
            buffer: buffer,
            title: cleanName.length > 25 ? cleanName.substring(0, 25) + '...' : cleanName,
            artist: "Local Track",
            bpm: 120 // Fallback estimate
          };

          loadedLocalBuffers.push(loadedBufferObj);
          
          // Inject row into UI database grid
          addNewTrackRowToLibrary(loadedBufferObj);
          
          processedCount++;
          if (processedCount === files.length) {
            loader.classList.remove('active');
            dropZone.classList.remove('dragover');
          }
        }, (err) => {
          console.error("Audio decoding failure", err);
          alert("Error decoding file: " + file.name + ". Make sure it is a valid audio file.");
          loader.classList.remove('active');
        });
      };

      reader.readAsArrayBuffer(file);
    });
  };

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    decodeAndAddTracks(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    decodeAndAddTracks(fileInput.files);
  });
}

function addNewTrackRowToLibrary(trackObj) {
  const container = document.querySelector('.track-presets');
  const row = document.createElement('div');
  row.className = 'track-row';
  
  // Custom unique id mapping
  const idx = loadedLocalBuffers.length - 1;
  row.dataset.localIndex = idx;
  
  row.innerHTML = `
    <div class="row-cell play-cell">📁</div>
    <div class="row-cell text-cell">
      <span class="t-title">${trackObj.title}</span>
      <span class="t-artist">${trackObj.artist}</span>
    </div>
    <div class="row-cell bpm-cell">${trackObj.bpm} BPM</div>
    <div class="row-cell load-cell">
      <button class="load-btn load-a">LOAD A</button>
      <button class="load-btn load-b">LOAD B</button>
    </div>
  `;

  // Map loader event handlers
  row.querySelector('.load-a').addEventListener('click', () => {
    deckA.loadTrack(trackObj.buffer, trackObj.title, trackObj.artist, trackObj.bpm);
    highlightActivePresetRow(row);
  });

  row.querySelector('.load-b').addEventListener('click', () => {
    deckB.loadTrack(trackObj.buffer, trackObj.title, trackObj.artist, trackObj.bpm);
    highlightActivePresetRow(row);
  });

  container.appendChild(row);
}


/* ==========================================================================
   KEYBOARD SHORTCUTS CONTROLLER
   ========================================================================== */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (!keyboardShortcutsEnabled || !audioCtx) return;

    const key = e.key.toUpperCase();
    const isShift = e.shiftKey;

    // Deck A Controls
    if (e.code === 'Space') {
      e.preventDefault();
      if (deckA.isPlaying) deckA.pause();
      else deckA.play();
    }
    if (key === 'C') {
      // Cue trigger hold
      deckA.jumpTo(deckA.hotCues[0] || 0);
      if (!deckA.isPlaying) deckA.play();
    }
    if (key === 'S') {
      // Sync trigger
      document.getElementById('deck-a-sync').click();
    }

    // Pads Deck A Mapping
    const padKeysA = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R'];
    if (padKeysA.includes(key)) {
      const idx = padKeysA.indexOf(key);
      if (isShift) {
        deckA.clearHotCue(idx);
      } else {
        deckA.triggerPad(idx, true);
      }
    }

    // Pitch bend Deck A
    if (key === 'Q' && isShift) deckA.applyPitchBend(-0.04);
    if (key === 'W' && isShift) deckA.applyPitchBend(0.04);

    // Deck B Controls
    if (e.code === 'Enter') {
      e.preventDefault();
      if (deckB.isPlaying) deckB.pause();
      else deckB.play();
    }
    if (key === 'K') {
      deckB.jumpTo(deckB.hotCues[0] || 0);
      if (!deckB.isPlaying) deckB.play();
    }
    if (key === 'L') {
      document.getElementById('deck-b-sync').click();
    }

    // Pads Deck B Mapping
    const padKeysB = ['7', '8', '9', '0', 'U', 'I', 'O', 'P'];
    if (padKeysB.includes(key)) {
      const idx = padKeysB.indexOf(key);
      if (isShift) {
        deckB.clearHotCue(idx);
      } else {
        deckB.triggerPad(idx, true);
      }
    }

    // Pitch bend Deck B
    if (key === 'U' && isShift) deckB.applyPitchBend(-0.04);
    if (key === 'I' && isShift) deckB.applyPitchBend(0.04);

    // Mixer Crossfader nudge arrow keys
    const fader = document.getElementById('crossfader');
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      fader.value = Math.max(-1.0, parseFloat(fader.value) - 0.1);
      fader.dispatchEvent(new Event('input'));
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      fader.value = Math.min(1.0, parseFloat(fader.value) + 0.1);
      fader.dispatchEvent(new Event('input'));
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      fader.value = 0; // Reset crossfader to center
      fader.dispatchEvent(new Event('input'));
    }

    // Monitor cue source select
    if (key === 'A') {
      document.getElementById('deck-a-cue-mon').click();
    }
    if (key === 'D') {
      document.getElementById('deck-b-cue-mon').click();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!keyboardShortcutsEnabled || !audioCtx) return;
    const key = e.key.toUpperCase();

    // Cue release pauses
    if (key === 'C') {
      deckA.pause();
    }
    if (key === 'K') {
      deckB.pause();
    }

    // Pad lift triggers (important for roll pad fx gates)
    const padKeysA = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R'];
    if (padKeysA.includes(key)) {
      const idx = padKeysA.indexOf(key);
      deckA.triggerPad(idx, false);
    }

    const padKeysB = ['7', '8', '9', '0', 'U', 'I', 'O', 'P'];
    if (padKeysB.includes(key)) {
      const idx = padKeysB.indexOf(key);
      deckB.triggerPad(idx, false);
    }
  });
}


/* ==========================================================================
   INITIALIZE DJ APP
   ========================================================================== */
function initDJSystem() {
  // Initialize Global Audio Context
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();
  
  // Master Gain node
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.7; // default 70%
  masterGain.connect(audioCtx.destination);

  // Master Analyser Node
  masterAnalyser = audioCtx.createAnalyser();
  masterAnalyser.fftSize = 512;
  masterGain.connect(masterAnalyser);

  // Initialize Decks
  // Connect Deck A and Deck B output to crossfader gains, which route to master
  setupCrossfaderNodeRouting();
  
  deckA = new DJDeck('A', crossfaderGainA);
  deckB = new DJDeck('B', crossfaderGainB);

  // Setup visual scrolling waveform parallel canvases
  waveformRendererInstance = new WaveformRenderer('parallel-waveforms');

  // Trigger background synth rendering loops
  compileSynthTracks().then(() => {
    // Load default tracks in decks
    deckA.loadTrack(synthTracks.synthwave, "Retro Synthwave Groove", "LABO Synth System", 120);
    deckB.loadTrack(synthTracks.house, "Deep Club House", "LABO Beat Gen", 125);
  });

  // Attach scratching controllers
  setupScratchHandler('jog-wheel-a', deckA, 'a');
  setupScratchHandler('jog-wheel-b', deckB, 'b');

  // Attach sliders and hardware buttons mappings
  mapUIHardwareControls();

  // Attach custom vertical knob rotation drag calculations
  setupKnobInteractivity();

  // Attach user local custom mp3 uploading zone
  setupCustomFileDropZone();

  // Attach keyboard triggers
  setupKeyboardShortcuts();

  // Start animation loops
  animateVinylJogWheels();
  updateVUMeters();
  startWaveformDrawLoop();
}

// Draw loop for scrolling waveforms
function startWaveformDrawLoop() {
  const draw = () => {
    if (waveformRendererInstance && deckA && deckB) {
      const timeA = deckA.getCurrentTime();
      const timeB = deckB.getCurrentTime();
      waveformRendererInstance.draw(
        timeA, deckA.duration, deckA.isPlaying,
        timeB, deckB.duration, deckB.isPlaying
      );
      
      // Update displays
      updateDeckDigitalTimeText('a', timeA);
      updateDeckDigitalTimeText('b', timeB);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

function updateDeckDigitalTimeText(deckKey, time) {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  const ms = Math.floor((time % 1) * 10);
  const displayTime = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms}`;
  
  const el = document.getElementById(`deck-${deckKey}-time`);
  if (el) el.innerText = displayTime;
}


// UI overlay activations
document.addEventListener('DOMContentLoaded', () => {
  const welcome = document.getElementById('welcome-screen');
  const startBtn = document.getElementById('start-dj-btn');

  // Theme: apply persisted choice or system preference
  const themeKey = 'labo-theme';
  const applyTheme = (theme) => {
    const root = document.documentElement;
    if (!theme || theme === 'dark') {
      root.removeAttribute('data-theme');
      return;
    }
    root.setAttribute('data-theme', theme);
  };

  const savedTheme = localStorage.getItem(themeKey);
  const systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(savedTheme || systemTheme);

  // Track system preference changes only when user hasn't explicitly chosen a theme
  if (!savedTheme && window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    mql.addEventListener('change', (ev) => {
      const next = ev.matches ? 'light' : 'dark';
      applyTheme(next);
    });
  }


  // Start compiling synthesis loops instantly in background
  const initCompilation = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const testCtx = new AudioContextClass();
    testCtx.close(); // just to prime page compilation safely
    compileSynthTracks();
  };

  initCompilation();


  startBtn.addEventListener('click', () => {
    // Check if compilation finished (button is active)
    if (!startBtn.classList.contains('active')) return;

    // Trigger Web Audio context activation
    initDJSystem();

    // Hide welcome overlay splash
    welcome.classList.add('hidden');
  });

  // Theme toggle
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleLabel = document.getElementById('theme-toggle-label');
  if (themeToggleBtn) {
    const current = document.documentElement.getAttribute('data-theme');
    const currentTheme = current ? current : 'dark';
    if (themeToggleLabel) themeToggleLabel.innerText = currentTheme === 'dark' ? 'THEME' : 'THEME';

    themeToggleBtn.addEventListener('click', () => {
      const root = document.documentElement;
      const nowTheme = root.getAttribute('data-theme');
      const nextTheme = nowTheme === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
      localStorage.setItem(themeKey, nextTheme);

      // Optional: update label for clarity without changing layout
      if (themeToggleLabel) {
        themeToggleLabel.innerText = nextTheme === 'light' ? 'LIGHT' : 'DARK';
      }
    });

    // Initialize label
    if (themeToggleLabel) {
      themeToggleLabel.innerText = currentTheme === 'light' ? 'LIGHT' : 'DARK';
    }
  }

  // Keyboard mapping Modal Popup toggles
  const shortcutsBtn = document.getElementById('shortcuts-toggle-btn');

  const shortcutsModal = document.getElementById('shortcuts-modal');
  const closeModalBtn = document.getElementById('close-shortcuts-btn');

  shortcutsBtn.addEventListener('click', () => {
    shortcutsModal.classList.remove('hidden');
    keyboardShortcutsEnabled = false; // suspend shortcuts while overlay is open
  });

  closeModalBtn.addEventListener('click', () => {
    shortcutsModal.classList.add('hidden');
    keyboardShortcutsEnabled = true;
  });

  shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) {
      shortcutsModal.classList.add('hidden');
      keyboardShortcutsEnabled = true;
    }
  });
});
