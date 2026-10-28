import { EMPTY_PLACES_STATE, type PlacesState, startPlacesFeed } from "@campus-live/client";
import { useEffect, useState } from "react";
import { API_URL } from "@/constants/api";

/** The campus by places, kept live by the shared feed in @campus-live/client. */
export function useLivePlaces(): PlacesState {
  const [state, setState] = useState<PlacesState>(EMPTY_PLACES_STATE);
  useEffect(() => (API_URL ? startPlacesFeed(API_URL, setState) : undefined), []);
  return state;
}
