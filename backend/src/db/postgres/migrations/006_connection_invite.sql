CREATE TABLE IF NOT EXISTS connection_invite (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL REFERENCES qa_connection(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('head', 'lider', 'qa', 'visitante')),
  invited_by BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, email)
);

CREATE INDEX IF NOT EXISTS idx_connection_invite_email ON connection_invite (lower(email));

ALTER TABLE connection_invite ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE connection_invite FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE connection_invite FROM authenticated;
  END IF;
END $$;
