import type { Camera, CameraReading, Place, Region } from "@campus-live/contracts";
import type { CameraRegistry } from "../cameras/camera-registry.js";
import type { LiveStore } from "../live/live-store.js";
import type { PlaceRegistry } from "../places/place-registry.js";
import { type CapacityTable, cameraCapacity } from "./capacity.js";

/** People or vehicles in view; for a parking camera, the taken slots. */
function occupied(reading: CameraReading): number {
  return reading.parking ? reading.parking.total - reading.parking.free : reading.count;
}

/**
 * One region per place that a camera feeds, in places.json order. Its percent follows the place's own
 * rule (LiveStore.live): an area or a road is as full as its fullest fresh camera (views overlap), a
 * building or a parking lot adds its fresh cameras up. Every camera weighs by its own capacity, so a
 * camera falling silent neither raises nor lowers the percent; with none fresh, there is no percent.
 */
export function computeRegions(
  places: Place[],
  monitored: Set<string>,
  fresh: Map<string, { camera: Camera; reading: CameraReading }[]>,
  table: CapacityTable,
): Region[] {
  return places
    .filter((place) => monitored.has(place.id))
    .map((place) => {
      const entries = fresh.get(place.id) ?? [];
      const shares = entries.map(({ camera, reading }) => ({
        used: occupied(reading),
        capacity: cameraCapacity(table, camera, reading),
      }));
      let percent: number | null = null;
      if (shares.length && (place.kind === "building" || place.kind === "parking")) {
        const capacity = shares.reduce((sum, share) => sum + share.capacity, 0);
        percent = Math.round((shares.reduce((sum, share) => sum + share.used, 0) / capacity) * 100);
      } else if (shares.length) {
        percent = Math.max(...shares.map((share) => Math.round((share.used / share.capacity) * 100)));
      }
      return {
        id: place.id,
        name: place.name,
        kind: place.kind,
        section: place.section,
        percent,
        demo: entries.some(({ reading }) => reading.source !== "camera"),
      };
    });
}

/** The places some camera feeds: the ones an alert can watch. */
export function monitoredPlaces(registry: CameraRegistry): Set<string> {
  return new Set(registry.list().flatMap((camera) => (camera.place ? [camera.place] : [])));
}

export interface RegionSource {
  places: PlaceRegistry;
  registry: CameraRegistry;
  store: LiveStore;
  capacity: CapacityTable;
}

/** Every region's percent now, from the live store. */
export function regionsNow(source: RegionSource, now: Date): Region[] {
  return computeRegions(
    source.places.list(),
    monitoredPlaces(source.registry),
    source.store.freshByPlace(now),
    source.capacity,
  );
}
