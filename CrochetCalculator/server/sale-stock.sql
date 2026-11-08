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
