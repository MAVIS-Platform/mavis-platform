"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOUND_KEY = "mavis-studio-sound";

const NOTES = {
  select: [520],
  place: [392, 587],
  connect: [440, 659, 784],
  disconnect: [520, 330],
  scale: [440, 587],
  warning: [330, 247],
  scenario: [330, 440, 587],
  capture: [523, 659, 880],
} as const;

export type StudioSound = keyof typeof NOTES;

export function useStudioSound() {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const output = useRef<GainNode | null>(null);
  const lastNote = useRef(-Infinity);

  useEffect(() => {
    try {
      enabledRef.current = localStorage.getItem(SOUND_KEY) === "on";
      setEnabled(enabledRef.current);
    } catch {
      // Studio works with or without browser storage.
    }
    return () => {
      const context = audio.current;
      audio.current = null;
      output.current = null;
      if (context) void context.close().catch(() => undefined);
    };
  }, []);

  const playSound = useCallback((sound: StudioSound) => {
    if (!enabledRef.current || document.hidden || typeof AudioContext === "undefined") return;
    const now = performance.now();
    if (now - lastNote.current < 65) return;
    lastNote.current = now;

    try {
      if (!audio.current) {
        const context = new AudioContext();
        const master = context.createGain();
        master.gain.value = 0.32;
        master.connect(context.destination);
        output.current = master;
        audio.current = context;
      }

      const context = audio.current;
      const master = output.current;
      if (!master) return;
      const playNotes = () => {
        if (!enabledRef.current || audio.current !== context || document.hidden) return;
        const start = context.currentTime;
        NOTES[sound].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const envelope = context.createGain();
          const onset = start + index * 0.047;
          oscillator.type = sound === "warning" ? "triangle" : "sine";
          oscillator.frequency.value = frequency;
          envelope.gain.setValueAtTime(0.001, onset);
          envelope.gain.exponentialRampToValueAtTime(0.13, onset + 0.012);
          envelope.gain.exponentialRampToValueAtTime(0.001, onset + 0.105);
          oscillator.connect(envelope);
          envelope.connect(master);
          oscillator.onended = () => {
            oscillator.disconnect();
            envelope.disconnect();
          };
          oscillator.start(onset);
          oscillator.stop(onset + 0.11);
        });
      };
      if (context.state === "running") playNotes();
      else void context.resume().then(playNotes).catch(() => undefined);
    } catch {
      // Audio can be disabled by browser policy.
    }
  }, []);

  function toggleSound() {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    if (output.current) output.current.gain.value = next ? 0.32 : 0;
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      // Keep the preference for the current session.
    }
    if (next) {
      lastNote.current = -Infinity;
      playSound("select");
    }
  }

  return { soundEnabled: enabled, toggleSound, playSound };
}
