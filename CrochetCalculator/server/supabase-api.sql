-- Run schema.sql first. Only the backend service role can invoke this function.
CREATE OR REPLACE FUNCTION public.tracker_api(operation TEXT, args JSONB DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, extensions AS $$
DECLARE
  result JSONB;
  v JSONB := args->'values';
  actor BIGINT := (args->>'actor')::BIGINT;
  account RECORD;
BEGIN
  CASE operation
    WHEN 'check' THEN
      PERFORM 1 FROM users LIMIT 1;
      PERFORM 1 FROM projects LIMIT 1;
      RETURN '[]'::JSONB;
    WHEN 'login' THEN
      IF args->>'pin' IS NULL OR args->>'pin' !~ '^[0-9]{6}$' THEN RETURN '[]'::JSONB; END IF;
      SELECT id,email INTO account FROM
        (SELECT id,email,count(*) OVER () AS matches FROM users
         WHERE pin_hash IS NOT NULL AND pin_hash=crypt(args->>'pin',pin_hash)) matched WHERE matches=1;
      IF NOT FOUND THEN RETURN '[]'::JSONB; END IF;
      DELETE FROM sessions WHERE token_hash=args->>'oldHash' OR expires_at<=NOW();
      INSERT INTO sessions(token_hash,user_id,expires_at)
        VALUES(args->>'tokenHash',account.id,NOW()+INTERVAL '7 days');
      RETURN jsonb_build_array(jsonb_build_object('id',account.id,'email',account.email));
    WHEN 'logout' THEN
      DELETE FROM sessions WHERE token_hash=v->>0;
      RETURN '[]'::JSONB;
    WHEN 'session' THEN
      SELECT jsonb_agg(to_jsonb(r)) INTO result FROM
        (SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=v->>0 AND s.expires_at>NOW()) r;
    WHEN 'activity' THEN
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id DESC) INTO result FROM
        (SELECT h.id,h.project_id,h.project_name,h.action,h.detail,h.created_at,u.email
         FROM activity_history h JOIN users u ON u.id=h.user_id
         WHERE h.id<(v->>0)::BIGINT ORDER BY h.id DESC LIMIT 51) r;
    WHEN 'materials_list' THEN
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id DESC) INTO result FROM (SELECT id,data FROM materials) r;
    WHEN 'materials_create', 'materials_update', 'materials_delete' THEN
      IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor) THEN RAISE EXCEPTION 'Invalid actor'; END IF;
      IF operation='materials_create' THEN
        WITH changed AS (INSERT INTO materials(data) VALUES((v->>0)::JSONB) RETURNING id,data)
        SELECT jsonb_agg(to_jsonb(changed)) INTO result FROM changed;
      ELSIF operation='materials_update' THEN
        WITH changed AS (UPDATE materials SET data=(v->>0)::JSONB,updated_at=NOW() WHERE id=(v->>1)::BIGINT AND data=(v->>2)::JSONB RETURNING id,data)
        SELECT jsonb_agg(to_jsonb(changed)) INTO result FROM changed;
      ELSE
        WITH changed AS (DELETE FROM materials WHERE id=(v->>0)::BIGINT RETURNING id)
        SELECT jsonb_agg(to_jsonb(changed)) INTO result FROM changed;
      END IF;
    WHEN 'projects', 'catalog' THEN
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.updated_at DESC) INTO result FROM
        (SELECT id,data,stock,updated_at FROM projects
         WHERE operation='projects' OR stock>0) r;
    WHEN 'create', 'update', 'stock', 'delete' THEN
      IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor) THEN
        RAISE EXCEPTION 'Invalid actor';
      END IF;
      PERFORM set_config('app.actor_id',actor::TEXT,true);
      IF operation='create' THEN
        WITH changed AS (INSERT INTO projects(data,user_id) VALUES((v->>0)::JSONB,actor) RETURNING id,data,stock)
        SELECT jsonb_agg(to_jsonb(changed)) INTO result FROM changed;
      ELSIF operation='update' THEN
        WITH changed AS (UPDATE projects SET data=(v->>0)::JSONB,updated_at=NOW()
          WHERE id=(v->>1)::BIGINT RETURNING id,data,stock)
        SELECT jsonb_agg(to_jsonb(changed)) INTO result FROM changed;
      ELSIF operation='stock' THEN
        WITH changed AS (UPDATE projects SET stock=(v->>0)::INTEGER,updated_at=NOW()
          WHERE id=(v->>1)::BIGINT AND stock=(v->>2)::INTEGER RETURNING id,stock)
        SELECT jsonb_agg(to_jsonb(changed)) INTO result FROM changed;
      ELSE
        WITH changed AS (DELETE FROM projects WHERE id=(v->>0)::BIGINT RETURNING id)
        SELECT jsonb_agg(to_jsonb(changed)) INTO result FROM changed;
      END IF;
    ELSE RAISE EXCEPTION 'Unsupported operation';
  END CASE;
  RETURN COALESCE(result,'[]'::JSONB);
END;
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users, public.sessions, public.projects, public.activity_history FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tracker_api(TEXT,JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_account_pin(TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracker_api(TEXT,JSONB) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users, public.sessions, public.projects, public.activity_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.users_id_seq, public.projects_id_seq, public.activity_history_id_seq TO service_role;
NOTIFY pgrst, 'reload schema';

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.materials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.materials_id_seq TO service_role;
