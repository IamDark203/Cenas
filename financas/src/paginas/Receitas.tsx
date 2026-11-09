import { useMemo, useState } from 'react';
import { CampoEscolha } from '../componentes/campos';
import { FormMovimento } from '../componentes/FormMovimento';
import { FormRecorrente } from '../componentes/FormRecorrente';
import { Icone } from '../componentes/icones';
import { ListaMovimentos } from '../componentes/ListaMovimentos';
import { Aviso, Cartao, Etiqueta, Kpi, Vazio } from '../componentes/ui';
import { mesDe, mesesEntre, somarMesesMes } from '../dominio/datas';
import { data as fmtData, euro, mesLongo } from '../dominio/formato';
import { nomeCategoria, primeiroMes } from '../dominio/fluxos';
import { NOMES_PERIODICIDADE, equivalenteMensal, proximaOcorrencia, valorRecorrente } from '../dominio/recorrencias';
import type { Recorrente } from '../dominio/tipos';
import { nomeConta, useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';

export default function Receitas() {
  const { estado, hoje } = useLoja();
  const { estimativa, mesRef } = useResumo();
  const [editarRec, setEditarRec] = useState<Recorrente | null>(null);
  const [novaFonte, setNovaFonte] = useState(false);
  const [novoRegisto, setNovoRegisto] = useState(false);
  const [mes, setMes] = useState(mesRef);
  const refeicao = new Set(estado.contas.filter((c) => c.tipo === 'refeicao').map((c) => c.id));
  const fontes = estado.recorrentes.filter((r) => r.tipo === 'receita');
  const meses = useMemo(() => mesesEntre(primeiroMes(estado, mesRef), somarMesesMes(mesRef, 0)).reverse(), [estado, mesRef]);
  const registos = estado.movimentos.filter((m) => m.tipo === 'receita' && (mes === 'tudo' || mesDe(m.data) === mes));
  const recebidoDinheiro = registos.filter((m) => !refeicao.has(m.contaId)).reduce((s, m) => s + m.valor, 0);
  const recebidoBeneficios = registos.filter((m) => refeicao.has(m.contaId)).reduce((s, m) => s + m.valor, 0);

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Rendimento mensal estimado" valor={euro(estimativa.receitas)} detalhe="Em dinheiro, média mensal das fontes ativas" />
        <Kpi rotulo="Benefícios mensais" valor={euro(estimativa.beneficios)} detalhe="Cartão-refeição: não é dinheiro disponível" />
        <Kpi rotulo={mes === 'tudo' ? 'Recebido (total)' : `Recebido em ${mesLongo(mes)}`} valor={euro(recebidoDinheiro)} detalhe={recebidoBeneficios > 0 ? `+ ${euro(recebidoBeneficios)} em benefícios` : 'Em dinheiro'} />
      </div>

      {estimativa.liquidoPorConfirmar > 0 && (
        <Aviso>
          Alguns rendimentos só têm o valor bruto. A aplicação não calcula IRS nem Segurança Social: indica o valor líquido que recebes para os cálculos ficarem corretos. Até lá, usa-se o valor indicado.
        </Aviso>
      )}

      <Cartao
        titulo="Fontes de rendimento"
        subtitulo="Rendimentos regulares. Os registos são criados automaticamente nas datas."
        acoes={
          <button type="button" className="primario" onClick={() => setNovaFonte(true)}>
            <Icone nome="adicionar" /> Fonte
          </button>
        }
      >
        {fontes.length ? (
          <div className="lista">
            {fontes.map((r) => {
              const ben = refeicao.has(r.contaId);
              const prox = r.ativo ? proximaOcorrencia(r, hoje) : null;
              return (
                <div className="item clicavel" key={r.id} role="button" tabIndex={0} onClick={() => setEditarRec(r)} onKeyDown={(e) => e.key === 'Enter' && setEditarRec(r)}>
                  <span className="avatar" style={{ color: ben ? 'var(--aviso)' : 'var(--positivo)', background: ben ? 'var(--aviso-suave)' : 'var(--positivo-suave)' }}>
                    <Icone nome={ben ? 'refeicao' : 'receitas'} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="titulo">{r.descricao}</div>
                    <div className="sub">
                      <span>{nomeCategoria(estado, r.categoriaId)}</span>
                      <span>{NOMES_PERIODICIDADE[r.periodicidade]}</span>
                      <span>→ {nomeConta(estado, r.contaId)}</span>
                      {prox && <span>Próximo: {fmtData(prox)}</span>}
                      <Etiqueta tom={ben ? 'aviso' : 'positivo'}>{ben ? 'Benefício (não monetário)' : 'Dinheiro'}</Etiqueta>
                      {r.valorBruto != null && !r.liquidoConfirmado && <Etiqueta tom="negativo">Líquido por confirmar</Etiqueta>}
                      {!r.ativo && <Etiqueta>Inativo</Etiqueta>}
                    </div>
                  </div>
                  <div className="montante">
                    {euro(valorRecorrente(r))}
                    <small>
                      {r.porDia ? `${euro(r.porDia.valorDia)} × ${r.porDia.dias} dias` : r.valorBruto != null ? `Bruto ${euro(r.valorBruto)}` : r.periodicidade !== 'mensal' ? `${euro(equivalenteMensal(r))}/mês` : 'líquido'}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Vazio>Ainda não tens fontes de rendimento.</Vazio>
        )}
      </Cartao>

      <Cartao
        titulo="Registos de rendimentos"
        acoes={
          <>
            <div style={{ minWidth: 170 }}>
              <CampoEscolha rotulo="Mês" valor={mes} mudar={setMes} opcoes={[...meses.map((m) => ({ valor: m, nome: mesLongo(m) })), { valor: 'tudo', nome: 'Todos' }]} />
            </div>
            <button type="button" onClick={() => setNovoRegisto(true)} style={{ alignSelf: 'end' }}>
              <Icone nome="adicionar" /> Registo pontual
            </button>
          </>
        }
      >
        <ListaMovimentos movimentos={registos} vazio="Sem rendimentos registados neste mês." />
      </Cartao>

      {(novaFonte || editarRec) && <FormRecorrente inicial={editarRec ?? undefined} tipoInicial="receita" aoFechar={() => (setNovaFonte(false), setEditarRec(null))} />}
      {novoRegisto && <FormMovimento tipoInicial="receita" aoFechar={() => setNovoRegisto(false)} />}
    </>
  );
}
