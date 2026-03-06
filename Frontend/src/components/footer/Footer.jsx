import { useState, useEffect } from "react";
import { MapPin, Mail, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { getStoredTheme } from "../../utils/theme-manager";
import env from "../../utils/env-loader";

const footerNav = [
  { label: "Dashboard", path: "/" },
  { label: "Port Search", path: "/port-search" },
  { label: "Trade Intelligence", path: "/trade-intelligence" },
  { label: "Risk Engine", path: "/risk-engine" },
];

export default function Footer() {
  const [theme, setTheme] = useState(getStoredTheme());

  useEffect(() => {
    const onTheme = () => setTheme(getStoredTheme());
    window.addEventListener("themechange", onTheme);
    return () => window.removeEventListener("themechange", onTheme);
  }, []);

  const isManual = theme === "manual";
  const logo = isManual ? "/images/logo2.png" : "/images/logo.jpg";

  return (
    <footer className="pg-footer">
      <div className="pg-footer-inner">
        <div className="pg-footer-grid">
          <div className="anim-fadeUp" style={{ animationDelay: "0ms" }}>
            <div className="pg-footer-brand">
              <img
                src={logo}
                alt={env.APP_NAME}
                className={isManual ? "" : "pg-logo"}
              />
            </div>
            <p className="pg-footer-desc">
              Smart Container Risk Engine for port logistics and trade
              monitoring.
            </p>
          </div>

          <div className="anim-fadeUp" style={{ animationDelay: "100ms" }}>
            <h4 className="pg-footer-heading">Contact</h4>
            <div className="pg-footer-contact">
              <div className="pg-footer-contact-item">
                <MapPin size={15} />
                <span>{env.ADDRESS}</span>
              </div>
              <div className="pg-footer-contact-item">
                <Mail size={15} />
                <a href={`mailto:${env.EMAIL}`}>{env.EMAIL}</a>
              </div>
              <div className="pg-footer-contact-item">
                <Phone size={15} />
                <a href={`tel:${env.PHONE}`}>{env.PHONE}</a>
              </div>
            </div>
          </div>

          <div className="anim-fadeUp" style={{ animationDelay: "200ms" }}>
            <h4 className="pg-footer-heading">Navigation</h4>
            <nav className="pg-footer-nav">
              {footerNav.map((item) => (
                <Link key={item.path} to={item.path}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="pg-footer-bottom">
          <p>{env.APP_NAME} -- Smart Container Risk Engine</p>
        </div>
      </div>
    </footer>
  );
}
