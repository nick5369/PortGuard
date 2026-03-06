import { useState } from "react";
import {
  THEMES,
  getStoredTheme,
  setStoredTheme,
  getManualColors,
  setManualColors,
  applyTheme,
} from "../../utils/theme-manager";
import { Sun, Moon, SlidersHorizontal, Check, Palette } from "lucide-react";

const COLOR_PRESETS = [
  { name: "Obsidian",  primary: "#c9b99a", secondary: "#121212" },
  { name: "Monaco",    primary: "#d4af37", secondary: "#0b0e13" },
  { name: "Ivory",     primary: "#1b1b1b", secondary: "#f5f0e8" },
  { name: "Graphite",  primary: "#e8e0d4", secondary: "#2a2a2e" },
  { name: "Navy",      primary: "#bfa980", secondary: "#0d1b2a" },
  { name: "Bordeaux",  primary: "#d4c5a9", secondary: "#2b0a14" },
  { name: "Platinum",  primary: "#2d2d34", secondary: "#eae6e1" },
  { name: "Emerald",   primary: "#c8d5bb", secondary: "#0a1f15" },
];

export default function ThemeSwitcher() {
  const [current, setCurrent] = useState(getStoredTheme());
  const [colors, setColors] = useState(getManualColors());
  const [stagedColors, setStagedColors] = useState(getManualColors());
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  function pick(theme) {
    setStoredTheme(theme);
    setCurrent(theme);
    if (theme === THEMES.MANUAL) {
      setStagedColors({ ...colors });
      setDirty(false);
      applyTheme(theme, colors);
    } else {
      applyTheme(theme, colors);
      setOpen(false);
    }
  }

  function stageColor(key, value) {
    setStagedColors((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function applyManual() {
    setColors({ ...stagedColors });
    setManualColors(stagedColors.primary, stagedColors.secondary);
    applyTheme(THEMES.MANUAL, stagedColors);
    setDirty(false);
  }

  function applyPreset(preset) {
    const next = { primary: preset.primary, secondary: preset.secondary };
    setStagedColors(next);
    setColors(next);
    setManualColors(next.primary, next.secondary);
    setStoredTheme(THEMES.MANUAL);
    setCurrent(THEMES.MANUAL);
    applyTheme(THEMES.MANUAL, next);
    setDirty(false);
  }

  const Icon =
    current === THEMES.DARK
      ? Moon
      : current === THEMES.MANUAL
        ? SlidersHorizontal
        : Sun;

  return (
    <div style={{ position: "relative" }}>
      <button
        className="pg-theme-btn"
        onClick={() => setOpen(!open)}
        aria-label="Theme switcher"
      >
        <Icon size={18} />
      </button>

      {open && (
        <div className="pg-theme-dropdown">
          <div className="pg-theme-dropdown-header">Theme</div>

          <div className="pg-theme-options-row">
            <button
              className={`pg-theme-chip ${current === THEMES.LIGHT ? "selected" : ""}`}
              onClick={() => pick(THEMES.LIGHT)}
            >
              <Sun size={14} />
              Light
            </button>
            <button
              className={`pg-theme-chip ${current === THEMES.DARK ? "selected" : ""}`}
              onClick={() => pick(THEMES.DARK)}
            >
              <Moon size={14} />
              Dark
            </button>
            <button
              className={`pg-theme-chip ${current === THEMES.MANUAL ? "selected" : ""}`}
              onClick={() => pick(THEMES.MANUAL)}
            >
              <SlidersHorizontal size={14} />
              Custom
            </button>
          </div>

          {current === THEMES.MANUAL && (
            <div className="pg-theme-manual-section">
              {/* Color pickers */}
              <div className="pg-theme-pickers">
                <div className="pg-theme-color-card">
                  <label className="pg-theme-color-label">Primary (Text)</label>
                  <div className="pg-theme-color-pick">
                    <div
                      className="pg-theme-swatch-wrapper"
                      style={{ "--swatch-color": stagedColors.primary }}
                    >
                      <input
                        type="color"
                        value={stagedColors.primary}
                        onChange={(e) => stageColor("primary", e.target.value)}
                      />
                    </div>
                    <span className="pg-theme-hex">{stagedColors.primary}</span>
                  </div>
                </div>

                <div className="pg-theme-color-card">
                  <label className="pg-theme-color-label">Secondary (BG)</label>
                  <div className="pg-theme-color-pick">
                    <div
                      className="pg-theme-swatch-wrapper"
                      style={{ "--swatch-color": stagedColors.secondary }}
                    >
                      <input
                        type="color"
                        value={stagedColors.secondary}
                        onChange={(e) => stageColor("secondary", e.target.value)}
                      />
                    </div>
                    <span className="pg-theme-hex">{stagedColors.secondary}</span>
                  </div>
                </div>
              </div>

              {/* Live preview swatch */}
              <div className="pg-theme-preview">
                <div
                  className="pg-theme-preview-box"
                  style={{
                    background: stagedColors.secondary,
                    color: stagedColors.primary,
                    borderColor: stagedColors.primary,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Aa</span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>Preview</span>
                </div>
              </div>

              {/* Apply button */}
              <button
                className={`pg-theme-apply-btn ${dirty ? "active" : ""}`}
                onClick={applyManual}
                disabled={!dirty}
              >
                <Check size={14} />
                Apply Colors
              </button>

              {/* Suggested presets */}
              <div className="pg-theme-presets">
                <div className="pg-theme-presets-header">
                  <Palette size={13} />
                  <span>Suggested Combos</span>
                </div>
                <div className="pg-theme-presets-grid">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      className="pg-theme-preset"
                      onClick={() => applyPreset(preset)}
                      title={preset.name}
                    >
                      <div className="pg-theme-preset-swatch">
                        <span
                          className="pg-preset-half pg-preset-left"
                          style={{ background: preset.secondary }}
                        />
                        <span
                          className="pg-preset-half pg-preset-right"
                          style={{ background: preset.primary }}
                        />
                      </div>
                      <span className="pg-theme-preset-name">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
