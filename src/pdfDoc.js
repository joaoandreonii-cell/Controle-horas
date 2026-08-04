/* ═════════════════════════════════════════════════════════════════════════
   PDF ← DOCUMENTO — o escritor, sem biblioteca
   O gêmeo do pdfText.js: lá bytes viram texto, aqui texto vira bytes. A
   escolha de não usar jsPDF é a mesma que reprovou o pdfjs-dist na spec 4
   (~100 KB gzip num PWA aberto no celular em campo, precacheado pelo SW).

   As streams saem SEM COMPRESSÃO de propósito: assim o extractPdfText do
   próprio app lê de volta o que este módulo escreveu, e o escritor se
   verifica sozinho.
   ═════════════════════════════════════════════════════════════════════════ */

/* ─── Larguras base-14 ───────────────────────────────────────────────────
   Métricas da Adobe para Helvetica e Helvetica-Bold, em milésimos de em,
   nos códigos 0x20 a 0x7E. Os dez dígitos valem 556 nas duas — é por isso
   que uma coluna de números alinha sem fonte monoespaçada, o equivalente
   em PDF do tabular-nums que a tela usa. */
const W_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 222, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Uma letra acentuada tem a mesma largura de avanço da letra base: o acento
// é desenhado por cima, não ao lado. Derivar por aqui é mais confiável do
// que recitar de cabeça 96 números do intervalo alto, e o erro que sobra
// (o i acentuado avança 278 contra 222) some em meio ponto num corpo de 10.
// Onde precisa ser exato — dígito, dois-pontos, sinal — é tudo ASCII, acima.
const BASE_ACENTUADA = {
  0xc0: 'A', 0xc1: 'A', 0xc2: 'A', 0xc3: 'A', 0xc4: 'A', 0xc5: 'A',
  0xc7: 'C',
  0xc8: 'E', 0xc9: 'E', 0xca: 'E', 0xcb: 'E',
  0xcc: 'I', 0xcd: 'I', 0xce: 'I', 0xcf: 'I',
  0xd1: 'N',
  0xd2: 'O', 0xd3: 'O', 0xd4: 'O', 0xd5: 'O', 0xd6: 'O', 0xd8: 'O',
  0xd9: 'U', 0xda: 'U', 0xdb: 'U', 0xdc: 'U', 0xdd: 'Y',
  0xe0: 'a', 0xe1: 'a', 0xe2: 'a', 0xe3: 'a', 0xe4: 'a', 0xe5: 'a',
  0xe7: 'c',
  0xe8: 'e', 0xe9: 'e', 0xea: 'e', 0xeb: 'e',
  0xec: 'i', 0xed: 'i', 0xee: 'i', 0xef: 'i',
  0xf1: 'n',
  0xf2: 'o', 0xf3: 'o', 0xf4: 'o', 0xf5: 'o', 0xf6: 'o', 0xf8: 'o',
  0xf9: 'u', 0xfa: 'u', 0xfb: 'u', 0xfc: 'u', 0xfd: 'y', 0xff: 'y',
};

// Os poucos glifos altos que não derivam de letra nenhuma.
const W_EXTRA = { 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xb7: 278 };

const W_PADRAO = 556; // o que sobrar avança como um 'n' — layout sã, sem exatidão fingida

// A Symbol traz a própria codificação e não leva /Encoding. Só um glifo é
// usado: o ≠ do herói, que o WinAnsi simplesmente não tem.
const SYMBOL = { '≠': 0xb9 };
const W_SYMBOL = { 0xb9: 549, 0x3d: 549 };

/* ─── Codificação ─────────────────────────────────────────────────────── */

// Pontuação tipográfica que o WinAnsi guarda no intervalo 0x80–0x9F, onde o
// latin-1 não tem nada. E o U+2212: o fmtDiff do app usa o menos tipográfico,
// que o WinAnsi não tem — sem esta linha, todo diferencial negativo sairia '?'.
const EXTRA = {
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '•': 0x95, '–': 0x96, '—': 0x97, '…': 0x85,
  '−': 0x2d,
};

export function paraWinAnsi(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x20 && cp <= 0x7e) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  const e = EXTRA[ch];
  return e === undefined ? 0x3f : e; // '?' — degrada, nunca quebra
}

