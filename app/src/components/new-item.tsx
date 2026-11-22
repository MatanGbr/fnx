import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "./ui/icon";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Title } from "./ui/title";
import { api, ApiError, ApiTimeoutError, WRITE_TIMEOUT_MESSAGE } from "../methods/api";
import { useTicketDraft } from "../stores/ticket-draft";
import { useTicketsFilter } from "../stores/tickets-filter";
import styles from "../styles/new-item.module.scss";
import clsx from "clsx";

import { newTicketSchema } from "../validation";

type FieldErrors = { title?: string; description?: string };

export const NewItem = () => {
    const { title, description, setTitle, setDescription, reset } = useTicketDraft();
    const applyFilters = useTicketsFilter((state) => state.applyFilters);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [resetting, setResetting] = useState(false);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const request = useRef<AbortController | null>(null);
    const titleInput = useRef<HTMLInputElement>(null);
    const descriptionInput = useRef<HTMLTextAreaElement>(null);
    const id = useId();

    useEffect(() => () => {
        request.current?.abort();
        clearTimeout(resetTimer.current);
    }, []);

    const resetForm = () => {
        if (submitting || resetTimer.current !== undefined) return;
        const finish = () => {
            reset();
            setErrors({});
            setError(null);
            setSuccess(null);
            setResetting(false);
            resetTimer.current = undefined;
            titleInput.current?.focus();
        };
        if ((!title && !description) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            finish();
        } else {
            setResetting(true);
            resetTimer.current = setTimeout(finish, 180);
        }
    };

    const createTicket = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (request.current || resetTimer.current !== undefined) return;
        const result = newTicketSchema.safeParse({ title, description });
        const fields = result.success ? {} : result.error.flatten().fieldErrors;
        const nextErrors: FieldErrors = {
            title: fields.title?.[0],
            description: fields.description?.[0],
        };
        setErrors(nextErrors);
        setError(null);
        setSuccess(null);
        if (!result.success) {
            (nextErrors.title ? titleInput.current : descriptionInput.current)?.focus();
            return;
        }

        const controller = new AbortController();
        request.current = controller;
        setSubmitting(true);
        try {
            const { data } = await api.post<{ data: { id: number } }>(
                "ticket/new",
                result.data,
                { signal: controller.signal },
            );
            if (controller.signal.aborted) return;
            reset();
            applyFilters({ ...useTicketsFilter.getState().filters, search: "", status: "" });
            setSuccess(`פנייה ${data.id} נוצרה בהצלחה.`);
        } catch (cause) {
            if (controller.signal.aborted) return;
            if (cause instanceof ApiError && cause.status === 400) {
                setErrors({
                    title: cause.fieldErrors.title?.length ? "הכותרת אינה תקינה. יש להזין 3–100 תווים." : undefined,
                    description: cause.fieldErrors.description?.length ? "התיאור אינו תקין. ניתן להזין עד 2,000 תווים." : undefined,
                });
            }
            setError(cause instanceof ApiTimeoutError ? `${WRITE_TIMEOUT_MESSAGE} הטיוטה נשמרה.` : "לא ניתן ליצור את הפנייה. הטיוטה נשמרה, ואפשר לנסות שוב.");
        } finally {
            if (!controller.signal.aborted) {
                request.current = null;
                setSubmitting(false);
            }
        }
    };

    return (
        <Card>
            <form className={clsx(styles["new-ticket-form"], resetting && styles["is-resetting"])} onSubmit={createTicket} noValidate aria-busy={submitting}>
                <Title startLevel={2}>פנייה חדשה</Title>
                <label htmlFor={`${id}-title`}>כותרת</label>
                <Input id={`${id}-title`} ref={titleInput} value={title} required readOnly={resetting} disabled={submitting}
                    aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? `${id}-title-error` : undefined}
                    onChange={(event) => {
                        setTitle(event.target.value);
                        setErrors((current) => ({ ...current, title: undefined }));
                        setSuccess(null);
                    }} />
                {errors.title && <p className={styles["field-error"]} id={`${id}-title-error`}>{errors.title}</p>}
                <label htmlFor={`${id}-description`}>תיאור (לא חובה)</label>
                <Input id={`${id}-description`} type="area" ref={descriptionInput} value={description} readOnly={resetting} disabled={submitting}
                    aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? `${id}-description-error` : undefined}
                    onChange={(event) => {
                        setDescription(event.target.value);
                        setErrors((current) => ({ ...current, description: undefined }));
                        setSuccess(null);
                    }} />
                {errors.description && <p className={styles["field-error"]} id={`${id}-description-error`}>{errors.description}</p>}
                {error && <p className={styles["field-error"]} role="alert">{error}</p>}
                <div className={styles["new-ticket-actions"]}>
                    <Button submit disabled={submitting || resetting}><span aria-hidden="true"><Icon.pen color="#fff" /></span><span>{submitting ? "יוצר פנייה…" : "צור פנייה"}</span></Button>
                    <Button className={styles["new-ticket-reset"]} disabled={submitting || resetting} aria-label="איפוס הטופס" title="איפוס הטופס"
                        onClick={resetForm}>
                        <span aria-hidden="true"><Icon.bin /></span>
                    </Button>
                </div>
                <p role="status">{success}</p>
            </form>
        </Card>
    );
};
