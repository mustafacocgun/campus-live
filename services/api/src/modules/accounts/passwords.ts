import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";

// Node's own scrypt: no extra package for passwords. N=2^15 costs ~50 ms here, cheap for a login and
// expensive for a guess; maxmem must grow with it (128 * N * r bytes).
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** `scrypt$N$r$p$salt$key`, salt and key in base64url: the parameters travel with each hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join(
    "$",
  );
}

// Checked against when the e-mail has no account, so a missing account takes as long as a wrong password.
const NO_ACCOUNT_HASH = `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${"A".repeat(22)}$${"A".repeat(86)}`;

/** True when `password` matches `stored`; false for a malformed hash. Runs scrypt even without one. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = (stored ?? NO_ACCOUNT_HASH).split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return stored !== null && actual.length === expected.length && timingSafeEqual(actual, expected);
}