const byteDe = (ch, fonte) =>
  (fonte === 'simbolo' && SYMBOL[ch] !== undefined) ? SYMBOL[ch] : paraWinAnsi(ch);

// O miolo de uma string literal PDF. O byte alto sai em octal, que é
// exatamente o que o unescapePdfString do pdfText.js desescapa na volta.
export function escaparPdf(str, fonte = 'normal') {
  let out = '';
  for (const ch of str) {
    const b = byteDe(ch, fonte);
    if (b === 0x28) { out += '\\('; continue; }
    if (b === 0x29) { out += '\\)'; continue; }
    if (b === 0x5c) { out += '\\\\'; continue; }
    if (b >= 0x80) { out += '\\' + b.toString(8).padStart(3, '0'); continue; }
    out += String.fromCharCode(b);
  }
  return out;
}

/* ─── Medida ──────────────────────────────────────────────────────────── */

function larguraDe(ch, fonte) {
  const b = byteDe(ch, fonte);
  if (fonte === 'simbolo') return W_SYMBOL[b] ?? 500;
  const tabela = fonte === 'bold' ? W_BOLD : W_NORMAL;
  if (b >= 0x20 && b <= 0x7e) return tabela[b - 0x20];
  const base = BASE_ACENTUADA[b];
  if (base) return tabela[base.charCodeAt(0) - 0x20];
  return W_EXTRA[b] ?? W_PADRAO;
}

export function medir(str, fonte, tamanho) {
  let total = 0;
  for (const ch of str) total += larguraDe(ch, fonte);
  return (total * tamanho) / 1000;
}

