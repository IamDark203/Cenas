export type IdSeccao =
  | 'painel'
  | 'assistente'
  | 'receitas'
  | 'refeicao'
  | 'comparador'
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
