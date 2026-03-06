import { useState, useRef } from "react";
import {
  Globe,
  Search,
  Newspaper,
  ExternalLink,
  Clock,
  Building2,
  Anchor,
  Ship,
  Container,
  TrendingUp,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Filter,
  WifiOff,
  KeyRound,
  Timer,
  ServerCrash,
  FileWarning,
  SearchX,
} from "lucide-react";
import env from "../../utils/env-loader";

const CATEGORIES = [
  { id: "all",        label: "All News",       icon: Newspaper },
  { id: "congestion", label: "Congestion",      icon: AlertTriangle },
  { id: "shipping",   label: "Shipping",        icon: Ship },
  { id: "container",  label: "Containers",      icon: Container },
  { id: "trade",      label: "Trade Routes",    icon: TrendingUp },
  { id: "terminal",   label: "Terminals",       icon: Building2 },
];

const POPULAR_PORTS = [
  "Singapore", "Rotterdam", "Shanghai", "Long Beach",
  "Dubai", "Mumbai", "Hamburg", "Busan",
];

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(dateStr);
}

export default function TradeIntelligence() {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function fetchNews(searchTerm, cat) {
    const term = searchTerm || keyword;
    const c = cat || category;
    if (!term.trim()) {
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const baseUrl = env.TRADE_INTEL_URL || env.API_BASE_URL;
      const url = `${baseUrl}/trade-intelligence/news?keyword=${encodeURIComponent(term.trim())}&category=${c}&limit=10`;

      let res;
      try {
        res = await fetch(url);
      } catch (networkErr) {
        throw {
          type: "network",
          title: "Backend Unreachable",
          message:
            "Could not connect to the PortGuard server. Please make sure the backend service is running and accessible.",
          hint: `Tried: ${baseUrl}`,
        };
      }

      if (res.status === 401) {
        throw {
          type: "auth",
          title: "Authentication Failed",
          message: "The API key is invalid or missing. Please contact the administrator to fix the server configuration.",
        };
      }
      if (res.status === 429) {
        throw {
          type: "ratelimit",
          title: "Rate Limit Exceeded",
          message: "Too many requests — the free-tier limit (100/day) has been reached. Please try again tomorrow or upgrade the API plan.",
        };
      }
      if (res.status === 500) {
        throw {
          type: "server",
          title: "Internal Server Error",
          message: "Something went wrong on the server. The backend team has been notified. Please try again shortly.",
        };
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw {
          type: "server",
          title: "Service Unavailable",
          message: `The backend server returned ${res.status}. It may be restarting or under heavy load. Try again in a moment.`,
        };
      }
      if (!res.ok) {
        throw {
          type: "server",
          title: `Server Error (${res.status})`,
          message: "An unexpected error occurred while fetching news. Please try again later.",
        };
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw {
          type: "parse",
          title: "Invalid Response",
          message: "The backend returned a malformed response. Please contact the backend team.",
        };
      }

      if (!data.articles || data.articles.length === 0) {
        setArticles([]);
        setError({
          type: "empty",
          title: "No Results",
          message: `No maritime news found for "${term}". Try a different port name, keyword, or category.`,
        });
      } else {
        setArticles(data.articles);
      }
    } catch (err) {
      if (err && err.type) {
        setError(err);
      } else {
        setError({
          type: "unknown",
          title: "Something Went Wrong",
          message: err?.message || "An unexpected error occurred. Please check your connection and try again.",
        });
      }
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    fetchNews();
  }

  function pickPort(port) {
    setKeyword(port);
    fetchNews(port, category);
  }

  function pickCategory(id) {
    setCategory(id);
    if (keyword.trim()) fetchNews(keyword, id);
  }

  return (
    <div className="ti">
      {/* ── Hero header ─────────────────────── */}
      <div className="ti-hero anim-fadeUp">
        <div className="ti-hero-icon">
          <Globe size={28} strokeWidth={1.5} />
        </div>
        <h1 className="ti-hero-title">Trade Intelligence</h1>
        <p className="ti-hero-sub">
          Real-time maritime news aggregated from global sources —
          ports, shipping, containers, and logistics.
        </p>
      </div>

      {/* ── Search bar ──────────────────────── */}
      <form className="ti-search anim-fadeUp" onSubmit={handleSubmit} style={{ animationDelay: "80ms" }}>
        <div className="ti-search-inner">
          <Search size={18} className="ti-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="ti-search-input"
            placeholder="Search port, trade route, or keyword..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button type="submit" className="ti-search-btn" disabled={loading}>
            {loading ? <Loader2 size={16} className="ti-spin" /> : "Search"}
          </button>
        </div>
      </form>

      {/* ── Quick-pick ports ────────────────── */}
      <div className="ti-quick anim-fadeUp" style={{ animationDelay: "140ms" }}>
        <span className="ti-quick-label">
          <Anchor size={13} /> Popular Ports
        </span>
        <div className="ti-quick-chips">
          {POPULAR_PORTS.map((p) => (
            <button
              key={p}
              className={`ti-chip ${keyword === p ? "active" : ""}`}
              onClick={() => pickPort(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Category filter ─────────────────── */}
      <div className="ti-categories anim-fadeUp" style={{ animationDelay: "200ms" }}>
        <span className="ti-quick-label">
          <Filter size={13} /> Category
        </span>
        <div className="ti-cat-row">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`ti-cat ${category === c.id ? "active" : ""}`}
              onClick={() => pickCategory(c.id)}
            >
              <c.icon size={14} />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results ─────────────────────────── */}
      <div className="ti-results">
        {loading && (
          <div className="ti-loading">
            <div className="pg-page-spinner">
              <div className="pg-page-spinner-ring" />
              <div className="pg-page-spinner-dot" />
            </div>
            <span className="pg-page-loader-text">Fetching latest news...</span>
          </div>
        )}

        {!loading && error && (
          <div className="ti-error anim-fadeUp">
            <div className="ti-error-icon">
              {error.type === "network" && <WifiOff size={26} />}
              {error.type === "auth" && <KeyRound size={26} />}
              {error.type === "ratelimit" && <Timer size={26} />}
              {error.type === "server" && <ServerCrash size={26} />}
              {error.type === "parse" && <FileWarning size={26} />}
              {error.type === "empty" && <SearchX size={26} />}
              {error.type === "unknown" && <AlertTriangle size={26} />}
            </div>
            <h3 className="ti-error-title">{error.title}</h3>
            <p className="ti-error-msg">{error.message}</p>
            {error.hint && <code className="ti-error-hint">{error.hint}</code>}
            <button className="pg-btn pg-btn-outline" onClick={() => fetchNews()}>
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        )}

        {!loading && !error && searched && articles.length > 0 && (
          <>
            <div className="ti-results-header anim-fadeUp">
              <span className="ti-results-count">
                {articles.length} article{articles.length > 1 ? "s" : ""} found
              </span>
            </div>
            <div className="ti-grid">
              {articles.map((art, i) => (
                <a
                  key={i}
                  href={art.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ti-card anim-fadeUp"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {art.image_url && (
                    <div className="ti-card-img">
                      <img src={art.image_url} alt="" loading="lazy" />
                    </div>
                  )}
                  <div className="ti-card-body">
                    <h3 className="ti-card-title">{art.title}</h3>
                    {art.description && (
                      <p className="ti-card-desc">{art.description}</p>
                    )}
                    <div className="ti-card-meta">
                      <span className="ti-card-source">
                        <Building2 size={12} />
                        {art.source_name}
                      </span>
                      <span className="ti-card-time">
                        <Clock size={12} />
                        {timeAgo(art.published_at)}
                      </span>
                    </div>
                  </div>
                  <div className="ti-card-link">
                    <ExternalLink size={14} />
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {!loading && !error && !searched && (
          <div className="ti-empty anim-fadeUp" style={{ animationDelay: "260ms" }}>
            <Newspaper size={28} />
            <p>Search a port or keyword above to get the latest maritime intelligence.</p>
          </div>
        )}
      </div>
    </div>
  );
}