export function quebrar(str, larguraMax, fonte, tamanho) {
  const linhas = [];
  let atual = '';
  for (const palavra of str.split(' ')) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    // O !atual deixa passar a palavra sozinha maior que a linha: cortá-la
    // seria pior, e sem isso o laço nunca avançaria.
    if (!atual || medir(tentativa, fonte, tamanho) <= larguraMax) { atual = tentativa; continue; }
    linhas.push(atual);
    atual = palavra;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function truncar(str, larguraMax, fonte, tamanho) {
  if (medir(str, fonte, tamanho) <= larguraMax) return str;
  let s = str;
  while (s.length > 1 && medir(`${s}…`, fonte, tamanho) > larguraMax) s = s.slice(0, -1);
  return `${s}…`;
}

/* ─── O documento ─────────────────────────────────────────────────────── */

const num = (v) => (Math.round(v * 100) / 100).toString();
const corPdf = ([r, g, b]) => `${num(r)} ${num(g)} ${num(b)}`;
const NOME_FONTE = { normal: 'F1', bold: 'F2', simbolo: 'F3' };

export function criarDoc({ largura, altura, margem }) {
  const paginas = [[]];
  let atual = 0;

  const doc = {
    largura, altura, margem, paginas,

    novaPagina() { paginas.push([]); atual = paginas.length - 1; return doc; },
    irParaPagina(i) { atual = i; return doc; },

    texto(x, y, str, opts = {}) {
      paginas[atual].push({
        tipo: 'texto', x, y, str,
        fonte: opts.fonte ?? 'normal',
        tamanho: opts.tamanho ?? 10,
        cor: opts.cor ?? [0, 0, 0],
        alinhamento: opts.alinhamento ?? 'esq',
        tracking: opts.tracking ?? 0,
      });
      return doc;
    },

    linha(x1, y1, x2, y2, opts = {}) {
      paginas[atual].push({
        tipo: 'linha', x1, y1, x2, y2,
        cor: opts.cor ?? [0, 0, 0],
        espessura: opts.espessura ?? 0.5,
      });
      return doc;
    },

    retangulo(x, y, w, h, opts = {}) {
      paginas[atual].push({ tipo: 'retangulo', x, y, w, h, cor: opts.cor ?? [0, 0, 0] });
      return doc;
    },

    bytes: (meta) => serializar(doc, meta),
  };

  return doc;
}

// Uma operação vira operadores de conteúdo. O y do layout conta do topo; o
// PDF conta de baixo, e a inversão mora só aqui.
function opParaConteudo(op, altura) {
  if (op.tipo === 'texto') {
    let x = op.x;
    if (op.alinhamento !== 'esq') {
      const w = medir(op.str, op.fonte, op.tamanho) + op.tracking * Math.max(0, op.str.length - 1);
      x = op.alinhamento === 'dir' ? op.x - w : op.x - w / 2;
    }
    const tc = op.tracking ? `${num(op.tracking)} Tc ` : '';
    return `BT ${tc}/${NOME_FONTE[op.fonte]} ${num(op.tamanho)} Tf ${corPdf(op.cor)} rg `
         + `1 0 0 1 ${num(x)} ${num(altura - op.y)} Tm (${escaparPdf(op.str, op.fonte)}) Tj ET`;
  }
  if (op.tipo === 'linha') {
    return `${corPdf(op.cor)} RG ${num(op.espessura)} w `
         + `${num(op.x1)} ${num(altura - op.y1)} m ${num(op.x2)} ${num(altura - op.y2)} l S`;
  }
  return `${corPdf(op.cor)} rg ${num(op.x)} ${num(altura - op.y - op.h)} ${num(op.w)} ${num(op.h)} re f`;
}

const pad2 = (n) => String(n).padStart(2, '0');
const dataPdf = (d) =>
  `D:${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  + `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;

// Text string do dicionário Info (o /Title, que o navegador mostra na aba): a
// spec do PDF lê isso em PDFDocEncoding ou UTF-16BE-com-BOM — nunca no
// WinAnsi do escaparPdf, que só vale dentro do conteúdo da página. As duas
// codificações só divergem em 0x80-0x9F (onde mora o travessão, entre outros
// da pontuação tipográfica), e é ali que um /Title escrito como string
// literal WinAnsi sai torto na aba do navegador. codePointAt(0) por
// caractere não cobre par substituto (um emoji fora do BMP) — não é caso
// que este projeto escreve em título.
const textoPdf = (s) => {
  let hex = 'FEFF';
  for (const ch of s) hex += ch.codePointAt(0).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
};

function serializar(doc, { titulo = '', emitidoEm = new Date(0) } = {}) {
  const { largura, altura, paginas } = doc;

  // 1 Catalog · 2 Pages · 3-5 fontes · 6 Info · depois, por página, o Page e o
  // Contents. A Symbol NÃO leva /Encoding: ela traz a própria.
  const PRIMEIRA_PAGINA = 7;
  const idPagina = (i) => PRIMEIRA_PAGINA + i * 2;
  const idConteudo = (i) => PRIMEIRA_PAGINA + i * 2 + 1;

  const corpos = [];
  corpos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  corpos[2] = `<< /Type /Pages /Count ${paginas.length} /Kids [${paginas.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] >>`;
  corpos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  corpos[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  corpos[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>';
  // /Producer e /Creator são só 'horas+' — ASCII puro, idêntico nas duas
  // codificações — e ficam como string literal comum. /CreationDate não é
  // text string, é date string (PDF 7.9.4): sempre literal, o encoding do
  // conteúdo não entra aqui.
  corpos[6] = `<< /Title ${textoPdf(titulo)} /Producer (horas+) /Creator (horas+) /CreationDate (${dataPdf(emitidoEm)}) >>`;

  paginas.forEach((ops, i) => {
    corpos[idPagina(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(largura)} ${num(altura)}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${idConteudo(i)} 0 R >>`;
    const conteudo = ops.map((op) => opParaConteudo(op, altura)).join('\n');
    corpos[idConteudo(i)] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
  });

  // O arquivo é montado como texto latin-1, em que 1 caractere é 1 byte —
  // por isso dá para contar offset com length. A conversão vem no fim.
  const total = corpos.length;
  let arquivo = '%PDF-1.4\n';
  const offsets = [];
  for (let n = 1; n < total; n++) {
    offsets[n] = arquivo.length;
    arquivo += `${n} 0 obj\n${corpos[n]}\nendobj\n`;
  }

  const inicioXref = arquivo.length;
  arquivo += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) {
    arquivo += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  arquivo += `trailer\n<< /Size ${total} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  const bytes = new Uint8Array(arquivo.length);
  for (let i = 0; i < arquivo.length; i++) bytes[i] = arquivo.charCodeAt(i) & 0xff;
  return bytes;
}
