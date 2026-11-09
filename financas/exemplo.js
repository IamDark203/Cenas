/* Dados de exemplo para experimentar a aplicação (botão "Carregar dados de exemplo"). */
self.FinExemplo = function () {
  return {
    categorias: ['Habitação', 'Alimentação', 'Transportes', 'Saúde', 'Lazer', 'Serviços e subscrições', 'Seguros', 'Outros'],
    rendimentos: [
      { nome: 'Ordenado', tipo: 'ordenado', valor: 1450, frequencia: 'mensal14' },
      { nome: 'Subsídio de alimentação', tipo: 'subsidio', valor: 160, frequencia: 'mensal' },
      { nome: 'Prémio anual', tipo: 'bonus', valor: 1200, frequencia: 'anual' },
      { nome: 'Trabalhos de design', tipo: 'freelance', valor: 300, frequencia: 'trimestral' },
    ],
    despesas: [
      { nome: 'Renda', categoria: 'Habitação', valor: 650, frequencia: 'mensal' },
      { nome: 'Luz, água e gás', categoria: 'Habitação', valor: 85, frequencia: 'mensal' },
      { nome: 'Supermercado', categoria: 'Alimentação', valor: 280, frequencia: 'mensal' },
      { nome: 'Passe', categoria: 'Transportes', valor: 40, frequencia: 'mensal' },
      { nome: 'Internet e telemóvel', categoria: 'Serviços e subscrições', valor: 45, frequencia: 'mensal' },
      { nome: 'Streaming', categoria: 'Serviços e subscrições', valor: 18, frequencia: 'mensal' },
      { nome: 'Ginásio', categoria: 'Saúde', valor: 35, frequencia: 'mensal' },
      { nome: 'Jantares e saídas', categoria: 'Lazer', valor: 120, frequencia: 'mensal' },
      { nome: 'Seguro automóvel', categoria: 'Seguros', valor: 360, frequencia: 'anual' },
      { nome: 'Férias', categoria: 'Lazer', valor: 1200, frequencia: 'anual' },
    ],
    poupancas: [
      { nome: 'Fundo de emergência', saldo: 4200, contribuicaoMensal: 150, objetivo: 6000 },
      { nome: 'Carro novo', saldo: 1800, contribuicaoMensal: 100, objetivo: 8000 },
    ],
    investimentos: [
      { nome: 'ETF MSCI World', tipo: 'etf', valorInvestido: 5000, valorAtual: 5720, contribuicaoMensal: 150 },
      { nome: 'PPR', tipo: 'ppr', valorInvestido: 2400, valorAtual: 2510, contribuicaoMensal: 50 },
      { nome: 'Certificados de Aforro', tipo: 'obrigacoes', valorInvestido: 3000, valorAtual: 3090 },
    ],
  };
};
