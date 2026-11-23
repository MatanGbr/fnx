import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles/global.scss';

import { App } from './app';

ReactDOM.createRoot(document.querySelector(`#root`)!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
