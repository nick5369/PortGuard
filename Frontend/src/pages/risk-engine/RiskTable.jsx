import { TableProperties } from "lucide-react";

function riskClass(level) {
  const l = (level || "").toLowerCase();
  if (l === "high") return "high";
  if (l === "medium") return "medium";
  return "low";
}

function scoreColor(score) {
  const s = Number(score) || 0;
  if (s >= 70) return "#dc2626";
  if (s >= 40) return "#ea580c";
  return "#16a34a";
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
                    <td style={{ whiteSpace: "normal", maxWidth: 260, fontSize: 11 }}>
                      {res.Explanation_Summary || "--"}
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
