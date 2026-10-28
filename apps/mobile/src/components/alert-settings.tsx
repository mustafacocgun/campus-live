import {
  ALERT_DIRECTION_TR,
  createAlertRule,
  deleteAlertRule,
  fetchAlertRules,
  fetchRegions,
  updateAlertRule,
} from "@campus-live/client";
import type { AlertDirection, AlertRule, AlertRulePatch, PlaceKind, Region } from "@campus-live/contracts";
import { useEffect, useState } from "react";
import { Modal, Pressable, SectionList, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/icons";
import { API_URL } from "@/constants/api";
import { cardShadow, tint } from "@/constants/theme";
import { useTheme } from "@/state/theme";

// The web app's AlertSettings (apps/web/src/components/AlertSettings.tsx): keep the two in step.
const REGIONS_REFRESH_MS = 10_000;

// The place list is long: grouped by kind, in the order people look for them.
const KIND_GROUP: [PlaceKind, string][] = [
  ["area", "Açık alanlar"],
  ["building", "Binalar"],
  ["parking", "Otoparklar"],
  ["road", "Yollar"],
];

function percentText(region: Region | undefined): string {
  if (!region || region.percent === null) return "şu an veri yok";
  return `şu an %${region.percent}${region.demo ? ", demo" : ""}`;
}

const message = (error: unknown) => (error instanceof Error ? error.message : "Bir şeyler ters gitti.");

/** The signed-in user's alert rules: add one for a place and a threshold, switch, mail or delete it. */
export function AlertSettings() {
  const { c } = useTheme();
  const [regions, setRegions] = useState<Region[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [direction, setDirection] = useState<AlertDirection>("below");
  const [threshold, setThreshold] = useState(60);
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([fetchRegions(API_URL), fetchAlertRules(API_URL)])
      .then(([loadedRegions, loadedRules]) => {
        if (!current) return;
        setRegions(loadedRegions);
        setRules(loadedRules);
        setPlaceId((chosen) => chosen || loadedRegions[0]?.id || "");
      })
      .catch((reason) => current && setError(message(reason)))
      .finally(() => current && setLoading(false));
    // The percents beside each region stay live while the settings are open.
    const timer = setInterval(() => {
      fetchRegions(API_URL)
        .then((fresh) => current && setRegions(fresh))
        .catch(() => undefined);
    }, REGIONS_REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);

  const byId = new Map(regions.map((region) => [region.id, region]));
  const chosen = byId.get(placeId);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const rule = await createAlertRule(API_URL, {
        place: placeId,
        direction,
        thresholdPct: threshold,
        email,
      });
      setRules((all) => [...all, rule]);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function change(rule: AlertRule, patch: AlertRulePatch) {
    setRules((all) => all.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)));
    try {
      const saved = await updateAlertRule(API_URL, rule.id, patch);
      setRules((all) => all.map((r) => (r.id === rule.id ? saved : r)));
    } catch (reason) {
      setRules((all) => all.map((r) => (r.id === rule.id ? rule : r)));
      setError(message(reason));
    }
  }

  async function remove(rule: AlertRule) {
    if (confirming !== rule.id) {
      setConfirming(rule.id);
      return;
    }
    setConfirming(null);
    try {
      await deleteAlertRule(API_URL, rule.id);
      setRules((all) => all.filter((r) => r.id !== rule.id));
    } catch (reason) {
      setError(message(reason));
    }
  }

  const step = (delta: number) => setThreshold((value) => Math.min(100, Math.max(5, value + delta)));
  const card = [styles.card, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)];

  return (
    <View style={styles.wrap}>
      <View>
        <Text accessibilityRole="header" style={[styles.title, { color: c.fg }]}>
          Bildirim ayarları
        </Text>
        <Text style={[styles.lead, { color: c.muted }]}>
          Bir yerin doluluğu belirlediğiniz eşiği geçtiğinde size haber verelim.
        </Text>
      </View>

      {error && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.alert, { backgroundColor: c.dangerBg, color: c.danger }]}
        >
          {error}
        </Text>
      )}

      <View style={[card, styles.form]}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: c.fg }]}>Yer</Text>
          <Pressable
            onPress={() => setChoosing(true)}
            disabled={loading || !regions.length}
            accessibilityRole="button"
            accessibilityHint="Yer listesini açar"
            style={[styles.select, { backgroundColor: c.card2, borderColor: c.line }]}
          >
            <Text numberOfLines={1} style={[styles.selectText, { color: chosen ? c.fg : c.muted }]}>
              {chosen ? `${chosen.name} (${percentText(chosen)})` : "Yerler yükleniyor…"}
            </Text>
            <Icon name="chevron" size={16} color={c.muted} />
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.fg }]}>Ne zaman</Text>
          <View style={styles.directions} accessibilityRole="radiogroup">
            {(["below", "above"] as const).map((option) => {
              const on = direction === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setDirection(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.direction,
                    on
                      ? { borderColor: c.accent, backgroundColor: tint(c.accent2, 0.1) }
                      : { borderColor: c.line, backgroundColor: c.card2 },
                  ]}
                >
                  <Text style={[styles.directionText, { color: on ? c.accentText : c.fg }]}>
                    {option === "below" ? "Eşiğin altına inince" : "Eşiğin üstüne çıkınca"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.fg }]}>Doluluk eşiği</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => step(-5)}
              disabled={threshold <= 5}
              accessibilityRole="button"
              accessibilityLabel="Eşiği 5 azalt"
              style={[styles.stepButton, { borderColor: c.line, backgroundColor: c.card2 }]}
            >
              <Text style={[styles.stepText, { color: c.fg }]}>−</Text>
            </Pressable>
            <Text
              accessibilityRole="adjustable"
              accessibilityValue={{ min: 5, max: 100, now: threshold, text: `yüzde ${threshold}` }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => step(event.nativeEvent.actionName === "increment" ? 5 : -5)}
              style={[styles.threshold, { color: c.fg }]}
            >
              %{threshold}
            </Text>
            <Pressable
              onPress={() => step(5)}
              disabled={threshold >= 100}
              accessibilityRole="button"
              accessibilityLabel="Eşiği 5 artır"
              style={[styles.stepButton, { borderColor: c.line, backgroundColor: c.card2 }]}
            >
              <Text style={[styles.stepText, { color: c.fg }]}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <Text style={[styles.body, { color: c.fg }]}>E-postama da gönder</Text>
          <Switch
            value={email}
            onValueChange={setEmail}
            trackColor={{ true: c.accent2, false: c.lineStrong }}
            thumbColor="#ffffff"
            accessibilityLabel="E-postama da gönder"
          />
        </View>

        <View style={[styles.summary, { borderColor: c.line }]}>
          <Text style={[styles.body, { color: c.muted }]}>
            {chosen ? (
              <>
                <Text style={[styles.strong, { color: c.fg }]}>{chosen.name}</Text> doluluğu %{threshold}{" "}
                {ALERT_DIRECTION_TR[direction]} bildirim gelir.
              </>
            ) : (
              "Yerler yükleniyor…"
            )}
          </Text>
          <Pressable
            onPress={() => void add()}
            disabled={busy || !chosen}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: pressed ? c.accent2 : c.accent },
              (busy || !chosen) && styles.disabled,
            ]}
          >
            <Text style={[styles.addText, { color: c.onAccent }]}>
              {busy ? "Ekleniyor…" : "Bildirimi ekle"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.rules}>
        <View style={styles.rulesHead}>
          <Text style={[styles.label, { color: c.fg }]}>Bildirimlerim</Text>
          {rules.length > 0 && <Text style={[styles.small, { color: c.muted }]}>{rules.length} kural</Text>}
        </View>
        {loading ? (
          <Text style={[styles.body, { color: c.muted }]}>Yükleniyor…</Text>
        ) : rules.length ? (
          rules.map((rule) => (
            <View
              key={rule.id}
              style={[
                styles.rule,
                { backgroundColor: c.card, borderColor: c.line },
                !rule.enabled && styles.faded,
              ]}
            >
              <View style={styles.ruleText}>
                <Text numberOfLines={1} style={[styles.strong, { color: c.fg }]}>
                  {rule.placeName}
                </Text>
                <Text style={[styles.small, { color: c.muted }]}>
                  %{rule.thresholdPct} {ALERT_DIRECTION_TR[rule.direction]},{" "}
                  {percentText(byId.get(rule.place))}
                </Text>
              </View>
              <Pressable
                onPress={() => void change(rule, { email: !rule.email })}
                accessibilityRole="button"
                accessibilityState={{ selected: rule.email }}
                accessibilityLabel={rule.email ? "E-postayla gönderme" : "E-postayla da gönder"}
                style={[styles.ruleButton, rule.email && { backgroundColor: tint(c.accent2, 0.15) }]}
              >
                <Icon name="mail" size={18} color={rule.email ? c.accentText : c.muted} />
              </Pressable>
              <Switch
                value={rule.enabled}
                onValueChange={(enabled) => void change(rule, { enabled })}
                trackColor={{ true: c.accent2, false: c.lineStrong }}
                thumbColor="#ffffff"
                accessibilityLabel={`${rule.placeName} bildirimi ${rule.enabled ? "açık" : "kapalı"}`}
              />
              <Pressable
                onPress={() => void remove(rule)}
                accessibilityRole="button"
                accessibilityLabel={confirming === rule.id ? "Silmeyi onayla" : "Kuralı sil"}
                style={[styles.ruleButton, confirming === rule.id && { backgroundColor: c.dangerBg }]}
              >
                <Icon name="trash" size={18} color={confirming === rule.id ? c.danger : c.muted} />
                {confirming === rule.id && (
                  <Text style={[styles.small, styles.strong, { color: c.danger }]}>Sil</Text>
                )}
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={[styles.empty, { color: c.muted, borderColor: c.line }]}>
            Henüz bildirim yok. Yukarıdan bir yer ve eşik seçip ekleyin.
          </Text>
        )}
      </View>

      <Text style={[styles.small, styles.fine, { color: c.muted }]}>
        Yüzde, bir yerdeki kameraların saydığı kişilerin ya da araçların o yerin tahmini kapasitesine
        oranıdır; otoparklarda dolu park yerlerinin oranıdır. Kapasiteler henüz ölçülmedi. Bildirim, doluluk
        eşiği geçtiği anda bir kez gelir ve eşiğin öbür yanına dönmeden tekrarlanmaz. Bildirimler uygulama
        açıkken gelir.
      </Text>

      <RegionPicker
        open={choosing}
        regions={regions}
        chosen={placeId}
        onChoose={(id) => {
          setPlaceId(id);
          setChoosing(false);
        }}
        onClose={() => setChoosing(false)}
      />
    </View>
  );
}

