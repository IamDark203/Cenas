import { useState } from 'react';
import { CampoNumero, CampoTexto } from '../componentes/campos';
import { GraficoDonut, useCores } from '../componentes/graficos';
import { useInteracoes } from '../componentes/janelas';
import { Aviso, Cartao, LinhasResumo, NotaSimulacao, Vazio } from '../componentes/ui';
import { euro, numero, pct } from '../dominio/formato';
import { novoId } from '../dominio/ids';
import { NOMES_ALOCACAO, validarAlocacao, valorAtualObjetivo } from '../dominio/planeamento';
import type { CategoriaAlocacao } from '../dominio/tipos';
import { useResumo } from '../estado/derivados';
import { useLoja } from '../estado/loja';

const CATS = Object.keys(NOMES_ALOCACAO) as CategoriaAlocacao[];
const vazio = (): Record<CategoriaAlocacao, number> => ({ ordem: 0, fundo: 0, poupanca: 0, investimentos: 0, objetivos: 0 });

export default function Alocacao() {
  const { estado, atualizar } = useLoja();
  const { atual } = useResumo();
  const { confirmar, avisar } = useInteracoes();
  const c = useCores();
  const objetivos = estado.objetivos.reduce((s, o) => s + valorAtualObjetivo(o), 0);
  // Saldos negativos (conta a descoberto) contam como 0 para a distribuição.
  const real: Record<CategoriaAlocacao, number> = {
    ordem: Math.max(0, atual.disponivel + atual.liquidezCarteiras),
    fundo: atual.fundoEmergencia,
    poupanca: Math.max(0, atual.poupancas - objetivos),
    investimentos: atual.carteira,
    objetivos: Math.min(objetivos, atual.poupancas),
  };
  const totalReal = CATS.reduce((s, k) => s + real[k], 0);
  const [base, setBase] = useState<number | null>(Math.round(totalReal * 100) / 100);
  const [p, setP] = useState<Record<CategoriaAlocacao, number>>(() =>
    totalReal > 0 ? (Object.fromEntries(CATS.map((k) => [k, Math.round((real[k] / totalReal) * 1000) / 10])) as Record<CategoriaAlocacao, number>) : vazio(),
  );
  const [nome, setNome] = useState('');
  const b = base ?? 0;
  const v = validarAlocacao(p, b);
  const definir = (k: CategoriaAlocacao, pctV: number) => setP((x) => ({ ...x, [k]: Math.max(0, Math.min(100, Math.round(pctV * 100) / 100)) }));

  const guardar = () => {
    if (!nome.trim()) return;
    atualizar((e) => ({ ...e, cenarios: [...e.cenarios, { id: novoId(), nome: nome.trim(), base: b, percentagens: p }] }));
    setNome('');
    avisar('Configuração guardada.');
  };

  return (
    <>
      <Aviso tom="info">Experimenta distribuições diferentes do teu património. Nada aqui altera as tuas contas e nenhuma distribuição é apresentada como a mais adequada.</Aviso>
      <div className="grelha">
        <Cartao titulo="Distribuição a testar">
          <CampoNumero rotulo="Valor a distribuir" valor={base} mudar={setBase} dica={`Património atual (sem cartão-refeição): ${euro(totalReal)}`} />
          {CATS.map((k, i) => (
            <div key={k} className="formulario" style={{ gap: 6 }}>
              <div className="cartao-cabeca">
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 560 }}>
                  <span className="ponto" style={{ background: c.serie[i] }} />
                  {NOMES_ALOCACAO[k]}
                </span>
                <span className="num suave">{euro(v.valores[k])}</span>
              </div>
              <div className="deslizador">
                <input type="range" min={0} max={100} step={1} value={p[k]} onChange={(e) => definir(k, Number(e.target.value))} aria-label={`${NOMES_ALOCACAO[k]} (%)`} />
                <div className="campo-pct">
                  <CampoNumero rotulo="%" sufixo="%" valor={p[k]} mudar={(x) => definir(k, x ?? 0)} />
                </div>
              </div>
              <CampoNumero rotulo="Valor" valor={Math.round(v.valores[k] * 100) / 100} mudar={(x) => b > 0 && definir(k, ((x ?? 0) / b) * 100)} />
            </div>
          ))}
        </Cartao>
        <div className="formulario" style={{ alignContent: 'start' }}>
          <Cartao titulo="Resultado">
            <LinhasResumo
              linhas={[
                ['Soma das percentagens', `${numero(Math.round(v.soma * 100) / 100)} %`],
                ['Capital alocado', euro(v.alocado)],
                ['Capital por alocar', euro(v.porAlocar), 'total'],
              ]}
            />
            {v.valido ? <Aviso tom="positivo">A soma é 100 %.</Aviso> : <Aviso>A soma deve ser 100 % ({v.soma < 100 ? `faltam ${numero(Math.round((100 - v.soma) * 100) / 100)} p.p.` : `excede em ${numero(Math.round((v.soma - 100) * 100) / 100)} p.p.`}).</Aviso>}
            <GraficoDonut
              fatias={[...CATS.map((k, i) => ({ nome: NOMES_ALOCACAO[k], valor: v.valores[k], cor: c.serie[i] })), ...(v.porAlocar > 0 ? [{ nome: 'Por alocar', valor: v.porAlocar, cor: c.serie[7] }] : [])]}
            />
          </Cartao>
          <Cartao titulo="Guardar esta configuração">
            <CampoTexto rotulo="Nome" valor={nome} mudar={setNome} exemplo="Ex.: Cenário A" />
            <button type="button" className="primario" disabled={!nome.trim() || !v.valido} onClick={guardar}>
              Guardar
            </button>
            {!v.valido && <p className="mais-suave pequeno">Só é possível guardar quando a soma é 100 %.</p>}
          </Cartao>
        </div>
      </div>

      <Cartao titulo="Comparar configurações" subtitulo="A coluna “Atual” mostra a distribuição real hoje.">
        {estado.cenarios.length ? (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th className="num">Atual</th>
                  {estado.cenarios.map((s) => (
                    <th key={s.id} className="num">
                      {s.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATS.map((k) => (
                  <tr key={k}>
                    <td>{NOMES_ALOCACAO[k]}</td>
                    <td className="num">
                      {pct(totalReal > 0 ? real[k] / totalReal : 0)}
                      <div className="mais-suave pequeno">{euro(real[k])}</div>
                    </td>
                    {estado.cenarios.map((s) => (
                      <td key={s.id} className="num">
                        {numero(s.percentagens[k])} %<div className="mais-suave pequeno">{euro((s.base * s.percentagens[k]) / 100)}</div>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td />
                  <td />
                  {estado.cenarios.map((s) => (
                    <td key={s.id} className="num">
                      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="pequeno" onClick={() => (setP(s.percentagens), setBase(s.base))}>
                          Abrir
                        </button>
                        <button
                          type="button"
                          className="pequeno perigo"
                          onClick={async () => (await confirmar(`Apagar "${s.nome}"?`, { botao: 'Apagar', perigo: true })) && atualizar((e) => ({ ...e, cenarios: e.cenarios.filter((x) => x.id !== s.id) }))}
                        >
                          Apagar
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio>Guarda configurações para as comparar lado a lado.</Vazio>
        )}
      </Cartao>
      <NotaSimulacao>Ferramenta de exploração. Não constitui aconselhamento financeiro.</NotaSimulacao>
    </>
  );
}
