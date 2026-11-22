'use client';
import { useEffect } from 'react';

// Only static, public brand assets are cached by the service worker.
// Employee information, auth, API calls and work hours are network-only.
export default function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
        // The web app continues to work even if SW registration fails.
      });
    };
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);
  return null;
}
