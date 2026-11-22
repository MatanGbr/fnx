import { ReactElement, ReactNode } from "react";
import styles from "../../styles/card.module.scss";
import clsx from "clsx";

import { CSSProperties } from "react";

export const Card = ({ children, style, className }: { children: ReactNode, style?: CSSProperties, className?: string }) => {
    return (<div className={clsx(styles.card, className)} style={style}>
        {children}
    </div >)
};
