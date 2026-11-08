CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, updated_at DESC);


ALTER TABLE projects ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0 CHECK (stock BETWEEN 0 AND 1000000);
CREATE TABLE IF NOT EXISTS activity_history (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL,
    project_name TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_user_idx ON activity_history(user_id, id DESC);

CREATE OR REPLACE FUNCTION record_project_activity() RETURNS TRIGGER AS $$
DECLARE
    actor_id BIGINT := NULLIF(current_setting('app.actor_id', true), '')::BIGINT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        actor_id := COALESCE(actor_id, OLD.user_id);
        IF actor_id IS NOT NULL THEN
            INSERT INTO activity_history(user_id, project_id, project_name, action, detail)
            VALUES(actor_id, OLD.id, OLD.data->>'name', 'deleted', 'Deleted project and inventory item');
        END IF;
        RETURN OLD;
    END IF;
    actor_id := COALESCE(actor_id, NEW.user_id);
    IF actor_id IS NOT NULL THEN
        IF TG_OP = 'INSERT' THEN
            INSERT INTO activity_history(user_id, project_id, project_name, action, detail)
            VALUES(actor_id, NEW.id, NEW.data->>'name', 'created', 'Created project');
        ELSE
            IF NEW.stock IS DISTINCT FROM OLD.stock THEN
                INSERT INTO activity_history(user_id, project_id, project_name, action, detail)
                VALUES(actor_id, NEW.id, NEW.data->>'name', 'stock_updated', 'Stock changed from ' || OLD.stock || ' to ' || NEW.stock);
            END IF;
            IF jsonb_array_length(COALESCE(NEW.data->'sales','[]'::jsonb)) > jsonb_array_length(COALESCE(OLD.data->'sales','[]'::jsonb)) THEN
                INSERT INTO activity_history(user_id, project_id, project_name, action, detail)
                VALUES(actor_id, NEW.id, NEW.data->>'name', 'sale_recorded',
                  'Recorded sale: ' || COALESCE(NEW.data->'sales'->-1->>'quantity','1') || ' units at PHP ' || COALESCE(NEW.data->'sales'->-1->>'price','0') || ' each' ||
                  CASE WHEN COALESCE(NEW.data->'sales'->-1->>'customer','') <> '' THEN ' for ' || (NEW.data->'sales'->-1->>'customer') ELSE '' END);
            ELSIF NEW.data->'sales' IS DISTINCT FROM OLD.data->'sales' THEN
                INSERT INTO activity_history(user_id, project_id, project_name, action, detail)
                VALUES(actor_id, NEW.id, NEW.data->>'name', 'sale_undone', 'Undid sale and restored stock');
            ELSIF NEW.data IS DISTINCT FROM OLD.data THEN
                INSERT INTO activity_history(user_id, project_id, project_name, action, detail)
                VALUES(actor_id, NEW.id, NEW.data->>'name', 'edited', 'Updated project details');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER project_activity_trigger
AFTER INSERT OR UPDATE OR DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION record_project_activity();

-- PINs are assigned by the workspace owner, never through the public API.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
CREATE OR REPLACE FUNCTION assign_account_pin(account_email TEXT, new_pin TEXT)
RETURNS BIGINT AS $$
DECLARE
    assigned_id BIGINT;
    normalized_email TEXT := lower(trim(account_email));
BEGIN
    IF new_pin IS NULL OR new_pin !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'PIN must contain exactly six digits';
    END IF;
    IF normalized_email IS NULL OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
        RAISE EXCEPTION 'Enter a valid account email';
    END IF;
    -- Serialize assignments so the same PIN cannot be assigned concurrently.
    LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM users WHERE email <> normalized_email AND pin_hash IS NOT NULL AND pin_hash = crypt(new_pin, pin_hash)) THEN
        RAISE EXCEPTION 'This PIN is already assigned. Choose a different PIN';
    END IF;
    INSERT INTO users(email, password_hash, pin_hash)
    VALUES(normalized_email, crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 12)), crypt(new_pin, gen_salt('bf', 12)))
    ON CONFLICT(email) DO UPDATE SET pin_hash = EXCLUDED.pin_hash
    RETURNING id INTO assigned_id;
    DELETE FROM sessions WHERE user_id = assigned_id;
    RETURN assigned_id;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS materials (
 id BIGSERIAL PRIMARY KEY,
 data JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON materials FROM PUBLIC;

-- Deduct finished stock atomically whenever sales are appended to a project.
CREATE OR REPLACE FUNCTION deduct_project_sale_stock() RETURNS TRIGGER AS $$
DECLARE
    previous_sales JSONB := COALESCE(OLD.data->'sales', '[]'::JSONB);
    next_sales JSONB := COALESCE(NEW.data->'sales', '[]'::JSONB);
    previous_count INTEGER := jsonb_array_length(previous_sales);
    next_count INTEGER := jsonb_array_length(next_sales);
    units BIGINT := 0;
    restored BIGINT := 0;
    entry JSONB;
    i INTEGER;
BEGIN
    IF next_sales = previous_sales THEN
        NEW.data := jsonb_set(NEW.data, '{sold}', COALESCE(OLD.data->'sold', '0'::JSONB));
        RETURN NEW;
    END IF;
    -- A stale editor must never remove or overwrite an already recorded sale.
    IF next_count < previous_count THEN
        RAISE EXCEPTION USING ERRCODE = 'PST02', MESSAGE = 'Sales changed. Refresh and try again.';
    END IF;
    IF previous_count > 0 THEN
        FOR i IN 0..previous_count - 1 LOOP
            IF next_sales->i IS DISTINCT FROM previous_sales->i THEN
                -- Only a one-way undo marker may be added to an existing sale.
                IF NOT (previous_sales->i ? 'voidedAt')
                   AND jsonb_typeof(next_sales->i->'voidedAt') = 'string'
                   AND length(next_sales->i->>'voidedAt') > 0
                   AND ((next_sales->i) - 'voidedAt') = previous_sales->i THEN
                    restored := restored + (previous_sales->i->>'quantity')::BIGINT;
                ELSE
                    RAISE EXCEPTION USING ERRCODE = 'PST02', MESSAGE = 'Sales changed. Refresh and try again.';
                END IF;
            END IF;
        END LOOP;
    END IF;
    IF next_count > previous_count THEN
        FOR i IN previous_count..next_count - 1 LOOP
            entry := next_sales->i;
            IF entry ? 'voidedAt' OR COALESCE(entry->>'quantity', '') !~ '^[1-9][0-9]{0,6}$' THEN
                RAISE EXCEPTION USING ERRCODE = 'PST03', MESSAGE = 'Enter a valid whole sale quantity.';
            END IF;
            units := units + (entry->>'quantity')::BIGINT;
        END LOOP;
    END IF;
    IF units > OLD.stock + restored THEN
        RAISE EXCEPTION USING ERRCODE = 'PST01', MESSAGE = 'Not enough stock. Refresh stock or reduce the sale quantity.';
    END IF;
    IF OLD.stock + restored - units > 1000000 THEN
        RAISE EXCEPTION USING ERRCODE = 'PST04', MESSAGE = 'Undo would exceed the stock limit. Adjust stock first.';
    END IF;
    NEW.stock := OLD.stock + restored - units;
    NEW.data := jsonb_set(NEW.data, '{sold}', to_jsonb(GREATEST(0, COALESCE((OLD.data->>'sold')::NUMERIC, 0) + units - restored)));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER project_sale_stock_trigger
BEFORE UPDATE OF data ON projects
FOR EACH ROW EXECUTE FUNCTION deduct_project_sale_stock();
