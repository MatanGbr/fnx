import { createContext, useContext, ReactNode, Children } from "react";
import styles from "../../styles/title.module.scss";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const Context = createContext(1);


export const Title = ({ children, autoNest = true, startLevel }: { children: ReactNode, autoNest?: boolean, startLevel?: HeadingLevel }) => {


  const inheritedLevel = useContext(Context);
  const level = startLevel ?? inheritedLevel;
  const Tag = `h${level}` as `h${HeadingLevel}`;
  const nextDepth = autoNest ? Math.min(level + 1, 6) : level;

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
