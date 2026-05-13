const audioCache: Record<string, HTMLAudioElement> = {};
const vibrationLoopCache: Partial<Record<keyof typeof AUDIO_MAP, number>> = {};

const AUDIO_MAP: Record<string, string> = {
  sos: '/audio/sos.wav',
  medicine: '/audio/medicine.wav',
  fall: '/audio/fall.wav',
  vital: '/audio/vital.wav',
  reminder: '/audio/reminder.wav',
  notification: '/audio/notification.wav',
};

export function playAlert(type: keyof typeof AUDIO_MAP) {
  const src = AUDIO_MAP[type];
  if (!src) return;
  if (!audioCache[type]) {
    audioCache[type] = new Audio(src);
  }
  const audio = audioCache[type];
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function vibrateDevice(pattern: number[] = [200, 100, 200]) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

function getVibrationPattern(type: string) {
  switch (type) {
    case 'sos':
      return [500, 200, 500, 200, 500];
    case 'fall':
      return [400, 150, 400];
    case 'vital':
    case 'medicine':
      return [200, 100, 200];
    default:
      return [150];
  }
}

export function startAlertLoop(
  type: keyof typeof AUDIO_MAP,
  options?: { vibrationIntervalMs?: number },
) {
  const src = AUDIO_MAP[type];
  if (!src) return;

  stopAlertLoop(type);

  if (!audioCache[type]) {
    audioCache[type] = new Audio(src);
  }

  const audio = audioCache[type];
  audio.loop = true;
  audio.currentTime = 0;
  audio.play().catch(() => {});

  const vibrationPattern = getVibrationPattern(type);
  vibrateDevice(vibrationPattern);
  vibrationLoopCache[type] = window.setInterval(() => {
    vibrateDevice(vibrationPattern);
  }, options?.vibrationIntervalMs ?? 1800);
}

export function stopAlertLoop(type?: keyof typeof AUDIO_MAP) {
  const types = type ? [type] : (Object.keys(vibrationLoopCache) as Array<keyof typeof AUDIO_MAP>);

  for (const currentType of types) {
    const vibrationLoop = vibrationLoopCache[currentType];
    if (vibrationLoop) {
      window.clearInterval(vibrationLoop);
      delete vibrationLoopCache[currentType];
    }

    const audio = audioCache[currentType];
    if (audio) {
      audio.loop = false;
      audio.pause();
      audio.currentTime = 0;
    }
  }

  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }
}

export function triggerAlert(type: string) {
  playAlert(type as keyof typeof AUDIO_MAP);
  vibrateDevice(getVibrationPattern(type));
}
