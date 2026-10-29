-- "Anyone with the link": 'viewer' = public view-only (no sign-in), 'editor' = signed-in users join as editors.
ALTER TABLE boards ADD COLUMN link_role TEXT CHECK (link_role IN ('viewer', 'editor'));
ALTER TABLE boards ADD COLUMN link_token TEXT;
CREATE UNIQUE INDEX boards_link_token_idx ON boards (link_token);

-- Invites for emails that don't have an account yet; claimed when a verified account with that email
-- is created (see apps/worker/src/auth.ts).
CREATE TABLE board_invites (
  board_id TEXT NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  invited_by TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, email)
);
CREATE INDEX board_invites_email_idx ON board_invites (email);
