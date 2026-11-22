import { Button } from "./button";
import { Children, isValidElement, useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import styles from "../../styles/select.module.scss";
import clsx from "clsx";

type Props = Omit<ComponentProps<"select">, "onChange" | "multiple" | "size" | "value"> & {
    compact?: boolean;
    value: string;
    onValueChange: (value: string) => void;
};

export const Select = ({ children, value, onValueChange, disabled, name, id, className, compact = false, ...props }: Props) => {
    const listId = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const [active, setActive] = useState(0);
    const search = useRef({ text: "", time: 0 });
    const options = Children.toArray(children).flatMap((child) => {
        if (!isValidElement<ComponentProps<"option">>(child) || child.type !== "option") return [];
        return [{ value: String(child.props.value ?? child.props.children), label: child.props.children, disabled: child.props.disabled }];
    });
    const selected = options.findIndex((option) => option.value === value);
    const open = position !== null && !disabled;

    const show = () => {
        if (disabled || !trigger.current) return;
        const rect = trigger.current.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom - 12;
        const above = rect.top - 12;
        const height = Math.min(240, options.length * 40 + 8);
        const upwards = below < height && above > below;
        const maxHeight = Math.max(40, Math.min(240, upwards ? above : below));
        const width = Math.min(Math.max(rect.width, 150), window.innerWidth - 16);
        setPosition({
            top: upwards ? Math.max(8, rect.top - Math.min(height, maxHeight) - 6) : rect.bottom + 6,
            left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
            width, maxHeight,
        });
        setActive(selected >= 0 && !options[selected].disabled ? selected : options.findIndex((option) => !option.disabled));
    };
    const choose = (index: number) => {
        const option = options[index];
        if (!option || option.disabled) return;
        onValueChange(option.value);
        setPosition(null);
        trigger.current?.focus();
    };

    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (!trigger.current?.contains(event.target as Node) && !list.current?.contains(event.target as Node)) setPosition(null);
        };
        const reposition = (event: Event) => {
            if (!list.current?.contains(event.target as Node)) setPosition(null);
        };
        document.addEventListener("pointerdown", outside);
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        return () => {
            document.removeEventListener("pointerdown", outside);
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
        };
    }, [open]);
    useEffect(() => { if (disabled) setPosition(null); }, [disabled]);
    useEffect(() => {
        if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }, [active, open]);

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Escape" || event.key === "Tab") { setPosition(null); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            if (!open) { show(); return; }
            if (event.key === "Enter" || event.key === " ") { choose(active); return; }
            const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
            if (!enabled.length) return;
            const current = enabled.indexOf(active);
            setActive(event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1)! :
                enabled[(current + (event.key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length]);
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            if (!open) show();
            const now = Date.now();
            search.current = { text: (now - search.current.time < 700 ? search.current.text : "") + event.key, time: now };
            const match = options.findIndex((option) => !option.disabled && String(option.label).toLowerCase().startsWith(search.current.text.toLowerCase()));
            if (match >= 0) setActive(match);
        }
    };

    return <div className={clsx(styles["custom-select"], compact && styles.compact, className)}>
        {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
        <Button ref={trigger} id={id} type="button" className={styles["custom-select__trigger"]} role="combobox"
            aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]}
            aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]}
            aria-required={props.required} aria-expanded={open} aria-controls={open ? listId : undefined}
            aria-haspopup="listbox" aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            disabled={disabled} onKeyDown={onKeyDown} onBlur={() => setPosition(null)}
            onClick={() => open ? setPosition(null) : show()}>
            <span>{options[selected]?.label ?? "בחרו אפשרות"}</span>
            <svg aria-hidden="true" viewBox="0 0 16 16" className={clsx(open && styles["is-open"])}>
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </Button>
        {open && createPortal(<div ref={list} id={listId} role="listbox" dir="rtl"
            aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]}
            className={styles["custom-select__menu"]} style={position}>
            {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option"
                aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
                className={clsx(styles["custom-select__option"], active === index && styles["is-active"])}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => !option.disabled && setActive(index)} onClick={() => choose(index)}>
                <span>{option.label}</span><span aria-hidden="true">{option.value === value ? "✓" : ""}</span>
            </div>)}
        </div>, document.body)}
    </div>;
};
