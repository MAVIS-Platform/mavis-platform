"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOUND_KEY = "mavis-studio-sound";
const VOLUME_KEY = "mavis-studio-volume";
const DEFAULT_VOLUME = 40;

const NOTES = {
  select: [520],
  place: [392, 587],
  connect: [440, 659, 784],
  disconnect: [520, 330],
  scale: [440, 587],
  warning: [330, 247],
  scenario: [330, 440, 587],
  capture: [523, 659, 880],
  panel: [620],
  policyOn: [490, 735],
  policyOff: [670, 465],
  crash: [290, 135],
  play: [500, 750],
  pause: [580, 470],
  checkpoint: [830],
  blocked: [250, 210],
  setting: [590, 650],
} as const;

export type StudioSound = keyof typeof NOTES;

export function useStudioSound() {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const audio = useRef<AudioContext | null>(null);
  const output = useRef<GainNode | null>(null);
  const lastNote = useRef(-Infinity);
  const lastCrash = useRef(-Infinity);

  useEffect(() => {
    try {
      enabledRef.current = localStorage.getItem(SOUND_KEY) === "on";
      setEnabled(enabledRef.current);
      const savedVolume = localStorage.getItem(VOLUME_KEY);
      if (savedVolume !== null && Number.isFinite(Number(savedVolume))) {
        volumeRef.current = Math.max(0, Math.min(100, Number(savedVolume)));
        setVolume(volumeRef.current);
      }
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
    if (!enabledRef.current || volumeRef.current === 0 || document.hidden || typeof AudioContext === "undefined") return;
    const now = performance.now();
    if (sound === "crash") {
      if (now - lastCrash.current < 220) return;
      lastCrash.current = now;
    } else if (now - lastNote.current < 65) return;
    lastNote.current = now;

    try {
      if (!audio.current) {
        const context = new AudioContext();
        const master = context.createGain();
        master.gain.value = volumeRef.current * 0.008;
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
          oscillator.type = sound === "warning" || sound === "crash" ? "triangle" : "sine";
          oscillator.frequency.setValueAtTime(frequency, onset);
          if (sound === "crash") oscillator.frequency.exponentialRampToValueAtTime(frequency / 3, onset + 0.09);
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
    if (output.current) output.current.gain.value = next ? volumeRef.current * 0.008 : 0;
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

  function changeVolume(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(100, Math.round(value)));
    volumeRef.current = next;
    setVolume(next);
    if (output.current) output.current.gain.value = enabledRef.current ? next * 0.008 : 0;
    try {
      localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      // Keep the volume for the current session.
    }
  }

  return { soundEnabled: enabled, toggleSound, volume, changeVolume, playSound };
}
