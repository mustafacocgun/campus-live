import { apiUrlProblem, askAssistant } from "@campus-live/client";
import type { AnswerPlace } from "@campus-live/contracts";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";
import { useSharedLocation } from "@/hooks/use-shared-location";

interface Turn {
  question: string;
  answer: string;
  fallback: boolean;
  /** The places the answer is about, nearest first: tap one to see it on the map. */
  places?: AnswerPlace[];
}

/**
 * Ask about the live campus in Turkish; answers come only from the live data. With the user's
 * position (the phone's, or picked on the map), "the nearest…" questions are answered from it; the
 * position goes to our API only, never to the LLM (D27).
 */
export default function AssistantScreen() {
  const router = useRouter();
  const { me, setMe, setPicking, setFocusId } = useSharedLocation();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Same check as the Harita tab: without it a question here silently did nothing (#12).
  const problem = apiUrlProblem(API_URL, Platform.OS);

  async function submit() {
    const asked = question.trim();
    if (!asked || busy || problem) return;
    setBusy(true);
    setQuestion("");
    try {
      const response = await askAssistant(API_URL, asked, me ? { lat: me.lat, lng: me.lng } : undefined);
      setTurns((all) => [
        ...all,
        {
          question: asked,
          answer: response.answer,
          fallback: response.via === "fallback",
          places: response.places,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Asistan şu an yanıt veremiyor.";
      setTurns((all) => [...all, { question: asked, answer: message, fallback: true }]);
    } finally {
      setBusy(false);
    }
  }

  /** The phone's position, after asking for permission; a map pick always works instead. */
  async function locateMe() {
    setLocating(true);
    setNote(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setNote("Konum izni verilmedi; haritadan seçebilirsin.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMe({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: "device",
        accuracy: position.coords.accuracy ? Math.round(position.coords.accuracy) : undefined,
      });
    } catch {
      setNote("Konum alınamadı; haritadan seçebilirsin.");
    } finally {
      setLocating(false);
    }
  }

  /** The map tab, to pick a position or to show a place. */
  function pickOnMap() {
    setPicking(true);
    router.navigate("/");
  }

  function showPlace(id: string) {
    setFocusId(id);
    router.navigate("/");
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Text style={styles.title}>Asistana sor</Text>
      {problem && <Text style={styles.error}>{problem}</Text>}
      <FlatList
        data={turns}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.turn}>
            <Text style={styles.question}>{item.question}</Text>
            <Text>{item.answer}</Text>
            {item.fallback && <Text style={styles.note}>Canlı verilerden özet</Text>}
            {item.places?.length ? (
              <View style={styles.chips}>
                {item.places.map((place) => (
                  <Pressable
                    key={place.id}
                    onPress={() => showPlace(place.id)}
                    style={styles.chip}
                    accessibilityRole="button"
                    accessibilityLabel={`${place.name} haritada göster`}
                  >
                    <Text style={styles.chipText} numberOfLines={1}>
                      📍 {place.name}
                      {place.metres !== null ? ` · ${place.metres} m` : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
      />
      <View style={styles.locationRow}>
        {me ? (
          <>
            <Text style={styles.locationText}>
              Konumun:{" "}
              {me.source === "device"
                ? `telefondan${me.accuracy ? ` (±${me.accuracy} m)` : ""}`
                : "haritadan seçildi"}
            </Text>
            <Pressable onPress={pickOnMap} style={styles.chip} accessibilityRole="button">
              <Text style={styles.chipText}>Değiştir</Text>
            </Pressable>
            <Pressable onPress={() => setMe(null)} style={styles.chip} accessibilityRole="button">
              <Text style={styles.chipText}>Kaldır</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={locateMe} disabled={locating} style={styles.chip} accessibilityRole="button">
              <Text style={styles.chipText}>{locating ? "Konum alınıyor…" : "Konumumu kullan"}</Text>
            </Pressable>
            <Pressable onPress={pickOnMap} style={styles.chip} accessibilityRole="button">
              <Text style={styles.chipText}>Haritadan seç</Text>
            </Pressable>
          </>
        )}
      </View>
      {note && <Text style={styles.privacy}>{note}</Text>}
      <Text style={styles.privacy}>Konum kaydedilmez; yapay zekâya yalnızca yaklaşık mesafe gider.</Text>
      <View style={styles.form}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={submit}
          placeholder="Örn. Otoparkta boş yer var mı?"
          maxLength={500}
          accessibilityLabel="Asistana sorunuz"
          style={styles.input}
        />
        <Pressable
          onPress={submit}
          disabled={busy || !!problem}
          style={[styles.button, (busy || !!problem) && styles.busy]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{busy ? "…" : "Sor"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontSize: 22, fontWeight: "700", padding: 12 },
  list: { paddingHorizontal: 12, gap: 12 },
  turn: { gap: 2 },
  question: { fontWeight: "600" },
  note: { fontSize: 12, color: "#9ca3af" },
  error: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
  },
  form: { flexDirection: "row", gap: 8, padding: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: {
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 13, color: "#1d4ed8" },
  locationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  locationText: { fontSize: 13, fontWeight: "600" },
  privacy: { fontSize: 11, color: "#9ca3af", paddingHorizontal: 12, paddingTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  button: { backgroundColor: "#000", borderRadius: 6, paddingHorizontal: 16, justifyContent: "center" },
  busy: { opacity: 0.5 },
  buttonText: { color: "#fff" },
});
