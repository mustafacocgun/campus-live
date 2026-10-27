import { type LiveState, startLiveFeed } from "@campus-live/client";
import { useEffect, useState } from "react";
import { API_URL } from "@/constants/api";

/** Every camera with its latest reading, kept live by the shared feed in @campus-live/client. */
export function useLiveCameras(): LiveState {
  const [state, setState] = useState<LiveState>({ cameras: [], connected: false, error: null });
  useEffect(() => (API_URL ? startLiveFeed(API_URL, setState) : undefined), []);
  return state;
}
