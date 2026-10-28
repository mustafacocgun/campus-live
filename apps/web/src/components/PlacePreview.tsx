"use client";

import { useState } from "react";
import { API_URL } from "@/lib/config";

/**
 * The stage preview (D33): what the place's camera sees right now, with YOLO's boxes, streamed by the
 * API. It hides itself when the API has none (the default: the preview is off outside the demo
 * machine), so most runs never show it.
 */
export function PlacePreview({ placeId }: { placeId: string }) {
  const [state, setState] = useState<{ placeId: string; status: "loading" | "live" | "off" }>({
    placeId,
    status: "loading",
  });
  // A new place starts loading again, without an effect.
  const status = state.placeId === placeId ? state.status : "loading";
  if (status === "off") return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold">
          {status === "live" && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          Görüntü işleme · canlı
        </span>
        <span className="text-muted">YOLO11n tespitleri</span>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black/80 ring-1 ring-line">
        {/* An MJPEG stream: the browser replaces the picture with each new frame. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a live stream, not an image to optimize */}
        <img
          key={placeId}
          src={`${API_URL}/api/preview/${encodeURIComponent(placeId)}`}
          alt="Kameranın gördüğü an, tespit edilen kişi ve araçlar kutu içinde"
          onLoad={() => setState({ placeId, status: "live" })}
          onError={() => setState({ placeId, status: "off" })}
          className="h-full w-full object-contain"
        />
        {status === "loading" && (
          <p className="absolute inset-0 grid place-items-center text-xs text-white/70">Görüntü bekleniyor…</p>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        Demo görüntüsü, kampüs kamerası değil. Yeşil kutular kişi, turuncu kutular araç. Görüntü kaydedilmez.
      </p>
    </div>
  );
}
