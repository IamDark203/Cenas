import { CampoCaixa, CampoNumero } from '../componentes/campos';
import { Aviso, Cartao, Vazio } from '../componentes/ui';
import { calcularAlertas } from '../dominio/alertas';
import type { ConfigAlertas } from '../dominio/tipos';
import { useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';
import { irPara } from '../navegacao';

const SECCAO_PARA: Record<string, Parameters<typeof irPara>[0]> = {
  despesas: 'despesas',
  receitas: 'receitas',
  contas: 'contas',
  fundo: 'fundo',
  objetivos: 'objetivos',
  painel: 'painel',
};

export default function Alertas() {
  const { estado, atualizar, hoje } = useLoja();
  const { alertas } = useResumo();
  const cfg = estado.alertas;
  const mudar = (p: Partial<ConfigAlertas>) => atualizar((e) => ({ ...e, alertas: { ...e.alertas, ...p } }));
  const dispensados = calcularAlertas(estado, hoje).filter((a) => estado.alertasDispensados.includes(a.id));

  return (
    <>
      <Aviso tom="info">Os alertas são apenas informativos: descrevem a situação e não tomam decisões por ti.</Aviso>
      <Cartao titulo={`Alertas ativos (${alertas.length})`}>
        {alertas.length ? (
          alertas.map((a) => (
            <Aviso key={a.id} tom={a.nivel === 'sucesso' ? 'positivo' : a.nivel === 'aviso' ? 'aviso' : 'info'}>
              <strong>{a.titulo}</strong>
              <div>{a.detalhe}</div>
              <div className="acoes" style={{ marginTop: 8 }}>
                <button type="button" className="pequeno" onClick={() => irPara(SECCAO_PARA[a.seccao])}>
                  Abrir
                </button>
                <button type="button" className="pequeno fantasma" onClick={() => atualizar((e) => ({ ...e, alertasDispensados: [...e.alertasDispensados, a.id] }))}>
                  Dispensar
                </button>
              </div>
            </Aviso>
          ))
        ) : (
          <Vazio>Sem alertas neste momento.</Vazio>
        )}
      </Cartao>
      {dispensados.length > 0 && (
        <Cartao titulo={`Dispensados (${dispensados.length})`} acoes={<button type="button" className="pequeno" onClick={() => atualizar((e) => ({ ...e, alertasDispensados: [] }))}>Repor todos</button>}>
          {dispensados.map((a) => (
            <p key={a.id} className="suave pequeno">
              {a.titulo}
            </p>
          ))}
        </Cartao>
      )}
      <Cartao titulo="Configurar alertas">
        <div className="linha-campos">
          <CampoCaixa rotulo="Despesas recorrentes próximas do vencimento" valor={cfg.recorrentes} mudar={(recorrentes) => mudar({ recorrentes })} />
          <CampoNumero rotulo="Avisar com antecedência de" sufixo="dias" min={0} max={60} valor={cfg.recorrentesDias} mudar={(v) => mudar({ recorrentesDias: Math.max(0, Math.round(v ?? 0)) })} />
        </div>
        <CampoCaixa rotulo="Despesas acima do orçamento" valor={cfg.orcamento} mudar={(orcamento) => mudar({ orcamento })} />
        <CampoCaixa rotulo="Objetivos financeiros atingidos" valor={cfg.objetivos} mudar={(objetivos) => mudar({ objetivos })} />
        <div className="linha-campos">
          <CampoCaixa rotulo="Reforços mensais de objetivos não registados" valor={cfg.reforcos} mudar={(reforcos) => mudar({ reforcos })} />
          <CampoNumero rotulo="A partir do dia" sufixo="" min={1} max={31} valor={cfg.reforcoDiaLimite} mudar={(v) => mudar({ reforcoDiaLimite: Math.min(31, Math.max(1, Math.round(v ?? 15))) })} />
        </div>
        <div className="linha-campos">
          <CampoCaixa rotulo="Alterações na distribuição do património" valor={cfg.distribuicao} mudar={(distribuicao) => mudar({ distribuicao })} />
          <CampoNumero rotulo="Variação mínima" sufixo="p.p." min={1} max={100} valor={cfg.distribuicaoLimitePp} mudar={(v) => mudar({ distribuicaoLimitePp: Math.max(1, v ?? 10) })} />
        </div>
        <CampoCaixa rotulo="Fundo de emergência abaixo do objetivo" valor={cfg.fundo} mudar={(fundo) => mudar({ fundo })} />
        <CampoCaixa rotulo="Valores por definir ou por confirmar" valor={cfg.porDefinir} mudar={(porDefinir) => mudar({ porDefinir })} />
        <p className="mais-suave pequeno">Os alertas aparecem dentro da aplicação. Não são enviadas notificações para fora do dispositivo.</p>
      </Cartao>
    </>
  );
}
