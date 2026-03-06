import { useEffect, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { initTheme } from "./utils/theme-manager";
import Loader from "./components/loader/Loader";
import Navbar from "./components/navbar/Navbar";
import Footer from "./components/footer/Footer";
import Dashboard from "./pages/dashboard/Dashboard";
import PortSearch from "./pages/port-search/PortSearch";
import TradeIntelligence from "./pages/trade-intelligence/TradeIntelligence";
import RiskEngine from "./pages/risk-engine/RiskEngine";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/* ── Page transition wrapper ────────────────────── */
function PageTransition({ children }) {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);
  const [content, setContent] = useState(children);

  useEffect(() => {
    setShow(false);
    const t = setTimeout(() => {
      setContent(children);
      setShow(true);
    }, 120);
    return () => clearTimeout(t);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) {
    return (
      <div className="pg-page-loader">
        <div className="pg-page-spinner">
          <div className="pg-page-spinner-ring" />
          <div className="pg-page-spinner-dot" />
        </div>
        <span className="pg-page-loader-text">Loading</span>
      </div>
    );
  }

  return <div className="pg-page-transition">{content}</div>;
}

function Layout() {
  return (
    <div className="pg-layout">
      <Navbar />
      <main className="pg-main">
        <ScrollToTop />
        <PageTransition>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/port-search" element={<PortSearch />} />
            <Route path="/trade-intelligence" element={<TradeIntelligence />} />
            <Route path="/risk-engine" element={<RiskEngine />} />
          </Routes>
        </PageTransition>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initTheme();
  }, []);

  const handleLoaderDone = useCallback(() => setLoading(false), []);

  return (
    <BrowserRouter>
      {loading && <Loader onDone={handleLoaderDone} />}
      <Layout />
    </BrowserRouter>
  );
}
