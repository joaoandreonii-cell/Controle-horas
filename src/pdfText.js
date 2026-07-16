/* ═════════════════════════════════════════════════════════════════════════
   PDF → TEXTO — o trabalho sujo, sem biblioteca externa
   Devolve as strings literais que o documento manda desenhar, na ordem. Não
   sabe o que é uma ficha: quem interpreta é o ficha.js. A escolha de não usar
   pdfjs-dist é deliberada (centenas de KB num PWA aberto no celular em campo);
   o que importa — fatiar a linha por coluna — teria de ser escrito de qualquer
   jeito, e a invariante do ficha.js é a rede que torna isto seguro.
   ═════════════════════════════════════════════════════════════════════════ */

// Bytes → string latin-1: cada byte vira um code point 0..255, sem perda. É a
// codificação em que a ficha traz os acentos (0xE7 = ç, 0xE3 = ã).
function bytesToLatin1(bytes) {
  let s = '';
  const CHUNK = 0x8000; // não estourar o limite de argumentos do apply
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return s;
}

// Desescapa o miolo de uma string literal PDF (o que vai entre parênteses).
// Cobre \( \) \\, as sequências \n \r \t \b \f, o octal \ddd (1 a 3 dígitos) e
// a continuação de linha (barra seguida de quebra, que some).
export function unescapePdfString(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\') { out += c; continue; }

    const n = raw[i + 1];
    if (n === undefined) break; // barra órfã no fim: ignora

    if (n >= '0' && n <= '7') {
      let oct = n; i++;
      while (oct.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      continue;
    }

    i++; // consumir o caractere escapado
    switch (n) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case '\r': if (raw[i + 1] === '\n') i++; break; // continuação de linha
      case '\n': break;                               // continuação de linha
      default: out += n; // \( \) \\ e qualquer outro: o próprio caractere
    }
  }
  return out;
}

// Extrai as strings literais entre parênteses, respeitando o parêntese escapado
// e o aninhamento balanceado que o PDF permite sem escape.
export function extractParenStrings(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '(') { i++; continue; }
    i++; // pular o '(' de abertura
    let depth = 1, raw = '';
    while (i < s.length && depth > 0) {
      const c = s[i];
      if (c === '\\') { raw += c + (s[i + 1] ?? ''); i += 2; continue; }
      if (c === '(') { depth++; raw += c; i++; continue; }
      if (c === ')') { depth--; if (depth === 0) { i++; break; } raw += c; i++; continue; }
      raw += c; i++;
    }
    out.push(unescapePdfString(raw));
  }
  return out;
}

// Descomprime bytes zlib (FlateDecode). O DecompressionStream não tolera bytes
// sobrando, e um PDF põe um EOL entre os dados e o endstream — então tentamos
// com 0, 1 e 2 bytes finais cortados e aceitamos o primeiro sucesso. Cortar às
// cegas não serve: o último byte do checksum Adler-32 pode valer 0x0A.
async function inflate(bytes) {
  for (let trim = 0; trim <= 2 && bytes.length - trim > 0; trim++) {
    const slice = trim === 0 ? bytes : bytes.subarray(0, bytes.length - trim);
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(slice).catch(() => {});
      writer.close().catch(() => {});
      const reader = ds.readable.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value); total += value.length;
      }
      const out = new Uint8Array(total);
      let off = 0;
      for (const ch of chunks) { out.set(ch, off); off += ch.length; }
      return out;
    } catch {
      // tenta com mais um byte cortado
    }
  }
  return null;
}

// Acha os blocos stream…endstream, descomprime cada um (ou usa cru, para os
// PDF-1.3 não comprimidos), e devolve todas as strings literais na ordem.
export async function extractPdfText(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const s = bytesToLatin1(data);
  const strings = [];

  let idx = 0;
  while (true) {
    const st = s.indexOf('stream', idx);
    if (st < 0) break;
    // 'stream' dentro de 'endstream' não abre bloco nenhum.
    if (s.substring(st - 3, st) === 'end') { idx = st + 6; continue; }

    let start = st + 6;
    if (s[start] === '\r') start++;
    if (s[start] === '\n') start++;

    const end = s.indexOf('endstream', start);
    if (end < 0) break;
    idx = end + 9;

    const rawBytes = data.subarray(start, end);
    const inflated = await inflate(rawBytes);
    const content = inflated ? bytesToLatin1(inflated) : bytesToLatin1(rawBytes);
    for (const str of extractParenStrings(content)) strings.push(str);
  }

  return strings;
}
