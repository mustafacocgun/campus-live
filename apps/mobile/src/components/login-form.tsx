import { ApiRequestError, fetchAuthConfig, logIn, resendCode, signUp, verifyCode } from "@campus-live/client";
import type { AuthConfig, User } from "@campus-live/contracts";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Icon } from "@/components/icons";
import { API_URL } from "@/constants/api";
import { cardShadow } from "@/constants/theme";
import { useTheme } from "@/state/theme";

type Step = "login" | "signup" | "verify";

const RESEND_WAIT_S = 60;

/** Sign in, or sign up with a school e-mail and the 6-digit code mailed to it, as on the web's /giris. */
export function LoginForm({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const { c } = useTheme();
  const [step, setStep] = useState<Step>("login");
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [off, setOff] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    let current = true;
    fetchAuthConfig(API_URL)
      .then((loaded) => current && setConfig(loaded))
      .catch(
        (reason) => current && setOff(reason instanceof Error ? reason.message : "Hesap özellikleri kapalı."),
      );
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1_000);
    return () => clearTimeout(timer);
  }, [wait]);

  function go(next: Step) {
    setStep(next);
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.code === "EMAIL_NOT_VERIFIED") {
        go("verify");
        setError("Hesabınız henüz doğrulanmadı: e-postanıza gelen kodu girin ya da yeni kod isteyin.");
      } else {
        setError(reason instanceof Error ? reason.message : "Bir şeyler ters gitti.");
      }
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const address = email.trim();
    if (step === "login") {
      void run(async () => onSignedIn(await logIn(API_URL, address, password)));
    } else if (step === "signup") {
      void run(async () => {
        await signUp(API_URL, address, password);
        setCode("");
        setWait(RESEND_WAIT_S);
        go("verify");
      });
    } else {
      void run(async () => onSignedIn(await verifyCode(API_URL, address, code)));
    }
  }

  function resend() {
    void run(async () => {
      await resendCode(API_URL, email.trim());
      setWait(RESEND_WAIT_S);
    });
  }

  const domains = config?.domains.map((domain) => `@${domain}`).join(" ya da ") ?? "";
  const ready =
    step === "verify"
      ? code.length === 6
      : email.includes("@") && password.length >= (step === "signup" ? 8 : 1);
  const disabled = busy || Boolean(off) || !ready;
  const input = [styles.input, { backgroundColor: c.card2, borderColor: c.line, color: c.fg }];

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }, cardShadow(c)]}>
      {/* The account system's real state: the API answered its config, or it did not. */}
      <View style={styles.stateRow}>
        <View
          style={[styles.stateDot, { backgroundColor: off ? "#9ca3af" : config ? "#22c55e" : "#f59e0b" }]}
        />
        <Text style={[styles.caption, { color: c.muted }]}>
          HESAP SİSTEMİ: {off ? "KAPALI" : config ? "AKTİF" : "BAĞLANIYOR"}
        </Text>
      </View>

      {step === "verify" ? (
        <View>
          <Text accessibilityRole="header" style={[styles.title, { color: c.fg }]}>
            E-postanızı doğrulayın
          </Text>
          <Text style={[styles.lead, { color: c.muted }]}>
            <Text style={[styles.strong, { color: c.fg }]}>{email.trim()}</Text> adresine 6 haneli bir kod
            gönderdik. Kod 15 dakika geçerli.
          </Text>
        </View>
      ) : (
        <>
          <View>
            <Text accessibilityRole="header" style={[styles.title, { color: c.fg }]}>
              Kampüs hesabınızla giriş yapın
            </Text>
            <Text style={[styles.lead, { color: c.muted }]}>
              Yoğunluk uyarıları ve bildirimler için okul e-posta adresinizle giriş yapın.
            </Text>
          </View>
          <View
            accessibilityRole="tablist"
            style={[styles.tabs, { backgroundColor: c.card2, borderColor: c.line }]}
          >
            {(["login", "signup"] as const).map((option) => {
              const on = step === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => go(option)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.tab, on && [{ backgroundColor: c.card }, cardShadow(c)]]}
                >
                  <Text style={[styles.tabText, { color: on ? c.fg : c.muted }]}>
                    {option === "login" ? "Giriş yap" : "Kayıt ol"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {off && (
        <Text style={[styles.alert, { backgroundColor: c.warnBg, color: c.fg }]}>
          {off} Canlı harita hesap olmadan da çalışır.
        </Text>
      )}
      {error && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.alert, { backgroundColor: c.dangerBg, color: c.danger }]}
        >
          {error}
        </Text>
      )}

      {step !== "verify" ? (
        <>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.fg }]}>Üniversite e-posta adresi</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder={
                config?.domains.length ? `ad.soyad@${config.domains.at(-1)}` : "ad.soyad@okul.edu.tr"
              }
              placeholderTextColor={c.muted}
              style={input}
            />
            {step === "signup" && domains ? (
              <Text style={[styles.help, { color: c.muted }]}>
                Yalnızca {domains} adresleriyle kayıt olunur.
              </Text>
            ) : null}
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.fg }]}>Şifre</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={step === "signup" ? "new-password" : "current-password"}
              textContentType={step === "signup" ? "newPassword" : "password"}
              onSubmitEditing={() => !disabled && submit()}
              style={input}
            />
            {step === "signup" && <Text style={[styles.help, { color: c.muted }]}>En az 8 karakter.</Text>}
          </View>
        </>
      ) : (
        <View style={styles.field}>
          <Text style={[styles.label, { color: c.fg }]}>Doğrulama kodu</Text>
          <TextInput
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            placeholder="123456"
            placeholderTextColor={c.muted}
            style={[input, styles.code]}
          />
        </View>
      )}

      <Pressable
        onPress={submit}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: pressed ? c.accent2 : c.accent },
          disabled && styles.disabled,
        ]}
      >
        <Text style={[styles.submitText, { color: c.onAccent }]}>
          {busy
            ? "Bekleyin…"
            : step === "login"
              ? "Giriş yap"
              : step === "signup"
                ? "Doğrulama kodu gönder"
                : "Doğrula ve giriş yap"}
        </Text>
        {!busy && <Icon name="arrowRight" size={16} color={c.onAccent} />}
      </Pressable>

      {step === "verify" && (
        <View style={styles.verifyRow}>
          <Pressable onPress={resend} disabled={busy || wait > 0} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.link, { color: wait > 0 ? c.muted : c.accentText }]}>
              {wait > 0 ? `Yeni kod ${wait} sn sonra` : "Kodu yeniden gönder"}
            </Text>
          </Pressable>
          <Pressable onPress={() => go("signup")} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.lead, { color: c.muted }]}>E-postayı değiştir</Text>
          </Pressable>
        </View>
      )}

      {config?.devOutbox && (
        <View style={[styles.note, { backgroundColor: c.card2 }]}>
          <Icon name="info" size={14} color={c.muted} />
          <Text style={[styles.noteText, { color: c.muted }]}>
            <Text style={[styles.strong, { color: c.fg }]}>Geliştirme modu:</Text> e-posta gönderilmiyor; kod
            services/api/.mail-outbox klasörüne yazılıyor.
          </Text>
        </View>
      )}
      <View style={[styles.note, { backgroundColor: c.card2 }]}>
        <Icon name="shield" size={14} color={c.muted} />
        <Text style={[styles.noteText, { color: c.muted }]}>
          Kamera görüntüleri saklanmaz ve hiçbir yere gönderilmez; uygulama yalnızca sayıları gösterir.
          Hesabınızda yalnızca e-posta adresiniz ve bildirim ayarlarınız tutulur.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 16 },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  caption: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.2 },
  lead: { marginTop: 6, fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: "600" },
  tabs: { flexDirection: "row", gap: 4, borderRadius: 12, borderWidth: 1, padding: 4 },
  tab: { flex: 1, borderRadius: 8, minHeight: 38, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 14, fontWeight: "600" },
  alert: { borderRadius: 12, padding: 12, fontSize: 14, overflow: "hidden" },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, minHeight: 46, fontSize: 15 },
  code: { textAlign: "center", fontSize: 24, fontWeight: "700", letterSpacing: 8 },
  help: { fontSize: 12 },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    minHeight: 48,
  },
  submitText: { fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  verifyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  link: { fontSize: 14, fontWeight: "600" },
  note: { flexDirection: "row", gap: 8, borderRadius: 12, padding: 12 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
