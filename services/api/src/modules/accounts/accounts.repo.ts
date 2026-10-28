import type { User } from "@campus-live/contracts";
import type { Db } from "../../db/database.js";

export interface StoredUser extends User {
  passwordHash: string;
  verified: boolean;
}

export interface StoredCode {
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  sentAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  verified_at: Date | null;
}

interface CodeRow {
  code_hash: string;
  expires_at: Date;
  attempts: number;
  sent_at: Date;
}

/** Every SQL query on users, sign-up codes and sessions. */
export class AccountsRepo {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string): Promise<StoredUser | null> {
    const { rows } = await this.db.query<UserRow>(
      "SELECT id, email, password_hash, verified_at FROM users WHERE email = $1",
      [email],
    );
    const row = rows[0];
    return row
      ? { id: row.id, email: row.email, passwordHash: row.password_hash, verified: row.verified_at !== null }
      : null;
  }

  /**
   * Creates the account unverified, or replaces the password of one still waiting for its code.
   * Returns null when the e-mail already has a verified account, which is never overwritten.
   */
  async upsertPending(email: string, passwordHash: string): Promise<string | null> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       WHERE users.verified_at IS NULL
       RETURNING id`,
      [email, passwordHash],
    );
    return rows[0]?.id ?? null;
  }

  async getCode(userId: string): Promise<StoredCode | null> {
    const { rows } = await this.db.query<CodeRow>(
      "SELECT code_hash, expires_at, attempts, sent_at FROM email_codes WHERE user_id = $1",
      [userId],
    );
    const row = rows[0];
    return row
      ? { codeHash: row.code_hash, expiresAt: row.expires_at, attempts: row.attempts, sentAt: row.sent_at }
      : null;
  }

  /** A new code replaces the old one and its wrong guesses. */
  async putCode(userId: string, codeHash: string, expiresAt: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO email_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = now()`,
      [userId, codeHash, expiresAt],
    );
  }

  async deleteCode(userId: string): Promise<void> {
    await this.db.query("DELETE FROM email_codes WHERE user_id = $1", [userId]);
  }

  async countWrongGuess(userId: string): Promise<void> {
    await this.db.query("UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = $1", [userId]);
  }

  async markVerified(userId: string): Promise<void> {
    await this.db.query("UPDATE users SET verified_at = now() WHERE id = $1", [userId]);
    await this.deleteCode(userId);
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
      tokenHash,
      userId,
      expiresAt,
    ]);
  }

  /** The signed-in user behind a session, or null when it is unknown or expired. */
  async userBySession(tokenHash: string): Promise<User | null> {
    const { rows } = await this.db.query<User>(
      `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ? { id: rows[0].id, email: rows[0].email } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
  }
}
