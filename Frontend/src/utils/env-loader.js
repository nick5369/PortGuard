const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api",
  APP_NAME: import.meta.env.VITE_APP_NAME || "PortGuard",
  ADDRESS: import.meta.env.VITE_ADDRESS || "",
  EMAIL: import.meta.env.VITE_EMAIL || "",
  PHONE: import.meta.env.VITE_PHONE || "",
  RISK_ENGINE_URL: import.meta.env.VITE_RISK_ENGINE_URL || "",
  TRADE_INTEL_URL: import.meta.env.VITE_TRADE_INTEL_URL || "",
  PORT_SEARCH_URL: import.meta.env.VITE_PORT_SEARCH_URL || "",
};

export default env;
