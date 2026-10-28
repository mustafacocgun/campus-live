import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { API_URL } from "@/constants/api";
import { useTheme } from "@/state/theme";

// Its typings default the extra props to `undefined`, which leaves no valid props at all.
const PreviewWebView = WebView<object>;

/**
 * A page whose only content is the API's stream. React Native's Image cannot play MJPEG; a WebView's
 * <img> can. The page tells the app whether the stream plays or is missing.
 */
function previewHtml(placeId: string): string {
  const src = JSON.stringify(`${API_URL}/api/preview/${encodeURIComponent(placeId)}`);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}img{display:block;width:100%;height:100%;object-fit:contain}</style>
</head><body><img id="v"><script>
var v = document.getElementById("v");
v.onload = function () { window.ReactNativeWebView.postMessage("live"); };
v.onerror = function () { window.ReactNativeWebView.postMessage("off"); };
v.src = ${src};
</script></body></html>`;
}

/**
 * The stage preview (D33): what the place's camera sees right now, with YOLO's boxes, streamed by the
 * API. It hides itself when the API has none (the default: the preview is off outside the demo
 * machine).
 */
export function PlacePreview({ placeId }: { placeId: string }) {
  const { c } = useTheme();
  const [state, setState] = useState<{ placeId: string; status: "loading" | "live" | "off" }>({
    placeId,
    status: "loading",
  });
  // A new place starts loading again, without an effect.
  const status = state.placeId === placeId ? state.status : "loading";
  if (!API_URL || status === "off") return null;

  function receive(event: WebViewMessageEvent) {
    setState({ placeId, status: event.nativeEvent.data === "live" ? "live" : "off" });
  }

  return (
    <View style={[styles.wrap, { borderColor: c.line }]}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          {status === "live" && <View style={styles.liveDot} />}
          <Text style={[styles.title, { color: c.fg }]}>Görüntü işleme · canlı</Text>
        </View>
        <Text style={[styles.small, { color: c.muted }]}>YOLO11n tespitleri</Text>
      </View>
      {/* The stream only shows: touches pass through, so the page still scrolls over it. */}
      <View pointerEvents="none" style={[styles.frame, { borderColor: c.line }]}>
        <PreviewWebView
          key={placeId}
          // The API as the page's address: the stream is then same-origin for the <img>.
          source={{ html: previewHtml(placeId), baseUrl: API_URL }}
          originWhitelist={["*"]}
          onMessage={receive}
          javaScriptEnabled
          scrollEnabled={false}
          style={styles.web}
        />
        {status === "loading" && (
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>Görüntü bekleniyor…</Text>
          </View>
        )}
      </View>
      <Text style={[styles.note, { color: c.muted }]}>
        Demo görüntüsü, kampüs kamerası değil. Yeşil kutular kişi, turuncu kutular araç. Görüntü
        kaydedilmez.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, borderTopWidth: 1, paddingTop: 12, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  title: { fontSize: 12, fontWeight: "600" },
  small: { fontSize: 12 },
  frame: {
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  web: { flex: 1, backgroundColor: "#000000" },
  waiting: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  waitingText: { fontSize: 12, color: "rgba(255, 255, 255, 0.7)" },
  note: { fontSize: 11 },
});
