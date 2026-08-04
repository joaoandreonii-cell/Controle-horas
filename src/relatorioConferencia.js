/* ═════════════════════════════════════════════════════════════════════════
   RELATÓRIO DA CONFERÊNCIA — o veredito vira documento
   Recebe o resultado JÁ CALCULADO pela tela e devolve páginas. Não recalcula
   nada: um segundo cálculo divergiria do primeiro, e aí o PDF — que sai do
   aparelho e vai parar na conversa de outra pessoa — mentiria.

   A5 (metade exata da A4, mesma proporção) porque o leitor é o WhatsApp no
   celular: uma A4 encolhe para 60% numa tela de 360px e obriga zoom.
   ═════════════════════════════════════════════════════════════════════════ */

import { criarDoc, medir, quebrar, truncar } from './pdfDoc';
import { vereditoDoPeriodo } from './conferencia';
import { formatDurationLong, formatDateBR, parseDate, MONTH_FULL, DAY_SHORT } from './format';

export const PAGINA = { largura: 419.53, altura: 595.28, margem: 36 };
const TOPO = 40;
const RODAPE = 40;

const TINTA = [0.110, 0.098, 0.090];
const FRACO = [0.471, 0.443, 0.424];
const REGUA = [0.906, 0.898, 0.894];

const VEREDITO = {
  fecha:          { rotulo: 'Fecha',       cor: [0.016, 0.471, 0.341] },
  divergencia:    { rotulo: 'Divergência', cor: [0.745, 0.071, 0.235] },
  'só na ficha':  { rotulo: 'Só na ficha', cor: [0.706, 0.325, 0.035] },
  'só no app':    { rotulo: 'Só no app',   cor: [0.012, 0.412, 0.631] },
};

// O tom do período pinta a faixa do herói. Mesmas famílias da tela, no degrau
// 700 — que é como aquelas cores viram tinta sobre branco.
const TOM = {
  confere: VEREDITO.fecha.cor,
  quase:   VEREDITO['só na ficha'].cor,
  menos:   VEREDITO.divergencia.cor,
  mais:    VEREDITO.fecha.cor,
};

const CATS = [
  { k: 'd50', rotulo: '50% diurno' },
  { k: 'd100', rotulo: '100% diurno' },
  { k: 'n50', rotulo: '50% noturno' },
  { k: 'n100', rotulo: '100% noturno' },
];

const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function nomeArquivoRelatorio(refMonth) {
  return `conferencia-${semAcento(MONTH_FULL[refMonth.month - 1])}-${refMonth.year}.pdf`;
}

// O zero vira travessão para não poluir a coluna — igual ao fmtDiff da tela.
const fmtDif = (min) => (min === 0 ? '—' : (min > 0 ? '+' : '-') + formatDurationLong(Math.abs(min)));

// As três colunas de número, todas alinhadas à direita na mesma geometria —
// no herói e em cada dia, para o olho descer reto pela página.
function colunas(doc) {
  const dif = doc.largura - doc.margem;
  return { dif, ficha: dif - 52, app: dif - 98, rotulo: doc.margem };
}

function tabelaCategorias(doc, y, { app, ficha, diff }, { comTotal }) {
  const c = colunas(doc);
  const linhas = CATS.filter((cat) => app[cat.k] > 0 || ficha[cat.k] > 0);

  doc.texto(c.app, y, 'App', { tamanho: 6.5, cor: FRACO, alinhamento: 'dir', tracking: 0.4 });
  doc.texto(c.ficha, y, 'Ficha', { tamanho: 6.5, cor: FRACO, alinhamento: 'dir', tracking: 0.4 });
  doc.texto(c.dif, y, 'Dif', { tamanho: 6.5, cor: FRACO, alinhamento: 'dir', tracking: 0.4 });
  y += 11;

  for (const cat of linhas) {
    doc.texto(c.rotulo, y, cat.rotulo, { tamanho: 8.5, cor: FRACO });
    doc.texto(c.app, y, formatDurationLong(app[cat.k]), { tamanho: 8.5, cor: TINTA, alinhamento: 'dir' });
    doc.texto(c.ficha, y, formatDurationLong(ficha[cat.k]), { tamanho: 8.5, cor: TINTA, alinhamento: 'dir' });
    doc.texto(c.dif, y, fmtDif(diff[cat.k]), { tamanho: 8.5, cor: FRACO, alinhamento: 'dir' });
    y += 12;
  }

  if (comTotal && linhas.length >= 2) {
    doc.linha(c.rotulo, y - 8, c.dif, y - 8, { cor: REGUA });
    doc.texto(c.rotulo, y + 2, 'Total', { fonte: 'bold', tamanho: 8.5, cor: TINTA });
    doc.texto(c.app, y + 2, formatDurationLong(app.total), { fonte: 'bold', tamanho: 8.5, cor: TINTA, alinhamento: 'dir' });
    doc.texto(c.ficha, y + 2, formatDurationLong(ficha.total), { fonte: 'bold', tamanho: 8.5, cor: TINTA, alinhamento: 'dir' });
    doc.texto(c.dif, y + 2, fmtDif(diff.total), { fonte: 'bold', tamanho: 8.5, cor: FRACO, alinhamento: 'dir' });
    y += 16;
  }
  return y;
}

