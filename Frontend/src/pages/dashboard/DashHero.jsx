import { useState, useEffect } from "react";
import env from "../../utils/env-loader";

export default function DashHero() {
  const [status, setStatus] = useState({ ok: false, msg: "Checking..." });

  useEffect(() => {
    const controller = new AbortController();
    fetch(env.API_BASE_URL, { signal: controller.signal, method: "GET" })
      .then((res) => {
        if (res.ok) setStatus({ ok: true, msg: "System Online" });
        else setStatus({ ok: false, msg: `Backend Error ${res.status}` });
      })
      .catch(() => {
        setStatus({ ok: false, msg: "Backend Unreachable" });
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="dash-hero anim-fadeUp">
      <img
        src="/images/port1.jpg"
        alt="Port Operations"
        className="dash-hero-img"
      />
      <div className="dash-hero-overlay" />
      <div className="dash-hero-content">
        <h1 className="dash-hero-title">{env.APP_NAME}</h1>
        <p className="dash-hero-subtitle">
          Real-time port logistics monitoring, container risk analysis, and
          trade intelligence -- all in one platform.
        </p>
        <div className={`dash-hero-badge ${status.ok ? "status-ok" : "status-err"}`}>
          <span className={`dash-hero-dot ${status.ok ? "dot-ok" : "dot-err"}`} />
          {status.msg}
        </div>
      </div>
    </section>
  );
}
