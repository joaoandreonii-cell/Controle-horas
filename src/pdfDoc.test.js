import { describe, it, expect } from 'vitest';
import { paraWinAnsi, escaparPdf, medir, quebrar, truncar } from './pdfDoc';

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
