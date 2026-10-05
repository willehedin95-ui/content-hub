// Client-side: a short chime when a long generation finishes.
//
// Browsers only allow audio after a user gesture, and the image arrives
// minutes after the click. So unlockSound() is called IN the click handler
// (creates/resumes the AudioContext), and playDoneSound() later reuses it.
let ctx: AudioContext | null = null;

export function unlockSound() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // No audio available - the title change still works.
  }
}

/** Two soft rising notes, plus "✓ <label>" in the tab title while the tab is hidden. */
export function playDoneSound(label = "Bild klar") {
  try {
    if (ctx) {
      const t0 = ctx.currentTime;
      [880, 1318.5].forEach((freq, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = t0 + i * 0.16;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(start);
        osc.stop(start + 0.5);
      });
    }
  } catch {
    // ignore
  }
  if (typeof document !== "undefined" && document.hidden) {
    const original = document.title;
    document.title = `✓ ${label}`;
    const restore = () => { document.title = original; document.removeEventListener("visibilitychange", restore); };
    document.addEventListener("visibilitychange", restore);
  }
}
