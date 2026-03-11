type ToneOptions = {
  duration: number;
  frequency: number;
  frequencyEnd?: number;
  gain: number;
  type?: OscillatorType;
};

function createNoiseBuffer(context: AudioContext, duration: number) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createGameAudioSystem() {
  let audioContext: AudioContext | null = null;
  let unlocked = false;
  let chargeOscillator: OscillatorNode | null = null;
  let chargeGainNode: GainNode | null = null;

  const getContext = () => {
    if (typeof window === "undefined") {
      return null;
    }

    if (!audioContext) {
      const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        return null;
      }
      audioContext = new AudioCtor();
    }

    return audioContext;
  };

  const ensureUnlocked = async () => {
    const context = getContext();
    if (!context) {
      return;
    }

    if (context.state !== "running") {
      await context.resume();
    }
    unlocked = context.state === "running";
  };

  const playTone = ({ duration, frequency, frequencyEnd, gain, type = "sine" }: ToneOptions) => {
    const context = getContext();
    if (!context || !unlocked) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequencyEnd ?? frequency), now + duration);

    gainNode.gain.setValueAtTime(gain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  };

  const playNoiseBurst = (duration: number, gain: number, highpass: number) => {
    const context = getContext();
    if (!context || !unlocked) {
      return;
    }

    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = createNoiseBuffer(context, duration);

    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(highpass, now);

    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(gain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(context.destination);
    source.start(now);
    source.stop(now + duration);
  };

  const stopCharge = () => {
    const context = getContext();
    if (!context) {
      return;
    }

    const now = context.currentTime;
    if (chargeGainNode) {
      chargeGainNode.gain.cancelScheduledValues(now);
      chargeGainNode.gain.setValueAtTime(Math.max(0.0001, chargeGainNode.gain.value), now);
      chargeGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    }
    if (chargeOscillator) {
      chargeOscillator.stop(now + 0.05);
    }
    chargeOscillator = null;
    chargeGainNode = null;
  };

  return {
    unlock: ensureUnlocked,
    startFireballCharge() {
      const context = getContext();
      if (!context || !unlocked || chargeOscillator) {
        return;
      }

      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(160, context.currentTime);
      gainNode.gain.setValueAtTime(0.0001, context.currentTime);
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start();
      chargeOscillator = oscillator;
      chargeGainNode = gainNode;
    },
    updateFireballCharge(level: number) {
      const context = getContext();
      if (!context || !unlocked || !chargeOscillator || !chargeGainNode) {
        return;
      }

      const now = context.currentTime;
      const eased = Math.max(0, Math.min(1, level));
      chargeOscillator.frequency.cancelScheduledValues(now);
      chargeOscillator.frequency.linearRampToValueAtTime(180 + eased * 980, now + 0.05);
      chargeGainNode.gain.cancelScheduledValues(now);
      chargeGainNode.gain.linearRampToValueAtTime(0.012 + eased * 0.045, now + 0.05);
    },
    stopFireballCharge() {
      stopCharge();
    },
    fireballCast() {
      playTone({ duration: 0.18, frequency: 360, frequencyEnd: 720, gain: 0.045, type: "sawtooth" });
      playTone({ duration: 0.12, frequency: 180, frequencyEnd: 120, gain: 0.03, type: "triangle" });
    },
    fireballExplode() {
      playNoiseBurst(0.24, 0.05, 240);
      playTone({ duration: 0.22, frequency: 120, frequencyEnd: 55, gain: 0.05, type: "triangle" });
    },
    chainLightning() {
      playNoiseBurst(0.16, 0.03, 1600);
      playTone({ duration: 0.08, frequency: 820, frequencyEnd: 1220, gain: 0.025, type: "square" });
      playTone({ duration: 0.12, frequency: 620, frequencyEnd: 410, gain: 0.018, type: "square" });
    },
    enemyMissileLaunch() {
      playTone({ duration: 0.16, frequency: 140, frequencyEnd: 280, gain: 0.03, type: "sawtooth" });
    },
    enemyHit() {
      playTone({ duration: 0.09, frequency: 220, frequencyEnd: 140, gain: 0.028, type: "square" });
    },
    enemyDefeat() {
      playTone({ duration: 0.24, frequency: 210, frequencyEnd: 60, gain: 0.04, type: "triangle" });
      playNoiseBurst(0.18, 0.025, 700);
    },
    playerHit() {
      playNoiseBurst(0.12, 0.03, 900);
      playTone({ duration: 0.14, frequency: 180, frequencyEnd: 90, gain: 0.035, type: "square" });
    },
  };
}
