import { useState, useMemo, memo } from "react";
import {
  BarChart3,
  PieChart as PieIcon,
  Globe,
  Weight,
  Layers,
} from "lucide-react";
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  Line,
} from "recharts";

/* ── Professional analytics palette ─────────────────────────────────────── */
const C = {
  // Risk signal colors — desaturated, refined
  green:   "#22c55e",   // safe / low risk
  orange:  "#f97316",   // medium risk
  red:     "#ef4444",   // critical / high risk

  // Primary accent — deep blue-indigo
  indigo:  "#6366f1",

  // Supporting data colors — muted & professional
  amber:   "#eab308",
  cyan:    "#22d3ee",
  pink:    "#f472b6",
  violet:  "#a78bfa",
  teal:    "#2dd4bf",
  rose:    "#fb7185",
  sky:     "#38bdf8",
  lime:    "#a3e635",
  fuchsia: "#c084fc",
  emerald: "#34d399",
  slate:   "#94a3b8",
  blue:    "#60a5fa",
};

/* ── Multi-series palette — ordered for max contrast between adjacent bars ── */
const MULTI = [
  "#6366f1",  // indigo
  "#22d3ee",  // cyan
  "#a78bfa",  // violet
  "#38bdf8",  // sky
  "#2dd4bf",  // teal
  "#f472b6",  // pink
  "#60a5fa",  // blue
  "#34d399",  // emerald
  "#eab308",  // amber
  "#c084fc",  // fuchsia
  "#fb7185",  // rose
  "#a3e635",  // lime
  "#f97316",  // orange
  "#94a3b8",  // slate
];

/* ── Grid & axis style constants ─────────────────────────────────────────── */
const GRID_COLOR  = "rgba(148,163,184,0.12)";   // very subtle slate grid
const AXIS_STYLE  = { fontSize: 10, fill: "#94a3b8" };
const AXIS_STYLE9 = { fontSize: 9,  fill: "#94a3b8" };
const AXIS_STYLE11= { fontSize: 11, fill: "#94a3b8" };

function scoreColor(s) {
  if (s >= 70) return C.red;
  if (s >= 40) return C.orange;
  return C.green;
}

function riskColor(level) {
  const l = (level || "").toLowerCase();
  if (l === "critical" || l === "high") return C.red;
  if (l === "medium") return C.orange;
  return C.green;
}

/* ── Performance limits ────────────────────────────────────────────────── */
const MAX_BARS = 150;    // cap per-container bar chart entries
const MAX_SCATTER = 300; // cap scatter plot points

// Returns top-N entries sorted by risk score descending (highest risk first)
function topByScore(arr, max, scoreKey = "score") {
  if (arr.length <= max) return arr;
  return [...arr].sort((a, b) => b[scoreKey] - a[scoreKey]).slice(0, max);
}

// For scatter: keep ALL high-risk points + sample the rest to fill up to max
function topScatter(arr, max, scoreKey = "score") {
  if (arr.length <= max) return arr;
  const high = arr.filter((d) => d[scoreKey] >= 70);
  const rest = arr.filter((d) => d[scoreKey] < 70);
  const remaining = Math.max(0, max - high.length);
  const step = rest.length / remaining;
  const sampledRest = remaining > 0
    ? Array.from({ length: remaining }, (_, i) => rest[Math.floor(i * step)])
    : [];
  return [...high, ...sampledRest];
}

/* ── COLUMN INDEXES in inputRows ────────────────────────────────────────── */
const IDX = {
  CONTAINER_ID: 0, DATE: 1, TIME: 2, TRADE_REGIME: 3, ORIGIN: 4,
  DEST_PORT: 5, DEST_COUNTRY: 6, HS_CODE: 7, IMPORTER: 8, EXPORTER: 9,
  VALUE: 10, DEC_WEIGHT: 11, MEAS_WEIGHT: 12, SHIPPING: 13, DWELL: 14,
};

/* ── Data builders ──────────────────────────────────────────────────────── */

function buildPieData(results) {
  let low = 0, med = 0, critical = 0;
  results.forEach((r) => {
    const l = (r.Risk_Level || "").toLowerCase();
    if (l === "critical" || l === "high") critical++;
    else if (l === "medium") med++;
    else low++;
  });
  return [
    { name: "Low", value: low },
    { name: "Medium", value: med },
    { name: "Critical", value: critical },
  ].filter((d) => d.value > 0);
}

