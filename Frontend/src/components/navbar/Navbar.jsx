import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Globe,
  ShieldAlert,
  Menu,
  X,
} from "lucide-react";
import ThemeSwitcher from "../theme-switcher/ThemeSwitcher";
import { getStoredTheme } from "../../utils/theme-manager";
import env from "../../utils/env-loader";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/port-search", label: "Port Search", icon: Search },
  { path: "/trade-intelligence", label: "Trade Intelligence", icon: Globe },
  { path: "/risk-engine", label: "Risk Engine", icon: ShieldAlert, risk: true },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme());
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    const onTheme = () => setTheme(getStoredTheme());
    window.addEventListener("scroll", onScroll);
    window.addEventListener("themechange", onTheme);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("themechange", onTheme);
    };
  }, []);

  const isManual = theme === "manual";
  const logo = isManual ? "/images/logo2.png" : "/images/logo.jpg";

  return (
    <nav className={`pg-nav ${scrolled ? "scrolled" : ""}`}>
      <div className="pg-nav-inner">
        <NavLink to="/" className="pg-nav-brand">
          <img src={logo} alt={env.APP_NAME} className={isManual ? "" : "pg-logo"} />
          <span>{env.APP_NAME}</span>
        </NavLink>

        <div className="pg-nav-links">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `pg-nav-link ${isActive ? "active" : ""} ${item.risk ? "risk-highlight" : ""}`
              }
            >
              <item.icon size={15} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="pg-nav-right">
          <ThemeSwitcher />
          <button
            className="pg-nav-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <div className={`pg-nav-mobile ${mobileOpen ? "open" : ""}`}>
        <div className="pg-nav-mobile-inner">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `pg-nav-mobile-link ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={16} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
