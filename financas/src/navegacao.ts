export type IdSeccao =
  | 'painel'
  | 'receitas'
  | 'despesas'
  | 'contas'
  | 'fundo'
  | 'objetivos'
  | 'investimentos'
  | 'alocacao'
  | 'analise'
  | 'alertas'
  | 'relatorios'
  | 'definicoes';

export function irPara(id: IdSeccao) {
  if (window.location.hash !== `#${id}`) window.location.hash = id;
}
