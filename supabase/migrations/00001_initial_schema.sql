-- ============================================================================
-- TeleDuo: Supabase schema
-- Users are created in Supabase Auth; app tables reference auth.users via FK.
-- ============================================================================

-- ── Users (app-level profile) ────────────────────────────────────────────────

CREATE TABLE public.users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT UNIQUE,
  email      TEXT UNIQUE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'bypass', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ── Devices ──────────────────────────────────────────────────────────────────

CREATE TABLE public.devices (
  id                 TEXT PRIMARY KEY,            -- DP + 18 alphanumeric chars
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type               TEXT NOT NULL DEFAULT 'phone',
  name               TEXT NOT NULL DEFAULT 'Telegram',
  display_name       TEXT NOT NULL DEFAULT 'Telegram',
  telegram_chat_id   BIGINT,
  telegram_username  TEXT,
  locale             TEXT NOT NULL DEFAULT 'en',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_user_id          ON public.devices(user_id);
CREATE INDEX idx_devices_telegram_chat_id ON public.devices(telegram_chat_id);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- ── Enrollments ──────────────────────────────────────────────────────────────

CREATE TABLE public.enrollments (
  activation_code TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  username        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'success', 'invalid')),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollments_user_id ON public.enrollments(user_id);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- ── Portal enrollments ───────────────────────────────────────────────────────

CREATE TABLE public.portal_enrollments (
  code           TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  activation_url TEXT,
  user_id        UUID,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_enrollments_username  ON public.portal_enrollments(username);
CREATE INDEX idx_portal_enrollments_expires   ON public.portal_enrollments(expires_at);

ALTER TABLE public.portal_enrollments ENABLE ROW LEVEL SECURITY;

-- ── Auth transactions ────────────────────────────────────────────────────────

CREATE TABLE public.auth_transactions (
  txid                 TEXT PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id            TEXT REFERENCES public.devices(id) ON DELETE SET NULL,
  factor               TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pushed',
  status_msg           TEXT,
  result               TEXT NOT NULL DEFAULT 'waiting',
  push_info            JSONB DEFAULT '{}',
  display_username     TEXT,
  ipaddr               TEXT,
  telegram_message_id  BIGINT,
  telegram_chat_id     BIGINT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at           TIMESTAMPTZ NOT NULL,
  resolved_at          TIMESTAMPTZ
);

CREATE INDEX idx_auth_tx_user_id ON public.auth_transactions(user_id);
CREATE INDEX idx_auth_tx_result  ON public.auth_transactions(result) WHERE result = 'waiting';

ALTER TABLE public.auth_transactions ENABLE ROW LEVEL SECURITY;

-- Enable realtime for auth_transactions (used for sync long-poll)
ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_transactions;

-- ── Cleanup meta ─────────────────────────────────────────────────────────────

CREATE TABLE public.cleanup_meta (
  key      TEXT PRIMARY KEY,
  last_run TIMESTAMPTZ
);

ALTER TABLE public.cleanup_meta ENABLE ROW LEVEL SECURITY;

-- ── Cascade delete on auth.users removal ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deleting from public.users cascades to devices, enrollments, auth_transactions
  DELETE FROM public.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_deleted();

-- ── Expired-document cleanup functions ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_expired_documents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - INTERVAL '24 hours';
  cnt    INTEGER;
BEGIN
  DELETE FROM enrollments WHERE expires_at < cutoff;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE LOG 'Cleaned up % expired enrollments', cnt; END IF;

  DELETE FROM portal_enrollments WHERE expires_at < cutoff;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE LOG 'Cleaned up % expired portal_enrollments', cnt; END IF;

  DELETE FROM auth_transactions WHERE expires_at < cutoff;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE LOG 'Cleaned up % expired auth_transactions', cnt; END IF;
END;
$$;

-- Throttled wrapper — runs cleanup at most once per 24 h
CREATE OR REPLACE FUNCTION public.cleanup_expired_if_needed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last TIMESTAMPTZ;
BEGIN
  SELECT last_run INTO last FROM cleanup_meta WHERE key = 'cleanup';

  IF last IS NULL OR EXTRACT(EPOCH FROM (now() - last)) > 86400 THEN
    INSERT INTO cleanup_meta (key, last_run)
    VALUES ('cleanup', now())
    ON CONFLICT (key) DO UPDATE SET last_run = now();

    PERFORM cleanup_expired_documents();
  END IF;
END;
$$;
