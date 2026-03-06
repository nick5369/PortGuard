import { ShieldAlert, Search, Globe, Container } from "lucide-react";

const features = [
  {
    icon: ShieldAlert,
    title: "Risk Engine",
    desc: "AI-powered container risk prediction and threat assessment in real time.",
  },
  {
    icon: Search,
    title: "Port Search",
    desc: "Explore global ports, shipping routes, and logistics infrastructure.",
  },
  {
    icon: Globe,
    title: "Trade Intelligence",
    desc: "Live aggregated news and insights on global trade and shipping.",
  },
  {
    icon: Container,
    title: "Container Tracking",
    desc: "End-to-end visibility of container movement and security status.",
  },
];

export default function DashFeatures() {
  return (
    <section className="dash-features">
      {features.map((f, i) => (
        <div
          key={f.title}
          className="dash-feature-card anim-fadeUp"
          style={{ animationDelay: `${i * 100 + 200}ms` }}
        >
          <div className="dash-feature-icon">
            <f.icon size={22} strokeWidth={1.5} />
          </div>
          <h3 className="dash-feature-title">{f.title}</h3>
          <p className="dash-feature-desc">{f.desc}</p>
        </div>
      ))}
    </section>
  );
}
