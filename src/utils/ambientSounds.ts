
export class AmbientSoundManager {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  
  // Nodes for different states
  private idleOsc: OscillatorNode | null = null;
  private idleGain: GainNode | null = null;
  private idleFilter: BiquadFilterNode | null = null;

  private listeningOsc: OscillatorNode | null = null;
  private listeningGain: GainNode | null = null;
  private listeningLFO: OscillatorNode | null = null;

  private speakingGain: GainNode | null = null;
  private speakingNoise: AudioBufferSourceNode | null = null;

  private currentMode: 'idle' | 'listening' | 'speaking' | 'none' = 'none';

  constructor() {
    // Context is created on first user interaction for policy compliance
  }

  private init() {
    if (this.audioCtx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 0.15; // Keep it subtle as requested
    this.masterGain.connect(this.audioCtx.destination);
  }

  private stopAll(fadeTime: number = 0.5) {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    
    // Fade out active gains
    [this.idleGain, this.listeningGain, this.speakingGain].forEach(gain => {
      if (gain) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);
      }
    });

    // Schedule stopping and cleanup of oscillators
    const oldIdle = this.idleOsc;
    const oldListening = this.listeningOsc;
    const oldLFO = this.listeningLFO;
    const oldNoise = this.speakingNoise;

    setTimeout(() => {
      [oldIdle, oldListening, oldLFO].forEach(osc => {
        if (osc) {
          try { osc.stop(); osc.disconnect(); } catch (e) {}
        }
      });
      if (oldNoise) {
        try { oldNoise.stop(); oldNoise.disconnect(); } catch (e) {}
      }
    }, fadeTime * 1000 + 100);

    this.idleOsc = null;
    this.listeningOsc = null;
    this.listeningLFO = null;
    this.speakingNoise = null;
  }

  public setMode(mode: 'idle' | 'listening' | 'speaking' | 'none') {
    this.init();
    if (!this.audioCtx) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (this.currentMode === mode) return;
    this.currentMode = mode;

    this.stopAll();

    const now = this.audioCtx.currentTime;

    switch (mode) {
      case 'idle':
        this.startIdle(now);
        break;
      case 'listening':
        this.startListening(now);
        break;
      case 'speaking':
        this.startSpeaking(now);
        break;
    }
  }

  private startIdle(startTime: number) {
    if (!this.audioCtx || !this.masterGain) return;

    // A deep, low-frequency hum (like a spaceship engine)
    this.idleOsc = this.audioCtx.createOscillator();
    this.idleOsc.type = 'sine';
    this.idleOsc.frequency.value = 55; // A1 note

    this.idleFilter = this.audioCtx.createBiquadFilter();
    this.idleFilter.type = 'lowpass';
    this.idleFilter.frequency.value = 200;
    this.idleFilter.Q.value = 5;

    this.idleGain = this.audioCtx.createGain();
    this.idleGain.gain.value = 0.0001;
    this.idleGain.gain.exponentialRampToValueAtTime(0.3, startTime + 1.5);

    this.idleOsc.connect(this.idleFilter);
    this.idleFilter.connect(this.idleGain);
    this.idleGain.connect(this.masterGain);

    this.idleOsc.start();
  }

  private startListening(startTime: number) {
    if (!this.audioCtx || !this.masterGain) return;

    // A pulsating "breathing" sound
    this.listeningOsc = this.audioCtx.createOscillator();
    this.listeningOsc.type = 'triangle';
    this.listeningOsc.frequency.value = 220;

    this.listeningGain = this.audioCtx.createGain();
    this.listeningGain.gain.value = 0.0001;

    // LFO for "breathing"
    this.listeningLFO = this.audioCtx.createOscillator();
    this.listeningLFO.type = 'sine';
    this.listeningLFO.frequency.value = 0.5; // 2 second pulse

    const lfoGain = this.audioCtx.createGain();
    lfoGain.gain.value = 0.05;

    this.listeningLFO.connect(lfoGain);
    lfoGain.connect(this.listeningGain.gain);

    this.listeningGain.gain.exponentialRampToValueAtTime(0.1, startTime + 0.5);

    this.listeningOsc.connect(this.listeningGain);
    this.listeningGain.connect(this.masterGain);

    this.listeningOsc.start();
    this.listeningLFO.start();
  }

  private startSpeaking(startTime: number) {
    if (!this.audioCtx || !this.masterGain) return;

    // A subtle high-frequency "data" texture
    const bufferSize = this.audioCtx.sampleRate * 2;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.speakingNoise = this.audioCtx.createBufferSource();
    this.speakingNoise.buffer = buffer;
    this.speakingNoise.loop = true;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 10;

    this.speakingGain = this.audioCtx.createGain();
    this.speakingGain.gain.value = 0.0001;
    this.speakingGain.gain.exponentialRampToValueAtTime(0.05, startTime + 0.2);

    this.speakingNoise.connect(filter);
    filter.connect(this.speakingGain);
    this.speakingGain.connect(this.masterGain);

    this.speakingNoise.start();
  }
}

export const ambientSoundManager = new AmbientSoundManager();
