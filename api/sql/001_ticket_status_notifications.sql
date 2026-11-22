BEGIN;

CREATE OR REPLACE FUNCTION public.notify_ticket_status_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_notify(
        'ticket_status_changed',
        json_build_object(
            'type', 'ticket-status-changed',
            'id', NEW.id,
            'previousStatus', OLD.status,
            'status', NEW.status
        )::text
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER ticket_status_changed
AFTER UPDATE ON public.tickets
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_ticket_status_changed();

COMMIT;
