import { useState, useMemo } from "react";
import { ArrowUpDown, MapPin } from "lucide-react";

const SIZE_LABEL = { V: "Very Small", S: "Small", M: "Medium", L: "Large" };
const SIZE_COLOR = { L: "#16a34a", M: "#2563eb", S: "#ea580c", V: "#6b7280" };
const TYPE_LABEL = {
  CB: "Coastal Breakwater", CN: "Coastal Natural", RN: "River Natural",
  RB: "River Basin", OR: "Open Roadstead", LC: "Lake/Canal", TH: "Typhoon Harbor",
};
const SHELTER_LABEL = { G: "Good", M: "Moderate", P: "Poor", N: "None" };

const COLS = [
  { key: "portName", label: "Port Name" },
  { key: "countryName", label: "Country" },
  { key: "regionName", label: "Region" },
  { key: "harborSize", label: "Size" },
  { key: "harborType", label: "Type" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "chDepth", label: "Ch. Depth" },
  { key: "shelter", label: "Shelter" },
];

export default function PortTable({ ports, onSelect }) {
  const [sortKey, setSortKey] = useState("portName");
  const [asc, setAsc] = useState(true);

  function toggleSort(key) {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(true); }
  }

  const sorted = useMemo(() => {
    return [...ports].sort((a, b) => {
      let va = a[sortKey] ?? "";
      let vb = b[sortKey] ?? "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (typeof va === "number" || typeof vb === "number") {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
      }
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
  }, [ports, sortKey, asc]);

  const stats = useMemo(() => {
    const s = { L: 0, M: 0, S: 0, V: 0 };
    ports.forEach(p => { if (s[p.harborSize] !== undefined) s[p.harborSize]++; });
    return s;
  }, [ports]);

  return (
    <div className="ps-results anim-fadeUp">
      <div className="ps-results-head">
        <div className="ps-results-title">
          <MapPin size={16} />
          <span>{ports.length} port{ports.length !== 1 ? "s" : ""} found</span>
        </div>
        <div className="ps-results-stats">
          {Object.entries(stats).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k} className="ps-stat-chip" style={{ borderColor: SIZE_COLOR[k] }}>
              <span className="ps-stat-dot" style={{ background: SIZE_COLOR[k] }} />
              {SIZE_LABEL[k]}: {v}
            </span>
          ))}
        </div>
      </div>
      <div className="ps-table-wrap">
        <table className="ps-table">
          <thead>
            <tr>
              {COLS.map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)}>
                  {col.label} <ArrowUpDown size={11} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((port, i) => (
              <tr key={port.portNumber || i} onClick={() => onSelect(port)}>
                <td className="ps-cell-name">{port.portName}</td>
                <td>{port.countryName}</td>
                <td>{port.regionName}</td>
                <td>
                  <span className="ps-size-badge" style={{ background: SIZE_COLOR[port.harborSize] || "#6b7280" }}>
                    {port.harborSize}
                  </span>
                </td>
                <td>{TYPE_LABEL[port.harborType] || port.harborType}</td>
                <td className="ps-cell-coord">{port.latitude}</td>
                <td className="ps-cell-coord">{port.longitude}</td>
                <td>{port.chDepth ? `${port.chDepth}m` : "—"}</td>
                <td>{SHELTER_LABEL[port.shelter] || port.shelter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
