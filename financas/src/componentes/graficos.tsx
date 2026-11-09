import { useEffect, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { euro, euroRedondo, pct } from '../dominio/formato';
import { Legenda } from './ui';

export interface Cores {
  serie: string[];
  texto3: string;
  borda: string;
  positivo: string;
  negativo: string;
  acento: string;
  superficie2: string;
}

function lerCores(): Cores {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    serie: ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'].map(v),
    texto3: v('--texto-3'),
    borda: v('--borda'),
    positivo: v('--positivo'),
    negativo: v('--negativo'),
    acento: v('--acento'),
    superficie2: v('--superficie-2'),
  };
}

/** Cores do tema atual (os atributos SVG do Recharts não aceitam variáveis CSS). */
export function useCores(): Cores {
  const [cores, setCores] = useState(lerCores);
  useEffect(() => {
    const atualizar = () => setCores(lerCores());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', atualizar);
    const obs = new MutationObserver(atualizar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', atualizar);
      obs.disconnect();
    };
  }, []);
  return cores;
}

function Dica({ active, payload, label, formatarRotulo }: { active?: boolean; payload?: { name: string; value: number; color?: string; payload?: { fill?: string } }[]; label?: string | number; formatarRotulo?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dica-grafico">
      {label != null && <strong>{formatarRotulo ? formatarRotulo(label) : label}</strong>}
      {payload.map((p) => (
        <span key={p.name} style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>
            <span className="ponto" style={{ background: p.color ?? p.payload?.fill, marginRight: 6 }} />
            {p.name}
          </span>
          <span className="num">{euro(p.value)}</span>
        </span>
      ))}
    </div>
  );
}

const eixoEuro = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)} k€` : euroRedondo(v));

export interface Serie {
  chave: string;
  nome: string;
  cor?: string;
  tipo?: 'linha' | 'area' | 'barra';
  empilhar?: string;
  tracejado?: boolean;
}

/** Gráfico cartesiano (linhas, áreas ou barras) com eixos em euros. */
export function GraficoSeries({
  dados,
  x,
  series,
  formatarX,
  tipo = 'area',
  altura = '',
  legenda = true,
}: {
  dados: object[];
  x: string;
  series: Serie[];
  formatarX?: (v: string | number) => string;
  tipo?: 'linha' | 'area' | 'barra';
  altura?: '' | 'alto' | 'baixo';
  legenda?: boolean;
}) {
  const c = useCores();
  const cor = (s: Serie, i: number) => s.cor ?? c.serie[i % c.serie.length];
  const comum = (
    <>
      <CartesianGrid vertical={false} stroke={c.borda} />
      <XAxis dataKey={x} tickFormatter={formatarX} tick={{ fill: c.texto3, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={12} />
      <YAxis tickFormatter={eixoEuro} tick={{ fill: c.texto3, fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
      <Tooltip content={<Dica formatarRotulo={formatarX} />} cursor={{ fill: c.superficie2, stroke: c.borda }} />
      {legenda && series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
    </>
  );
  let grafico: ReactNode;
  if (tipo === 'barra') {
    grafico = (
      <BarChart data={dados} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        {comum}
        {series.map((s, i) => (
          <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={cor(s, i)} radius={[4, 4, 0, 0]} stackId={s.empilhar} maxBarSize={36} animationDuration={450} />
        ))}
      </BarChart>
    );
  } else if (tipo === 'linha') {
    grafico = (
      <LineChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {comum}
        {series.map((s, i) => (
          <Line key={s.chave} dataKey={s.chave} name={s.nome} stroke={cor(s, i)} strokeWidth={2} dot={dados.length < 14} strokeDasharray={s.tracejado ? '5 4' : undefined} type="monotone" animationDuration={500} />
        ))}
      </LineChart>
    );
  } else {
    grafico = (
      <AreaChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.chave} id={`g-${s.chave}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor(s, i)} stopOpacity={0.28} />
              <stop offset="100%" stopColor={cor(s, i)} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        {comum}
        {series.map((s, i) => (
          <Area key={s.chave} dataKey={s.chave} name={s.nome} stroke={cor(s, i)} fill={`url(#g-${s.chave})`} strokeWidth={2} type="monotone" stackId={s.empilhar} dot={dados.length < 3} animationDuration={500} />
        ))}
      </AreaChart>
    );
  }
  return (
    <div className={`grafico${altura ? ` ${altura}` : ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        {grafico as never}
      </ResponsiveContainer>
    </div>
  );
}

/** Donut com legenda e percentagens. */
export function GraficoDonut({ fatias, vazio = 'Sem dados para mostrar.' }: { fatias: { nome: string; valor: number; cor?: string }[]; vazio?: string }) {
  const c = useCores();
  const dados = fatias.filter((f) => f.valor > 0.004).map((f, i) => ({ ...f, cor: f.cor ?? c.serie[i % c.serie.length] }));
  const total = dados.reduce((s, f) => s + f.valor, 0);
  if (total <= 0) return <p className="suave pequeno">{vazio}</p>;
  return (
    <div className="donut-wrap">
      <div className="grafico baixo">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="62%" outerRadius="96%" paddingAngle={dados.length > 1 ? 1.5 : 0} stroke="none" animationDuration={450}>
              {dados.map((f) => (
                <Cell key={f.nome} fill={f.cor} />
              ))}
            </Pie>
            <Tooltip content={<Dica />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={dados.map((f) => ({ nome: f.nome, cor: f.cor, valor: `${pct(f.valor / total)} · ${euroRedondo(f.valor)}` }))} />
    </div>
  );
}
