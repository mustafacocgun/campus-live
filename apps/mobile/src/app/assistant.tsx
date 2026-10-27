import { askAssistant } from "@campus-live/client";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_URL } from "@/constants/api";

interface Turn {
  question: string;
  answer: string;
  fallback: boolean;
}

/** Ask about the live campus in Turkish; answers come only from the live data. */
export default function AssistantScreen() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const asked = question.trim();
    if (!asked || busy || !API_URL) return;
    setBusy(true);
    setQuestion("");
    try {
      const response = await askAssistant(API_URL, asked);
      setTurns((all) => [
        ...all,
        { question: asked, answer: response.answer, fallback: response.via === "fallback" },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Asistan şu an yanıt veremiyor.";
      setTurns((all) => [...all, { question: asked, answer: message, fallback: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Text style={styles.title}>Asistana sor</Text>
      <FlatList
        data={turns}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.turn}>
            <Text style={styles.question}>{item.question}</Text>
            <Text>{item.answer}</Text>
            {item.fallback && <Text style={styles.note}>Canlı verilerden özet</Text>}
          </View>
        )}
      />
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
          disabled={busy}
          style={[styles.button, busy && styles.busy]}
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
  form: { flexDirection: "row", gap: 8, padding: 12 },
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
