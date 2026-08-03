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
