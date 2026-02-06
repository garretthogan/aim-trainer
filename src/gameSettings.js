const STORAGE_KEY = 'aim-trainer-game-settings';

const DEFAULTS = {
  minCapsules: 1,
  maxCapsules: 3,
  minTargets: 3,
  maxTargets: 8,
  timerDuration: 60,
};

function parsedInt(value, defaultVal) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? defaultVal : n;
}

export function getGameSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      minCapsules: Math.max(0, parsedInt(parsed.minCapsules, DEFAULTS.minCapsules)),
      maxCapsules: Math.max(0, parsedInt(parsed.maxCapsules, DEFAULTS.maxCapsules)),
      minTargets: Math.max(0, parsedInt(parsed.minTargets, DEFAULTS.minTargets)),
      maxTargets: Math.max(0, parsedInt(parsed.maxTargets, DEFAULTS.maxTargets)),
      timerDuration: Math.max(5, parsedInt(parsed.timerDuration, DEFAULTS.timerDuration)),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setGameSettings(settings) {
  const safe = {
    minCapsules: Math.max(0, parsedInt(settings.minCapsules, DEFAULTS.minCapsules)),
    maxCapsules: Math.max(0, parsedInt(settings.maxCapsules, DEFAULTS.maxCapsules)),
    minTargets: Math.max(0, parsedInt(settings.minTargets, DEFAULTS.minTargets)),
    maxTargets: Math.max(0, parsedInt(settings.maxTargets, DEFAULTS.maxTargets)),
    timerDuration: Math.max(5, parsedInt(settings.timerDuration, DEFAULTS.timerDuration)),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

export { DEFAULTS };
