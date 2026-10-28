import { apiUrlProblem, askAssistant } from "@campus-live/client";
import type { AnswerPlace, CameraKind } from "@campus-live/contracts";
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppHeader } from "@/components/app-header";
import { Icon, KindIcon, SparkleIcon } from "@/components/icons";
import { API_URL } from "@/constants/api";
import { cardShadow, tint } from "@/constants/theme";
import { kmFromCampus, locateDevice } from "@/lib/my-location";
import { useCampus } from "@/state/campus";
import { useTheme } from "@/state/theme";

interface Turn {
  question: string;
  answer: string;
  fallback: boolean;
  /** The places the answer is about, nearest first: tap one to see it on the map. */
  places?: AnswerPlace[];
}

interface Suggestion {
  text: string;
  hint: string;
  icon: (color: string) => ReactNode;
}

const kindIcon = (kind: CameraKind) => (color: string) => <KindIcon kind={kind} size={16} color={color} />;
const pinIcon = (color: string) => <Icon name="pin" size={16} color={color} />;

/** One per camera kind; each matches a fallback intent, so they answer without the LLM too. */
const SUGGESTIONS: Suggestion[] = [
  { text: "Otoparkta boş yer var mı?", hint: "Otoparklar", icon: kindIcon("parking") },
  { text: "Kütüphane kalabalık mı?", hint: "Kalabalık", icon: kindIcon("crowd") },
  { text: "Yolda trafik nasıl?", hint: "Trafik", icon: kindIcon("traffic") },
];
/** With a position, the "nearest" questions come first. */
const NEARBY_SUGGESTIONS: Suggestion[] = [
  { text: "Bana en yakın otopark nerede?", hint: "Konumuna göre", icon: pinIcon },
  { text: "En yakın kafe nerede?", hint: "Konumuna göre", icon: pinIcon },
];

function Avatar() {
  const { c } = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: c.accent }]}>
      <SparkleIcon size={14} color={c.onAccent} />
    </View>
  );
}

/**
 * Ask about the live campus in Turkish; answers come only from the live data (CLAUDE.md §4.7). With the
 * user's position (from the device or picked on the map), "the nearest…" questions are answered from
 * it; the position stays in the app and the API, never reaching the LLM.
 */
