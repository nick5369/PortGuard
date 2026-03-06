import { useState, useEffect } from "react";
import { Anchor, WifiOff, SearchX, ServerCrash, AlertTriangle } from "lucide-react";
import PortSearchInput from "./PortSearchInput";
import PortTable from "./PortTable";
import PortDetail from "./PortDetail";

const API = "https://msi.nga.mil/api/publications/world-port-index";

export default function PortSearch() {
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [namesLoaded, setNamesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ports, setPorts] = useState([]);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [selectedPort, setSelectedPort] = useState(null);

  useEffect(() => {
    fetch(`${API}/wpi-prc-names`)
      .then(r => r.json())
      .then(data => {
        setCountries((data.countries || []).sort());
        setRegions((data.regions || []).sort());
        setNamesLoaded(true);
      })
      .catch(() => setNamesLoaded(true));
  }, []);

  async function handleSearch(params) {
    setLoading(true);
    setError(null);
    setSearched(true);
    setPorts([]);
    setSelectedPort(null);

    try {
      const qs = new URLSearchParams({ ...params, output: "json" });
      let res;
      try {
        res = await fetch(`${API}?${qs}`);
      } catch {
        throw {
          type: "network",
          title: "Connection Failed",
          message: "Could not reach the NGA World Port Index API. Check your internet connection and try again.",
        };
      }

      if (!res.ok) {
        throw {
          type: "server",
          title: `Server Error (${res.status})`,
          message: "The WPI API returned an error. Please try again later.",
        };
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw {
          type: "parse",
          title: "Invalid Response",
          message: "Could not parse the API response.",
        };
      }

      if (!data.ports || data.ports.length === 0) {
        setError({
          type: "empty",
          title: "No Ports Found",
          message: "No ports matched your search criteria. Try a different name or adjust filters.",
        });
        return;
      }

      setPorts(data.ports);
    } catch (err) {
      if (err?.type) setError(err);
      else setError({ type: "unknown", title: "Something Went Wrong", message: err?.message || "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ps">
      <div className="ps-hero anim-fadeUp">
        <div className="ps-hero-icon">
          <Anchor size={28} strokeWidth={1.5} />
        </div>
        <h1>Port Search</h1>
        <p>
          Search the World Port Index — over 3,700 ports worldwide with
          detailed facilities, services, and physical characteristics.
        </p>
      </div>

      <PortSearchInput
        countries={countries}
        regions={regions}
        onSearch={handleSearch}
        loading={loading}
        namesLoaded={namesLoaded}
      />

      {loading && (
        <div className="ps-loading">
          <div className="pg-page-spinner">
            <div className="pg-page-spinner-ring" />
            <div className="pg-page-spinner-dot" />
          </div>
          <span className="pg-page-loader-text">Searching ports...</span>
        </div>
      )}

      {!loading && error && (
        <div className="ps-error anim-fadeUp">
          <div className="ps-error-icon">
            {error.type === "network" && <WifiOff size={26} />}
            {error.type === "server" && <ServerCrash size={26} />}
            {error.type === "empty" && <SearchX size={26} />}
            {(error.type === "parse" || error.type === "unknown") && <AlertTriangle size={26} />}
          </div>
          <h3>{error.title}</h3>
          <p>{error.message}</p>
        </div>
      )}

      {!loading && !error && searched && ports.length > 0 && (
        <PortTable ports={ports} onSelect={setSelectedPort} />
      )}

      {selectedPort && (
        <PortDetail port={selectedPort} onClose={() => setSelectedPort(null)} />
      )}
    </div>
  );
}
