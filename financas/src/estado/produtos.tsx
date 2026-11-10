import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import incluida from '../../public/dados/produtos.json';
import { assinatura, detetarAlteracoes, type BaseProdutos } from '../dominio/bancos';
import { novoId } from '../dominio/ids';
import { saldoConta } from '../dominio/saldos';
import { useLoja } from './loja';

interface ContextoProdutos {
  base: BaseProdutos;
  /** Origem dos dados apresentados. */
  origem: 'incluida' | 'servidor';
  aAtualizar: boolean;
  erro: string | null;
  atualizarAgora: () => Promise<void>;
}

const Contexto = createContext<ContextoProdutos | null>(null);

/**
 * Base de produtos bancários: começa com a cópia incluída na app (funciona sem internet) e é atualizada
 * a partir de dados/produtos.json publicado no site (verificado automaticamente nas fontes oficiais).
 * Cada atualização é comparada com a anterior para gerar alertas de alterações (Módulo 16).
 */
export function ProvedorProdutos({ children }: { children: ReactNode }) {
  const { estado, atualizar, situacao, hoje } = useLoja();
  const [base, setBase] = useState<BaseProdutos>(incluida as unknown as BaseProdutos);
  const [origem, setOrigem] = useState<'incluida' | 'servidor'>('incluida');
  const [aAtualizar, setAAtualizar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;

  const registar = useCallback(
    (nova: BaseProdutos) => {
      const e = estadoRef.current;
      const ligadas = e.contas.filter((c) => c.produtoId).map((c) => ({ produtoId: c.produtoId as string, saldo: saldoConta(e, c, hoje), nome: c.nome }));
      const alteracoes = detetarAlteracoes(nova.produtos, e.bancos.instantaneo, ligadas, e.bancos.requisitosCumpridos, e.pressupostos.retencaoJuros, hoje);
      const instantaneo = Object.fromEntries(nova.produtos.map((p) => [p.id, assinatura(p)]));
      const mudou = JSON.stringify(instantaneo) !== JSON.stringify(e.bancos.instantaneo);
      if (!mudou && !alteracoes.length && e.bancos.ultimaConsulta === hoje) return;
      atualizar((x) => {
        const conhecidas = new Set(x.bancos.alteracoes.map((a) => a.texto));
        const novas = alteracoes.filter((a) => !conhecidas.has(a.texto)).map((a) => ({ id: novoId(), data: hoje, ...a }));
        return { ...x, bancos: { ...x.bancos, instantaneo, ultimaConsulta: hoje, alteracoes: [...novas, ...x.bancos.alteracoes].slice(0, 100) } };
      });
    },
    [atualizar, hoje],
  );

  const atualizarAgora = useCallback(async () => {
    setAAtualizar(true);
    setErro(null);
    try {
      const r = await fetch('./dados/produtos.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const nova = (await r.json()) as BaseProdutos;
      if (!Array.isArray(nova.produtos)) throw new Error('formato inválido');
      // Nunca substituir por uma versão mais antiga do que a incluída na app.
      const atual = incluida as unknown as BaseProdutos;
      const usar = nova.geradoEm >= atual.geradoEm ? nova : atual;
      setBase(usar);
      setOrigem(usar === nova ? 'servidor' : 'incluida');
      registar(usar);
    } catch (e) {
      setErro(`Não foi possível obter a versão mais recente (${(e as Error).message}). A mostrar os dados incluídos na app.`);
      registar(base);
    } finally {
      setAAtualizar(false);
    }
  }, [base, registar]);

  // Uma consulta por arranque, quando os dados do utilizador já estão carregados.
  const feito = useRef(false);
  useEffect(() => {
    if (situacao !== 'pronto' || feito.current) return;
    feito.current = true;
    atualizarAgora();
  }, [situacao, atualizarAgora]);

  return <Contexto.Provider value={{ base, origem, aAtualizar, erro, atualizarAgora }}>{children}</Contexto.Provider>;
}

export function useProdutos(): ContextoProdutos {
  const c = useContext(Contexto);
  if (!c) throw new Error('useProdutos fora do provedor');
  return c;
}
