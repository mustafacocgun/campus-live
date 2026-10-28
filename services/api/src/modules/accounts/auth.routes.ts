import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import {
  LoginRequest,
  ResendCodeRequest,
  SignupRequest,
  type User,
  VerifyRequest,
} from "@campus-live/contracts";
import { type Response, Router } from "express";
import { HttpError, ok } from "../../lib/http.js";
import { type Mailer, mailErrorSummary } from "../../lib/mailer.js";
import { rateLimit } from "../assistant/rate-limit.js";
import type { AccountsRepo } from "./accounts.repo.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { currentUser, requireUser } from "./require-user.js";
import { isSchoolEmail } from "./school-email.js";
import {
  clearSessionCookie,
  hashToken,
  newSessionToken,
  SESSION_DAYS,
  sessionTokenFrom,
  setSessionCookie,
} from "./sessions.js";

const CODE_TTL_MS = 15 * 60_000;
const CODE_RESEND_MS = 60_000;
const CODE_MAX_ATTEMPTS = 5;
const TOO_MANY = "Çok fazla deneme: lütfen biraz bekleyin.";

export interface AccountsDeps {
  repo: AccountsRepo;
  mailer: Mailer;
  allowedDomains: string[];
  /** Secure cookies outside development (HTTPS only). */
  secureCookies: boolean;
}

/** The code is hashed with its user's id, so one stolen hash fits no other account. */
function codeHash(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** POST /api/auth/*: sign-up with a school e-mail and a mailed code, then e-mail + password sessions. */
export function authRouter(deps: AccountsDeps): Router {
  const { repo, mailer } = deps;
  const router = Router();
  const limited = rateLimit(10, 60_000, TOO_MANY);

  async function sendCode(userId: string, email: string): Promise<void> {
    if (mailer.mode === "off") {
      throw new HttpError(503, "MAIL_OFF", "E-posta gönderimi ayarlanmamış: kayıt şu an yapılamıyor.");
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await repo.putCode(userId, codeHash(userId, code), new Date(Date.now() + CODE_TTL_MS));
    try {
      await mailer.send({
        to: email,
        subject: "Campus Live doğrulama kodunuz",
        text:
          `Campus Live hesabınızı açmak için kodunuz: ${code}\n\n` +
          `Kod ${CODE_TTL_MS / 60_000} dakika geçerlidir. Bu kaydı siz yapmadıysanız bu e-postayı yok sayın.`,
      });
    } catch (error) {
      await repo.deleteCode(userId);
      console.error(`Sign-up code: ${mailErrorSummary(error)}`);
      throw new HttpError(
        502,
        "MAIL_FAILED",
        "Doğrulama e-postası gönderilemedi: biraz sonra yeniden deneyin.",
      );
    }
  }

  async function startSession(res: Response, user: User): Promise<void> {
    const { token, hash } = newSessionToken();
    await repo.createSession(user.id, hash, new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60_000));
    setSessionCookie(res, token, deps.secureCookies);
  }

  function refuseEarlyResend(sentAt: Date | undefined): void {
    if (sentAt && Date.now() - sentAt.getTime() < CODE_RESEND_MS) {
      throw new HttpError(429, "CODE_RECENTLY_SENT", "Yeni bir kod için bir dakika bekleyin.");
    }
  }

  router.get("/config", (_req, res) => {
    res.json(ok({ domains: deps.allowedDomains, devOutbox: mailer.mode === "outbox" }));
  });

  router.post("/signup", limited, async (req, res) => {
    const { email, password } = SignupRequest.parse(req.body);
    if (!deps.allowedDomains.length) {
      throw new HttpError(
        503,
        "SIGNUP_CLOSED",
        "Kayıt şu an kapalı: izin verilen okul alan adı ayarlanmamış.",
      );
    }
    if (!isSchoolEmail(email, deps.allowedDomains)) {
      throw new HttpError(
        400,
        "EMAIL_NOT_ALLOWED",
        `Yalnızca okul e-postasıyla kayıt olunabilir (${deps.allowedDomains.map((d) => `@${d}`).join(", ")}).`,
      );
    }
    const existing = await repo.findByEmail(email);
    if (existing?.verified) {
      throw new HttpError(409, "EMAIL_TAKEN", "Bu e-postayla bir hesap zaten var: giriş yapın.");
    }
    if (existing) refuseEarlyResend((await repo.getCode(existing.id))?.sentAt);
    const userId = await repo.upsertPending(email, await hashPassword(password));
    if (!userId) throw new HttpError(409, "EMAIL_TAKEN", "Bu e-postayla bir hesap zaten var: giriş yapın.");
    await sendCode(userId, email);
    res.status(202).json(ok({ email }));
  });

  // Always 202, so the answer does not tell whether an e-mail has a pending account.
  router.post("/resend", limited, async (req, res) => {
    const { email } = ResendCodeRequest.parse(req.body);
    const user = await repo.findByEmail(email);
    if (user && !user.verified) {
      refuseEarlyResend((await repo.getCode(user.id))?.sentAt);
      await sendCode(user.id, email);
    }
    res.status(202).json(ok({ email }));
  });

  router.post("/verify", limited, async (req, res) => {
    const { email, code } = VerifyRequest.parse(req.body);
    const user = await repo.findByEmail(email);
    const stored = user && !user.verified ? await repo.getCode(user.id) : null;
    if (!user || !stored) throw new HttpError(400, "CODE_INVALID", "Kod geçersiz: yeni bir kod isteyin.");
    if (stored.attempts >= CODE_MAX_ATTEMPTS) {
      throw new HttpError(429, "CODE_LOCKED", "Çok fazla hatalı deneme: yeni bir kod isteyin.");
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "CODE_EXPIRED", "Kodun süresi doldu: yeni bir kod isteyin.");
    }
    if (!sameHash(stored.codeHash, codeHash(user.id, code))) {
      await repo.countWrongGuess(user.id);
      throw new HttpError(400, "CODE_WRONG", "Kod hatalı.");
    }
    await repo.markVerified(user.id);
    const signedIn = { id: user.id, email: user.email };
    await startSession(res, signedIn);
    res.json(ok(signedIn));
  });

  router.post("/login", limited, async (req, res) => {
    const { email, password } = LoginRequest.parse(req.body);
    const user = await repo.findByEmail(email);
    const valid = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !valid) throw new HttpError(401, "BAD_CREDENTIALS", "E-posta ya da şifre hatalı.");
    if (!user.verified) {
      throw new HttpError(403, "EMAIL_NOT_VERIFIED", "Önce e-postanıza gelen kodla hesabınızı doğrulayın.");
    }
    const signedIn = { id: user.id, email: user.email };
    await startSession(res, signedIn);
    res.json(ok(signedIn));
  });

  router.post("/logout", async (req, res) => {
    const token = sessionTokenFrom(req);
    if (token) await repo.deleteSession(hashToken(token));
    clearSessionCookie(res, deps.secureCookies);
    res.json(ok(null));
  });

  router.get("/me", requireUser(repo), (_req, res) => {
    res.json(ok(currentUser(res)));
  });

  return router;
}
