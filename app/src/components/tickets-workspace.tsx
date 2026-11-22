import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Card } from "./ui/card";
import { NewItem } from "./new-item";
import { Dataset } from "./dataset";
import styles from "../styles/tickets-workspace.module.scss";
import clsx from "clsx";

const MIN_FORM_WIDTH = 240;
const MIN_DATASET_WIDTH = 320;
const DIVIDER_SPACE = 24; // 8px divider and two 8px gaps.

export const TicketsWorkspace = () => {
    const container = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
    const [availableWidth, setAvailableWidth] = useState(0);
    const [preferredWidth, setPreferredWidth] = useState(300);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => {
            setAvailableWidth(entry.contentRect.width);
        });
        if (container.current) observer.observe(container.current);
        return () => observer.disconnect();
    }, []);

    const maxWidth = Math.max(MIN_FORM_WIDTH, availableWidth - MIN_DATASET_WIDTH - DIVIDER_SPACE);
    const clamp = (width: number) => Math.min(maxWidth, Math.max(MIN_FORM_WIDTH, width));
    const width = clamp(preferredWidth);

    const startDrag = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
        setDragging(true);
    };

    const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        // The form is on the right in RTL: moving left increases its width.
        setPreferredWidth(clamp(drag.current.width + drag.current.x - event.clientX));
    };

    const endDrag = (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 40 : 10;
        const nextWidth = {
            ArrowLeft: width + step,
            ArrowRight: width - step,
            Home: MIN_FORM_WIDTH,
            End: maxWidth,
        }[event.key];
        if (nextWidth === undefined) return;
        event.preventDefault();
        setPreferredWidth(clamp(nextWidth));
    };

    return (
        <Card className={styles["tickets-workspace"]}>
            <div ref={container} className={clsx(styles["tickets-split"], dragging && styles["is-resizing"])}
                style={{ gridTemplateColumns: `${width}px 8px minmax(0, 1fr)` }}>
                <div id="new-ticket-panel" className={styles["new-ticket-panel"]}><NewItem /></div>
                <div className={styles["tickets-divider"]} role="separator" tabIndex={0}
                    aria-label="שינוי רוחב חלונית פנייה חדשה" aria-orientation="vertical"
                    aria-controls="new-ticket-panel" aria-valuemin={MIN_FORM_WIDTH}
                    aria-valuemax={Math.round(maxWidth)} aria-valuenow={Math.round(width)}
                    aria-valuetext={`${Math.round(width)} פיקסלים`}
                    onPointerDown={startDrag} onPointerMove={moveDrag}
                    onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
                    onKeyDown={resizeWithKeyboard} />
                <Dataset />
            </div>
        </Card>
    );
};
