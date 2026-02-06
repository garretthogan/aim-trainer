const STORAGE_KEY = 'aim-trainer-game-settings';

const DEFAULTS = {
  minCapsules: 1,
  maxCapsules: 3,
  minTargets: 3,
  maxTargets: 8,
  timerDuration: 60,
};

export function getGameSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      minCapsules: Math.max(0, parseInt(parsed.minCapsules, 10) || DEFAULTS.minCapsules),
      maxCapsules: Math.max(0, parseInt(parsed.maxCapsules, 10) ?? DEFAULTS.maxCapsules),
      minTargets: Math.max(0, parseInt(parsed.minTargets, 10) || DEFAULTS.minTargets),
      maxTargets: Math.max(0, parseInt(parsed.maxTargets, 10) ?? DEFAULTS.maxTargets),
      timerDuration: Math.max(5, parseInt(parsed.timerDuration, 10) || DEFAULTS.timerDuration),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setGameSettings(settings) {
  const safe = {
    minCapsules: Math.max(0, parseInt(settings.minCapsules, 10) ?? DEFAULTS.minCapsules),
    maxCapsules: Math.max(0, parseInt(settings.maxCapsules, 10) ?? DEFAULTS.maxCapsules),
    minTargets: Math.max(0, parseInt(settings.minTargets, 10) ?? DEFAULTS.minTargets),
    maxTargets: Math.max(0, parseInt(settings.maxTargets, 10) ?? DEFAULTS.maxTargets),
    timerDuration: Math.max(5, parseInt(settings.timerDuration, 10) ?? DEFAULTS.timerDuration),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

export { DEFAULTS };
