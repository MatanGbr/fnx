import { Button } from "./ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "../stores/connection";
import { Select } from "./ui/select";
import { Icon } from "./ui/icon";
import { api, ApiTimeoutError, WRITE_TIMEOUT_MESSAGE } from "../methods/api";
import { useTicketsFilter, type TicketStatus } from "../stores/tickets-filter";
import styles from "../styles/dataset.module.scss";
import clsx from "clsx";

import { ticketParamsSchema, updateTicketSchema, ticketsQuerySchema, ticketsMessageSchema,
    type Ticket, type Pagination } from "../validation";

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
});
const HIGHLIGHT_DURATION = 2_400;

function pause(signal: AbortSignal) {
    return new Promise<void>((resolve) => {
        const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
        };
        const timer = setTimeout(finish, 120);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
    });
}

export const Dataset = () => {
    const filters = useTicketsFilter((state) => state.filters);
    const page = useTicketsFilter((state) => state.page);
    const setPage = useTicketsFilter((state) => state.setPage);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshVersion, setRefreshVersion] = useState(0);
    const updates = useRef(new Map<number, AbortController>());
    const [pendingStatuses, setPendingStatuses] = useState<Record<number, TicketStatus>>({});
    const [statusError, setStatusError] = useState<string | null>(null);
    const [highlights, setHighlights] = useState<Record<number, number>>({});
    const highlightTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
    const highlightedStatuses = useRef(new Map<number, TicketStatus>());
    const highlightVersion = useRef(0);
    const previousQuery = useRef<{ filters: typeof filters; page: number } | null>(null);

    const highlightChange = useCallback((id: number, status: TicketStatus) => {
        // The PATCH response and its SSE notification describe the same update.
        if (highlightedStatuses.current.get(id) === status) return;
        highlightedStatuses.current.set(id, status);
        const version = ++highlightVersion.current;
        clearTimeout(highlightTimers.current.get(id));
        setHighlights((current) => ({ ...current, [id]: version }));
        highlightTimers.current.set(id, setTimeout(() => {
            highlightTimers.current.delete(id);
            highlightedStatuses.current.delete(id);
            setHighlights((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });
        }, HIGHLIGHT_DURATION));
    }, []);

    useEffect(() => () => {
        for (const timer of highlightTimers.current.values()) clearTimeout(timer);
        highlightTimers.current.clear();
        highlightedStatuses.current.clear();
    }, []);

    useEffect(() => () => {
        for (const controller of updates.current.values()) controller.abort();
        updates.current.clear();
    }, []);

    const updateStatus = async (id: number, status: TicketStatus) => {
        if (updates.current.has(id)) return;
        const controller = new AbortController();
        updates.current.set(id, controller);
        setPendingStatuses((current) => ({ ...current, [id]: status }));
        setStatusError(null);
        try {
            const params = ticketParamsSchema.parse({ id });
            const body = updateTicketSchema.parse({ status });
            await api.patch<{ data: Ticket }>(`tickets/${params.id}`, body, { signal: controller.signal });
            if (!controller.signal.aborted) {
                if (tickets.find((ticket) => ticket.id === id)?.status !== status) highlightChange(id, status);
                // Also reload if SSE is temporarily unavailable or status was unchanged.
                setRefreshVersion((version) => version + 1);
            }
        } catch (cause) {
            if (!controller.signal.aborted) setStatusError(cause instanceof ApiTimeoutError ? WRITE_TIMEOUT_MESSAGE : `עדכון הסטטוס של פנייה ${id} נכשל. אפשר לנסות שוב.`);
        } finally {
            if (!controller.signal.aborted) {
                updates.current.delete(id);
                setPendingStatuses((current) => {
                    const next = { ...current };
                    delete next[id];
                    return next;
                });
            }
        }
    };

    useEffect(() => {
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;
        const refresh = () => {
            // Combine a burst of notifications without postponing refresh forever.
            if (refreshTimer !== undefined) return;
            refreshTimer = setTimeout(() => {
                refreshTimer = undefined;
                setRefreshVersion((version) => version + 1);
            }, 100);
        };

        const disconnect = api.events("events/tickets", {
            onChange: (change) => {
                highlightChange(change.id, change.status);
                refresh();
            },
            onResync: refresh,
            onConnection: useConnection.getState().setStatus,
        });

        return () => {
            clearTimeout(refreshTimer);
            disconnect();
        };
    }, [highlightChange]);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const refreshing = previousQuery.current?.filters === filters && previousQuery.current?.page === page;
        if (!refreshing) {
            setTickets([]);
            setPagination(null);
        }
        setError(null);
        setLoading(true);

        async function load() {
            try {
                const query = ticketsQuerySchema.parse({ ...filters, page, pageSize: 10 });
                const messages = await api.get<unknown>("tickets", {
                    stream: true, signal,
                    params: { ...query, status: query.status ?? "" },
                });
                let received = false;
                const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                for await (const value of messages) {
                    if (signal.aborted) return;
                    const message = ticketsMessageSchema.parse(value);
                    received = true;
                    if (message.items.length === 0 && page > 1) {
                        setPage(Math.max(1, Math.min(page - 1, message.pagination.totalPages)));
                        return;
                    }
                    setPagination(message.pagination);
                    if (refreshing) {
                        // Retain row nodes and highlight only the changed ticket.
                        setTickets(message.items);
                        continue;
                    }
                    for (const ticket of message.items) {
                        if (signal.aborted) return;
                        setTickets((current) => [...current, ticket]);
                        if (!reduceMotion) await pause(signal);
                    }
                }
                if (!received) throw new Error("Empty tickets stream");
                if (!signal.aborted) previousQuery.current = { filters, page };
            } catch (cause) {
                if (!signal.aborted) {
                    setTickets([]);
                    setPagination(null);
                    setError(cause instanceof ApiTimeoutError ? cause.message : "לא ניתן לטעון פניות. נסו שוב.");
                }
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        }

        void load();
        return () => controller.abort();
    }, [filters, page, refreshVersion, setPage]);

    return (
        <section className={styles["dataset"]} aria-label="רשימת פניות">
            <p role="status">{loading ? "טוען פניות…" : !error && tickets.length === 0 ? "לא נמצאו פניות" : ""}</p>
            {statusError && <p role="alert">{statusError}</p>}
            {error && <div role="alert">
                <p>{error}</p>
                <Button type="button" onClick={() => setRefreshVersion((value) => value + 1)}>נסה שוב</Button>
            </div>}
            <div className={styles["dataset-scroll"]}>
            <table className={styles["tickets-table"]} aria-busy={loading}>
                <thead><tr>
                    <th scope="col">מזהה</th>
                    <th scope="col">כותרת</th>
                    <th scope="col">תיאור</th>
                    <th scope="col">תאריך יצירה</th>
                    <th scope="col">סטטוס</th>
                </tr></thead>
                <tbody>
                    {tickets.map((ticket) => <tr key={ticket.id}
                        className={highlights[ticket.id] ? clsx(styles["ticket-updated"], styles[`ticket-updated-${highlights[ticket.id] % 2}`]) : undefined}>
                        <td>{ticket.id}</td>
                        <td>{ticket.title}</td>
                        <td>{ticket.description || "—"}</td>
                        <td>{dateFormatter.format(new Date(ticket.created_at))}</td>
                        <td>
                            <Select compact value={pendingStatuses[ticket.id] ?? ticket.status}
                                disabled={loading || pendingStatuses[ticket.id] !== undefined}
                                aria-label={`סטטוס פנייה ${ticket.id}`}
                                onValueChange={(value) => void updateStatus(ticket.id, value as TicketStatus)}>
                                <option value="open">פתוחה</option>
                                <option value="in_progress">בטיפול</option>
                                <option value="closed">סגורה</option>
                            </Select>
                        </td>
                    </tr>)}
                </tbody>
            </table>
            </div>
            <nav className={styles["tickets-pagination"]} aria-label="דפדוף בפניות">
                <Button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}><span aria-hidden="true"><Icon.right /></span><span>הקודם</span></Button>
                <span>עמוד {page}{pagination && pagination.totalPages > 0 ? ` מתוך ${pagination.totalPages}` : ""}</span>
                <Button type="button" disabled={loading || !pagination || page >= pagination.totalPages} onClick={() => setPage(page + 1)}><span>הבא</span><span aria-hidden="true"><Icon.left /></span></Button>
            </nav>
        </section>
    );
};
