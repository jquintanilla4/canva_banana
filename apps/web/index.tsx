
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import '@canva-banana/workspace/style.css';

if (typeof document !== 'undefined') {
  document.documentElement.style.setProperty('--app-root-font-size', '12.8px'); // Set the shared UI scale before the first render.
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
