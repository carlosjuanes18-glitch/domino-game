// Sistema de Audio Web y Efectos Táctiles Hápticos
class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;

    // Archivos de audio reales personalizados
    this.audioFiles = {
      snareReveal: new Audio('/audio/snare-roll-reveal.v4.mp3'),
      laughter: new Audio('/audio/freesound_community-laughter3-43820.mp3'),
      scream: new Audio('/audio/freesound_community-terror-scream-grito-terror-101302.mp3'),
      no: new Audio('/audio/freesound_community-no-96018.mp3'),
      failureTrumpet: new Audio('/audio/universfield-failure-trumpet-242645.mp3'),
      angry: new Audio('/audio/whatsapp-angry.mpeg'),
      champions: new Audio('/audio/queen-champions.mp3'),
      timeBomb: new Audio('/audio/bomba-tiempo.mp3'),
      psychosis: new Audio('/audio/psicosis.mp3')
    };

    // Precarga automática de audios
    Object.values(this.audioFiles).forEach(a => {
      a.preload = 'auto';
    });
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playAudio(key, volume = 0.9) {
    if (this.muted) return;
    this.init();
    const sound = this.audioFiles[key];
    if (!sound) return;
    try {
      sound.pause();
      sound.currentTime = 0;
      sound.volume = volume;
      const p = sound.play();
      if (p !== undefined) {
        p.catch(() => { });
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Redoble de tambor con revelación triunfal al cerrar el juego / final de sesión / tranca
  playSnareRollReveal() {
    this.playAudio('snareReveal', 0.95);
  }

  // Risas épicas para el emoji 😂
  playLaughter() {
    this.playAudio('laughter', 0.92);
  }

  // Grito de desesperación y terror para el emoji 😱 o 💀
  playScream() {
    this.playAudio('scream', 0.88);
  }

  // Audio de WhatsApp de Muy Enojado (😡 / 🤬)
  playAngry() {
    this.playAudio('angry', 0.95);
  }

  // Exclamación "¡No!" para "¡No llevo!" / 🚫
  playNo() {
    this.playAudio('no', 0.85);
  }

  // Trompeta de derrota
  playFailureTrumpet() {
    this.playAudio('failureTrumpet', 0.85);
  }

  // Canción de Queen - We Are The Champions para la pantalla de Balance Final
  playChampions() {
    this.playAudio('champions', 0.95);
  }

  // Detener la canción de Champions al cerrar la pantalla de Balance Final
  stopChampions() {
    const sound = this.audioFiles['champions'];
    if (sound) {
      try {
        sound.pause();
        sound.currentTime = 0;
      } catch (e) {
        console.warn(e);
      }
    }
  }

  // Efecto de sonido Bomba de Tiempo (para el emoji de bomba clásica 💣)
  playTimeBomb() {
    this.playAudio('timeBomb', 0.95);
  }

  // Tema de Psicosis (para el emoji de Dominó Psicópata con cuchillo)
  playPsychosis() {
    this.playAudio('psychosis', 0.95);
  }

  // Sonido de colocar ficha de dominó (impacto nítido de marfil/madera)
  playTileClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, now);
      filter.Q.setValueAtTime(3, now);

      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);

      // Pequeño golpe sordo
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
      subGain.gain.setValueAtTime(0.5, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.12);

      if (navigator.vibrate) {
        navigator.vibrate(25);
      }
    } catch (e) {
      console.warn('Audio error', e);
    }
  }

  // Sonido de "Paso" (Doble toque sobre la mesa de madera / 'toc-toc')
  playPassKnock() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const playKnock = (delay) => {
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.09);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.09);
      };

      playKnock(0);
      playKnock(0.12);

      if (navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }
    } catch (e) {
      console.warn('Audio error', e);
    }
  }

  // Sonido de victoria / Dominó / Tranca
  playWinFanfare() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const now = this.ctx.currentTime + i * 0.11;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
      });

      if (navigator.vibrate) {
        navigator.vibrate([70, 50, 100, 50, 150]);
      }
    } catch (e) {
      console.warn('Audio error', e);
    }
  }

  // Sonido de emoji pop
  playPop() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      console.warn('Audio error', e);
    }
  }
}

window.soundManager = new SoundManager();

