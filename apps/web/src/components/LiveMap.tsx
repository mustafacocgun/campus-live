"use client";

import { LEVEL_COLOR } from "@campus-live/client";
import type { LiveCamera } from "@campus-live/contracts";
import { type DivIcon, divIcon, type LatLngTuple } from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { inkOn } from "@/lib/ink";
import { iconPathFor } from "./icons";

const PIN_SHAPE = "M20 50C20 50 4 33.5 4 20a16 16 0 0 1 32 0c0 13.5-16 30-16 30z";

// Cached so a reading at the same level keeps the same icon: a new icon would restart the ripple.
const icons = new Map<string, DivIcon>();

/** A teardrop in the level color with the camera's icon; busy pins ripple where they touch the map. */
function pinIcon(path: string, color: string, busy: boolean, selected: boolean): DivIcon {
  const key = [path, color, busy, selected].join("|");
  let icon = icons.get(key);
  if (!icon) {
    const classes = ["camera-pin", busy && "camera-pin--busy", selected && "camera-pin--selected"];
    icon = divIcon({
      className: "camera-pin-icon",
      html:
        `<div class="${classes.filter(Boolean).join(" ")}" style="--pin:${color};--ink:${inkOn(color)}">` +
        (busy ? `<span class="camera-pin__ripple"></span>` : "") +
        `<svg class="camera-pin__shape" viewBox="0 0 40 52"><path d="${PIN_SHAPE}"/></svg>` +
        `<svg class="camera-pin__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></div>`,
      iconSize: [40, 52],
      iconAnchor: [20, 50],
      tooltipAnchor: [0, -58],
    });
    icons.set(key, icon);
  }
  return icon;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Refits the view when the set of shown cameras changes (a filter), not on every reading. */
function FitToCameras({ positions }: { positions: string }) {
  const map = useMap();
  useEffect(() => {
    if (!positions) return;
    const bounds = positions.split(";").map((p) => p.split(",").map(Number) as LatLngTuple);
    map.fitBounds(bounds, { padding: [64, 64], maxZoom: 17, animate: !reducedMotion() });
  }, [map, positions]);
  return null;
}

/** Brings the selected camera into view when the selection changes. */
function FocusCamera({ position }: { position: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    const target = position.split(",").map(Number) as LatLngTuple;
    map.flyTo(target, Math.max(map.getZoom(), 17), { animate: !reducedMotion(), duration: 0.6 });
  }, [map, position]);
  return null;
}

const positionOf = (camera: LiveCamera) => `${camera.latitude},${camera.longitude}`;

/** One pin per camera in its level's color, grey with no fresh reading. Loaded in the browser only. */
export default function LiveMap({
  cameras,
  selectedId,
  onSelect,
}: {
  cameras: LiveCamera[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!cameras.length)
    return <div className="h-full grid place-items-center text-muted">Harita yükleniyor…</div>;
  const selected = cameras.find((camera) => camera.id === selectedId);
  return (
    <MapContainer
      bounds={cameras.map((c): LatLngTuple => [c.latitude, c.longitude])}
      boundsOptions={{ padding: [64, 64], maxZoom: 17 }}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToCameras positions={cameras.map(positionOf).join(";")} />
      <FocusCamera position={selected ? positionOf(selected) : null} />
      {cameras.map((camera) => {
        const reading = camera.stale ? null : camera.reading;
        const color = reading ? LEVEL_COLOR[reading.level] : LEVEL_COLOR.stale;
        const isSelected = camera.id === selectedId;
        return (
          <Marker
            key={camera.id}
            position={[camera.latitude, camera.longitude]}
            icon={pinIcon(iconPathFor(camera), color, reading?.level === "high", isSelected)}
            zIndexOffset={isSelected ? 1000 : 0}
            title={camera.name}
            eventHandlers={{ click: () => onSelect(camera.id) }}
          >
            <Tooltip permanent direction="top" className="camera-label">
              {camera.name}
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
