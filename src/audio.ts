type Cue = 'build' | 'undo' | 'day' | 'error' | 'success';
let audio: AudioContext | undefined;
let volume = 0;
export function setVolume(value: number) {
  volume = Math.max(0, Math.min(1, value));
}
export function playCue(cue: Cue) {
  if (!volume) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const notes: Record<Cue, number[]> = {
      build: [392, 523],
      undo: [440, 330],
      day: [330, 440, 523],
      error: [196, 185],
      success: [392, 494, 587, 784],
    };
    notes[cue].forEach((frequency, i) => {
      const oscillator = audio!.createOscillator(),
        gain = audio!.createGain();
      const at = audio!.currentTime + i * 0.09;
      oscillator.type = cue === 'build' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume * 0.09, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      oscillator.connect(gain).connect(audio!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.32);
    });
  } catch {
    /* Sound is optional; game state never depends on the audio device. */
  }
}
