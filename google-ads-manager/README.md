# Gestor de Campanhas Google Ads

Aplicação web para registar **manualmente** e analisar os resultados de campanhas de Google Ads.
Não precisa de instalação, servidor nem dependências: abra o `index.html` no browser.

![Painel](screenshot.png)

## Funcionalidades

### Registo de resultados
- Registo por **dia, semana, mês ou intervalo** de datas. Uma semana vai sempre de segunda a domingo.
- Detalhe opcional por **grupo de anúncios** e **palavra-chave**, com sugestões a partir do que já foi registado.
- A app impede que o mesmo resultado seja contado duas vezes: recusa períodos que se sobrepõem ao mesmo nível e
  não deixa misturar o total da campanha com o detalhe por grupo ou palavra-chave no mesmo período.
  Se o período e o nível forem exatamente iguais, pergunta se quer substituir o registo existente.
- Métricas calculadas enquanto escreve, botão "Guardar e seguinte" (passa ao período seguinte) e "Duplicar".
- Validações: valores negativos, cliques acima das impressões, datas inválidas, palavra-chave sem grupo.

### Painel
- Indicadores (Custo, Impressões, Cliques, CTR, CPC, Conversões, Custo/conversão, ROAS) comparados com o período anterior.
- **Ritmo do mês**: gasto face ao orçamento mensal e conversões face ao objetivo, com **previsão para o fim do mês**
  e o valor por dia que ainda pode gastar.
- Gráfico de evolução **por dia, semana ou mês**. Pode mostrar o total ou **comparar campanhas**
  (ou grupos de anúncios, quando há uma campanha selecionada).
- **Anotações** (por exemplo, "subi os lances") marcadas no gráfico.
- Tabela de desempenho por campanha, grupo de anúncios ou palavra-chave.

Os registos semanais, mensais ou de intervalo são repartidos pelos dias de forma proporcional quando o período
escolhido os corta a meio. Por exemplo, metade de uma semana conta metade dos valores dessa semana.

### Relatório
- Relatório para **imprimir ou guardar em PDF**: indicadores, gráficos, tabela por campanha, evolução por semana
  ou por mês, orçamento e objetivos (quando o período é um mês completo) e as anotações do período.

### Contas e campanhas
- **Várias contas ou clientes**, cada uma com as suas campanhas, resultados e anotações.
- Campanhas com orçamento diário e/ou mensal, objetivo de conversões por mês, CPA alvo e ROAS alvo.

### Segurança dos dados
- **Gravação automática num ficheiro** à sua escolha, a cada alteração (Chrome e Edge no computador).
- Aviso quando a última cópia de segurança tem mais de 7 dias.
- **Anular** depois de apagar campanhas, registos, anotações ou contas, de importar ficheiros e de carregar dados de exemplo.
- Os dados ficam sincronizados entre separadores abertos da app.
- Exportar uma conta em JSON para **partilhar com um colega**, que a pode **juntar** aos seus dados.
- Exportar e importar resultados em CSV (separador `;`, decimais com vírgula, compatível com o Excel em português).

## Onde ficam os dados

Os dados ficam no `localStorage` do browser, ou seja, só nesse computador e nesse browser.
Para não os perder:
- no Chrome ou Edge, use **Dados → Gravar automaticamente num ficheiro…** e escolha, por exemplo, uma pasta do
  OneDrive, Google Drive ou Dropbox para ter também uma cópia na nuvem;
- nos outros browsers, use **Dados → Fazer cópia de segurança** regularmente.

Para recuperar os dados, use **Dados → Abrir cópia ou ficheiro partilhado…** e escolha "Substituir tudo".

## Métricas calculadas

| Métrica | Fórmula |
|---|---|
| CTR | cliques ÷ impressões |
| CPC médio | custo ÷ cliques |
| Taxa de conversão | conversões ÷ cliques |
| Custo / conversão (CPA) | custo ÷ conversões |
| ROAS | valor de conversão ÷ custo |
| Previsão do mês | valor até ao último dia com dados × (dias do mês ÷ dias com dados) |
| Orçamento mensal | o valor mensal da campanha ou, se não estiver definido, orçamento diário × dias do mês |

## Formato CSV

```
inicio;fim;campanha;grupo_anuncios;palavra_chave;impressoes;cliques;custo;conversoes;valor_conversao
2026-11-02;2026-11-08;Pesquisa — Marca;;;8400;910;312,40;96;5210,00
```

As datas podem estar em `AAAA-MM-DD` ou `DD/MM/AAAA`. As campanhas que ainda não existem são criadas
automaticamente. Se o ficheiro tiver algum erro, nada é importado e a app indica as linhas com problemas.

## Testes

```bash
npm test          # testes da lógica (Node, sem dependências)
npm run test:e2e  # teste completo no browser (precisa do Playwright com o Chromium)
```

## Estrutura

| Ficheiro | Conteúdo |
|---|---|
| `js/core.js` | Lógica pura: datas, rateio de períodos, conflitos, ritmo mensal, CSV, migração de dados |
| `js/format.js` | Formatação em pt-PT e definição das métricas |
| `js/store.js` | Armazenamento, contas, anular, gravação automática em ficheiro |
| `js/chart.js` | Gráfico de linhas em SVG |
| `js/ui.js` | Utilitários da interface (diálogos, tabelas, avisos) |
| `js/dashboard.js`, `campaigns.js`, `results.js`, `report.js`, `data.js`, `app.js` | Separadores e ações |
