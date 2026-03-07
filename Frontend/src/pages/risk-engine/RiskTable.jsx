import { useState, useMemo, useRef, useEffect } from "react";
import {
  TableProperties,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  SlidersHorizontal,
  Eye,
} from "lucide-react";

/* ── Helpers ──────────────────────────────────────────────────────────── */
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

function shortLabel(h) {
  return h.replace(/_/g, " ").replace(/\s*\(.*?\)/g, "");
}

const PAGE_SIZES = [10, 25, 50, 100];

/* ── Explanation Cell ─────────────────────────────────────────────────── */
function ExplanationCell({ text }) {
  if (!text) return <span style={{ color: "var(--pg-text-muted)" }}>--</span>;
  const m = text.match(/(?:Top drivers|Primary factors|unusual patterns in)[:\s]*(.+?)\.?\s*$/i);
  if (!m) return <span>{text}</span>;
  const mainPart = text.slice(0, m.index).trim();
  const drivers = m[1].split(/,\s*/).map((d) => d.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  return (
    <div className="re-explanation-cell">
      <span className="re-expl-main">{mainPart}</span>
      {drivers.length > 0 && (
        <div className="re-expl-drivers">
          {drivers.map((d, i) => (
            <span key={i} className="re-driver-chip" style={{
              backgroundColor: `${DRIVER_COLORS[i % DRIVER_COLORS.length]}18`,
              color: DRIVER_COLORS[i % DRIVER_COLORS.length],
              borderColor: `${DRIVER_COLORS[i % DRIVER_COLORS.length]}30`,
            }}>{d.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function RiskTable({ inputRows, inputHeaders, results, onRowClick }) {
  if (!results || !results.length) return null;

  /* ── State ──────────────────────────────────────────────────────────── */
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [colFilters, setColFilters] = useState([]);          // [{col,value}]

  const filterRef = useRef(null);

  /* close dropdowns on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilters(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* reset page when any filter changes */
  useEffect(() => { setPage(0); }, [search, riskFilter, colFilters, pageSize]);

  /* ── Result map ─────────────────────────────────────────────────────── */
  const resultMap = useMemo(() => {
    const m = {};
    results.forEach((r) => { m[String(r.Container_ID)] = r; });
    return m;
  }, [results]);

  /* ── Filter + Search (runs over ALL columns, even those not displayed) */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return inputRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => {
        const cid = String(row[0]);
        const res = resultMap[cid] || {};

        /* risk level */
        if (riskFilter !== "all" && riskClass(res.Risk_Level) !== riskFilter) return false;

        /* column filters */
        for (const cf of colFilters) {
          if (!cf.value.trim()) continue;
          if (!String(row[cf.col] || "").toLowerCase().includes(cf.value.toLowerCase())) return false;
        }

        /* global search across ALL input + output columns */
        if (q) {
          const blob = [...row.map(String), res.Risk_Score ?? "", res.Risk_Level ?? "", res.Explanation_Summary ?? ""]
            .join("\x00").toLowerCase();
          if (!blob.includes(q)) return false;
        }

        return true;
      });
  }, [inputRows, resultMap, search, riskFilter, colFilters]);

  /* ── Pagination math ────────────────────────────────────────────────── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function pageRange() {
    const max = 5;
    let s = Math.max(0, safePage - Math.floor(max / 2));
    let e = Math.min(totalPages, s + max);
    if (e - s < max) s = Math.max(0, e - max);
    const r = [];
    for (let i = s; i < e; i++) r.push(i);
    return r;
  }

  /* ── Column-filter CRUD ─────────────────────────────────────────────── */
  const addFilter = () => setColFilters((p) => [...p, { col: 0, value: "" }]);
  const updFilter = (i, k, v) => setColFilters((p) => p.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const delFilter = (i) => setColFilters((p) => p.filter((_, j) => j !== i));

  const badgeCount = colFilters.filter((f) => f.value.trim()).length + (riskFilter !== "all" ? 1 : 0);

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="re-section anim-fadeUp">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="re-section-head">
        <TableProperties size={18} />
        Analysis Results
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500, color: "var(--pg-text-muted)" }}>
          {filtered.length === inputRows.length
            ? `${results.length} container${results.length > 1 ? "s" : ""} analyzed`
            : `${filtered.length} of ${results.length} shown`}
        </span>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="re-table-toolbar">
        {/* Search */}
        <div className="re-search-box">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search across all columns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="re-search-clear" onClick={() => setSearch("")}><X size={12} /></button>
          )}
        </div>

        {/* Risk level pills */}
        <div className="re-risk-filters">
          {["all", "low", "medium", "critical"].map((lv) => (
            <button
              key={lv}
              className={`re-rf-btn ${lv}${riskFilter === lv ? " active" : ""}`}
              onClick={() => setRiskFilter(lv)}
            >
              {lv === "all" ? "All" : lv[0].toUpperCase() + lv.slice(1)}
            </button>
          ))}
        </div>

        {/* Filters dropdown */}
        <div className="re-tb-drop" ref={filterRef}>
          <button
            className={`re-tb-btn${badgeCount ? " has-badge" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal size={14} />
            <span className="re-tb-btn-label">Filters</span>
            {badgeCount > 0 && <span className="re-badge">{badgeCount}</span>}
          </button>
          {showFilters && (
            <div className="re-drop-panel">
              <div className="re-drop-title">Column Filters</div>
              <div className="re-drop-hint">Filter by any column — even those not shown in the table</div>
              {colFilters.map((cf, i) => (
                <div key={i} className="re-cf-row">
                  <select value={cf.col} onChange={(e) => updFilter(i, "col", +e.target.value)}>
                    {inputHeaders.map((h, hi) => (
                      <option key={hi} value={hi}>{shortLabel(h)}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="contains..."
                    value={cf.value}
                    onChange={(e) => updFilter(i, "value", e.target.value)}
                    autoFocus
                  />
                  <button className="re-cf-del" onClick={() => delFilter(i)}><X size={12} /></button>
                </div>
              ))}
              <button className="re-add-cf" onClick={addFilter}>+ Add filter</button>
              {colFilters.length > 0 && (
                <button className="re-clear-cf" onClick={() => setColFilters([])}>Clear all</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Active filter chips (below toolbar) ──────────────────────── */}
      {(riskFilter !== "all" || colFilters.some((f) => f.value.trim())) && (
        <div className="re-active-filters">
          {riskFilter !== "all" && (
            <span className={`re-af-chip ${riskFilter}`}>
              Risk: {riskFilter[0].toUpperCase() + riskFilter.slice(1)}
              <button onClick={() => setRiskFilter("all")}><X size={10} /></button>
            </span>
          )}
          {colFilters.map((cf, i) =>
            cf.value.trim() ? (
              <span key={i} className="re-af-chip col">
                {shortLabel(inputHeaders[cf.col])}: &quot;{cf.value}&quot;
                <button onClick={() => delFilter(i)}><X size={10} /></button>
              </span>
            ) : null
          )}
          <button className="re-af-clear" onClick={() => { setRiskFilter("all"); setColFilters([]); }}>
            Clear all
          </button>
        </div>
      )}

      {/* ── Compact 4-Column Table ───────────────────────────────────── */}
      <div className="re-section-body" style={{ padding: 0 }}>
        <div className="re-result-table-wrap">
          <table className="re-result-table re-compact-table">
            <thead>
              <tr>
                <th>Container ID</th>
                <th>Risk Score</th>
                <th>Risk Level</th>
                <th>Explanation</th>
                <th className="re-th-action"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "48px 20px", color: "var(--pg-text-muted)", fontSize: 13 }}
                  >
                    No containers match your filters
                  </td>
                </tr>
              ) : (
                pageRows.map(({ row, idx }) => {
                  const cid = String(row[0]);
                  const res = resultMap[cid] || {};
                  const cls = riskClass(res.Risk_Level);
                  return (
                    <tr key={idx} className="re-clickable-row" onClick={() => onRowClick(idx)}>
                      <td>
                        <span className="re-cid">{cid}</span>
                      </td>
                      <td>
                        <div className="re-score-cell">
                          <span style={{ color: scoreColor(res.Risk_Score), fontWeight: 700, fontSize: 14 }}>
                            {res.Risk_Score ?? "--"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {res.Risk_Level ? (
                          <span className={`re-risk-pill ${cls}`}>{res.Risk_Level}</span>
                        ) : "--"}
                      </td>
                      <td className="re-expl-td">
                        <ExplanationCell text={res.Explanation_Summary} />
                      </td>
                      <td className="re-td-action">
                        <span className="re-view-btn" title="View details">
                          <Eye size={14} />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        <div className="re-pag">
          <div className="re-pag-info">
            Showing <strong>{filtered.length === 0 ? 0 : safePage * pageSize + 1}</strong>–
            <strong>{Math.min((safePage + 1) * pageSize, filtered.length)}</strong> of{" "}
            <strong>{filtered.length}</strong>
          </div>

          <div className="re-pag-btns">
            <button disabled={safePage === 0} onClick={() => setPage(0)} title="First page">
              <ChevronsLeft size={14} />
            </button>
            <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} title="Previous page">
              <ChevronLeft size={14} />
            </button>
            {pageRange().map((p) => (
              <button
                key={p}
                className={`re-pag-num${p === safePage ? " active" : ""}`}
                onClick={() => setPage(p)}
              >
                {p + 1}
              </button>
            ))}
            <button disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)} title="Next page">
              <ChevronRight size={14} />
            </button>
            <button disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)} title="Last page">
              <ChevronsRight size={14} />
            </button>
          </div>

          <div className="re-pag-size">
            <span>Rows per page</span>
            <select value={pageSize} onChange={(e) => setPageSize(+e.target.value)}>
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Click hint ─────────────────────────────────────────────── */}
        <div className="re-table-hint">
          <Eye size={12} /> Click any row to view full container details, input data &amp; comparison charts
        </div>
      </div>
    </div>
  );
}
