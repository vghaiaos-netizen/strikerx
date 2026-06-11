// Web Audio API sound manager for StrikerX
// Sounds: crash, explosion, goal, saved, kick, safe_pick, cashout, win, bet_placed, tick
// Uses synthesized sounds via oscillator (no audio files needed)

export type SoundType = 
  | 'crash' 
  | 'explosion' 
  | 'goal' 
  | 'saved' 
  | 'kick' 
  | 'safe_pick' 
  | 'cashout' 
  | 'win' 
  | 'bet_placed' 
  | 'tick';

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem("strikerx_sound");
      this.enabled = stored === null ? true : stored === "true";
      
      // Auto-unlock AudioContext on first interaction
      const unlock = () => {
        this.initContext();
        window.removeEventListener('click', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('click', unlock);
      window.addEventListener('touchstart', unlock);
    }
  }

  private initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public enable() {
    this.enabled = true;
    localStorage.setItem("strikerx_sound", "true");
    this.initContext();
  }

  public disable() {
    this.enabled = false;
    localStorage.setItem("strikerx_sound", "false");
  }

  public isEnabled() {
    return this.enabled;
  }

  public play(sound: SoundType) {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    switch (sound) {
      case 'crash': {
        // rising then falling pitch, 0.3s
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
      case 'explosion': {
        // low frequency burst noise, 0.4s
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
        
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      case 'goal': {
        // happy ascending arpeggio (C-E-G-C), 0.6s
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          
          osc.frequency.setValueAtTime(freq, now + i * 0.15);
          gain.gain.setValueAtTime(0.2, now + i * 0.15);
          gain.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.2);
          
          osc.start(now + i * 0.15);
          osc.stop(now + i * 0.15 + 0.2);
        });
        break;
      }
      case 'saved': {
        // descending sad tones (E-D-C), 0.4s
        const notes = [329.63, 293.66, 261.63];
        notes.forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          
          osc.frequency.setValueAtTime(freq, now + i * 0.13);
          gain.gain.setValueAtTime(0.2, now + i * 0.13);
          gain.gain.linearRampToValueAtTime(0, now + i * 0.13 + 0.13);
          
          osc.start(now + i * 0.13);
          osc.stop(now + i * 0.13 + 0.13);
        });
        break;
      }
      case 'kick': {
        // short thump + frequency sweep, 0.2s
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
        
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }
      case 'safe_pick': {
        // short high ping, 0.15s
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'cashout': {
        // coin jingle (ascending 3 tones), 0.35s
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          
          osc.frequency.setValueAtTime(freq, now + i * 0.1);
          gain.gain.setValueAtTime(0.2, now + i * 0.1);
          gain.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.15);
          
          osc.start(now + i * 0.1);
          osc.stop(now + i * 0.1 + 0.15);
        });
        break;
      }
      case 'win': {
        // fanfare 4 notes, 0.8s
        const notes = [523.25, 523.25, 523.25, 659.25];
        notes.forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          
          osc.frequency.setValueAtTime(freq, now + i * 0.2);
          gain.gain.setValueAtTime(0.2, now + i * 0.2);
          gain.gain.linearRampToValueAtTime(0, now + i * 0.2 + 0.2);
          
          osc.start(now + i * 0.2);
          osc.stop(now + i * 0.2 + 0.2);
        });
        break;
      }
      case 'bet_placed': {
        // low click, 0.1s
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }
      case 'tick': {
        // metronome tick, 0.08s
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(1000, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.08);
        
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }
    }
  }
}

export const soundManager = new SoundManager();
