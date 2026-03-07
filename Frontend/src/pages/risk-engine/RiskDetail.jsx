import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

function scoreColor(s) {
  if (s >= 70) return "#dc2626";
  if (s >= 40) return "#ea580c";
  return "#16a34a";
}

function riskClass(level) {
  const l = (level || "").toLowerCase();
  if (l === "critical" || l === "high") return "critical";
  if (l === "medium") return "medium";
  return "low";
}

const DRIVER_COLORS = ["#6366f1", "#f59e0b", "#06b6d4", "#ec4899", "#8b5cf6", "#14b8a6"];

function parseDrivers(text) {
  if (!text) return { main: "--", drivers: [] };
  const m = text.match(/(?:Top drivers|Primary factors|unusual patterns in)[:\s]*(.+?)\.?\s*$/i);
  if (!m) return { main: text, drivers: [] };
  return {
    main: text.slice(0, m.index).trim(),
    drivers: m[1].split(/,\s*/).map((d) => d.replace(/^\d+\.\s*/, "").trim()).filter(Boolean),
  };
}

export default function RiskDetail({
  rowIndex,
  inputRows,
  inputHeaders,
  results,
  onClose,
}) {
  /* ── Close on Escape key ────────────────────────────────────────────── */
  const handleKey = useCallback((e) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (rowIndex == null) return;
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [rowIndex, handleKey]);

  if (rowIndex == null) return null;

  const row = inputRows[rowIndex];
  const cid = String(row[0]);
  const res = results.find((r) => String(r.Container_ID) === cid) || {};
  const score = Number(res.Risk_Score) || 0;
  const cls = riskClass(res.Risk_Level);
  const { main: explMain, drivers } = parseDrivers(res.Explanation_Summary);

  return createPortal(
    <div className="re-detail-overlay" onClick={onClose}>
      <div className="re-detail-panel" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="re-detail-header">
          <h2>Container {cid}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <kbd className="re-esc-hint">ESC</kbd>
            <button className="re-detail-close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="re-detail-body">
          {/* ── Risk summary strip ────────────────────────────────── */}
          <div className="re-detail-risk-bar">
            <div className="score" style={{ color: scoreColor(score) }}>
              {score}
            </div>
            <div className="bar-wrap">
              <div className="explanation">{explMain}</div>
              {drivers.length > 0 && (
                <div className="re-expl-drivers" style={{ marginTop: 6 }}>
                  {drivers.map((d, i) => (
                    <span
                      key={i}
                      className="re-driver-chip"
                      style={{
                        backgroundColor: `${DRIVER_COLORS[i % DRIVER_COLORS.length]}18`,
                        color: DRIVER_COLORS[i % DRIVER_COLORS.length],
                        borderColor: `${DRIVER_COLORS[i % DRIVER_COLORS.length]}30`,
                      }}
                    >
                      {d.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className={`re-risk-pill ${cls}`}>{res.Risk_Level || "--"}</span>
          </div>

          {/* ── All input fields ──────────────────────────────────── */}
          <div className="re-detail-grid">
            {inputHeaders.map((h, i) => (
              <div className="re-detail-field" key={h}>
                <div className="label">{h.replace(/_/g, " ").replace(/\s*\(.*?\)/g, "")}</div>
                <div className="value">{row[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
