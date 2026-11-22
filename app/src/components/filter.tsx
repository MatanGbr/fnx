import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";
import { useTicketsFilter, type Filters } from "../stores/tickets-filter";
import styles from "../styles/filter.module.scss";
import clsx from "clsx";

export const Filter = () => {
    const filters = useTicketsFilter((state) => state.filters);
    const applyFilters = useTicketsFilter((state) => state.applyFilters);
    const [draft, setDraft] = useState<Filters>(filters);
    const searchInput = useRef<HTMLInputElement>(null);
    const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [clearing, setClearing] = useState(false);
    const cancelClear = () => {
        clearTimeout(clearTimer.current);
        clearTimer.current = undefined;
        setClearing(false);
    };
    useEffect(() => {
        cancelClear();
        setDraft(filters);
    }, [filters]);
    useEffect(() => () => clearTimeout(clearTimer.current), []);

    const clearSearch = () => {
        searchInput.current?.focus();
        if (!draft.search || clearing) return;
        const finish = () => {
            setDraft((current) => ({ ...current, search: "" }));
            setClearing(false);
            clearTimer.current = undefined;
        };
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
        else {
            setClearing(true);
            clearTimer.current = setTimeout(finish, 160);
        }
    };

    const filterItems = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        applyFilters(clearing ? { ...draft, search: "" } : draft);
    };

    return (
        <Card>
            <form className={styles.filter} onSubmit={filterItems}>
                <div className={clsx(styles["search-field"], clearing && styles["is-clearing"])}>
                    <Input ref={searchInput} placeholder="חיפוש בכותרת" value={draft.search}
                        onKeyDown={(event) => {
                            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                clearSearch();
                            }
                        }}
                        onChange={(event) => {
                            cancelClear();
                            setDraft((current) => ({ ...current, search: event.target.value }));
                        }} />
                    {draft.search && <Button type="button" className={styles["search-field__clear"]}
                        aria-label="ניקוי החיפוש" onClick={clearSearch}>
                        <svg aria-hidden="true" viewBox="0 0 16 16">
                            <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor"
                                strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </Button>}
                </div>
                <Button type="button" className={styles.fuzzy}
                    aria-label="חיפוש מקורב" aria-pressed={draft.fuzzy}
                    title={draft.fuzzy ? "חיפוש מקורב פעיל — לחצו לכיבוי" : "חיפוש מקורב כבוי — לחצו להפעלה"}
                    onClick={() => setDraft((current) => ({ ...current, fuzzy: !current.fuzzy }))}>
                    <span aria-hidden="true">≈</span>
                </Button>
                <Select className={styles.status} aria-label="סינון לפי סטטוס" value={draft.status}
                    onValueChange={(value) => setDraft({ ...draft, status: value as Filters["status"] })}>
                    <option value="">כל הסטטוסים</option>
                    <option value="open">פתוחה</option>
                    <option value="in_progress">בטיפול</option>
                    <option value="closed">סגורה</option>
                </Select>
                <Button submit><span aria-hidden="true"><Icon.search color="#fff" /></span><span>חפש</span></Button>
            </form>
        </Card>
    );
};
