-- Accounts and region alerts. Only the school e-mail, a scrypt hash of the password and the user's
-- alert rules are kept: no names, no student numbers (CLAUDE.md §0.4).

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  verified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The sign-up code: one live code per user, stored as a hash, with a cap on wrong guesses.
CREATE TABLE email_codes (
  user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  sent_at    timestamptz NOT NULL DEFAULT now()
);

-- Sessions are looked up by a hash of the cookie's token: a leaked table cannot sign anyone in.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id ON sessions (user_id);

-- A place is an id from config/places.json, not a foreign key: places live in that file.
CREATE TABLE alert_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place            text NOT NULL,
  direction        text NOT NULL CHECK (direction IN ('below', 'above')),
  threshold_pct    integer NOT NULL CHECK (threshold_pct BETWEEN 1 AND 100),
  email            boolean NOT NULL DEFAULT false,
  enabled          boolean NOT NULL DEFAULT true,
  last_notified_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alert_rules_user_id ON alert_rules (user_id);

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rule_id       uuid REFERENCES alert_rules (id) ON DELETE SET NULL,
  place         text NOT NULL,
  -- The name when it was sent: the inbox reads the same even if places.json renames the place.
  place_name    text NOT NULL,
  direction     text NOT NULL,
  threshold_pct integer NOT NULL,
  percent       integer NOT NULL,
  demo          boolean NOT NULL,
  message       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
);
CREATE INDEX notifications_user_created ON notifications (user_id, created_at DESC);
