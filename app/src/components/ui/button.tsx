import type { ComponentProps } from "react";

import styles from "../../styles/button.module.scss";
import clsx from "clsx";


export const Button = ({ children, submit = false, className, ...props }: ComponentProps<"button"> & { submit?: boolean }) => {
    return (<button {...props} className={clsx(styles.button, className)} type={props.type ?? (submit ? "submit" : "button")}> 
    {children}
    </button >)
};
