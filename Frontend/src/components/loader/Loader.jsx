import { useState, useEffect } from "react";
import { getStoredTheme } from "../../utils/theme-manager";

export default function Loader({ onDone }) {
  const [phase, setPhase] = useState("active");
  const isManual = getStoredTheme() === "manual";

  useEffect(() => {
    const timer = setTimeout(() => setPhase("exit"), 2200);
    const done = setTimeout(() => onDone(), 2900);
    return () => {
      clearTimeout(timer);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className={`pg-loader ${phase === "exit" ? "pg-loader-exit" : ""}`}>
      <div className="pg-loader-content">
        <div className="pg-loader-ring">
          <div className="pg-loader-ring-inner" />
        </div>
        <div className="pg-loader-logo-wrap">
          <img
            src={isManual ? "/images/logo2.png" : "/images/logo.jpg"}
            alt="PortGuard"
            className={`pg-loader-logo ${isManual ? "" : "pg-loader-logo-invert"}`}
          />
        </div>
        <div className="pg-loader-text">
          <span className="pg-loader-name">PortGuard</span>
          <span className="pg-loader-tagline">Smart Container Risk Engine</span>
        </div>
        <div className="pg-loader-bar">
          <div className="pg-loader-bar-fill" />
        </div>
      </div>
    </div>
  );
}
