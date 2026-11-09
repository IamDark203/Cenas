# As Minhas Finanças

Uma aplicação simples para gerir as finanças pessoais. Funciona no browser, não precisa de instalação nem de conta, e
os dados ficam guardados apenas no teu dispositivo.

## O que podes registar

| Secção | O que guardas |
| --- | --- |
| **Rendimentos** | Ordenado, subsídios, prémios, trabalhos extra, rendas, juros… com frequência (semanal, mensal 12x, mensal 14x com subsídios de férias e Natal, trimestral, semestral, anual). |
| **Despesas** | Para onde vai o dinheiro, organizado por categorias que podes criar, mudar de nome ou apagar. |
| **Poupanças** | Saldo de cada conta, reforço mensal e objetivo (com progresso e meses que faltam). |
| **Investimentos** | Total investido, valor atual (ganho/perda e rentabilidade) e investimento mensal. |

Tudo é editável: cada item tem os botões **Editar** e **Apagar**, e as alterações refletem-se de imediato no **Resumo**.

O **Resumo** mostra, em valores mensais ou anuais:
- rendimentos, despesas, poupança + investimento (e a taxa de poupança), saldo livre, total poupado e património;
- um gráfico de **para onde vai o meu dinheiro** (despesas por categoria, poupança, investimentos e o que fica por alocar);
- despesas por categoria, progresso dos objetivos de poupança e desempenho dos investimentos.

## Como usar

- **Mais simples:** abre o ficheiro `index.html` no browser (duplo clique).
- **Com servidor local:** dentro desta pasta, corre `npm start` e abre http://localhost:8080.

Para experimentar, vai a **Definições → Carregar dados de exemplo**.

### No iPhone, como uma app

1. Abre o link da aplicação no **Safari**: `https://iamdark203.github.io/Cenas/financas/`.
2. Toca em **Partilhar** (o quadrado com a seta) → **Adicionar ao ecrã principal** → **Adicionar**.

Fica com ícone próprio, abre em ecrã inteiro e funciona sem internet depois da primeira visita. Qualquer pessoa pode
usar o link, sem conta: cada pessoa vê só os seus dados, guardados no próprio telemóvel.

## Os teus dados

Os dados ficam guardados no armazenamento local do browser (`localStorage`) do teu dispositivo. Não são enviados para
lado nenhum, nem para quem publicou a aplicação.
Em **Definições** podes:
- **Exportar** uma cópia de segurança em JSON (recomendado de vez em quando; no iPhone, escolhe "Guardar em Ficheiros");
- **Importar** essa cópia noutro browser ou computador;
- **Apagar tudo**.

> Se limpares os dados do browser, os dados da aplicação também são apagados. Faz cópias de segurança.

## Estrutura

| Ficheiro | Função |
| --- | --- |
| `index.html` | Página e estrutura da interface |
| `styles.css` | Estilos (inclui modo escuro e telemóvel) |
| `calc.js` | Cálculos (valores mensais, resumo, objetivos, validação de dados importados) |
| `graficos.js` | Gráficos em SVG/HTML, sem bibliotecas externas |
| `app.js` | Interface: listas, formulários de edição, categorias, importar/exportar |
| `armazenamento.js` | Guarda os dados no dispositivo |
| `manifest.webmanifest`, `icones/` | Nome, ícone e ecrã inteiro quando adicionada ao ecrã principal |
| `sw.js` | Funcionamento sem internet (ao alterar a aplicação, muda `VERSAO` neste ficheiro) |
| `exemplo.js` | Dados de exemplo |
| `servidor.js` | Servidor estático opcional (`npm start`) |

## Testes

```bash
npm test
```
