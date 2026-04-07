CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS provider_profiles (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_env_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  text_optimize TEXT NOT NULL,
  notice_generate TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id TEXT PRIMARY KEY,
  canonical TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_clauses (
  id TEXT PRIMARY KEY,
  clause_code TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_clauses_code ON safety_clauses (clause_code);

CREATE TABLE IF NOT EXISTS recognition_sessions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  device_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recognition_segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  polished_text TEXT NOT NULL,
  timing_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segments_session_idx ON recognition_segments (session_id, segment_index);

CREATE TABLE IF NOT EXISTS notice_reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  enterprise_name TEXT NOT NULL,
  inspector TEXT,
  inspected_at TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  pdf_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
