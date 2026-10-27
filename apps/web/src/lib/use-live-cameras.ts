"use client";

import { type LiveState, startLiveFeed } from "@campus-live/client";
import { useEffect, useState } from "react";
import { API_URL } from "./config";

/** Every camera with its latest reading, kept live by the shared feed in @campus-live/client. */
export function useLiveCameras(): LiveState {
  const [state, setState] = useState<LiveState>({ cameras: [], connected: false, error: null });
  useEffect(() => startLiveFeed(API_URL, setState), []);
  return state;
}
