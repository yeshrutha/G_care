import { afterEach, expect, it, vi } from 'vitest';
import { speakText, stopSpeaking } from '@/components/VoiceAssistant';

afterEach(() => { stopSpeaking(); vi.unstubAllGlobals(); });

it('reports completion only when audio ends, and ignores cancelled announcements', async () => {
  const audio: any[] = [];
  vi.stubGlobal('Audio', class {
    onended?: () => void;
    currentTime = 0;
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();
    constructor() { audio.push(this); }
  });
  const first = vi.fn();
  speakText('Appointment booked', 'en-IN', first);
  expect(first).not.toHaveBeenCalled();
  audio[0].onended();
  expect(first).toHaveBeenCalledOnce();
  const cancelled = vi.fn();
  speakText('Old appointment', 'en-IN', cancelled);
  stopSpeaking();
  audio[1].onended();
  expect(cancelled).not.toHaveBeenCalled();
});

it('waits for fallback speech to finish when audio playback fails', async () => {
  vi.stubGlobal('Audio', class {
    currentTime = 0;
    pause() {}
    play() { return Promise.reject(new Error('audio unavailable')); }
  });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  let utterance: any;
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), paused: false, getVoices: () => [], speak: (value: any) => { utterance = value; } });
  const complete = vi.fn();
  speakText('Appointment booked', 'kn-IN', complete);
  await Promise.resolve();
  expect(complete).not.toHaveBeenCalled();
  expect(utterance.lang).toBe('kn-IN');
  utterance.onend();
  expect(complete).toHaveBeenCalledOnce();
});
