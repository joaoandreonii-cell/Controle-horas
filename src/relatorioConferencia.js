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

const LINHA_DIA = 15;
const LINHA_CLIENTE = 12;
const LINHA_CAT = 12;
const CABECALHO_CAT = 11;
const RESPIRO_DIA = 9;

// Medir antes de posicionar é o que permite nunca partir um dia entre páginas:
// um dia cortado ao meio é exatamente o que faz alguém ler o número errado.
function alturaDoDia(diaConf) {
  const cats = CATS.filter((c) => diaConf.app[c.k] > 0 || diaConf.ficha[c.k] > 0);
  let h = LINHA_DIA;
  if (diaConf.clientes.length) h += LINHA_CLIENTE;
  if (diaConf.status !== 'fecha') h += CABECALHO_CAT + cats.length * LINHA_CAT;
  if (diaConf.status === 'só na ficha' || diaConf.status === 'só no app') h += LINHA_CLIENTE;
  return h + RESPIRO_DIA;
}

const AUSENCIA = {
  'só na ficha': 'sem lançamento no app',
  'só no app': 'a ficha não tem este dia',
};

function desenharDia(doc, diaConf, y) {
  const dir = doc.largura - doc.margem;
  const v = VEREDITO[diaConf.status];
  const [, mes, d] = diaConf.data.split('-');
  const dow = DAY_SHORT[parseDate(diaConf.data).getDay()];

  // A linha lê da esquerda para a direita: 12/11 qua Divergência … +00:30 01:30.
  // O rótulo fica à esquerda, e não encostado no total, porque o diferencial
  // também disputa o lado direito — encaixar os dois lá sobrepõe um no outro.
  doc.texto(doc.margem, y, `${d}/${mes}`, { fonte: 'bold', tamanho: 10, cor: TINTA });
  doc.texto(doc.margem + 32, y, dow, { tamanho: 8, cor: FRACO });
  doc.texto(doc.margem + 56, y, v.rotulo, { tamanho: 7.5, cor: v.cor, tracking: 0.3 });

  // 'Só na ficha' é o único caso em que o app não tem número nenhum: aí o
  // total do cabeçalho é o da ficha, senão seria sempre 00:00.
  const total = diaConf.status === 'só na ficha' ? diaConf.ficha.total : diaConf.app.total;
  doc.texto(dir, y, formatDurationLong(total), { fonte: 'bold', tamanho: 10, cor: TINTA, alinhamento: 'dir' });

  // O dia que fecha com um minuto de diferença ainda deve isso ao leitor —
  // pequeno e cinza, sem virar alarme.
  if (diaConf.status === 'fecha' && diaConf.diff.total !== 0) {
    doc.texto(dir - 46, y, fmtDif(diaConf.diff.total), { tamanho: 7.5, cor: FRACO, alinhamento: 'dir' });
  }
  y += LINHA_DIA;

  if (diaConf.clientes.length) {
    const nomes = diaConf.clientes.map((c) => c.nome).join(' · ');
    doc.texto(doc.margem, y, truncar(nomes, doc.largura - doc.margem * 2, 'normal', 8), { tamanho: 8, cor: FRACO });
    y += LINHA_CLIENTE;
  }

  if (AUSENCIA[diaConf.status]) {
    doc.texto(doc.margem, y, AUSENCIA[diaConf.status], { tamanho: 8, cor: v.cor });
    y += LINHA_CLIENTE;
  }

  if (diaConf.status !== 'fecha') {
    y = tabelaCategorias(doc, y, diaConf, { comTotal: false });
  }

  return y + RESPIRO_DIA;
}

function cabecalhoMagro(doc, { refMonth }) {
  const dir = doc.largura - doc.margem;
  doc.texto(doc.margem, TOPO, 'horas+', { fonte: 'bold', tamanho: 9, cor: FRACO });
  doc.texto(dir, TOPO, `conferência · ${MONTH_FULL[refMonth.month - 1]} de ${refMonth.year}`,
    { tamanho: 7, cor: FRACO, alinhamento: 'dir', tracking: 0.5 });
  doc.linha(doc.margem, TOPO + 7, dir, TOPO + 7, { cor: REGUA });
  return TOPO + 26;
}

// O rodapé é a última coisa a ser desenhada porque o "N de M" precisa do M.
function rodape(doc, { refMonth, tolerancia, emitidoEm }) {
  const dir = doc.largura - doc.margem;
  const y = doc.altura - 22;
  const total = doc.paginas.length;
  const nota = `horas+ · ${MONTH_FULL[refMonth.month - 1]} de ${refMonth.year} · gerado em `
    + `${emitidoEm.getDate().toString().padStart(2, '0')}/`
    + `${(emitidoEm.getMonth() + 1).toString().padStart(2, '0')}/${emitidoEm.getFullYear()}`
    + ` · comparação por data civil, tolerância de ${tolerancia} min`;

  for (let i = 0; i < total; i++) {
    doc.irParaPagina(i);
    doc.linha(doc.margem, y - 10, dir, y - 10, { cor: REGUA });
    doc.texto(doc.margem, y, nota, { tamanho: 6.5, cor: FRACO });
    doc.texto(dir, y, `${i + 1} de ${total}`, { tamanho: 6.5, cor: FRACO, alinhamento: 'dir' });
  }
}

export function montarRelatorio({ resultado, totais, ficha, refMonth, tolerancia = 2, emitidoEm }) {
  const doc = criarDoc(PAGINA);
  let y = cabecalho(doc, { ficha, refMonth });
  y = heroi(doc, y, { resultado, totais, tolerancia });

  doc.texto(doc.margem, y, 'DIA A DIA', { tamanho: 7, cor: FRACO, tracking: 0.9 });
  y += 16;

  const limite = doc.altura - RODAPE;
  for (const diaConf of resultado) {
    if (y + alturaDoDia(diaConf) > limite) {
      doc.novaPagina();
      y = cabecalhoMagro(doc, { refMonth });
    }
    y = desenharDia(doc, diaConf, y);
  }

  rodape(doc, { refMonth, tolerancia, emitidoEm: emitidoEm ?? new Date(0) });
  doc.irParaPagina(0);

  return doc;
}

export function gerarPdfConferencia(args) {
  const doc = montarRelatorio(args);
  const { refMonth } = args;
  return doc.bytes({
    titulo: `Conferência da ficha — ${MONTH_FULL[refMonth.month - 1]} de ${refMonth.year}`,
    emitidoEm: args.emitidoEm,
  });
}
