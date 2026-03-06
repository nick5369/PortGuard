const THEME_KEY = "portguard-theme";
const MANUAL_PRI_KEY = "portguard-manual-primary";
const MANUAL_SEC_KEY = "portguard-manual-secondary";

const THEMES = {
  LIGHT: "light",
  DARK: "dark",
  MANUAL: "manual",
};

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || THEMES.LIGHT;
}

function setStoredTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function getManualColors() {
  return {
    primary: localStorage.getItem(MANUAL_PRI_KEY) || "#000000",
    secondary: localStorage.getItem(MANUAL_SEC_KEY) || "#ffffff",
  };
}

function setManualColors(primary, secondary) {
  localStorage.setItem(MANUAL_PRI_KEY, primary);
  localStorage.setItem(MANUAL_SEC_KEY, secondary);
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function shiftBrightness(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, v + amount));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

const MANUAL_VARS = [
  "--pg-bg",
  "--pg-bg-alt",
  "--pg-text",
  "--pg-text-muted",
  "--pg-border",
  "--pg-border-light",
  "--pg-accent",
  "--pg-accent-inv",
  "--pg-logo-invert",
  "--pg-shadow",
  "--pg-overlay",
];

function clearManualVars() {
  const root = document.documentElement;
  MANUAL_VARS.forEach((v) => root.style.removeProperty(v));
}

function applyManualVars(primary, secondary) {
  const root = document.documentElement;
  const p = hexToRgb(primary);
  const s = hexToRgb(secondary);
  root.style.setProperty("--pg-bg", secondary);
  root.style.setProperty("--pg-bg-alt", shiftBrightness(secondary, -8));
  root.style.setProperty("--pg-text", primary);
  root.style.setProperty("--pg-text-muted", `rgba(${p.r},${p.g},${p.b},0.6)`);
  root.style.setProperty("--pg-border", primary);
  root.style.setProperty("--pg-border-light", `rgba(${p.r},${p.g},${p.b},0.12)`);
  root.style.setProperty("--pg-accent", primary);
  root.style.setProperty("--pg-accent-inv", secondary);
  root.style.setProperty("--pg-logo-invert", "0");
  root.style.setProperty("--pg-shadow", `rgba(${p.r},${p.g},${p.b},0.08)`);
  root.style.setProperty("--pg-overlay", `rgba(${s.r},${s.g},${s.b},0.85)`);
}

function applyTheme(theme, manualColors) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark", "theme-manual");
  clearManualVars();
  if (theme === THEMES.DARK) {
    root.classList.add("theme-dark");
  } else if (theme === THEMES.MANUAL) {
    root.classList.add("theme-manual");
    const colors = manualColors || getManualColors();
    applyManualVars(colors.primary, colors.secondary);
  } else {
    root.classList.add("theme-light");
  }
  window.dispatchEvent(new CustomEvent("themechange"));
}

function initTheme() {
  const theme = getStoredTheme();
  const manualColors = getManualColors();
  applyTheme(theme, manualColors);
  return { theme, manualColors };
}

export {
  THEMES,
  getStoredTheme,
  setStoredTheme,
  getManualColors,
  setManualColors,
  applyTheme,
  initTheme,
};
