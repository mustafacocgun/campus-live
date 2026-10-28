import type { LatLng } from "@campus-live/contracts";
import * as Location from "expo-location";

/** The user's position: from the device (with its accuracy) or picked on the map. Kept in the app only. */
export interface MyLocation extends LatLng {
  source: "device" | "map";
  accuracy?: number;
}

// The campus map's anchor, the same point the web map opens on.
const CAMPUS: LatLng = { lat: 40.742, lng: 30.332 };

/** How far a position is from the campus, in km, flat-earth. */
export function kmFromCampus(spot: LatLng): number {
  const north = (spot.lat - CAMPUS.lat) * 111.32;
  const east = (spot.lng - CAMPUS.lng) * 111.32 * Math.cos((CAMPUS.lat * Math.PI) / 180);
  return Math.hypot(east, north);
}

/** The device's position, or a Turkish reason it could not be had (the map pick always works). */
export async function locateDevice(): Promise<MyLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error("Konum izni verilmedi; haritadan seçebilirsin.");
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      source: "device",
      accuracy: position.coords.accuracy === null ? undefined : Math.round(position.coords.accuracy),
    };
  } catch {
    throw new Error("Konum alınamadı; haritadan seçebilirsin.");
  }
}
