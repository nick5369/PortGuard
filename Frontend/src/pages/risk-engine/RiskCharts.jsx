import { BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  Legend,
} from "recharts";

const PIE_COLORS = ["#16a34a", "#ea580c", "#dc2626"];

function scoreColor(s) {
  if (s >= 70) return "#dc2626";
  if (s >= 40) return "#ea580c";
  return "#16a34a";
}

function buildPieData(results) {
  let low = 0, med = 0, high = 0;
  results.forEach((r) => {
    const l = (r.Risk_Level || "").toLowerCase();
    if (l === "high") high++;
    else if (l === "medium") med++;
    else low++;
  });
  return [
    { name: "Low", value: low },
    { name: "Medium", value: med },
    { name: "High", value: high },
  ].filter((d) => d.value > 0);
}

function buildBarData(results) {
  return results.map((r) => ({
    id: String(r.Container_ID).slice(-6),
    score: Number(r.Risk_Score) || 0,
    fill: scoreColor(Number(r.Risk_Score) || 0),
  }));
}

function buildDistribution(results) {
  const buckets = [
    { range: "0-10", min: 0, max: 10, count: 0 },
    { range: "10-20", min: 10, max: 20, count: 0 },
    { range: "20-30", min: 20, max: 30, count: 0 },
    { range: "30-40", min: 30, max: 40, count: 0 },
    { range: "40-50", min: 40, max: 50, count: 0 },
    { range: "50-60", min: 50, max: 60, count: 0 },
    { range: "60-70", min: 60, max: 70, count: 0 },
    { range: "70-80", min: 70, max: 80, count: 0 },
    { range: "80-90", min: 80, max: 90, count: 0 },
    { range: "90-100", min: 90, max: 100, count: 0 },
  ];
  results.forEach((r) => {
    const s = Number(r.Risk_Score) || 0;
    const b = buckets.find((b) => s >= b.min && s < b.max);
    if (b) b.count++;
    else if (s >= 100) buckets[buckets.length - 1].count++;
  });
  return buckets;
}

function buildScatter(results, inputRows) {
  return results.map((r, i) => {
    const row = inputRows[i] || [];
    return {
      weight: Number(row[11]) || 0,
      value: Number(row[10]) || 0,
      score: Number(r.Risk_Score) || 0,
      fill: scoreColor(Number(r.Risk_Score) || 0),
    };
  });
}

export default function RiskCharts({ results, inputRows }) {
  if (!results || !results.length) return null;

  const pieData = buildPieData(results);
  const barData = buildBarData(results);
  const distData = buildDistribution(results);
  const scatterData = buildScatter(results, inputRows);

  const avgScore = (
    results.reduce((s, r) => s + (Number(r.Risk_Score) || 0), 0) / results.length
  ).toFixed(1);
  const maxScore = Math.max(...results.map((r) => Number(r.Risk_Score) || 0)).toFixed(1);
  const lowCount = results.filter((r) => (r.Risk_Level || "").toLowerCase() === "low").length;
  const highCount = results.filter(
    (r) => (r.Risk_Level || "").toLowerCase() === "high" || (r.Risk_Level || "").toLowerCase() === "medium"
  ).length;

  return (
    <div className="re-section anim-fadeUp">
      <div className="re-section-head">
        <BarChart3 size={18} />
        Graphical Analysis
      </div>
      <div className="re-section-body">
        <div className="re-summary-row">
          <div className="re-summary-card">
            <div className="re-summary-val" style={{ color: "#16a34a" }}>{results.length}</div>
            <div className="re-summary-label">Total Analyzed</div>
          </div>
          <div className="re-summary-card">
            <div className="re-summary-val" style={{ color: scoreColor(Number(avgScore)) }}>{avgScore}</div>
            <div className="re-summary-label">Avg Risk Score</div>
          </div>
          <div className="re-summary-card">
            <div className="re-summary-val" style={{ color: "#dc2626" }}>{maxScore}</div>
            <div className="re-summary-label">Highest Score</div>
          </div>
          <div className="re-summary-card">
            <div className="re-summary-val" style={{ color: lowCount > highCount ? "#16a34a" : "#ea580c" }}>
              {((lowCount / results.length) * 100).toFixed(0)}%
            </div>
            <div className="re-summary-label">Low Risk Rate</div>
          </div>
        </div>

        <div className="re-charts-grid">
          <div className="re-chart-card">
            <div className="re-chart-title">Risk Level Distribution</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="re-chart-card">
            <div className="re-chart-title">Score Distribution</div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={distData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  fill="rgba(99,102,241,0.2)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="re-chart-card full">
            <div className="re-chart-title">Risk Score per Container</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                <XAxis dataKey="id" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {barData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="re-chart-card full">
            <div className="re-chart-title">Declared Value vs Weight (colored by risk)</div>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                <XAxis dataKey="weight" name="Weight" tick={{ fontSize: 10 }} />
                <YAxis dataKey="value" name="Value" tick={{ fontSize: 10 }} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatterData}>
                  {scatterData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
