import { useId, useState } from "react";
import { type GestureResponderEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import type { SessionPoint } from "@/lib/session-history";
import { useTheme } from "@/state/theme";

// The web app's SessionChart (apps/web/src/components/SessionChart.tsx): keep the two in step.
const W = 280;
const H = 104;
const PAD = { top: 10, right: 10, bottom: 20, left: 30 };

/** Campus time, whatever the device's zone (CLAUDE.md §2.10). */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** One place's values since the app opened; touch the chart to read any point. */
export function SessionChart({ points, unit }: { points: SessionPoint[]; unit: string }) {
  const { c } = useTheme();
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(W);
  const gradient = `chart${useId().replace(/[^\w-]/g, "")}`;
  if (points.length < 2)
    return (
      <Text style={[styles.empty, { color: c.muted, borderColor: c.line }]}>
        Grafik ilk birkaç okumadan sonra çizilir.
      </Text>
    );

  const values = points.map((point) => point.value);
  const top = Math.max(1, ...values);
  const first = points[0].at;
  const last = points[points.length - 1];
  const span = Math.max(1, last.at - first);
  const x = (at: number) => PAD.left + ((at - first) / span) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - value / top) * (H - PAD.top - PAD.bottom);
  const base = y(0);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join("");
  const area = `${line}L${x(last.at).toFixed(1)} ${base}L${PAD.left} ${base}Z`;
  const index = active === null ? null : Math.min(active, points.length - 1);
  const shown = index === null ? null : points[index];
  const summary = `Bu oturumda ${points.length} okuma: en düşük ${Math.min(...values)}, en yüksek ${Math.max(...values)}, son ${last.value} ${unit}.`;

  function pick(event: GestureResponderEvent) {
    const px = (event.nativeEvent.locationX / width) * W;
    let best = 0;
    points.forEach((point, i) => {
      if (Math.abs(x(point.at) - px) < Math.abs(x(points[best].at) - px)) best = i;
    });
    setActive(best);
  }

  const left = shown ? (x(shown.at) / W) * 100 : 0;
  return (
    <View
      accessible
      accessibilityLabel={summary}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width || W)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={pick}
      onResponderMove={pick}
      onResponderRelease={() => setActive(null)}
      onResponderTerminate={() => setActive(null)}
      style={styles.wrap}
    >
      <Svg width="100%" height={(width / W) * H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id={`${gradient}-line`} x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor={c.accent} />
            <Stop offset="1" stopColor={c.accent2} />
          </LinearGradient>
          <LinearGradient id={`${gradient}-area`} x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={c.accent2} stopOpacity={0.3} />
            <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Line x1={PAD.left} x2={W - PAD.right} y1={y(top)} y2={y(top)} stroke={c.line} />
        <Line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} stroke={c.line} />
        <SvgText x={PAD.left - 6} y={y(top) + 3} textAnchor="end" fontSize={10} fill={c.muted}>
          {top}
        </SvgText>
        <SvgText x={PAD.left - 6} y={base + 3} textAnchor="end" fontSize={10} fill={c.muted}>
          0
        </SvgText>
        <SvgText x={PAD.left} y={H - 4} fontSize={10} fill={c.muted}>
          {clock(first)}
        </SvgText>
        <SvgText x={W - PAD.right} y={H - 4} textAnchor="end" fontSize={10} fill={c.muted}>
          {clock(last.at)}
        </SvgText>
        <Path d={area} fill={`url(#${gradient}-area)`} />
        <Path
          d={line}
          fill="none"
          stroke={`url(#${gradient}-line)`}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {shown && (
          <Line
            x1={x(shown.at)}
            x2={x(shown.at)}
            y1={PAD.top}
            y2={base}
            stroke={c.muted}
            strokeOpacity={0.6}
          />
        )}
        <Circle
          cx={x((shown ?? last).at)}
          cy={y((shown ?? last).value)}
          r={4}
          strokeWidth={2}
          fill={c.accent2}
          stroke={c.card}
        />
      </Svg>
      {shown && (
        <View
          pointerEvents="none"
          style={[
            styles.tip,
            {
              backgroundColor: c.card,
              borderColor: c.line,
              left: `${left}%`,
              transform: [{ translateX: left < 25 ? 0 : left > 75 ? -110 : -55 }],
            },
          ]}
        >
          <Text style={[styles.tipValue, { color: c.fg }]}>
            {shown.value} {unit}
          </Text>
          <Text style={[styles.tipTime, { color: c.muted }]}>{clock(shown.at)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  empty: { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 12, fontSize: 12 },
  tip: {
    position: "absolute",
    top: -40,
    width: 110,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tipValue: { fontSize: 12, fontWeight: "600" },
  tipTime: { fontSize: 12 },
});