/** The long place list as a searchable sheet, grouped by kind: a phone has no <select> with groups. */
function RegionPicker({
  open,
  regions,
  chosen,
  onChoose,
  onClose,
}: {
  open: boolean;
  regions: Region[];
  chosen: string;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("tr");
  const sections = KIND_GROUP.map(([kind, title]) => ({
    title,
    data: regions.filter(
      (region) => region.kind === kind && (!needle || region.name.toLocaleLowerCase("tr").includes(needle)),
    ),
  })).filter((section) => section.data.length);
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.sheet, { backgroundColor: c.panel, paddingTop: insets.top + 8 }]}>
        <View style={styles.sheetHead}>
          <Text accessibilityRole="header" style={[styles.title, { color: c.fg }]}>
            Yer seç
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            style={styles.ruleButton}
          >
            <Icon name="close" size={20} color={c.muted} />
          </Pressable>
        </View>
        <View style={[styles.search, { backgroundColor: c.card, borderColor: c.line }]}>
          <Icon name="search" size={16} color={c.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Yer ara…"
            placeholderTextColor={c.muted}
            accessibilityLabel="Yer ara"
            style={[styles.searchInput, { color: c.fg }]}
          />
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(region) => region.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionTitle, { color: c.muted, backgroundColor: c.panel }]}>
              {section.title.toLocaleUpperCase("tr")}
            </Text>
          )}
          renderItem={({ item }) => {
            const on = item.id === chosen;
            return (
              <Pressable
                onPress={() => onChoose(item.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                android_ripple={{ color: c.line }}
                style={[
                  styles.option,
                  {
                    backgroundColor: on ? tint(c.accent2, 0.1) : c.card,
                    borderColor: on ? c.accent : c.line,
                  },
                ]}
              >
                <Text numberOfLines={1} style={[styles.strong, { color: on ? c.accentText : c.fg }]}>
                  {item.name}
                </Text>
                <Text style={[styles.small, { color: c.muted }]}>{percentText(item)}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={[styles.body, { color: c.muted }]}>Eşleşen yer yok.</Text>}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.2 },
  lead: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  alert: { borderRadius: 12, padding: 12, fontSize: 14, overflow: "hidden" },
  card: { borderRadius: 16, borderWidth: 1 },
  form: { padding: 16, gap: 16 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: "600" },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  selectText: { flex: 1, fontSize: 14 },
  directions: { flexDirection: "row", gap: 8 },
  direction: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  directionText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 22, fontWeight: "600" },
  threshold: { flex: 1, textAlign: "center", fontSize: 28, fontWeight: "700", fontVariant: ["tabular-nums"] },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  body: { fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: "600", fontSize: 14 },
  small: { fontSize: 12 },
  summary: { borderTopWidth: 1, paddingTop: 14, gap: 12 },
  addButton: { borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center" },
  addText: { fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  rules: { gap: 8 },
  rulesHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  rule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
  },
  faded: { opacity: 0.6 },
  ruleText: { flex: 1, minWidth: 0 },
  ruleButton: {
    minWidth: 44,
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  empty: { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 12, fontSize: 14 },
  fine: { lineHeight: 17 },
  sheet: { flex: 1, paddingHorizontal: 16, gap: 12 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  sectionTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4, paddingTop: 14, paddingBottom: 6 },
  option: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6 },
});
