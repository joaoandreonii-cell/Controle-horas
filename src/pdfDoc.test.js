import { describe, it, expect } from 'vitest';
import { paraWinAnsi, escaparPdf, medir, quebrar, truncar, criarDoc } from './pdfDoc';
import { extractPdfText } from './pdfText';

describe('paraWinAnsi', () => {
  it('deixa o ASCII imprimível passar', () => {
    expect(paraWinAnsi('A')).toBe(0x41);
    expect(paraWinAnsi(' ')).toBe(0x20);
    expect(paraWinAnsi('~')).toBe(0x7e);
  });

  it('deixa o latin-1 alto passar — é onde moram os acentos do português', () => {
    expect(paraWinAnsi('ç')).toBe(0xe7);
    expect(paraWinAnsi('ã')).toBe(0xe3);
    expect(paraWinAnsi('Ê')).toBe(0xca);
    expect(paraWinAnsi('·')).toBe(0xb7);
  });

  it('traduz a pontuação tipográfica que o WinAnsi põe em outro lugar', () => {
    expect(paraWinAnsi('—')).toBe(0x97);
    expect(paraWinAnsi('–')).toBe(0x96);
    expect(paraWinAnsi('…')).toBe(0x85);
    expect(paraWinAnsi('•')).toBe(0x95);
  });

  it('converte o menos tipográfico em hífen — o fmtDiff do app usa U+2212', () => {
    expect(paraWinAnsi('−')).toBe(0x2d);
  });

  it('o que não existe vira ?, e nunca quebra', () => {
    expect(paraWinAnsi('≠')).toBe(0x3f);
    expect(paraWinAnsi('日')).toBe(0x3f);
    expect(paraWinAnsi('🙂')).toBe(0x3f);
  });
});

describe('escaparPdf', () => {
  it('escapa parêntese e barra invertida', () => {
    expect(escaparPdf('a(b)c')).toBe('a\\(b\\)c');
    expect(escaparPdf('a\\b')).toBe('a\\\\b');
  });

  it('escreve o byte alto em octal — é o que o unescapePdfString do app lê', () => {
    expect(escaparPdf('ção')).toBe('\\347\\343o');
  });

  it('na fonte Symbol o ≠ vira o código dele, não ?', () => {
    expect(escaparPdf('≠', 'simbolo')).toBe('\\271');
    expect(escaparPdf('=', 'simbolo')).toBe('=');
  });
});

describe('medir', () => {
  it('usa as métricas base-14: os dígitos da Helvetica são todos 556', () => {
    expect(medir('0', 'normal', 1000)).toBe(556);
    expect(medir('99999', 'normal', 1000)).toBe(556 * 5);
  });

  it('escala com o corpo', () => {
    expect(medir('0', 'normal', 10)).toBeCloseTo(5.56, 5);
  });

  it('a bold é mais larga que a normal na mesma palavra', () => {
    expect(medir('novembro', 'bold', 10)).toBeGreaterThan(medir('novembro', 'normal', 10));
  });

  it('acento não faz a string encolher nem explodir', () => {
    const comAcento = medir('março', 'normal', 10);
    const semAcento = medir('marco', 'normal', 10);
    expect(Math.abs(comAcento - semAcento)).toBeLessThan(1);
  });

  it('string vazia mede zero', () => {
    expect(medir('', 'normal', 10)).toBe(0);
  });
});

describe('quebrar', () => {
  it('parte no espaço, respeitando a largura', () => {
    const linhas = quebrar('a ficha reconhece uma hora a menos do que voce lancou', 80, 'normal', 9);
    expect(linhas.length).toBeGreaterThan(1);
    for (const l of linhas) expect(medir(l, 'normal', 9)).toBeLessThanOrEqual(80);
  });

  it('não perde nem duplica palavra', () => {
    const texto = 'a ficha reconhece uma hora a menos';
    expect(quebrar(texto, 80, 'normal', 9).join(' ')).toBe(texto);
  });

  it('palavra sozinha maior que a largura sai numa linha só, sem laço infinito', () => {
    expect(quebrar('COOPERATIVAAGRARIAAGROINDUSTRIAL', 20, 'normal', 9)).toHaveLength(1);
  });
});

describe('truncar', () => {
  it('devolve intacto o que cabe', () => {
    expect(truncar('TIROL', 200, 'normal', 9)).toBe('TIROL');
  });

  it('corta e marca com reticências o que não cabe', () => {
    const s = truncar('COOPERATIVA AGRARIA AGROINDUSTRIAL LTDA', 60, 'normal', 9);
    expect(s.endsWith('…')).toBe(true);
    expect(medir(s, 'normal', 9)).toBeLessThanOrEqual(60);
  });
});

const doc5 = () => criarDoc({ largura: 419.53, altura: 595.28, margem: 36 });
const latin1 = (bytes) => String.fromCharCode(...bytes);