function buildDistribution(results) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${(i + 1) * 10}`,
    min: i * 10, max: (i + 1) * 10, count: 0,
  }));
  results.forEach((r) => {
    const s = Number(r.Risk_Score) || 0;
    const idx = Math.min(Math.floor(s / 10), 9);
    buckets[idx].count++;
  });
  return buckets;
}

function buildBarData(results) {
  return results.map((r) => ({
    id: String(r.Container_ID).slice(-6),
    fullId: String(r.Container_ID),
    score: Number(r.Risk_Score) || 0,
    fill: scoreColor(Number(r.Risk_Score) || 0),
  }));
}

function buildTop10(results) {
  return [...results]
    .map((r) => ({
      id: String(r.Container_ID).slice(-6),
      score: Number(r.Risk_Score) || 0,
      level: r.Risk_Level || "Low",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function buildGroupedAvg(results, inputRows, colIdx) {
  const groups = {};
  results.forEach((r, i) => {
    const row = inputRows[i] || [];
    const key = row[colIdx] || "Unknown";
    if (!groups[key]) groups[key] = { sum: 0, count: 0, low: 0, med: 0, crit: 0 };
    groups[key].sum += Number(r.Risk_Score) || 0;
    groups[key].count++;
    const l = (r.Risk_Level || "").toLowerCase();
    if (l === "critical" || l === "high") groups[key].crit++;
    else if (l === "medium") groups[key].med++;
    else groups[key].low++;
  });
  return Object.entries(groups)
    .map(([name, g]) => ({
      name, avg: Number((g.sum / g.count).toFixed(1)), count: g.count,
      low: g.low, medium: g.med, critical: g.crit,
    }))
    .sort((a, b) => b.avg - a.avg);
}

function buildScatter(results, inputRows) {
  return results.map((r, i) => {
    const row = inputRows[i] || [];
    return {
      weight: Number(row[IDX.DEC_WEIGHT]) || 0,
      value: Number(row[IDX.VALUE]) || 0,
      score: Number(r.Risk_Score) || 0,
      fill: scoreColor(Number(r.Risk_Score) || 0),
    };
  });
}

function buildWeightDiscrepancy(results, inputRows) {
  return results.map((r, i) => {
    const row = inputRows[i] || [];
    const decW = Number(row[IDX.DEC_WEIGHT]) || 0;
    const measW = Number(row[IDX.MEAS_WEIGHT]) || 0;
    const diff = measW - decW;
    return {
      id: String(r.Container_ID).slice(-6),
      declared: decW, measured: measW,
      diff: Number(diff.toFixed(2)),
      pct: decW > 0 ? Number(((diff / decW) * 100).toFixed(1)) : 0,
      fill: diff > 0 ? C.amber : diff < 0 ? C.cyan : C.green,
    };
  });
}

function buildDwellVsRisk(results, inputRows) {
  return results.map((r, i) => ({
    dwell: Number((inputRows[i] || [])[IDX.DWELL]) || 0,
    score: Number(r.Risk_Score) || 0,
    fill: scoreColor(Number(r.Risk_Score) || 0),
  }));
}

function buildValueVsRisk(results, inputRows) {
  return results.map((r, i) => ({
    value: Number((inputRows[i] || [])[IDX.VALUE]) || 0,
    score: Number(r.Risk_Score) || 0,
    fill: scoreColor(Number(r.Risk_Score) || 0),
  }));
}

function buildHsCategory(results, inputRows) {
  const groups = {};
  results.forEach((r, i) => {
    const hs = String((inputRows[i] || [])[IDX.HS_CODE] || "").slice(0, 2) || "??";
    if (!groups[hs]) groups[hs] = { sum: 0, count: 0 };
    groups[hs].sum += Number(r.Risk_Score) || 0;
    groups[hs].count++;
  });
  return Object.entries(groups)
    .map(([name, g]) => ({
      name: `HS-${name}`, avg: Number((g.sum / g.count).toFixed(1)), count: g.count,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 15);
}

function buildRiskRadar(results) {
  const scores = results.map((r) => Number(r.Risk_Score) || 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const med = [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)];
  const stddev = Math.sqrt(scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length);
  return [
    { metric: "Average", value: Number(avg.toFixed(1)), fullMark: 100 },
    { metric: "Maximum", value: Number(max.toFixed(1)), fullMark: 100 },
    { metric: "Minimum", value: Number(min.toFixed(1)), fullMark: 100 },
    { metric: "Median", value: Number(med.toFixed(1)), fullMark: 100 },
    { metric: "Std Dev", value: Number(stddev.toFixed(1)), fullMark: 100 },
    { metric: "Spread", value: Number((max - min).toFixed(1)), fullMark: 100 },
  ];
}

function buildDwellBuckets(results, inputRows) {
  const buckets = [
    { range: "0-12h", min: 0, max: 12, low: 0, med: 0, crit: 0 },
    { range: "12-24h", min: 12, max: 24, low: 0, med: 0, crit: 0 },
    { range: "24-48h", min: 24, max: 48, low: 0, med: 0, crit: 0 },
    { range: "48-72h", min: 48, max: 72, low: 0, med: 0, crit: 0 },
    { range: "72h+", min: 72, max: Infinity, low: 0, med: 0, crit: 0 },
  ];
  results.forEach((r, i) => {
    const dwell = Number((inputRows[i] || [])[IDX.DWELL]) || 0;
    const b = buckets.find((b) => dwell >= b.min && dwell < b.max) || buckets[4];
    const l = (r.Risk_Level || "").toLowerCase();
    if (l === "critical" || l === "high") b.crit++;
    else if (l === "medium") b.med++;
    else b.low++;
  });
  return buckets;
}

/* ── Chart tab definitions ──────────────────────────────────────────────── */
const TABS = [
  { id: "overview", label: "Overview", icon: PieIcon },
  { id: "containers", label: "Containers", icon: BarChart3 },
  { id: "geography", label: "Geography & Trade", icon: Globe },
  { id: "weight", label: "Weight & Value", icon: Weight },
  { id: "deep", label: "Deep Dive", icon: Layers },
];

/* ── Custom Tooltip (memoized to avoid re-creation on every render) ────── */
const CustomTooltip = memo(function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="re-custom-tooltip">
      {label && <div className="re-tt-label">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="re-tt-row">
          <span className="re-tt-dot" style={{ background: p.color || p.fill || C.indigo }} />
          <span>{p.name || p.dataKey}: </span>
          <strong>{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */
export default function RiskCharts({ results, inputRows }) {
  const [activeTab, setActiveTab] = useState("overview");

  if (!results || !results.length) return null;

  /* ── Summary stats (always needed, cheap) ───────────────────────────── */
  const { avgScore, maxScore, minScore, lowCount, medCount, critCount } = useMemo(() => {
    const scores = results.map((r) => Number(r.Risk_Score) || 0);
    const sum = scores.reduce((a, b) => a + b, 0);
    return {
      avgScore: (sum / scores.length).toFixed(1),
      maxScore: Math.max(...scores).toFixed(1),
      minScore: Math.min(...scores).toFixed(1),
      lowCount: results.filter((r) => (r.Risk_Level || "").toLowerCase() === "low").length,
      medCount: results.filter((r) => (r.Risk_Level || "").toLowerCase() === "medium").length,
      critCount: results.filter((r) => { const l = (r.Risk_Level || "").toLowerCase(); return l === "critical" || l === "high"; }).length,
    };
  }, [results]);

  /* ── Overview tab data ───────────────────────────────────────────────── */
  const overviewData = useMemo(() => ({
    pieData: buildPieData(results),
    distData: buildDistribution(results),
    radarData: buildRiskRadar(results),
  }), [results]);

  /* ── Containers tab data (top MAX_BARS by risk score) ──────────────────── */
  const containersData = useMemo(() => {
    const barData = topByScore(buildBarData(results), MAX_BARS);
    const top10 = buildTop10(results);
    const dwellBuckets = buildDwellBuckets(results, inputRows);
    return { barData, top10, dwellBuckets };
  }, [results, inputRows]);

  /* ── Geography tab data ──────────────────────────────────────────────── */
  const geoData = useMemo(() => ({
    byOrigin: buildGroupedAvg(results, inputRows, IDX.ORIGIN),
    byPort: buildGroupedAvg(results, inputRows, IDX.DEST_PORT),
    byRegime: buildGroupedAvg(results, inputRows, IDX.TRADE_REGIME),
    byShipping: buildGroupedAvg(results, inputRows, IDX.SHIPPING),
    byCountry: buildGroupedAvg(results, inputRows, IDX.DEST_COUNTRY),
  }), [results, inputRows]);

  /* ── Weight & Value tab data (high-risk preserved) ─────────────────── */
  const weightData = useMemo(() => {
    // Weight discrepancy: worst anomalies first
    const allDiscrep = buildWeightDiscrepancy(results, inputRows);
    const weightDiscrep = allDiscrep.length > MAX_BARS
      ? [...allDiscrep].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, MAX_BARS)
      : allDiscrep;
    const scatterData = topScatter(buildScatter(results, inputRows), MAX_SCATTER);
    const dwellVsRisk = topScatter(buildDwellVsRisk(results, inputRows), MAX_SCATTER);
    return { weightDiscrep, scatterData, dwellVsRisk };
  }, [results, inputRows]);

  /* ── Deep Dive tab data (high-risk preserved) ────────────────────────── */
  const deepData = useMemo(() => {
    const valueVsRisk = topScatter(buildValueVsRisk(results, inputRows), MAX_SCATTER);
    const hsData = buildHsCategory(results, inputRows);
    // Composed chart: top by risk score so most dangerous containers visible
    const allComposed = results.map((r, i) => ({
      id: String(r.Container_ID).slice(-6),
      score: Number(r.Risk_Score) || 0,
      dwell: Number((inputRows[i] || [])[IDX.DWELL]) || 0,
    }));
    const composedData = topByScore(allComposed, MAX_BARS);
    // Weight discrepancy %: worst anomalies first
    const allDiscrep2 = buildWeightDiscrepancy(results, inputRows);
    const weightDiscrep = allDiscrep2.length > MAX_BARS
      ? [...allDiscrep2].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, MAX_BARS)
      : allDiscrep2;
    return { valueVsRisk, hsData, composedData, weightDiscrep };
  }, [results, inputRows]);

  return (
    <div className="re-section anim-fadeUp">
      <div className="re-section-head">
        <BarChart3 size={18} />
        Graphical Analysis
      </div>
      <div className="re-section-body" style={{ padding: 0 }}>
        {/* Sub-tab navigation */}
        <div className="re-chart-tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                className={`re-chart-tab ${activeTab === t.id ? "active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="re-chart-panel">

          {/* ═══════════ OVERVIEW ═══════════ */}
          {activeTab === "overview" && (
            <>
              <div className="re-summary-row">
                <div className="re-summary-card"><div className="re-summary-val" style={{color:C.indigo}}>{results.length}</div><div className="re-summary-label">Total Analyzed</div></div>
                <div className="re-summary-card"><div className="re-summary-val" style={{color:scoreColor(Number(avgScore))}}>{avgScore}</div><div className="re-summary-label">Avg Score</div></div>
                <div className="re-summary-card"><div className="re-summary-val" style={{color:C.red}}>{maxScore}</div><div className="re-summary-label">Highest</div></div>
                <div className="re-summary-card"><div className="re-summary-val" style={{color:C.green}}>{minScore}</div><div className="re-summary-label">Lowest</div></div>
                <div className="re-summary-card"><div className="re-summary-val" style={{color:C.green}}>{lowCount}</div><div className="re-summary-label">Low</div></div>
                <div className="re-summary-card"><div className="re-summary-val" style={{color:C.orange}}>{medCount}</div><div className="re-summary-label">Medium</div></div>
                <div className="re-summary-card"><div className="re-summary-val" style={{color:C.red}}>{critCount}</div><div className="re-summary-label">Critical</div></div>
                <div className="re-summary-card"><div className="re-summary-val" style={{color:lowCount > medCount + critCount ? C.green : C.orange}}>{((lowCount / results.length) * 100).toFixed(0)}%</div><div className="re-summary-label">Low Rate</div></div>
              </div>
              <div className="re-charts-grid">
                <div className="re-chart-card">
                  <div className="re-chart-title">Risk Level Distribution</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={overviewData.pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={4} dataKey="value" label={({name,value})=>`${name}: ${value}`} isAnimationActive={false}>
                        {overviewData.pieData.map((entry,i)=>(<Cell key={i} fill={entry.name==="Low"?C.green:entry.name==="Medium"?C.orange:C.red}/>))}
                      </Pie>
                      <Tooltip content={<CustomTooltip/>}/><Legend/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="re-chart-card">
                  <div className="re-chart-title">Score Distribution</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={overviewData.distData}>
                      <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.indigo} stopOpacity={0.35}/><stop offset="100%" stopColor={C.indigo} stopOpacity={0.0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                      <XAxis dataKey="range" tick={AXIS_STYLE}/><YAxis allowDecimals={false} tick={AXIS_STYLE}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Area type="monotone" dataKey="count" stroke={C.indigo} fill="url(#areaGrad)" strokeWidth={2.5} isAnimationActive={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="re-chart-card full">
                  <div className="re-chart-title">Risk Score Statistics</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={overviewData.radarData}>
                      <PolarGrid stroke={GRID_COLOR}/>
                      <PolarAngleAxis dataKey="metric" tick={{fontSize:11,fill:C.slate}}/>
                      <PolarRadiusAxis tick={{fontSize:9,fill:C.slate}} domain={[0,100]}/>
                      <Radar name="Score Stats" dataKey="value" stroke={C.indigo} fill={`${C.indigo}25`} strokeWidth={2}/>
                      <Tooltip content={<CustomTooltip/>}/><Legend/>
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* ═══════════ CONTAINERS ═══════════ */}
          {activeTab === "containers" && (
            <div className="re-charts-grid">
              <div className="re-chart-card full">
                <div className="re-chart-title">Risk Score per Container {results.length > MAX_BARS && <span style={{fontSize:11,opacity:0.6}}>(Top {MAX_BARS} highest risk of {results.length})</span>}</div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={containersData.barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="id" tick={AXIS_STYLE9} interval={0} angle={-40} textAnchor="end" height={55}/>
                    <YAxis domain={[0,100]} tick={AXIS_STYLE}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="score" radius={[4,4,0,0]} name="Score" isAnimationActive={false}>{containersData.barData.map((d,i)=>(<Cell key={i} fill={d.fill}/>))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card full">
                <div className="re-chart-title">Top 10 Riskiest Containers</div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={containersData.top10} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis type="number" domain={[0,100]} tick={AXIS_STYLE}/>
                    <YAxis type="category" dataKey="id" tick={AXIS_STYLE} width={60}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="score" radius={[0,4,4,0]} name="Score" isAnimationActive={false}>{containersData.top10.map((d,i)=>(<Cell key={i} fill={riskColor(d.level)}/>))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card full">
                <div className="re-chart-title">Risk Levels by Dwell Time Range</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={containersData.dwellBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="range" tick={AXIS_STYLE}/><YAxis allowDecimals={false} tick={AXIS_STYLE}/>
                    <Tooltip content={<CustomTooltip/>}/><Legend/>
                    <Bar dataKey="low" stackId="a" fill={C.green} name="Low" isAnimationActive={false}/>
                    <Bar dataKey="med" stackId="a" fill={C.orange} name="Medium" isAnimationActive={false}/>
                    <Bar dataKey="crit" stackId="a" fill={C.red} name="Critical" radius={[4,4,0,0]} isAnimationActive={false}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ═══════════ GEOGRAPHY & TRADE ═══════════ */}
          {activeTab === "geography" && (
            <div className="re-charts-grid">
              <div className="re-chart-card">
                <div className="re-chart-title">Avg Score by Origin Country</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={geoData.byOrigin.slice(0,12)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis type="number" domain={[0,100]} tick={AXIS_STYLE}/>
                    <YAxis type="category" dataKey="name" tick={AXIS_STYLE} width={50}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="avg" radius={[0,4,4,0]} name="Avg Score" isAnimationActive={false}>{geoData.byOrigin.slice(0,12).map((d,i)=>(<Cell key={i} fill={MULTI[i%MULTI.length]}/>))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card">
                <div className="re-chart-title">Avg Score by Destination Port</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={geoData.byPort.slice(0,12)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis type="number" domain={[0,100]} tick={AXIS_STYLE}/>
                    <YAxis type="category" dataKey="name" tick={AXIS_STYLE} width={70}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="avg" radius={[0,4,4,0]} name="Avg Score" isAnimationActive={false}>{geoData.byPort.slice(0,12).map((d,i)=>(<Cell key={i} fill={MULTI[(i+3)%MULTI.length]}/>))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card">
                <div className="re-chart-title">Risk Breakdown by Trade Regime</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={geoData.byRegime}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="name" tick={AXIS_STYLE11}/><YAxis allowDecimals={false} tick={AXIS_STYLE}/>
                    <Tooltip content={<CustomTooltip/>}/><Legend/>
                    <Bar dataKey="low" stackId="a" fill={C.green} name="Low" isAnimationActive={false}/>
                    <Bar dataKey="medium" stackId="a" fill={C.orange} name="Medium" isAnimationActive={false}/>
                    <Bar dataKey="critical" stackId="a" fill={C.red} name="Critical" radius={[4,4,0,0]} isAnimationActive={false}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card">
                <div className="re-chart-title">Avg Score by Shipping Line</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={geoData.byShipping.slice(0,10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="name" tick={AXIS_STYLE9} interval={0} angle={-30} textAnchor="end" height={50}/>
                    <YAxis domain={[0,100]} tick={AXIS_STYLE}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="avg" radius={[4,4,0,0]} name="Avg Score" isAnimationActive={false}>{geoData.byShipping.slice(0,10).map((d,i)=>(<Cell key={i} fill={MULTI[(i+5)%MULTI.length]}/>))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card full">
                <div className="re-chart-title">Risk Breakdown by Destination Country</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={geoData.byCountry.slice(0,15)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="name" tick={AXIS_STYLE} interval={0}/>
                    <YAxis allowDecimals={false} tick={AXIS_STYLE}/>
                    <Tooltip content={<CustomTooltip/>}/><Legend/>
                    <Bar dataKey="low" stackId="a" fill={C.green} name="Low" isAnimationActive={false}/>
                    <Bar dataKey="medium" stackId="a" fill={C.orange} name="Medium" isAnimationActive={false}/>
                    <Bar dataKey="critical" stackId="a" fill={C.red} name="Critical" radius={[4,4,0,0]} isAnimationActive={false}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ═══════════ WEIGHT & VALUE ═══════════ */}
          {activeTab === "weight" && (
            <div className="re-charts-grid">
              <div className="re-chart-card">
                <div className="re-chart-title">Declared Value vs Weight {results.length > MAX_SCATTER && <span style={{fontSize:11,opacity:0.6}}>(All high-risk + sample, {MAX_SCATTER} shown)</span>}</div>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="weight" name="Weight" tick={AXIS_STYLE}/>
                    <YAxis dataKey="value" name="Value" tick={AXIS_STYLE}/>
                    <Tooltip cursor={{strokeDasharray:"3 3"}} content={<CustomTooltip/>}/>
                    <Scatter data={weightData.scatterData} name="Containers" isAnimationActive={false}>{weightData.scatterData.map((d,i)=>(<Cell key={i} fill={d.fill}/>))}</Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card">
                <div className="re-chart-title">Dwell Time vs Risk Score {results.length > MAX_SCATTER && <span style={{fontSize:11,opacity:0.6}}>(All high-risk + sample, {MAX_SCATTER} shown)</span>}</div>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="dwell" name="Dwell (hrs)" tick={AXIS_STYLE}/>
                    <YAxis dataKey="score" name="Risk Score" domain={[0,100]} tick={AXIS_STYLE}/>
                    <Tooltip cursor={{strokeDasharray:"3 3"}} content={<CustomTooltip/>}/>
                    <Scatter data={weightData.dwellVsRisk} name="Containers" isAnimationActive={false}>{weightData.dwellVsRisk.map((d,i)=>(<Cell key={i} fill={d.fill}/>))}</Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card full">
                <div className="re-chart-title">Weight Discrepancy (Measured − Declared) per Container {results.length > MAX_BARS && <span style={{fontSize:11,opacity:0.6}}>(Top {MAX_BARS} worst anomalies of {results.length})</span>}</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={weightData.weightDiscrep}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="id" tick={AXIS_STYLE9} interval={0} angle={-40} textAnchor="end" height={55}/>
                    <YAxis tick={AXIS_STYLE}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="diff" radius={[4,4,0,0]} name="Difference" isAnimationActive={false}>{weightData.weightDiscrep.map((d,i)=>(<Cell key={i} fill={d.fill}/>))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card full">
                <div className="re-chart-title">Declared vs Measured Weight</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={weightData.weightDiscrep}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="id" tick={AXIS_STYLE9} interval={0} angle={-40} textAnchor="end" height={55}/>
                    <YAxis tick={AXIS_STYLE}/>
                    <Tooltip content={<CustomTooltip/>}/><Legend/>
                    <Bar dataKey="declared" fill={C.sky} name="Declared" radius={[4,4,0,0]} isAnimationActive={false}/>
                    <Bar dataKey="measured" fill={C.violet} name="Measured" radius={[4,4,0,0]} isAnimationActive={false}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ═══════════ DEEP DIVE ═══════════ */}
          {activeTab === "deep" && (
            <div className="re-charts-grid">
              <div className="re-chart-card">
                <div className="re-chart-title">Declared Value vs Risk Score {results.length > MAX_SCATTER && <span style={{fontSize:11,opacity:0.6}}>(All high-risk + sample, {MAX_SCATTER} shown)</span>}</div>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="value" name="Value" tick={AXIS_STYLE}/>
                    <YAxis dataKey="score" name="Risk Score" domain={[0,100]} tick={AXIS_STYLE}/>
                    <Tooltip cursor={{strokeDasharray:"3 3"}} content={<CustomTooltip/>}/>
                    <Scatter data={deepData.valueVsRisk} name="Containers" isAnimationActive={false}>{deepData.valueVsRisk.map((d,i)=>(<Cell key={i} fill={d.fill}/>))}</Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card">
                <div className="re-chart-title">Avg Score by HS Code Category</div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={deepData.hsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="name" tick={AXIS_STYLE9} interval={0} angle={-35} textAnchor="end" height={50}/>
                    <YAxis domain={[0,100]} tick={AXIS_STYLE}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="avg" radius={[4,4,0,0]} name="Avg Score" isAnimationActive={false}>{deepData.hsData.map((d,i)=>(<Cell key={i} fill={MULTI[(i+2)%MULTI.length]}/>))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card full">
                <div className="re-chart-title">Risk Score & Dwell Time per Container {results.length > MAX_BARS && <span style={{fontSize:11,opacity:0.6}}>(Top {MAX_BARS} highest risk of {results.length})</span>}</div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={deepData.composedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="id" tick={AXIS_STYLE9} interval={0} angle={-40} textAnchor="end" height={55}/>
                    <YAxis yAxisId="left" domain={[0,100]} tick={AXIS_STYLE} label={{value:"Risk Score",angle:-90,position:"insideLeft",fontSize:10,fill:C.indigo}}/>
                    <YAxis yAxisId="right" orientation="right" tick={AXIS_STYLE} label={{value:"Dwell (hrs)",angle:90,position:"insideRight",fontSize:10,fill:C.amber}}/>
                    <Tooltip content={<CustomTooltip/>}/><Legend/>
                    <Bar yAxisId="left" dataKey="score" fill={`${C.indigo}55`} name="Risk Score" radius={[4,4,0,0]} isAnimationActive={false}/>
                    <Line yAxisId="right" type="monotone" dataKey="dwell" stroke={C.amber} strokeWidth={2.5} dot={false} name="Dwell Time" isAnimationActive={false}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="re-chart-card full">
                <div className="re-chart-title">Weight Discrepancy % per Container {results.length > MAX_BARS && <span style={{fontSize:11,opacity:0.6}}>(Top {MAX_BARS} worst anomalies of {results.length})</span>}</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={deepData.weightDiscrep}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR}/>
                    <XAxis dataKey="id" tick={AXIS_STYLE9} interval={0} angle={-40} textAnchor="end" height={55}/>
                    <YAxis tick={AXIS_STYLE} tickFormatter={(v)=>`${v}%`}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="pct" radius={[4,4,0,0]} name="Discrepancy %" isAnimationActive={false}>{deepData.weightDiscrep.map((d,i)=>(<Cell key={i} fill={Math.abs(d.pct)>10?C.red:Math.abs(d.pct)>5?C.amber:C.teal}/>))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

