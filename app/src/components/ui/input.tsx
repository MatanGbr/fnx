import { useId, type ComponentProps } from "react";
import styles from "../../styles/input.module.scss";
import clsx from "clsx";

type Props =
    | ({ type: "area" } & ComponentProps<"textarea">)
    | ({ type?: "text" | "email" } & Omit<ComponentProps<"input">, "type">);

export const Input = (props: Props) => {
    const generatedId = useId();
    const id = props.id ?? generatedId;
    let field;
    if (props.type === "area") {
        const { type, ...rest } = props;
        field = <textarea {...rest} className={clsx(styles.field, rest.className)} id={id} />;
    } else {
        field = <input {...props} className={clsx(styles.field, props.className)} aria-label={props["aria-label"] ?? props.placeholder} id={id} type={props.type ?? "text"} />;
    }
    return (
        <div className={styles.input}>
            {field}
        </div>
    );
};
