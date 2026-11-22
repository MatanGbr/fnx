import type { CSSProperties, ReactElement, SVGProps } from "react";
import { icons } from "./icons-map";
import styles from "../../styles/icon.module.scss";
import clsx from "clsx";

type IconName = keyof typeof icons;

type NamedIconProps = {
  color?: CSSProperties["color"];
};

type IconProps = NamedIconProps & {
  svg: ReactElement<SVGProps<SVGSVGElement>>;
};

const CustomIcon = ({
  color = "currentColor",
  svg,
}: IconProps) => {
  return <span className={styles["icon"]} style={{ color }}>{svg}</span>;
};

const namedIcons = Object.fromEntries(
  (Object.keys(icons) as IconName[]).map((name): [IconName, (props: NamedIconProps) => ReactElement] => {
    const NamedIcon = ({ color }: NamedIconProps) => (
      <CustomIcon svg={icons[name]} color={color} />
    );
    NamedIcon.displayName = `Icon.${name}`;
    return [name, NamedIcon];
  }),
) as { [K in IconName]: (props: NamedIconProps) => ReactElement };

export const Icon = Object.assign(CustomIcon, namedIcons);
