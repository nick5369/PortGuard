import { useState, useRef, useEffect } from "react";
import { Search, Ship, Globe, MapPin, ChevronDown, X, Loader2, Anchor, Filter } from "lucide-react";

const MODES = [
  { id: "countryName", label: "Country", icon: Globe, placeholder: "Search country..." },
  { id: "regionName", label: "Region", icon: MapPin, placeholder: "Search region..." },
  { id: "portName", label: "Port Name", icon: Ship, placeholder: "Enter port name..." },
];

const SIZES = [
  { id: "", label: "All Sizes" },
  { id: "L", label: "Large" },
  { id: "M", label: "Medium" },
  { id: "S", label: "Small" },
  { id: "V", label: "Very Small" },
];

const POPULAR = ["Singapore", "Japan", "India", "China", "United States", "United Kingdom", "Australia", "Germany"];

export default function PortSearchInput({ countries, regions, onSearch, loading, namesLoaded }) {
  const [mode, setMode] = useState("countryName");
  const [query, setQuery] = useState("");
  const [size, setSize] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const isDropdown = mode !== "portName";
  const list = mode === "countryName" ? countries : regions;
  const filtered = list.filter(x => x.toLowerCase().includes(filter.toLowerCase()));
  const modeObj = MODES.find(m => m.id === mode);

  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function switchMode(id) {
    setMode(id);
    setQuery("");
    setFilter("");
    setOpen(false);
  }

  function doSearch(searchQuery, searchMode, searchSize) {
    const q = searchQuery || query;
    const m = searchMode || mode;
    const s = searchSize !== undefined ? searchSize : size;
    if (!q.trim()) return;
    const params = { [m]: q.trim() };
    if (s) params.harborSize = s;
    onSearch(params);
  }

  function select(item) {
    setQuery(item);
    setOpen(false);
    setFilter("");
    doSearch(item, mode, size);
  }

  function clear() {
    setQuery("");
    setFilter("");
    inputRef.current?.focus();
  }

  function submit(e) {
    e.preventDefault();
    if (isDropdown && open && filtered.length > 0) {
      const exact = filtered.find(x => x.toLowerCase() === filter.toLowerCase());
      select(exact || filtered[0]);
      return;
    }
    doSearch();
  }

  function changeSize(s) {
    setSize(s);
    if (query.trim()) doSearch(query, mode, s);
  }

  function pickPopular(name) {
    setMode("countryName");
    setQuery(name);
    setOpen(false);
    setFilter("");
    const params = { countryName: name };
    if (size) params.harborSize = size;
    onSearch(params);
  }

  return (
    <div className="ps-input anim-fadeUp" style={{ animationDelay: "80ms" }}>
      <div className="ps-tabs">
        {MODES.map(m => (
          <button key={m.id} className={`ps-tab ${mode === m.id ? "active" : ""}`} onClick={() => switchMode(m.id)}>
            <m.icon size={14} /> {m.label}
          </button>
        ))}
      </div>

      <form className="ps-search" onSubmit={submit}>
        <div className="ps-search-wrap" ref={wrapRef}>
          <Search size={18} className="ps-search-icon" />
          {isDropdown ? (
            <>
              <input
                ref={inputRef}
                type="text"
                className="ps-search-input"
                placeholder={modeObj.placeholder}
                value={open ? filter : query}
                onChange={e => { setFilter(e.target.value); if (!open) setOpen(true); }}
                onFocus={() => setOpen(true)}
              />
              {query && !open && (
                <button type="button" className="ps-clear" onClick={clear}><X size={14} /></button>
              )}
              <button type="button" className="ps-chevron" onClick={() => setOpen(!open)}>
                <ChevronDown size={16} className={open ? "ps-chevron-flip" : ""} />
              </button>
              {open && (
                <div className="ps-dropdown">
                  {!namesLoaded && <div className="ps-dropdown-empty">Loading...</div>}
                  {namesLoaded && filtered.length === 0 && <div className="ps-dropdown-empty">No matches</div>}
                  {filtered.slice(0, 60).map(item => (
                    <button type="button" key={item} className={`ps-dropdown-item ${item === query ? "selected" : ""}`} onClick={() => select(item)}>
                      {item}
                    </button>
                  ))}
                  {filtered.length > 60 && <div className="ps-dropdown-more">{filtered.length - 60} more — type to narrow</div>}
                </div>
              )}
            </>
          ) : (
            <input ref={inputRef} type="text" className="ps-search-input" placeholder={modeObj.placeholder} value={query} onChange={e => setQuery(e.target.value)} />
          )}
          <button type="submit" className="ps-search-btn" disabled={loading || !query.trim()}>
            {loading ? <Loader2 size={16} className="ps-spin" /> : "Search"}
          </button>
        </div>
      </form>

      <div className="ps-quick">
        <span className="ps-quick-label"><Anchor size={13} /> Popular Countries</span>
        <div className="ps-quick-chips">
          {POPULAR.map(c => (
            <button key={c} className={`ps-chip ${query === c && mode === "countryName" ? "active" : ""}`} onClick={() => pickPopular(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="ps-filters">
        <span className="ps-quick-label"><Filter size={13} /> Harbor Size</span>
        <div className="ps-filter-chips">
          {SIZES.map(s => (
            <button key={s.id} className={`ps-chip ${size === s.id ? "active" : ""}`} onClick={() => changeSize(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
