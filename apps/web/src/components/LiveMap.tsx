"use client";

import { isDemo, LEVEL_COLOR, LEVEL_LABEL_TR, valueText } from "@campus-live/client";
import type { LiveCamera } from "@campus-live/contracts";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

/** One colored circle per camera; grey when it has no fresh reading. Loaded in the browser only. */
export default function LiveMap({ cameras }: { cameras: LiveCamera[] }) {
  if (!cameras.length)
    return <div className="h-full grid place-items-center text-gray-500">Harita yükleniyor…</div>;
  const center: [number, number] = [
    cameras.reduce((sum, c) => sum + c.latitude, 0) / cameras.length,
    cameras.reduce((sum, c) => sum + c.longitude, 0) / cameras.length,
  ];
  return (
    <MapContainer center={center} zoom={16} className="h-full w-full rounded-lg" scrollWheelZoom>
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
            radius={16}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.6 }}
          >
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
