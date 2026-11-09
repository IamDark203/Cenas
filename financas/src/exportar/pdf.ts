import { data as fmtData, euro, mesLongo, pct } from '../dominio/formato';
import type { Relatorio } from '../dominio/relatorios';

/** Gera o relatório em PDF (jsPDF carregado só quando é preciso). */
export async function relatorioPdf(r: Relatorio, hojeIso: string): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const titulo = r.tipo === 'mes' ? `Relatório de ${mesLongo(r.chave)}` : `Relatório anual de ${r.chave}`;
  const cor: [number, number, number] = [31, 79, 209];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(titulo, 14, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Capital · gerado a ${fmtData(hojeIso)} · valores em euros`, 14, 26);
  doc.setTextColor(0);

  const a = r.atual;
  const p = r.anterior;
  const dif = (x: number, y: number) => {
    const d = x - y;
    return `${d >= 0 ? '+' : ''}${euro(d)}`;
  };
  autoTable(doc, {
    startY: 32,
    head: [['Indicador', 'Período', 'Período anterior', 'Diferença']],
    body: [
      ['Receitas (dinheiro)', euro(a.receitas), euro(p.receitas), dif(a.receitas, p.receitas)],
      ['Despesas (dinheiro)', euro(a.despesas), euro(p.despesas), dif(a.despesas, p.despesas)],
      ['Poupança líquida', euro(a.poupanca), euro(p.poupanca), dif(a.poupanca, p.poupanca)],
      ['Taxa de poupança', a.receitas ? pct(a.taxaPoupanca) : '—', p.receitas ? pct(p.taxaPoupanca) : '—', ''],
      ['Benefícios em cartão-refeição', euro(a.beneficios), euro(p.beneficios), dif(a.beneficios, p.beneficios)],
      ['Despesas com cartão-refeição', euro(a.despesasRefeicao), euro(p.despesasRefeicao), dif(a.despesasRefeicao, p.despesasRefeicao)],
      ['Investimentos realizados', euro(a.investido), euro(p.investido), dif(a.investido, p.investido)],
      ['Património no início', euro(a.patrimonioInicio), euro(p.patrimonioInicio), ''],
      ['Património no fim', euro(a.patrimonioFim), euro(p.patrimonioFim), ''],
      ['Evolução do património', euro(a.variacaoPatrimonio), euro(p.variacaoPatrimonio), dif(a.variacaoPatrimonio, p.variacaoPatrimonio)],
    ],
    headStyles: { fillColor: cor },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    styles: { fontSize: 9 },
  });

  const total = r.categorias.reduce((s, c) => s + c.valor, 0);
  const antes = new Map(r.categoriasAnteriores.map((c) => [c.id, c.valor]));
  autoTable(doc, {
    head: [['Despesas por categoria', 'Valor', '% do total', 'Período anterior']],
    body: r.categorias.length
      ? r.categorias.map((c) => [c.nome, euro(c.valor), pct(total ? c.valor / total : 0), euro(antes.get(c.id) ?? 0)])
      : [['Sem despesas registadas', '', '', '']],
    headStyles: { fillColor: cor },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    styles: { fontSize: 9 },
  });

  if (r.tipo === 'ano') {
    autoTable(doc, {
      head: [['Mês', 'Receitas', 'Despesas', 'Poupança', 'Taxa de poupança']],
      body: a.fluxos.map((f) => [mesLongo(f.mes), euro(f.receitas), euro(f.despesas), euro(f.poupanca), f.receitas ? pct(f.taxaPoupanca) : '—']),
      headStyles: { fillColor: cor },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      styles: { fontSize: 9 },
    });
  }

  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 260;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    doc.splitTextToSize(
      'Receitas e despesas em dinheiro excluem o cartão-refeição. Transferências entre contas próprias e correções de saldo não contam como receitas nem despesas. Documento informativo; não constitui aconselhamento financeiro.',
      180,
    ),
    14,
    Math.min(y + 10, 285),
  );
  return doc.output('blob');
}