describe('criarDoc — páginas e operações', () => {
  it('nasce com uma página e nenhuma operação', () => {
    const doc = doc5();
    expect(doc.paginas).toHaveLength(1);
    expect(doc.paginas[0]).toHaveLength(0);
  });

  it('acumula a operação na página corrente', () => {
    const doc = doc5();
    doc.texto(10, 20, 'oi');
    doc.novaPagina();
    doc.texto(10, 20, 'tchau');
    expect(doc.paginas).toHaveLength(2);
    expect(doc.paginas[0][0].str).toBe('oi');
    expect(doc.paginas[1][0].str).toBe('tchau');
  });

  it('irParaPagina volta a desenhar numa página anterior — é como o rodapé sabe o N/M', () => {
    const doc = doc5();
    doc.novaPagina();
    doc.irParaPagina(0);
    doc.texto(10, 580, '1/2');
    expect(doc.paginas[0]).toHaveLength(1);
    expect(doc.paginas[1]).toHaveLength(0);
  });

  it('guarda o texto com os atributos que o layout pediu', () => {
    const doc = doc5();
    doc.texto(10, 20, 'App', { fonte: 'bold', tamanho: 9, cor: [1, 0, 0], alinhamento: 'dir' });
    expect(doc.paginas[0][0]).toMatchObject({
      tipo: 'texto', x: 10, y: 20, str: 'App', fonte: 'bold', tamanho: 9, alinhamento: 'dir',
    });
  });
});

describe('criarDoc — bytes', () => {
  const emitidoEm = new Date(2026, 7, 3, 14, 30, 0);

  it('sai com cabeçalho e fecho de PDF', () => {
    const doc = doc5();
    doc.texto(36, 50, 'oi');
    const s = latin1(doc.bytes({ titulo: 'teste', emitidoEm }));
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declara no /Count o número de páginas', () => {
    const doc = doc5();
    doc.novaPagina();
    doc.novaPagina();
    const s = latin1(doc.bytes({ titulo: 'teste', emitidoEm }));
    expect(s).toContain('/Count 3');
  });

  it('cada offset do xref aponta para onde o objeto realmente começa', () => {
    const doc = doc5();
    doc.texto(36, 50, 'ção (com) \\ tudo');
    doc.novaPagina();
    doc.texto(36, 50, 'segunda');
    const s = latin1(doc.bytes({ titulo: 'teste', emitidoEm }));

    const inicio = s.indexOf('xref\n') + 'xref\n'.length;
    const [, totalStr] = s.slice(inicio, s.indexOf('\n', inicio)).split(' ');
    const total = Number(totalStr);
    const corpo = s.indexOf('\n', inicio) + 1;

    for (let n = 1; n < total; n++) {
      const entrada = s.substr(corpo + n * 20, 20);
      const offset = Number(entrada.slice(0, 10));
      expect(s.startsWith(`${n} 0 obj`, offset)).toBe(true);
    }
    expect(s.substr(corpo, 20)).toBe('0000000000 65535 f \n');
  });

  it('o startxref aponta para a palavra xref', () => {
    const doc = doc5();
    doc.texto(36, 50, 'oi');
    const s = latin1(doc.bytes({ titulo: 'teste', emitidoEm }));
    const offset = Number(s.slice(s.lastIndexOf('startxref\n') + 10).split('\n')[0]);
    expect(s.startsWith('xref', offset)).toBe(true);
  });

  it('mesma entrada, mesmos bytes', () => {
    const um = doc5(); um.texto(36, 50, 'março');
    const dois = doc5(); dois.texto(36, 50, 'março');
    expect(latin1(um.bytes({ titulo: 't', emitidoEm }))).toBe(latin1(dois.bytes({ titulo: 't', emitidoEm })));
  });

  it('inverte o eixo: y é medido do topo', () => {
    const doc = doc5();
    doc.texto(36, 40, 'topo');
    const s = latin1(doc.bytes({ titulo: 't', emitidoEm }));
    expect(s).toContain(`1 0 0 1 36 ${(595.28 - 40).toFixed(2)} Tm`);
  });
});

describe('ida e volta — o leitor do app lê o que o escritor escreveu', () => {
  it('devolve as mesmas strings, acento incluído', async () => {
    const doc = doc5();
    doc.texto(36, 50, 'CONFERÊNCIA DA FICHA');
    doc.texto(36, 70, 'março de 2026 · 33:15');
    doc.novaPagina();
    doc.texto(36, 50, 'ADAMI SA MADEIRAS (143)');

    const bytes = doc.bytes({ titulo: 'Conferência', emitidoEm: new Date(2026, 7, 3) });
    const lidas = await extractPdfText(bytes.buffer);

    expect(lidas).toContain('CONFERÊNCIA DA FICHA');
    expect(lidas).toContain('março de 2026 · 33:15');
    expect(lidas).toContain('ADAMI SA MADEIRAS (143)');
  });
});
