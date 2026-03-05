interface TapLocationCardProps {
  lat: number;
  lng: number;
  address: string;
  fullAddress: string;
  distanceFromAddress?: string;
}

/**
 * TapLocationCard - Shows the location where the NFC tag was tapped.
 * Uses a static Google Maps embed for now.
 */
const TapLocationCard = ({ lat, lng, address, fullAddress, distanceFromAddress }: TapLocationCardProps) => {
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=14&size=400x200&markers=color:red%7C${lat},${lng}&key=`;

  return (
    <div style={{ border: "1px solid var(--p-color-border)", borderRadius: "8px", overflow: "hidden" }}>
      <div
        style={{
          background: "var(--p-color-bg-surface-secondary)",
          height: "120px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          color: "var(--p-color-text-secondary)",
        }}
      >
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--p-color-text-interactive)", textDecoration: "underline" }}
        >
          📍 {lat.toFixed(4)}, {lng.toFixed(4)} — Open in Maps
        </a>
      </div>
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--p-color-border)" }}>
        <p style={{ fontSize: "12px", color: "var(--p-color-text-secondary)", margin: 0 }}>
          {fullAddress || address}
          {distanceFromAddress && (
            <span style={{ marginLeft: "8px", fontWeight: 500, color: "var(--p-color-text)" }}>
              ({distanceFromAddress} from address)
            </span>
          )}
        </p>
      </div>
    </div>
  );
};

export default TapLocationCard;
