"use client";

import { isDemo, LEVEL_COLOR, LEVEL_LABEL_TR, valueText } from "@campus-live/client";
import type { CameraKind, LiveCamera } from "@campus-live/contracts";
import { type DivIcon, divIcon } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, Tooltip } from "react-leaflet";
import { KIND_ICON_PATH, KIND_LABEL_TR } from "./icons";

// Cached so a reading at the same level keeps the same icon: a new icon would restart the pulse.
const icons = new Map<string, DivIcon>();

function markerIcon(kind: CameraKind, color: string, pulse: boolean): DivIcon {
  const key = `${kind}|${color}|${pulse}`;
  let icon = icons.get(key);
  if (!icon) {
    icon = divIcon({
      className: "camera-marker-icon",
      html:
        `<span class="camera-marker${pulse ? " camera-marker--pulse" : ""}" style="--marker-color:${color}">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="${KIND_ICON_PATH[kind]}"/></svg></span>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -20],
      tooltipAnchor: [0, -22],
    });
    icons.set(key, icon);
  }
  return icon;
}

/** One icon per camera in its level's color, pulsing when busy; grey with no fresh reading. Browser only. */
export default function LiveMap({ cameras }: { cameras: LiveCamera[] }) {
  if (!cameras.length)
    return <div className="h-full grid place-items-center text-muted">Harita yükleniyor…</div>;
  // Fit every camera on screen, whatever the viewport; padding leaves room for the labels.
  const bounds = cameras.map((c): [number, number] => [c.latitude, c.longitude]);
  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [56, 56], maxZoom: 17 }}
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
          <Marker
            key={camera.id}
            position={[camera.latitude, camera.longitude]}
            icon={markerIcon(camera.kind, color, reading?.level === "high")}
            title={camera.name}
          >
            <Tooltip permanent direction="top" className="camera-label">
              {camera.name}
            </Tooltip>
            {/* Leaflet styles <p> inside popups; divs keep the spacing ours. */}
            <Popup>
              <div className="min-w-44 space-y-1.5">
                <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {camera.section} · {KIND_LABEL_TR[camera.kind]}
                </div>
                <div className="text-sm font-bold">{camera.name}</div>
                {reading ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold tabular-nums">{valueText(reading)}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ color, backgroundColor: `${color}26` }}
                    >
                      {LEVEL_LABEL_TR[reading.level]}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-muted">Güncel veri yok</div>
                )}
                {reading && isDemo(reading) && (
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-300">Demo verisi</div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
