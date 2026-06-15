// Web Audio API sound manager for StrikerX
// Sounds: synthesized only — no audio files needed

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
  | 'tick'
  | 'price_up'
  | 'price_down'
  | 'lock_in'
  | 'countdown_tick'
  | 'trade_win_epic'
  | 'trade_loss'
  | 'streak_up';

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem("strikerx_sound");
      this.enabled = stored === null ? true : stored === "true";

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
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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

  public playTick(mult: number) {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const pitch = Math.min(440, 220 + (mult - 1) * (220 / 9));
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(pitch, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.06);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public play(sound: SoundType) {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    switch (sound) {
      case 'crash': {
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

      // ── New trading sounds ────────────────────────────────────────────────

      case 'price_up': {
        // Quick ascending 2-note ping (C5→E5), very subtle
        [523.25, 659.25].forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          const t = now + i * 0.05;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.05, t);
          gain.gain.linearRampToValueAtTime(0, t + 0.07);
          osc.start(t);
          osc.stop(t + 0.07);
        });
        break;
      }
      case 'price_down': {
        // Quick descending 2-note ping (E5→C5), very subtle
        [659.25, 523.25].forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          const t = now + i * 0.05;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.05, t);
          gain.gain.linearRampToValueAtTime(0, t + 0.07);
          osc.start(t);
          osc.stop(t + 0.07);
        });
        break;
      }
      case 'lock_in': {
        // Dramatic 3-note lock sequence (C3→G3→C4), sawtooth
        [130.81, 196.00, 261.63].forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.type = 'sawtooth';
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          const t = now + i * 0.12;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.18, t);
          gain.gain.linearRampToValueAtTime(0, t + 0.18);
          osc.start(t);
          osc.stop(t + 0.18);
        });
        break;
      }
      case 'countdown_tick': {
        // Urgent square beep at 1200Hz, 50ms
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      }
      case 'trade_win_epic': {
        // 7-note triumphant ascending fanfare (C4→E4→G4→C5→E5→G5→C6)
        [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          const t = now + i * 0.1;
          const vol = i >= 4 ? 0.22 : 0.18;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(vol, t);
          gain.gain.linearRampToValueAtTime(0, t + 0.2);
          osc.start(t);
          osc.stop(t + 0.2);
        });
        break;
      }
      case 'trade_loss': {
        // Heavy bass drop: 120Hz → 25Hz, sawtooth, 0.6s
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.6);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }
      case 'streak_up': {
        // Ascending 3-note celebration (C5→E5→G5)
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          const t = now + i * 0.13;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.linearRampToValueAtTime(0, t + 0.18);
          osc.start(t);
          osc.stop(t + 0.18);
        });
        break;
      }
    }
  }
}

export const soundManager = new SoundManager();
