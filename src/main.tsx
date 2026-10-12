import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Remove the no-dependency welcome screen only after React has mounted.
// Two frames let the actual app paint first; there is no artificial loading delay.
function BootReady() {
  useEffect(() => {
    let secondFrame = 0;
    let removal = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const splash = document.getElementById('boot-splash');
        if (!splash) return;
        splash.classList.add('boot-splash--leaving');
        removal = window.setTimeout(() => splash.remove(), 340);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(removal);
    };
  }, []);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /><BootReady /></React.StrictMode>,
);
