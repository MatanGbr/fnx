import { createContext, useContext, ReactNode, Children } from "react";
import styles from "../../styles/title.module.scss";
import clsx from "clsx";

const Context = createContext(0);


export const Title = ({ children, autoNest = true }: { children: ReactNode, autoNest?: boolean }) => {


    const depth = useContext(Context);
  const Tag = depth === 0 ? "h1" : "h2";
  const nextDepth = autoNest ? depth + 1 : depth;

  return (
    <Context.Provider value={nextDepth}>

        {Children.map(children, (child) => {
          if (typeof child === "string") {
            return <Tag className={styles.title}>{child}</Tag>;
          }
          return child;
        })}

    </Context.Provider>
  );

};