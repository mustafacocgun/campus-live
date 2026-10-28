import { EMPTY_PLACES_STATE, PLACE_TOPIC, type PlacesState, startPlacesFeed } from "@campus-live/client";
import type { CameraKind } from "@campus-live/contracts";
import { router } from "expo-router";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { API_URL } from "@/constants/api";
import type { MyLocation } from "@/lib/my-location";
import { appendPlaces, type SessionHistory } from "@/lib/session-history";

interface CampusState extends PlacesState {
  /** The values this app has received so far, for the "Bu oturum" chart. */
  history: SessionHistory;
  topic: CameraKind | null;
  section: string | null;
  chooseTopic: (topic: CameraKind | null) => void;
  chooseSection: (section: string | null) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  /** A place an answer or a list points at: shown on the map whatever the filters. */
  showOnMap: (id: string) => void;
  /** Opens a place's detail in the Yerler tab. */
  openDetail: (id: string) => void;
  /** The user's position, for "the nearest…" questions: kept in this app only. */
  me: MyLocation | null;
  setMe: (me: MyLocation | null) => void;
  /** While true, a tap on the map sets the user's position instead of selecting a place. */
  picking: boolean;
  startPicking: () => void;
  stopPicking: () => void;
}

const CampusContext = createContext<CampusState | null>(null);

/**
 * The campus by places, kept live by the shared feed in @campus-live/client, and what the tabs share:
 * the filters, the selected place and the user's position (the web keeps these in LiveDashboard).
 */
export function CampusProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<PlacesState>(EMPTY_PLACES_STATE);
  const [history, setHistory] = useState<SessionHistory>({});
  const [topic, setTopic] = useState<CameraKind | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [me, setMe] = useState<MyLocation | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!API_URL) return;
    return startPlacesFeed(API_URL, (next) => {
      setLive(next);
      const now = Date.now();
      setHistory((previous) => appendPlaces(previous, next.places, now));
    });
  }, []);

  const value = useMemo<CampusState>(() => {
    const selected = live.places.find((place) => place.id === selectedId) ?? null;
    return {
      ...live,
      history,
      topic,
      section,
      chooseTopic: (next) => {
        setTopic(next);
        setSection(null);
        if (next && selected && PLACE_TOPIC[selected.kind] !== next) setSelectedId(null);
      },
      chooseSection: (next) => {
        setSection(next);
        if (next && selected && selected.section !== next) setSelectedId(null);
      },
      selectedId,
      select: setSelectedId,
      showOnMap: (id) => {
        setTopic(null);
        setSection(null);
        setSelectedId(id);
        router.navigate("/");
      },
      openDetail: (id) => {
        setSelectedId(id);
        router.navigate("/places");
      },
      me,
      setMe: (next) => {
        setMe(next);
        setPicking(false);
      },
      picking,
      startPicking: () => {
        setPicking(true);
        router.navigate("/");
      },
      stopPicking: () => setPicking(false),
    };
  }, [live, history, topic, section, selectedId, me, picking]);

  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampus(): CampusState {
  const campus = useContext(CampusContext);
  if (!campus) throw new Error("useCampus outside CampusProvider");
  return campus;
}
