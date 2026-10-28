"use client";

import { EMPTY_PLACES_STATE, type PlacesState, startPlacesFeed } from "@campus-live/client";
import { useEffect, useState } from "react";
import { API_URL } from "./config";
import { appendPlaces, type SessionHistory } from "./session-history";

/**
 * The campus by places, kept live by the shared feed in @campus-live/client, plus the values this page
 * has received so far (for the "Bu oturum" chart).
 */
export function useLivePlaces(): PlacesState & { history: SessionHistory } {
  const [state, setState] = useState<PlacesState>(EMPTY_PLACES_STATE);
  const [history, setHistory] = useState<SessionHistory>({});
  useEffect(
    () =>
      startPlacesFeed(API_URL, (next) => {
        setState(next);
        const now = Date.now();
        setHistory((previous) => appendPlaces(previous, next.places, now));
      }),
    [],
  );
  return { ...state, history };
}
