const STORAGE_KEY = 'aim-trainer-capsule-settings';

const DEFAULTS = {
  radius: 0.6,
  height: 3.6,
  movementSpeed: 22,
};

export function getCapsuleConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      radius: Number(parsed.radius) || DEFAULTS.radius,
      height: Number(parsed.height) || DEFAULTS.height,
      movementSpeed: Number(parsed.movementSpeed) || DEFAULTS.movementSpeed,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setCapsuleConfig(config) {
  const safe = {
    radius: Number(config.radius) ?? DEFAULTS.radius,
    height: Number(config.height) ?? DEFAULTS.height,
    movementSpeed: Number(config.movementSpeed) ?? DEFAULTS.movementSpeed,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

export { DEFAULTS };
