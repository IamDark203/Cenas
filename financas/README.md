# Capital — controlo financeiro pessoal

Centro de controlo das finanças pessoais: receitas, despesas e orçamento, contas e património, fundo de emergência,
objetivos de poupança, investimentos, simuladores, projeções, alertas e relatórios. Euros e formatos de Portugal.

Publicada em **https://iamdark203.github.io/Cenas/contas-da-casa/** (branch `site-financas`, pasta `contas-da-casa/`).
No iPhone: abrir no Safari → Partilhar → **Adicionar ao ecrã principal**. Funciona sem internet.

## Princípios

- **Uma única fonte de dados.** Todos os ecrãs leem o mesmo registo de movimentos (receitas, despesas,
  transferências e correções de saldo). Saldos, património, gráficos, relatórios e alertas são calculados a partir dele.
- **Sem duplicações.** Transferências entre contas próprias e correções de saldo não contam como receitas nem despesas.
  Compras de investimentos pagas por uma conta tiram o dinheiro dessa conta e passam-no para a carteira.
- **Cartão-refeição à parte.** É um benefício, não dinheiro disponível: fica fora do “disponível” e da taxa de poupança.
- **Sem pressupostos escondidos.** Não calcula IRS nem Segurança Social. Enquanto o salário líquido não for confirmado,
  usa o valor indicado e mostra um aviso.
- **Sem aconselhamento.** Não recomenda produtos, não executa ordens e todas as simulações são identificadas como tal.
- **Privacidade.** Os dados ficam só no dispositivo (localStorage). Não há servidor nem acesso a contas bancárias.
  Opcionalmente, os dados são cifrados com palavra-passe (PBKDF2-SHA-256 + AES-GCM 256) e a app bloqueia após
  5 minutos em segundo plano.

## Secções

| Secção | Conteúdo |
| --- | --- |
| Painel | Património, saldos, disponível, poupanças, fundo, investido, receitas/despesas, taxa de poupança, 5 gráficos, períodos (mês, 3, 6, 12 meses, tudo) |
| Receitas | Fontes de rendimento (bruto/líquido, por dia de trabalho, conta de destino), registos |
| Despesas | Lista filtrável, recorrentes automáticas, orçamento vs real, calendário, histórico e categorias com mais gastos |
| Contas | Contas e produtos (TANB/TANL, limite remunerado, juros, condições), histórico, transferências, atualização de saldo |
| Fundo de emergência | Objetivo por meses de despesas essenciais, contas associadas, progresso, simulador 3/6/9/12 meses, perda de rendimento |
| Objetivos | Vários objetivos com data limite, reforços, contribuições e distribuição das poupanças |
| Investimentos | Ativos, compras/vendas (custo médio, comissões), cotações (manual ou fonte configurável), alocação pretendida, simulador DCA |
| Simulador de alocação | Distribuição do património por percentagens/valores, validação de 100 %, configurações guardadas e comparadas |
| Análise e projeções | Indicadores e projeções a 1, 3, 5, 10 e 20 anos com pressupostos editáveis |
| Alertas | Pagamentos próximos, orçamento, objetivos, reforços, distribuição, fundo, valores por definir |
| Relatórios | Mensais e anuais com comparação; exportação PDF, Excel e CSV |
| Definições | Perfil, tema, mês de referência, categorias, pressupostos, palavra-passe, cópias de segurança |

## Assistente financeiro e comparador bancário

- **Fundo de emergência inteligente:** despesas essenciais calculadas pelas categorias (plano e média real), sugestão de 3/6/9/12 meses pela estabilidade profissional, regularidade, fontes de rendimento e dependentes, e valor mínimo protegido (nunca reduzido sem confirmação). Objetivo efetivo = maior entre o calculado e o mínimo.
- **Alocações virtuais:** cada conta divide o saldo por fundo, objetivos, despesas futuras, etc. A soma nunca ultrapassa o saldo e não cria património. Política de juros por conta: capital não atribuído (predefinida), proporcional ou destino específico.
- **Distribuição de reforços:** proposta pela ordem de prioridade configurada; só atualiza alocações depois de confirmada e nunca executa transferências.
- **Disponível para gastar agora** e **orçamento disponível para o mês** (indicadores distintos, com o cálculo visível).
- **Cartão-refeição** independente, **planeador e viabilidade de objetivos**, **orçamento de lazer** e **assistente de sugestões** — todos a partir do mesmo plano mensal (`src/dominio/orcamento.ts`).
- **Comparador bancário:** base `public/dados/produtos.json` com dados da documentação oficial (FIN), fonte e data de verificação por produto; "Não disponível" quando a fonte não indica o dado. Simulador diário (escalões, limite remunerado, base 360/365, datas de pagamento, capitalização, promoções, prazos e renovação, penalizações, comissões e imposto configurável), ranking personalizado, integração com o fundo e alertas de alterações com impacto.
- **Atualização automática:** `.github/workflows/financas-verificar-produtos.yml` corre `scripts/verificar-fontes.mjs` todas as semanas (e manualmente), compara a impressão digital de cada documento oficial e marca como "desatualizada" a informação cuja fonte mudou, guardando o histórico. Workflows agendados só correm a partir do branch predefinido do repositório.

## Desenvolvimento

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm test         # testes do domínio e de aceitação A–J (vitest)
npm run build    # gera dist/ (ficheiros estáticos)
```

Para publicar: copiar o conteúdo de `dist/` para a pasta `contas-da-casa/` do branch `site-financas`.
Ao mudar a lógica de cache, alterar `VERSAO` em `public/sw.js`.

| Pasta | Conteúdo |
| --- | --- |
| `src/dominio` | Modelo de dados e cálculos puros (testados em `dominio.test.ts`) |
| `src/estado` | Estado da app, gravação local e cifra |
| `src/componentes` | Componentes de interface, formulários e gráficos |
| `src/paginas` | Uma página por secção |
| `src/exportar` | CSV, Excel (gerador próprio) e PDF |
