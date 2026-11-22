import styles from "./styles/app.module.scss";
import React from 'react';
import { ConnectionStatus } from './components/connection-status';
import { Card } from './components/ui/card';
import { Header } from './components/header';
import { Filter } from './components/filter';
import { TicketsWorkspace } from './components/tickets-workspace';

export const App = () => {
  return (
    <main className={styles.main}>
      <Card className={styles["app-shell"]}>
        <Header />
        <Filter />
        <TicketsWorkspace />
        <ConnectionStatus />
      </Card>
    </main>
  );
};
