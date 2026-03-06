const images = [
  {
    src: "/images/ContainerSecurity.jpg",
    label: "Container Security",
  },
  {
    src: "/images/ShipWithContainer.jpg",
    label: "Maritime Logistics",
  },
  {
    src: "/images/containerDetection.png",
    label: "Detection Systems",
  },
];

export default function DashImages() {
  return (
    <section className="dash-images">
      {images.map((img, i) => (
        <div
          key={img.label}
          className="dash-image-card anim-fadeUp"
          style={{ animationDelay: `${i * 120 + 400}ms` }}
        >
          <img src={img.src} alt={img.label} />
          <div className="dash-image-label">
            <span>{img.label}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
