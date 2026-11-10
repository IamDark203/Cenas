import { useMemo, useState } from 'react';
import { DistribuirReforco } from '../componentes/DistribuirReforco';
import { Aviso, Cartao, Kpi, LinhasResumo, Vazio } from '../componentes/ui';
import { sugestoesAssistente } from '../dominio/assistente';
import { euro, pct } from '../dominio/formato';
import { disponivelParaGastar, orcamentoDoMes, orcamentoLazer, planoMensal } from '../dominio/orcamento';
import { resumoFundo } from '../dominio/planeamento';
import { useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { irPara, type IdSeccao } from '../navegacao';

export default function Assistente() {
  const { estado, hoje } = useLoja();
  const { atual } = useResumo();
  const [distribuir, setDistribuir] = useState(false);
  const d = useMemo(() => {
    const plano = planoMensal(estado, hoje);
    return {
      plano,
      disp: disponivelParaGastar(estado, hoje),
      mes: orcamentoDoMes(estado, hoje),
      lazer: orcamentoLazer(estado, hoje),
      fe: resumoFundo(estado, atual.fundoEmergencia, hoje),
      sugestoes: sugestoesAssistente(estado, hoje),
    };
  }, [estado, hoje, atual.fundoEmergencia]);
  const p = d.plano;

  return (
    <>
      <Cartao titulo="Respostas rápidas" subtitulo="Calculadas a partir dos teus dados. Toca numa resposta para ver a secção.">
        <div className="kpis">
          <Kpi rotulo="Quanto tenho realmente disponível?" valor={euro(d.disp.agora)} detalhe="Livre de alocações e compromissos" classeValor={d.disp.agora < 0 ? 'negativo' : ''} />
          <Kpi rotulo="Quanto está protegido?" valor={euro(d.fe.capital)} detalhe={`Fundo de emergência · ${pct(d.fe.progresso)} do objetivo`} />
          <Kpi rotulo="Quanto devo ter no fundo?" valor={euro(d.fe.objetivo)} detalhe={d.fe.origemObjetivo === 'minimo' ? 'Mínimo protegido' : `${d.fe.meses} meses de despesas essenciais`} />
          <Kpi rotulo="Quanto posso gastar em lazer?" valor={euro(d.lazer.total)} detalhe={`Por mês · já usaste ${euro(d.lazer.gasto)}`} />
          <Kpi rotulo="Quanto consigo poupar por mês?" valor={euro(Math.max(0, p.capacidadeReal))} detalhe="Rendimento − despesas − gasto médio não essencial" classeValor={p.capacidadeReal < 0 ? 'negativo' : ''} />
          <Kpi rotulo="Orçamento que resta este mês" valor={euro(d.mes.restante)} detalhe={`De ${euro(d.mes.orcamento)}`} />
        </div>
        <div className="acoes">
          <button type="button" className="primario" onClick={() => setDistribuir(true)}>
            Como devo distribuir um novo rendimento?
          </button>
          <button type="button" onClick={() => irPara('objetivos')}>
            Quanto devo reforçar em cada objetivo?
          </button>
        </div>
      </Cartao>

      <Cartao titulo="Plano mensal" subtitulo="Base de todos os cálculos do assistente.">
        {p.rendimento > 0 ? (
          <LinhasResumo
            linhas={[
              ['Rendimento líquido mensal (dinheiro)', euro(p.rendimento)],
              ['− Despesas essenciais', euro(-p.despesasEssenciais)],
              ['− Empréstimos e prestações', euro(-p.compromissos)],
              ['− Outras despesas fixas', euro(-p.despesasFixas)],
              ['= Capacidade antes de lazer e poupança', euro(p.capacidadeBruta), 'total'],
              ['− Reforço do fundo de emergência', euro(-p.reforcoFundo)],
              ['− Reforços de objetivos', euro(-p.reforcoObjetivos)],
              ['− Investimento programado', euro(-p.investimento)],
              ['− Outras poupanças planeadas', euro(-p.outrasPoupancas)],
              ['= Orçamento de lazer (discricionário)', euro(p.discricionario), 'total'],
              ['Benefícios em cartão-refeição (à parte)', euro(p.beneficios)],
            ]}
          />
        ) : (
          <Vazio>Regista as tuas fontes de rendimento em Receitas para o assistente poder calcular o plano.</Vazio>
        )}
        {p.mesesHistorico === 0 && p.rendimento > 0 && <p className="mais-suave pequeno">Ainda não há meses completos de histórico: as despesas variáveis só entram quando houver registos.</p>}
      </Cartao>

      <Cartao titulo={`Sugestões (${d.sugestoes.length})`}>
        {d.sugestoes.length ? (
          d.sugestoes.map((s) => (
            <Aviso key={s.id} tom={s.tom === 'positivo' ? 'positivo' : s.tom === 'aviso' ? 'aviso' : 'info'}>
              <strong>{s.titulo}</strong>
              <div className="pequeno">Como foi calculado: {s.origem}</div>
              <div className="acoes" style={{ marginTop: 6 }}>
                <button type="button" className="pequeno" onClick={() => irPara(s.seccao as IdSeccao)}>
                  Abrir
                </button>
              </div>
            </Aviso>
          ))
        ) : (
          <Vazio>Sem sugestões: ainda não há dados suficientes ou está tudo em ordem.</Vazio>
        )}
      </Cartao>
      <p className="nota-simulacao">As sugestões são informativas e baseiam-se nos dados que registaste. Não constituem aconselhamento financeiro e nada é alterado sem a tua confirmação.</p>
      {distribuir && <DistribuirReforco aoFechar={() => setDistribuir(false)} />}
    </>
  );
}
