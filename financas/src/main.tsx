import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProvedorInteracoes } from './componentes/janelas';
import { ProvedorLoja } from './estado/loja';
import './estilos.css';

createRoot(document.getElementById('raiz') as HTMLElement).render(
  <StrictMode>
    <ProvedorLoja>
      <ProvedorInteracoes>
        <App />
      </ProvedorInteracoes>
    </ProvedorLoja>
  </StrictMode>,
);

// Funcionamento sem internet (só em HTTPS ou localhost).
if ('serviceWorker' in navigator && window.isSecureContext && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
