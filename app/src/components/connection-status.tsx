import clsx from "clsx";

import { Card } from "./ui/card";
import { useConnection } from "../stores/connection";

import styles from "../styles/connection-status.module.scss";


const labels = {
    checking: "בודק חיבור לנתונים…",
    connected: "החיבור לנתונים פעיל",
    offline: "אין חיבור לאינטרנט.",
    unavailable: "אין חיבור לנתונים",
};

export const ConnectionStatus = () => {
    const status = useConnection((state) => state.status);
    return <Card className={clsx(styles["connection-status"], styles[`connection-status--${status}`])}>
        <div role="status" aria-live="polite" aria-atomic="true">
            <span className={styles["connection-status__dot"]} aria-hidden="true" />
            <span>{labels[status]}</span>
        </div>
    </Card>;
};
