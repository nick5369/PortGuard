import { X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

function scoreColor(s) {
  if (s >= 70) return "#dc2626";
  if (s >= 40) return "#ea580c";
  return "#16a34a";
}

function riskClass(level) {
  const l = (level || "").toLowerCase();
  if (l === "high") return "high";
  if (l === "medium") return "medium";
  return "low";
}

export default function RiskDetail({
  rowIndex,
  inputRows,
  inputHeaders,
  results,
  onClose,
}) {
  if (rowIndex == null) return null;

  const row = inputRows[rowIndex];
  const cid = String(row[0]);
  const res = results.find((r) => String(r.Container_ID) === cid) || {};
  const score = Number(res.Risk_Score) || 0;
  const cls = riskClass(res.Risk_Level);

  const compData = results
    .map((r) => ({
      id: String(r.Container_ID).slice(-6),
      score: Number(r.Risk_Score) || 0,
      current: String(r.Container_ID) === cid,
    }))
    .sort((a, b) => a.score - b.score);

  const numericFields = [
    { key: "Declared_Value", idx: 10 },
    { key: "Declared_Weight", idx: 11 },
    { key: "Measured_Weight", idx: 12 },
    { key: "Dwell_Time_Hours", idx: 14 },
  ];

  function normalize(val, idx) {
    const all = inputRows.map((r) => Number(r[idx]) || 0);
    const max = Math.max(...all, 1);
    return ((Number(val) || 0) / max) * 100;
  }

  const radarData = numericFields.map((f) => ({
    field: f.key.replace(/_/g, " "),
    value: normalize(row[f.idx], f.idx),
    avg:
      inputRows.reduce((s, r) => s + normalize(r[f.idx], f.idx), 0) /
      inputRows.length,
  }));

  return (
    <div className="re-detail-overlay" onClick={onClose}>
      <div className="re-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="re-detail-header">
          <h2>Container {cid}</h2>
          <button className="re-detail-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="re-detail-body">
          <div className="re-detail-risk-bar">
            <div className="score" style={{ color: scoreColor(score) }}>
              {score}
            </div>
            <div className="bar-wrap">
              <div className="bar-bg">
                <span
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, score)}%`,
                    backgroundColor: scoreColor(score),
                  }}
                />
              </div>
              <div className="explanation">{res.Explanation_Summary || "--"}</div>
            </div>
            <span className={`re-risk-pill ${cls}`}>{res.Risk_Level || "--"}</span>
          </div>

          <div className="re-detail-grid">
            {inputHeaders.map((h, i) => (
              <div className="re-detail-field" key={h}>
                <div className="label">{h.replace(/_/g, " ")}</div>
                <div className="value">{row[i]}</div>
              </div>
            ))}
          </div>

          <div className="re-charts-grid">
            <div className="re-chart-card">
              <div className="re-chart-title">This Container vs All (Score Comparison)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={compData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                  <XAxis dataKey="id" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={50} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                    {compData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.current ? "#6366f1" : "rgba(150,150,150,0.25)"}
                        stroke={d.current ? "#6366f1" : "none"}
                        strokeWidth={d.current ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="re-chart-card">
              <div className="re-chart-title">Metric Profile (vs Average)</div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(150,150,150,0.2)" />
                  <PolarAngleAxis dataKey="field" tick={{ fontSize: 9 }} />
                  <PolarRadiusAxis tick={{ fontSize: 8 }} domain={[0, 100]} />
                  <Radar
                    name="This Container"
                    dataKey="value"
                    stroke="#6366f1"
                    fill="rgba(99,102,241,0.25)"
                    strokeWidth={2}
                  />
                  <Radar
                    name="Fleet Average"
                    dataKey="avg"
                    stroke="#f59e0b"
                    fill="rgba(245,158,11,0.1)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
