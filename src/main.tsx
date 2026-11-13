import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/telas.css';

registerSW({ immediate: true });

/** Qualquer ação que falhar no servidor aparece num aviso rápido (em vez de sumir em silêncio). */
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason as Error)?.message;
  if (!msg) return;
  const el = document.createElement('div');
  el.className = 'toast-erro';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
});

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
