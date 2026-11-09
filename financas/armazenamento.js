/*
 * Armazenamento dos dados.
 * - Sempre: localStorage do browser (cópia local).
 * - Quando a página corre publicada no claude.ai: também na conta do utilizador (capacidade `db`),
 *   num documento privado que só o próprio vê. Assim os dados sincronizam entre iPhone e computador
 *   e não se perdem se o browser limpar o armazenamento local.
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

  function usarCapacidade(nome) {
    if (!root.claude || typeof root.claude.use !== 'function') return Promise.resolve(null);
    return root.claude.use(nome).catch(() => null);
  }

  function temDados(e) {
    return !!e && ['rendimentos', 'despesas', 'poupancas', 'investimentos'].some((k) => (e[k] || []).length > 0);
  }

  /**
   * Liga a sincronização com a conta. Resolve com uma função `gravar(estado)` ou `null` se não houver conta.
   * @param {{obterEstado: () => object, aoReceber: (estado: object) => void, aoMudarEstado: (e: string) => void}} o
   */
  async function ligarConta(o) {
    const [db, user] = await Promise.all([usarCapacidade('db'), usarCapacidade('user')]);
    if (!db || !user) return null;
    let id = null;
    try {
      id = await user.id();
    } catch (e) {
      id = null;
    }
    if (!id) return null;

    const ref = db.doc(`data/users/${id}/financas`);
    let ativo = true;
    let aGravar = false;
    let pendente = null;
    let temporizador = null;
    let ultimoRecebido = '';

    async function escrever() {
      if (aGravar || !ativo) return;
      aGravar = true;
      while (pendente && ativo) {
        const e = pendente;
        pendente = null;
        try {
          await ref.set({ estado: e, atualizadoEm: new Date().toISOString() });
          ultimoRecebido = JSON.stringify(e);
          o.aoMudarEstado('conta');
        } catch (err) {
          if (err && err.code === 'unavailable') {
            pendente = pendente || e;
            await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
          } else {
            if (err && (err.code === 'invalid_argument' || err.code === 'revoked')) ativo = false;
            o.aoMudarEstado('erro');
            break;
          }
        }
      }
      aGravar = false;
    }

    function gravar(estado) {
      if (!ativo) return;
      pendente = JSON.parse(JSON.stringify(estado));
      clearTimeout(temporizador);
      temporizador = setTimeout(escrever, 500);
    }

    let confirmado = false;
    const limite = setTimeout(() => {
      if (!confirmado) o.aoMudarEstado('lento');
    }, 10000);

    ref.onSnapshot(
      (snap) => {
        if (!snap.metadata.fromCache && !confirmado) {
          confirmado = true;
          clearTimeout(limite);
          o.aoMudarEstado('conta');
          // Primeira vez com conta: envia o que já existia neste dispositivo.
          if (!snap.exists && temDados(o.obterEstado())) gravar(o.obterEstado());
        }
        if (snap.metadata.hasPendingWrites || !snap.exists || pendente) return;
        const dados = snap.data();
        if (!dados || !dados.estado) return;
        const texto = JSON.stringify(dados.estado);
        if (texto === ultimoRecebido) return;
        ultimoRecebido = texto;
        o.aoReceber(dados.estado);
      },
      () => {
        clearTimeout(limite);
        ativo = false;
        o.aoMudarEstado('erro');
      },
    );

    return gravar;
  }

  root.FinArmazenamento = { lerLocal, gravarLocal, ligarConta, usarCapacidade };
})(self);
