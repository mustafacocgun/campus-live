import type { LatLng } from "@campus-live/contracts";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

/** The user's position: from the device (with its accuracy) or picked on the map. Kept in the app only. */
export interface MyLocation extends LatLng {
  source: "device" | "map";
  accuracy?: number;
}

interface Shared {
  me: MyLocation | null;
  setMe: (me: MyLocation | null) => void;
  /** While true, a tap on the Harita tab sets the user's position. */
  picking: boolean;
  setPicking: (on: boolean) => void;
  /** The place an answer's chip asked the map to show. */
  focusId: string | null;
  setFocusId: (id: string | null) => void;
}

const SharedLocation = createContext<Shared | null>(null);

/** What the Asistan and Harita tabs share: the user's position and the place to show. */
export function SharedLocationProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MyLocation | null>(null);
  const [picking, setPicking] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ me, setMe, picking, setPicking, focusId, setFocusId }),
    [me, picking, focusId],
  );
  return <SharedLocation.Provider value={value}>{children}</SharedLocation.Provider>;
}

export function useSharedLocation(): Shared {
  const shared = useContext(SharedLocation);
  if (!shared) throw new Error("useSharedLocation needs SharedLocationProvider");
  return shared;
}
