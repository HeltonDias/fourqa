CREATE TABLE IF NOT EXISTS app_user (
  id BIGSERIAL PRIMARY KEY,
  ado_profile_id TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  global_role TEXT NOT NULL DEFAULT 'qa' CHECK (global_role IN ('head', 'lider', 'qa', 'visitante')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_credential (
  user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  pat_encrypted TEXT NOT NULL,
  org_hint TEXT,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_connection (
  id BIGSERIAL PRIMARY KEY,
  org TEXT NOT NULL,
  project TEXT NOT NULL,
  test_plan_id INTEGER NOT NULL,
  test_plan_name TEXT,
  plan_key TEXT NOT NULL UNIQUE,
  title TEXT,
  legacy BOOLEAN NOT NULL DEFAULT false,
  created_by BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org, project, test_plan_id)
);

CREATE TABLE IF NOT EXISTS connection_member (
  connection_id BIGINT NOT NULL REFERENCES qa_connection(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role TEXT CHECK (role IS NULL OR role IN ('head', 'lider', 'qa', 'visitante')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_member_user ON connection_member (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_connection_plan_key_lower ON qa_connection (lower(plan_key));

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_member ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE app_user, user_credential, qa_connection, connection_member FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE app_user, user_credential, qa_connection, connection_member FROM authenticated;
  END IF;
END $$;
