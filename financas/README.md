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

### No iPhone (por link)

A aplicação está publicada como página privada no claude.ai. Abre o link no Safari (com sessão iniciada no
claude.ai), toca em **Partilhar → Adicionar ao ecrã principal**. Nessa versão os dados ficam guardados na tua conta,
em privado, e sincronizam entre dispositivos.

Para atualizar a página publicada depois de alterar o código: `npm run artifact` cria `dist/financas.html`, que é o
ficheiro a publicar.

## Os teus dados

Os dados ficam guardados no armazenamento local do browser (`localStorage`). Não são enviados para lado nenhum.
Em **Definições** podes:
- **Exportar** uma cópia de segurança em JSON (recomendado de vez em quando);
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
| `armazenamento.js` | Guarda os dados no browser e, no claude.ai, também na conta (sincronizado) |
| `construir-artifact.cjs` | Junta tudo num único HTML para publicar (`npm run artifact`) |
| `exemplo.js` | Dados de exemplo |
| `servidor.js` | Servidor estático opcional (`npm start`) |

## Testes

```bash
npm test
```
