// THE DELIVERY ADDRESS ON A MAP, THE RECORD PAGE'S WAY — OpenStreetMap's own
// embed with a marker at the address (the-ritualist src/components/MiniMap.tsx):
// no key, no billing, loaded lazily. Sam, 2026-09-24: "the shopify app was
// supposed to have the good maps i showed you".
//
// The record page's footer prints the coordinates beside an "open ↗" link;
// the app never prints a coordinate as text, so the frame stands alone. The
// coordinates live only in the frame's address, for OpenStreetMap to draw.

export default function MiniMap({
  lat,
  lng,
  label = "Delivery address",
  height = 200,
}: {
  lat: number;
  lng: number;
  label?: string;
  height?: number;
}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const d = 0.003; // about 300 m around the point
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <div
      data-testid="address-map"
      style={{ overflow: "hidden", borderRadius: "var(--p-border-radius-200)", border: "1px solid var(--p-color-border)", background: "#f1f1f1" }}
    >
      <iframe title={label} src={src} loading="lazy" style={{ width: "100%", height, border: 0, display: "block" }} />
    </div>
  );
}
