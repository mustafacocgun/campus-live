import type { LivePlace, LiveSnapshot, Place } from "@campus-live/contracts";

/** A place with its live state: what the assistant reads. */
export type PlaceView = Place & Omit<LivePlace, "id">;

/** The places, each with its state from the snapshot (stale when the snapshot does not have it). */
export function placeViews(places: Place[], live: LiveSnapshot): PlaceView[] {
  const states = new Map(live.places.map((state) => [state.id, state]));
  return places.map((place) => {
    const { id: _id, ...state } = states.get(place.id) ?? {
      id: place.id,
      count: null,
      level: null,
      parking: null,
      stale: true,
      ageMs: null,
      demo: true,
    };
    return { ...place, ...state };
  });
}
