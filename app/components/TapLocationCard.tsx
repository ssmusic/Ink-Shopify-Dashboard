import { useState, useEffect } from "react";
import { Text, InlineStack } from "@shopify/polaris";

interface TapLocationCardProps {
  lat: number;
  lng: number;
  address: string;       // short form: "City, STATE ZIP"
  fullAddress: string;   // full shipping address
  distanceFromAddress?: string;
}

/**
 * TapLocationCard - Shows where the NFC tag was tapped.
 * Uses OpenStreetMap embed (no API key needed) + Nominatim reverse-geocoding
 * to display the actual city at the tap location.
 */
const TapLocationCard = ({ lat, lng, address, fullAddress, distanceFromAddress }: TapLocationCardProps) => {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

  const [tapCity, setTapCity] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } }
    )
      .then((r) => r.json())
      .then((data) => {
        const addr = data?.address;
        if (!addr) return;
        const city = addr.city || addr.town || addr.village || addr.county || addr.state_district || "";
        const state = addr.state || "";
        const zip = addr.postcode || "";
        const parts = [city, state, zip].filter(Boolean);
        if (parts.length > 0) setTapCity(parts.join(", "));
      })
      .catch(() => {/* silently ignore */});
  }, [lat, lng]);

  return (
    <div style={{ border: "1px solid var(--p-color-border)", borderRadius: "8px", overflow: "hidden" }}>
      {/* Map header */}
      <div style={{
        background: "var(--p-color-bg-surface-secondary)",
        padding: "10px 12px",
        borderBottom: "1px solid var(--p-color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <Text as="p" variant="bodySm" tone="subdued">📍 Tap Location</Text>
          <Text as="p" variant="bodySm" fontWeight="semibold">
            {tapCity || address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
          </Text>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "11px", color: "var(--p-color-text-interactive)" }}
        >
          ⤡
        </a>
      </div>

      {/* Embedded map */}
      <div style={{ height: "150px", overflow: "hidden" }}>
        <iframe
          width="100%"
          height="100%"
          style={{ border: 0 }}
          src={embedUrl}
          title="Tap location map"
          loading="lazy"
        />
      </div>

      {/* Footer details */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid var(--p-color-border)", background: "var(--p-color-bg-surface)" }}>
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          <div>
            {distanceFromAddress && (
              <Text as="p" variant="bodySm" tone="subdued">
                📐 Distance from address: <strong>{distanceFromAddress}</strong>
              </Text>
            )}
            {(fullAddress || address) && (
              <Text as="p" variant="bodySm" tone="subdued">
                📮 {fullAddress || address}
              </Text>
            )}
            <Text as="p" variant="bodySm" tone="subdued">
              <code style={{ fontFamily: "monospace", fontSize: "11px" }}>
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </code>
            </Text>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "12px",
              color: "var(--p-color-text-interactive)",
              whiteSpace: "nowrap",
              paddingLeft: "8px",
            }}
          >
            Open in Maps →
          </a>
        </InlineStack>
      </div>
    </div>
  );
};

export default TapLocationCard;
