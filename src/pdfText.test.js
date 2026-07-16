import { describe, it, expect } from 'vitest';
import { unescapePdfString, extractParenStrings, extractPdfText } from './pdfText';

/* pdfText só faz o trabalho sujo: bytes do PDF → as strings literais que o
   documento manda desenhar. Não sabe o que é uma ficha — isso é do ficha.js.
   Aqui provamos que a descompressão, o desescape e o recorte funcionam nos três
   sabores de PDF que os exemplos reais trouxeram. */

// Concatena strings (UTF-8) e Uint8Arrays num PDF sintético.
function bytes(...parts) {
  const enc = new TextEncoder();
  const arrs = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p));
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// Comprime como FlateDecode (zlib) — a API simétrica do DecompressionStream.
async function deflate(str) {
  const raw = Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xff);
  const cs = new CompressionStream('deflate');
  const w = cs.writable.getWriter();
  w.write(raw); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

describe('unescapePdfString', () => {
  it('texto comum passa intacto', () => {
    expect(unescapePdfString('ABC 123 : 45')).toBe('ABC 123 : 45');
  });

  it('desescapa parêntese e barra invertida', () => {
    expect(unescapePdfString('a\\(b\\)c\\\\d')).toBe('a(b)c\\d');
  });

  it('octal vira o byte latin-1 — é como a ficha traz os acentos', () => {
    // \347 = 0xE7 = ç, \343 = 0xE3 = ã. É exatamente o produtor "estranho".
    expect(unescapePdfString('Descri\\347\\343o')).toBe('Descrição');
  });

  it('a continuação de linha (barra + quebra) some', () => {
    expect(unescapePdfString('linha um\\\nlinha dois')).toBe('linha umlinha dois');
  });

  it('a barra órfã no fim não estoura', () => {
    expect(unescapePdfString('fim\\')).toBe('fim');
  });
});

describe('extractParenStrings', () => {
  it('pega as strings na ordem em que aparecem', () => {
    expect(extractParenStrings('BT (um) Tj (dois) Tj ET')).toEqual(['um', 'dois']);
  });

  it('respeita parênteses aninhados balanceados', () => {
    expect(extractParenStrings('(a(b)c)')).toEqual(['a(b)c']);
  });

  it('respeita o parêntese escapado como conteúdo, não como fim', () => {
    expect(extractParenStrings('(a\\)b)')).toEqual(['a)b']);
  });

  it('ignora o que está fora de parênteses', () => {
    expect(extractParenStrings('/F1 12 Tf 100 700 Td')).toEqual([]);
  });
});

describe('extractPdfText', () => {
  it('lê um stream de texto não comprimido (PDF-1.3)', async () => {
    const pdf = bytes(
      '%PDF-1.3\n4 0 obj<<>>\nstream\n',
      'BT (linha da ficha) Tj ET',
      '\nendstream endobj',
    );
    expect(await extractPdfText(pdf.buffer)).toEqual(['linha da ficha']);
  });

  it('lê um stream comprimido com FlateDecode, apesar do EOL antes de endstream', async () => {
    const deflated = await deflate('BT (linha comprimida) Tj ET');
    const pdf = bytes(
      '%PDF-1.7\n4 0 obj<</Filter/FlateDecode/Length 40>>\nstream\n',
      deflated,
      '\nendstream',   // o \n é o byte sobrando que o DecompressionStream não tolera sozinho
    );
    expect(await extractPdfText(pdf.buffer)).toEqual(['linha comprimida']);
  });

  it('tolera CRLF antes de endstream', async () => {
    const deflated = await deflate('(dois bytes de sobra) Tj');
    const pdf = bytes('stream\n', deflated, '\r\nendstream');
    expect(await extractPdfText(pdf.buffer)).toEqual(['dois bytes de sobra']);
  });

  it('não confunde a palavra endstream com o começo de um novo stream', async () => {
    const pdf = bytes('stream\n(a) Tj\nendstream\njunk\nstream\n(b) Tj\nendstream');
    expect(await extractPdfText(pdf.buffer)).toEqual(['a', 'b']);
  });

  it('junta as linhas de vários streams na ordem', async () => {
    const d1 = await deflate('(cliente ADAMI) Tj');
    const pdf = bytes(
      'stream\n', d1, '\nendstream\n',
      'stream\n', 'BT (10/11/2025 linha) Tj ET', '\nendstream',
    );
    expect(await extractPdfText(pdf.buffer)).toEqual(['cliente ADAMI', '10/11/2025 linha']);
  });
});
