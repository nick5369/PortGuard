import { useState, useRef } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  WifiOff,
  ServerCrash,
  FileWarning,
  RefreshCw,
} from "lucide-react";
import env from "../../utils/env-loader";
import RiskInput from "./RiskInput";
import RiskTable from "./RiskTable";
import RiskCharts from "./RiskCharts";
import RiskDetail from "./RiskDetail";

function parseCSVResponse(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] || "";
    });
    return obj;
  });
}

export default function RiskEngine() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inputRows, setInputRows] = useState([]);
  const [inputHeaders, setInputHeaders] = useState([]);
  const [results, setResults] = useState([]);
  const [detailIdx, setDetailIdx] = useState(null);
  const resultRef = useRef(null);

  async function handleSubmit(csvBlob, rows, headers) {
    setLoading(true);
    setError(null);
    setInputRows(rows);
    setInputHeaders(headers);
    setResults([]);

    try {
      const baseUrl = env.RISK_ENGINE_URL || env.API_BASE_URL;
      const form = new FormData();
      form.append("file", csvBlob, "input.csv");

      let res;
      try {
        res = await fetch(`${baseUrl}/predict`, {
          method: "POST",
          body: form,
        });
      } catch {
        throw {
          type: "network",
          title: "Backend Unreachable",
          message:
            "Could not connect to the Risk Engine service. Make sure the backend is running.",
          hint: `Tried: ${baseUrl}/predict`,
        };
      }

      if (res.status === 422) {
        throw {
          type: "validation",
          title: "Invalid Input",
          message:
            "The backend rejected the CSV. Please check that all 15 columns are present and correctly formatted.",
        };
      }
      if (res.status === 500) {
        throw {
          type: "server",
          title: "Internal Server Error",
          message: "The Risk Engine encountered an error processing your data. Please try again.",
        };
      }
      if (!res.ok) {
        throw {
          type: "server",
          title: `Server Error (${res.status})`,
          message: "An unexpected error occurred while analyzing risk.",
        };
      }

      const contentType = res.headers.get("Content-Type") || "";
      let parsed;
      if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
        const text = await res.text();
        parsed = parseCSVResponse(text);
      } else {
        const json = await res.json();
        parsed = json.results || json.predictions || json.data || json;
        if (!Array.isArray(parsed)) parsed = [parsed];
      }

      if (!parsed.length) {
        throw {
          type: "empty",
          title: "No Results",
          message: "The backend returned an empty response. Please check your input data.",
        };
      }

      setResults(parsed);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      if (err && err.type) setError(err);
      else
        setError({
          type: "unknown",
          title: "Something Went Wrong",
          message: err?.message || "An unexpected error occurred.",
        });
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const errIcons = {
    network: WifiOff,
    validation: FileWarning,
    server: ServerCrash,
    empty: FileWarning,
    unknown: AlertTriangle,
  };

  return (
    <div className="re">
      <div className="re-hero anim-fadeUp">
        <div className="re-hero-icon anim-scaleIn">
          <ShieldAlert size={30} strokeWidth={1.5} />
        </div>
        <h1>Risk Engine</h1>
        <p>
          Upload container declaration data or enter it manually. The AI engine
          will predict risk scores, levels, and provide detailed explanations.
        </p>
      </div>

      <RiskInput onSubmit={handleSubmit} loading={loading} />

      {loading && (
        <div className="re-loading">
          <div className="pg-page-spinner">
            <div className="pg-page-spinner-ring" />
            <div className="pg-page-spinner-dot" />
          </div>
          <span>Running risk analysis...</span>
        </div>
      )}

      {error && (
        <div className="re-error-banner anim-fadeUp">
          {(() => {
            const EIcon = errIcons[error.type] || AlertTriangle;
            return <EIcon size={20} />;
          })()}
          <div>
            <div className="re-err-title">{error.title}</div>
            <div className="re-err-msg">{error.message}</div>
            {error.hint && (
              <code style={{ fontSize: 11, display: "block", marginTop: 4, opacity: 0.5 }}>
                {error.hint}
              </code>
            )}
          </div>
        </div>
      )}

      <div ref={resultRef}>
        {results.length > 0 && (
          <>
            <RiskTable
              inputRows={inputRows}
              inputHeaders={inputHeaders}
              results={results}
              onRowClick={setDetailIdx}
            />
            <RiskCharts results={results} inputRows={inputRows} />
          </>
        )}
      </div>

      <RiskDetail
        rowIndex={detailIdx}
        inputRows={inputRows}
        inputHeaders={inputHeaders}
        results={results}
        onClose={() => setDetailIdx(null)}
      />
    </div>
  );
}
