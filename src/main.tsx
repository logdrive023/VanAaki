import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { pedirPersistencia } from './db/db';
import { garantirDados } from './db/seed';
import { iniciarSimulador } from './services/simulador';
import './styles/base.css';
import './styles/app.css';

registerSW({ immediate: true });

(async () => {
  await garantirDados();          // primeira vez: cria os dados de exemplo no navegador
  void pedirPersistencia();       // pede para o navegador não apagar os dados
  iniciarSimulador();             // GPS simulado (uma aba só, via Web Locks)
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
})();
