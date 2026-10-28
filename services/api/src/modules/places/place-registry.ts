import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CampusMap, type Place } from "@campus-live/contracts";

/** config/places.json at the repo root: what users see (same depth from src/ and dist/). */
export const SHARED_PLACES_FILE = fileURLToPath(new URL("../../../../../config/places.json", import.meta.url));

/** The campus outline and its places: public, served as they are. */
export class PlaceRegistry {
  private readonly byId = new Map<string, Place>();

  constructor(readonly map: CampusMap) {
    for (const place of map.places) {
      if (this.byId.has(place.id)) throw new Error(`duplicate place id: ${place.id}`);
      this.byId.set(place.id, place);
    }
  }

  list(): Place[] {
    return this.map.places;
  }

  get(id: string): Place | undefined {
    return this.byId.get(id);
  }
}

export function loadPlaces(path: string): PlaceRegistry {
  return new PlaceRegistry(CampusMap.parse(JSON.parse(readFileSync(path, "utf8"))));
}
