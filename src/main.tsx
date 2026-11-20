import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initAndroidBackButton } from './native/backButton';
import { initPushNotifications } from './native/push';

// Android shell only: back walks WebView history, exits only at the Hub
// root. Inert in the browser / PWA / QA (no Capacitor runtime there).
initAndroidBackButton();

// Android shell only: FCM push listeners (tap routing + token refresh).
// Inert in the browser / PWA / QA — the plugin is never imported there.
initPushNotifications();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: register the service worker in production builds only, so dev reloads
// are never served stale.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is best-effort; the app works without it */
    });
  });
}
