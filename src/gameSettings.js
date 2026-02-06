const STORAGE_KEY = 'aim-trainer-game-settings';

/** Difficulty presets: targets, capsules, and timer duration. */
export const DIFFICULTIES = {
  easy:   { minTargets: 1, maxTargets: 3, minCapsules: 1, maxCapsules: 3, timerDuration: 60 },
  medium: { minTargets: 2, maxTargets: 6, minCapsules: 2, maxCapsules: 6, timerDuration: 45 },
  hard:   { minTargets: 4, maxTargets: 12, minCapsules: 4, maxCapsules: 12, timerDuration: 30 },
};

const DEFAULT_DIFFICULTY = 'medium';

const DEFAULTS = {
  difficulty: DEFAULT_DIFFICULTY,
};

function isValidDifficulty(value) {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

export function getGameSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getSettingsFromDifficulty(DEFAULTS.difficulty);
    const parsed = JSON.parse(raw);
    const difficulty = isValidDifficulty(parsed.difficulty) ? parsed.difficulty : DEFAULTS.difficulty;
    return getSettingsFromDifficulty(difficulty);
  } catch {
    return getSettingsFromDifficulty(DEFAULTS.difficulty);
  }
}

/** Returns full settings object with derived min/max and timer from the given difficulty. */
function getSettingsFromDifficulty(difficulty) {
  const d = DIFFICULTIES[difficulty];
  return {
    difficulty,
    timerDuration: d.timerDuration,
    minTargets: d.minTargets,
    maxTargets: d.maxTargets,
    minCapsules: d.minCapsules,
    maxCapsules: d.maxCapsules,
  };
}

export function setGameSettings(settings) {
  const difficulty = isValidDifficulty(settings.difficulty) ? settings.difficulty : DEFAULTS.difficulty;
  const stored = { difficulty };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return getSettingsFromDifficulty(difficulty);
}

export { DEFAULTS };
