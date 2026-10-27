"use client";

import { isDemo, LEVEL_COLOR, LEVEL_LABEL_TR, valueText } from "@campus-live/client";
import type { LiveCamera } from "@campus-live/contracts";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";

/** One colored circle per camera; grey when it has no fresh reading. Loaded in the browser only. */
export default function LiveMap({ cameras }: { cameras: LiveCamera[] }) {
  if (!cameras.length)
    return <div className="h-full grid place-items-center text-muted">Harita yükleniyor…</div>;
  // Fit every camera on screen, whatever the viewport; padding leaves room for the labels.
  const bounds = cameras.map((c): [number, number] => [c.latitude, c.longitude]);
  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [48, 48], maxZoom: 17 }}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cameras.map((camera) => {
        const reading = camera.stale ? null : camera.reading;
        const color = reading ? LEVEL_COLOR[reading.level] : LEVEL_COLOR.stale;
        return (
          <CircleMarker
            key={camera.id}
            center={[camera.latitude, camera.longitude]}
            radius={14}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: color, fillOpacity: 0.9 }}
          >
            <Tooltip permanent direction="top" offset={[0, -14]} className="camera-label">
              {camera.name}
            </Tooltip>
            <Popup>
              <strong>{camera.name}</strong>
              <br />
              {camera.section}
              <br />
              {reading ? `${valueText(reading)} · ${LEVEL_LABEL_TR[reading.level]}` : "Güncel veri yok"}
              {reading && isDemo(reading) && (
                <>
                  <br />
                  <em>Demo verisi</em>
                </>
              )}
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