export default function AssistantScreen() {
  const { c } = useTheme();
  const { me, setMe, picking, startPicking, stopPicking, showOnMap } = useCampus();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const log = useRef<ComponentRef<typeof ScrollView>>(null);
  // Same check as the Harita tab: without it a question here silently did nothing (#12).
  const problem = apiUrlProblem(API_URL, Platform.OS);
  const suggestions = [...(me ? NEARBY_SUGGESTIONS : []), ...SUGGESTIONS];

  useEffect(() => {
    log.current?.scrollToEnd({ animated: true });
  }, [turns, busy]);

  // The keyboard shrinks the conversation: the latest answer stays in view while typing.
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => log.current?.scrollToEnd({ animated: true }));
    return () => shown.remove();
  }, []);

  async function ask(text: string) {
    const asked = text.trim();
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

  async function locateMe() {
    setLocating(true);
    setNote(null);
    try {
      const found = await locateDevice();
      const km = kmFromCampus(found);
      if (km > 2)
        setNote(`Cihaz konumu kampüsten yaklaşık ${Math.round(km)} km uzakta; haritadan seçebilirsin.`);
      else if ((found.accuracy ?? 0) > 150)
        setNote(`Konum yaklaşık (±${found.accuracy} m); daha doğrusu için haritadan seç.`);
      setMe(found);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Konum alınamadı; haritadan seçebilirsin.");
    } finally {
      setLocating(false);
    }
  }

  const chip = (label: string, onPress: () => void, icon?: ReactNode, disabled = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: c.card, borderColor: pressed ? c.accent : c.line },
        disabled && styles.disabled,
      ]}
    >
      {icon}
      <Text style={[styles.chipText, { color: c.fg }]}>{label}</Text>
    </Pressable>
  );

  return (
    // "padding" on Android too: the app is edge to edge, so the window no longer shrinks for the
    // keyboard and the input would stay under it.
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: c.panel }]}>
      <AppHeader />
      <View style={[styles.panel, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}>
        {/* The assistant's own header: the one navy surface on the screen, so it reads as the feature. */}
        <View style={[styles.head, { backgroundColor: c.accent }]}>
          <View style={styles.headIcon}>
            <SparkleIcon size={20} color="#ffffff" />
          </View>
          <View style={styles.headText}>
            <View style={styles.headTitleRow}>
              <Text style={styles.headTitle}>Kampüs Asistanı</Text>
              <Text style={styles.aiBadge}>YAPAY ZEKÂ</Text>
            </View>
            <Text numberOfLines={1} style={styles.headSub}>
              Yanıtlar yalnızca canlı verilere dayanır.
            </Text>
          </View>
          {turns.length > 0 && (
            <Pressable
              onPress={() => setTurns([])}
              accessibilityRole="button"
              accessibilityLabel="Yeni sohbet"
              style={styles.headButton}
            >
              <Icon name="newChat" size={16} color="#ffffff" />
            </Pressable>
          )}
        </View>

        {problem && (
          <Text style={[styles.problem, { backgroundColor: c.dangerBg, color: c.danger }]}>{problem}</Text>
        )}

        <ScrollView
          ref={log}
          style={styles.log}
          contentContainerStyle={styles.logContent}
          keyboardShouldPersistTaps="handled"
        >
          {!turns.length && !busy && (
            <View style={styles.welcomeWrap}>
              <View style={styles.answerRow}>
                <Avatar />
                <View style={[styles.bubble, { backgroundColor: c.card2, borderColor: c.line }]}>
                  <Text style={[styles.bold, { color: c.fg }]}>Merhaba! Kampüste neyi merak ediyorsun?</Text>
                  <Text style={[styles.body, { color: c.muted }]}>
                    Kalabalık, boş park yeri ya da trafik hakkında sor; canlı verilerden yanıtlayayım.
                  </Text>
                </View>
              </View>
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.text}
                  onPress={() => void ask(suggestion.text)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.suggestion,
                    { backgroundColor: pressed ? c.card2 : c.card, borderColor: c.line },
                  ]}
                >
                  <View style={[styles.suggestionIcon, { backgroundColor: tint(c.accent2, 0.12) }]}>
                    {suggestion.icon(c.accentText)}
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.bold, { color: c.fg }]}>{suggestion.text}</Text>
                    <Text style={[styles.small, { color: c.muted }]}>{suggestion.hint}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          {turns.map((turn, index) => (
            <View key={index} style={styles.turn}>
              <Text style={[styles.question, { backgroundColor: c.accent, color: c.onAccent }]}>
                {turn.question}
              </Text>
              <View style={styles.answerRow}>
                <Avatar />
                <View style={[styles.bubble, { backgroundColor: c.card2, borderColor: c.line }]}>
                  <Text style={[styles.body, { color: c.fg }]}>{turn.answer}</Text>
                  {turn.places?.length ? (
                    <View style={styles.answerPlaces}>
                      {turn.places.map((place) => (
                        <Pressable
                          key={place.id}
                          onPress={() => showOnMap(place.id)}
                          accessibilityRole="button"
                          accessibilityHint="Haritada gösterir"
                          style={[styles.placeChip, { backgroundColor: c.card, borderColor: c.accentText }]}
                        >
                          <Icon name="pin" size={14} color={c.accentText} />
                          <Text numberOfLines={1} style={[styles.placeChipText, { color: c.accentText }]}>
                            {place.name}
                          </Text>
                          {place.metres !== null && (
                            <Text style={[styles.small, { color: c.muted }]}>· {place.metres} m</Text>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[styles.via, { color: c.muted }]}>
                    {turn.fallback ? "Canlı verilerden özet" : "Yapay zekâ, canlı verilerle"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          {busy && (
            <View style={styles.answerRow} accessibilityLabel="Yanıt hazırlanıyor">
              <Avatar />
              <View style={[styles.bubble, { backgroundColor: c.card2, borderColor: c.line }]}>
                <ActivityIndicator color={c.muted} />
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.foot, { backgroundColor: c.card2, borderColor: c.line }]}>
          {turns.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quick}
            >
              {suggestions.map((suggestion) =>
                chip(suggestion.text, () => void ask(suggestion.text), undefined, busy),
              )}
            </ScrollView>
          )}
          <View style={styles.locationRow}>
            {picking ? (
              <>
                <Text style={[styles.small, styles.bold, { color: c.accentText }]}>
                  Haritada konumuna dokun…
                </Text>
                {chip("Vazgeç", stopPicking)}
              </>
            ) : me ? (
              <>
                <View style={styles.meRow}>
                  <Icon name="locate" size={14} color={c.fg} />
                  <Text style={[styles.small, { color: c.fg }]}>
                    Konumun:{" "}
                    {me.source === "device"
                      ? `cihazdan${me.accuracy ? ` (±${me.accuracy} m)` : ""}`
                      : "haritadan seçildi"}
                  </Text>
                </View>
                {chip("Değiştir", startPicking)}
                {chip("Kaldır", () => setMe(null))}
              </>
            ) : (
              <>
                {chip(
                  locating ? "Konum alınıyor…" : "Konumumu kullan",
                  () => void locateMe(),
                  <Icon name="locate" size={14} color={c.fg} />,
                  locating,
                )}
                {chip("Haritadan seç", startPicking, <Icon name="pin" size={14} color={c.fg} />)}
              </>
            )}
          </View>
          {note && <Text style={[styles.small, { color: c.muted }]}>{note}</Text>}
          <View style={[styles.form, { backgroundColor: c.card, borderColor: c.line }]}>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={() => void ask(question)}
              placeholder="Asistana bir şey sor…"
              placeholderTextColor={c.muted}
              maxLength={500}
              returnKeyType="send"
              accessibilityLabel="Asistana sorunuz"
              style={[styles.input, { color: c.fg }]}
            />
            <Pressable
              onPress={() => void ask(question)}
              disabled={busy || !question.trim() || !!problem}
              accessibilityRole="button"
              accessibilityLabel="Sor"
              style={({ pressed }) => [
                styles.send,
                { backgroundColor: pressed ? c.accent2 : c.accent },
                (busy || !question.trim() || !!problem) && styles.disabled,
              ]}
            >
              <Text style={[styles.sendText, { color: c.onAccent }]}>{busy ? "…" : "Sor"}</Text>
              <Icon name="send" size={16} color={c.onAccent} />
            </Pressable>
          </View>
          {(me || picking) && (
            <Text numberOfLines={1} style={[styles.via, { color: c.muted }]}>
              Konum kaydedilmez; yapay zekâya yalnızca yaklaşık mesafe gider.
            </Text>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  panel: { flex: 1, margin: 12, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  headIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  headText: { flex: 1, minWidth: 0 },
  headTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headTitle: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  aiBadge: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
  },
  headSub: { color: "rgba(255, 255, 255, 0.8)", fontSize: 12 },
  headButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  problem: { margin: 12, marginBottom: 0, padding: 10, borderRadius: 10, fontSize: 14 },
  log: { flex: 1 },
  logContent: { padding: 16, gap: 16 },
  welcomeWrap: { gap: 10 },
  answerRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bubble: {
    flexShrink: 1,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bold: { fontWeight: "600", fontSize: 14 },
  body: { fontSize: 14, lineHeight: 21 },
  small: { fontSize: 12 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  suggestionIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  turn: { gap: 10 },
  question: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    overflow: "hidden",
  },
  answerPlaces: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  placeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  placeChipText: { fontSize: 12, fontWeight: "500", flexShrink: 1 },
  via: { fontSize: 11, marginTop: 4 },
  foot: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 8 },
  quick: { gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 12, fontWeight: "500" },
  disabled: { opacity: 0.45 },
  locationRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  meRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  form: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 5,
    paddingLeft: 14,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  send: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  sendText: { fontSize: 14, fontWeight: "600" },
});
