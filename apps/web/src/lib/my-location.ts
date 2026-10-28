import type { LatLng } from "@campus-live/contracts";

/** The user's position: from the device (with its accuracy) or picked on the map. Kept in the page only. */
export interface MyLocation extends LatLng {
  source: "device" | "map";
  accuracy?: number;
}

// The campus map's anchor, the same point the map opens on.
const CAMPUS: LatLng = { lat: 40.742, lng: 30.332 };

/** How far a position is from the campus, in km, flat-earth. */
export function kmFromCampus(spot: LatLng): number {
  const north = (spot.lat - CAMPUS.lat) * 111.32;
  const east = (spot.lng - CAMPUS.lng) * 111.32 * Math.cos((CAMPUS.lat * Math.PI) / 180);
  return Math.hypot(east, north);
}

/** The device's position, or a Turkish reason it could not be had (the map pick always works). */
export function locateDevice(): Promise<MyLocation> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Bu tarayıcı konum vermiyor; haritadan seçebilirsin."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "device",
          accuracy: Math.round(position.coords.accuracy),
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Konum izni verilmedi; haritadan seçebilirsin."
              : "Konum alınamadı; haritadan seçebilirsin.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
