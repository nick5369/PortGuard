import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function DashCTA() {
  return (
    <section className="dash-cta anim-fadeUp" style={{ animationDelay: "600ms" }}>
      <div className="dash-cta-text">
        <h2>Ready to Analyze Risk?</h2>
        <p>
          Launch the AI-powered Risk Engine to assess container threats and
          generate real-time security insights.
        </p>
      </div>
      <Link to="/risk-engine" className="pg-btn pg-btn-filled">
        Open Risk Engine
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}
