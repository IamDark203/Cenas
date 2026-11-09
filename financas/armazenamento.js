/*
 * Armazenamento dos dados no próprio dispositivo (localStorage).
 * Os dados nunca saem do telemóvel/computador de cada pessoa.
 */
(function (root) {
  'use strict';

  const CHAVE = 'financas.v1';

  function lerLocal() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      return null;
    }
  }

  function gravarLocal(estado) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Pede ao browser para não apagar os dados quando faltar espaço.
  if (root.navigator && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  root.FinArmazenamento = { lerLocal, gravarLocal };
})(self);
