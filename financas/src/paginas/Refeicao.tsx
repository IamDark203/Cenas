import { useState } from 'react';
import { CampoCaixa } from '../componentes/campos';
import { FormMovimento } from '../componentes/FormMovimento';
import { Icone } from '../componentes/icones';
import { ListaMovimentos } from '../componentes/ListaMovimentos';
import { Aviso, Barra, Cartao, Kpi, Vazio } from '../componentes/ui';
import { euro, pct } from '../dominio/formato';
import { nomeCategoria } from '../dominio/fluxos';
import { resumoRefeicao } from '../dominio/orcamento';
import { useLoja } from '../estado/loja';
import { irPara } from '../navegacao';

export default function Refeicao() {
  const { estado, atualizar, hoje } = useLoja();
  const r = resumoRefeicao(estado, hoje);
  const [nova, setNova] = useState(false);
  const categorias = estado.categorias.filter((c) => c.tipo === 'despesa');
  const finalidade = new Set(r.finalidade);
  const nomesFinalidade = categorias.filter((c) => finalidade.has(c.id)).map((c) => c.nome);

  if (!r.contas.length)
    return (
      <Vazio acao={<button type="button" className="primario" onClick={() => irPara('contas')}>Criar conta do tipo “Cartão-refeição”</button>}>
        Ainda não tens um cartão-refeição registado.
      </Vazio>
    );

  return (
    <>
      <Aviso tom="info">O cartão-refeição é um benefício separado: o saldo nunca entra no saldo bancário nem no dinheiro disponível, e as despesas pagas com ele não contam como despesas em dinheiro.</Aviso>
      <div className="kpis">
        <Kpi rotulo="Saldo atual" valor={euro(r.saldo)} classeValor={r.saldo < 0 ? 'negativo' : ''} detalhe={r.saldo < 0 ? 'Atualiza o saldo em Contas' : undefined} />
        <Kpi rotulo="Carregamento mensal esperado" valor={euro(r.carregamento)} detalhe="Das fontes de rendimento para este cartão" />
        <Kpi rotulo="Gasto este mês" valor={euro(r.gastoMes)} />
        <Kpi rotulo="Orçamento restante do mês" valor={euro(r.restanteMes)} classeValor={r.restanteMes < 0 ? 'negativo' : ''} detalhe={nomesFinalidade.length ? `Para ${nomesFinalidade.join(', ')}` : 'Define a finalidade abaixo'} />
      </div>
      {r.carregamento > 0 && <Barra grande fracao={r.gastoMes / r.carregamento} cor={r.gastoMes > r.carregamento ? 'var(--negativo)' : 'var(--aviso)'} />}

      <div className="grelha">
        <Cartao titulo="Finalidade do cartão" subtitulo="O carregamento mensal aparece como orçamento destas categorias.">
          {categorias
            .filter((c) => c.essencial || c.lazer)
            .map((c) => (
              <CampoCaixa
                key={c.id}
                rotulo={c.nome}
                valor={finalidade.has(c.id)}
                mudar={(v) => atualizar((e) => ({ ...e, refeicao: { finalidadeIds: v ? [...e.refeicao.finalidadeIds, c.id] : e.refeicao.finalidadeIds.filter((x) => x !== c.id) } }))}
              />
            ))}
        </Cartao>
        <Cartao titulo="Utilização por categoria" subtitulo="Este mês">
          {r.porCategoria.size ? (
            [...r.porCategoria.entries()].map(([id, v]) => (
              <div className="linha-barra" key={id}>
                <div className="cabeca">
                  <span>{nomeCategoria(estado, id || null)}</span>
                  <span className="num suave">
                    {euro(v)} · {pct(r.gastoMes > 0 ? v / r.gastoMes : 0)}
                  </span>
                </div>
                <Barra fracao={r.gastoMes > 0 ? v / r.gastoMes : 0} cor="var(--aviso)" />
              </div>
            ))
          ) : (
            <p className="suave pequeno">Sem despesas com o cartão este mês.</p>
          )}
        </Cartao>
      </div>

      <Cartao
        titulo="Movimentos do cartão"
        acoes={
          <button type="button" className="primario" onClick={() => setNova(true)}>
            <Icone nome="adicionar" /> Despesa com cartão
          </button>
        }
      >
        <ListaMovimentos movimentos={r.movimentos} contaId={r.contas[0].id} vazio="Sem movimentos no cartão." />
      </Cartao>
      {nova && <FormMovimento tipoInicial="despesa" meioInicial="refeicao" aoFechar={() => setNova(false)} />}
    </>
  );
}