function cabecalho(doc, { ficha, refMonth }) {
  const dir = doc.largura - doc.margem;
  doc.texto(doc.margem, TOPO, 'horas+', { fonte: 'bold', tamanho: 13, cor: TINTA });
  doc.texto(dir, TOPO, 'CONFERÊNCIA DA FICHA', { tamanho: 7, cor: FRACO, alinhamento: 'dir', tracking: 0.9 });
  doc.linha(doc.margem, TOPO + 8, dir, TOPO + 8, { cor: REGUA });

  let y = TOPO + 26;
  if (ficha.tecnico) {
    doc.texto(doc.margem, y, ficha.tecnico, { fonte: 'bold', tamanho: 10.5, cor: TINTA });
    y += 13;
  }
  const periodo = ficha.periodo
    ? `${formatDateBR(ficha.periodo.inicio)} a ${formatDateBR(ficha.periodo.fim)}`
    : '';
  const mes = `${MONTH_FULL[refMonth.month - 1]} de ${refMonth.year}`;
  doc.texto(doc.margem, y, periodo ? `${periodo} · ${mes}` : mes, { tamanho: 8.5, cor: FRACO });
  return y + 16;
}

function heroi(doc, y, { resultado, totais, tolerancia }) {
  const dir = doc.largura - doc.margem;
  const v = vereditoDoPeriodo({ resultado, totais, tolerancia });
  const cor = TOM[v.tom];

  doc.texto(doc.margem, y, 'TOTAL DO PERÍODO', { tamanho: 7, cor: FRACO, tracking: 0.9 });
  doc.texto(dir, y, resultado.length === 1 ? '1 dia com horas' : `${resultado.length} dias com horas`,
    { tamanho: 7, cor: FRACO, alinhamento: 'dir' });
  y += 16;

  doc.texto(doc.margem, y, 'App', { tamanho: 7, cor: FRACO, tracking: 0.6 });
  doc.texto(dir, y, 'Ficha', { tamanho: 7, cor: FRACO, alinhamento: 'dir', tracking: 0.6 });
  y += 22;

  doc.texto(doc.margem, y, formatDurationLong(totais.app.total), { fonte: 'bold', tamanho: 24, cor: TINTA });
  doc.texto(doc.largura / 2, y - 3, v.glifo, { fonte: 'simbolo', tamanho: 17, cor, alinhamento: 'centro' });
  doc.texto(dir, y, formatDurationLong(totais.ficha.total), { fonte: 'bold', tamanho: 24, cor, alinhamento: 'dir' });
  y += 18;

  // A faixa do veredito: fundo a 5% da cor sobre branco, filete de 2pt à
  // esquerda. Sem canto arredondado — em PDF isso é bezier, e não vale.
  const larguraTexto = doc.largura - doc.margem * 2 - 18;
  const linhas = quebrar(v.frase, larguraTexto, 'normal', 9);
  const alturaFaixa = linhas.length * 12 + 12;
  const tinta5 = cor.map((c) => 1 - (1 - c) * 0.09);
  doc.retangulo(doc.margem, y, doc.largura - doc.margem * 2, alturaFaixa, { cor: tinta5 });
  doc.retangulo(doc.margem, y, 2, alturaFaixa, { cor });
  let ly = y + 15;
  for (const l of linhas) {
    doc.texto(doc.margem + 12, ly, l, { tamanho: 9, cor });
    ly += 12;
  }
  y += alturaFaixa + 18;

  y = tabelaCategorias(doc, y, totais, { comTotal: true });
  doc.linha(doc.margem, y, dir, y, { cor: REGUA });
  return y + 20;
}

export function montarRelatorio({ resultado, totais, ficha, refMonth, tolerancia = 2, emitidoEm }) {
  const doc = criarDoc(PAGINA);
  let y = cabecalho(doc, { ficha, refMonth });
  y = heroi(doc, y, { resultado, totais, tolerancia });
  return doc;
}
