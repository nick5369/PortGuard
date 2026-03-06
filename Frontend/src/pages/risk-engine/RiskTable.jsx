import { TableProperties } from "lucide-react";

function riskClass(level) {
  const l = (level || "").toLowerCase();
  if (l === "critical" || l === "high") return "critical";
  if (l === "medium") return "medium";
  return "low";
}

function scoreColor(score) {
  const s = Number(score) || 0;
  if (s >= 70) return "#dc2626";
  if (s >= 40) return "#ea580c";
  return "#16a34a";
}

const DRIVER_COLORS = ["#6366f1", "#f59e0b", "#06b6d4", "#ec4899", "#8b5cf6", "#14b8a6"];

function ExplanationCell({ text }) {
  if (!text) return <span style={{ color: "var(--pg-text-muted)" }}>--</span>;

  // Parse "Classified as Low risk (score 25.2). Primary factors: 1. Feature_A, 2. Feature_B, 3. Feature_C."
  const driverMatch = text.match(
    /(?:Top drivers|Primary factors|unusual patterns in)[:\s]*(.+?)\.?\s*$/i
  );

  if (!driverMatch) {
    return <span>{text}</span>;
  }

  const mainPart = text.slice(0, driverMatch.index).trim();
  const driversRaw = driverMatch[1];
  const drivers = driversRaw
    .split(/,\s*/)
    .map((d) => d.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  return (
    <div className="re-explanation-cell">
      <span className="re-expl-main">{mainPart}</span>
      {drivers.length > 0 && (
        <div className="re-expl-drivers">
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
  );
}

export default function RiskTable({ inputRows, inputHeaders, results, onRowClick }) {
  if (!results || !results.length) return null;

  const resultMap = {};
  results.forEach((r) => {
    resultMap[String(r.Container_ID)] = r;
  });

  return (
    <div className="re-section anim-fadeUp">
      <div className="re-section-head">
        <TableProperties size={18} />
        Analysis Results
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500, color: "var(--pg-text-muted)" }}>
          {results.length} container{results.length > 1 ? "s" : ""} analyzed
        </span>
      </div>
      <div className="re-section-body" style={{ padding: 0 }}>
        <div className="re-result-table-wrap">
          <table className="re-result-table">
            <thead>
              <tr>
                <th>#</th>
                {inputHeaders.map((h) => (
                  <th key={h}>{h.replace(/_/g, " ")}</th>
                ))}
                <th>Risk Score</th>
                <th>Risk Level</th>
                <th>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {inputRows.map((row, i) => {
                const cid = String(row[0]);
                const res = resultMap[cid] || {};
                const cls = riskClass(res.Risk_Level);
                return (
                  <tr key={i} onClick={() => onRowClick(i)}>
                    <td style={{ color: "var(--pg-text-muted)", fontWeight: 700 }}>{i + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                    <td>
                      <span style={{ color: scoreColor(res.Risk_Score), fontWeight: 700 }}>
                        {res.Risk_Score ?? "--"}
                      </span>
                      {res.Risk_Score != null && (
                        <span className="re-score-bar">
                          <span
                            className="re-score-bar-fill"
                            style={{
                              width: `${Math.min(100, Number(res.Risk_Score))}%`,
                              backgroundColor: scoreColor(res.Risk_Score),
                            }}
                          />
                        </span>
                      )}
                    </td>
                    <td>
                      {res.Risk_Level ? (
                        <span className={`re-risk-pill ${cls}`}>{res.Risk_Level}</span>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="re-expl-td">
                      <ExplanationCell text={res.Explanation_Summary} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
