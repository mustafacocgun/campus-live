"use client";

import { connectLive, fetchCameras, isStale, mergeReading } from "@campus-live/client";
import type { LiveCamera } from "@campus-live/contracts";
import { useEffect, useState } from "react";
import { API_URL } from "./config";

/** Every camera with its latest reading: the first load over REST, then live over Socket.IO. */
export function useLiveCameras() {
  const [cameras, setCameras] = useState<LiveCamera[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCameras(API_URL)
      .then(setCameras)
      .catch(() => setError("API'ye ulaşılamadı."));
    const disconnect = connectLive(
      API_URL,
      (reading) => setCameras((all) => mergeReading(all, reading)),
      setConnected,
    );
    // A camera that goes silent turns grey, even if no further reading arrives.
    const timer = setInterval(() => {
      const now = new Date();
      setCameras((all) => all.map((camera) => ({ ...camera, stale: isStale(camera.reading, now) })));
    }, 5_000);
    return () => {
      disconnect();
      clearInterval(timer);
    };
  }, []);

  return { cameras, connected, error };
}
