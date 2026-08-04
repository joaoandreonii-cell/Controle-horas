import { describe, it, expect } from 'vitest';
import { montarRelatorio, nomeArquivoRelatorio } from './relatorioConferencia';

const cat = (o = {}) => ({ d50: 0, d100: 0, n50: 0, n100: 0, total: 0, ...o });

const dia = (data, status, app, fic, clientes = []) => ({
  data, status,
  app: cat(app), ficha: cat(fic),
  diff: cat({
    d50: (app.d50 || 0) - (fic.d50 || 0), d100: (app.d100 || 0) - (fic.d100 || 0),
    n50: (app.n50 || 0) - (fic.n50 || 0), n100: (app.n100 || 0) - (fic.n100 || 0),
    total: (app.total || 0) - (fic.total || 0),
  }),
  clientes: clientes.map((nome, i) => ({ codigo: String(100 + i), nome })),
  colaborador: 'JOAO PACCE ANDREONI',
  linhasFicha: [],
});

const somaTotais = (dias) => {
  const app = cat(); const fic = cat(); const diff = cat();
  for (const d of dias) for (const k of Object.keys(app)) { app[k] += d.app[k]; fic[k] += d.ficha[k]; }
  for (const k of Object.keys(app)) diff[k] = app[k] - fic[k];
  return { app, ficha: fic, diff };
};

const fichaFalsa = {
  tecnico: 'JOAO PACCE ANDREONI',
  periodo: { inicio: '2025-10-26', fim: '2025-11-25' },
};

const montar = (dias, extra = {}) => montarRelatorio({
  resultado: dias,
  totais: somaTotais(dias),
  ficha: fichaFalsa,
  refMonth: { year: 2025, month: 11 },
  tolerancia: 2,
  emitidoEm: new Date(2026, 7, 3, 14, 30),
  ...extra,
});

const textos = (doc) => doc.paginas.flat().filter((o) => o.tipo === 'texto').map((o) => o.str);
const textosDaPagina = (doc, i) => doc.paginas[i].filter((o) => o.tipo === 'texto').map((o) => o.str);

describe('nomeArquivoRelatorio', () => {
  it('traz mês e ano, legível na lista de anexos', () => {
    expect(nomeArquivoRelatorio({ year: 2025, month: 11 })).toBe('conferencia-novembro-2025.pdf');
  });

  it('tira o acento — março sairia torto do outro lado', () => {
    expect(nomeArquivoRelatorio({ year: 2026, month: 3 })).toBe('conferencia-marco-2026.pdf');
  });
});

describe('cabeçalho', () => {
  it('identifica o app, o técnico e o período da ficha', () => {
    const t = textos(montar([dia('2025-11-10', 'fecha', { d50: 14, total: 14 }, { d50: 14, total: 14 })]));
    expect(t).toContain('horas+');
    expect(t).toContain('CONFERÊNCIA DA FICHA');
    expect(t).toContain('JOAO PACCE ANDREONI');
    expect(t.some((s) => s.includes('26/10/2025') && s.includes('25/11/2025'))).toBe(true);
    expect(t.some((s) => s.includes('novembro') && s.includes('2025'))).toBe(true);
  });
});

describe('herói', () => {
  it('põe os dois totais e a frase do veredito', () => {
    const dias = [dia('2025-11-10', 'fecha', { d50: 120, total: 120 }, { d50: 120, total: 120 })];
    const t = textos(montar(dias));
    expect(t).toContain('App');
    expect(t).toContain('Ficha');
    // 2 no herói (App/Ficha) + 2 na linha '50% diurno' da tabela
    // logo abaixo + 1 no total da linha do dia, no DIA A DIA.
    expect(t.filter((s) => s === '02:00')).toHaveLength(5);
    expect(t).toContain('Tudo confere — o total e cada dia fecham com a ficha.');
  });

  it('quebra a frase longa em linhas que cabem na coluna', () => {
    const dias = [dia('2025-11-10', 'divergencia', { d50: 180, total: 180 }, { d50: 120, total: 120 })];
    const doc = montar(dias);
    const t = textos(doc);
    expect(t.join(' ')).toContain('A ficha reconhece 01:00 a menos');
  });

  it('desenha o glifo do veredito na fonte Symbol quando não fecha', () => {
    const dias = [dia('2025-11-10', 'divergencia', { d50: 180, total: 180 }, { d50: 120, total: 120 })];
    const simbolos = montar(dias).paginas.flat().filter((o) => o.fonte === 'simbolo');
    expect(simbolos).toHaveLength(1);
    expect(simbolos[0].str).toBe('≠');
  });

  it('só lista categoria que tem minutos de algum lado', () => {
    const dias = [dia('2025-11-10', 'fecha', { d50: 120, total: 120 }, { d50: 120, total: 120 })];
    const t = textosDaPagina(montar(dias), 0);
    expect(t).toContain('50% diurno');
    expect(t).not.toContain('100% noturno');
  });
});

describe('dia a dia', () => {
  it('traz todos os dias, com data, dia da semana e veredito', () => {
    const dias = [
      dia('2025-11-10', 'fecha', { d50: 14, total: 14 }, { d50: 14, total: 14 }, ['ADAMI SA MADEIRAS']),
      dia('2025-11-12', 'divergencia', { d50: 90, total: 90 }, { d50: 60, total: 60 }, ['TIROL']),
    ];
    const t = textos(montar(dias));
    expect(t).toContain('10/11');
    expect(t).toContain('seg');
    expect(t).toContain('Fecha');
    expect(t).toContain('12/11');
    expect(t).toContain('qua');
    expect(t).toContain('Divergência');
    expect(t).toContain('ADAMI SA MADEIRAS');
    expect(t).toContain('TIROL');
  });

  it('o dia que fecha não ganha mini-tabela', () => {
    const doc = montar([dia('2025-11-10', 'fecha', { d50: 14, total: 14 }, { d50: 14, total: 14 })]);
    // 'App' aparece uma vez no herói e uma no cabeçalho da tabela do herói — nunca três.
    expect(textos(doc).filter((s) => s === 'App')).toHaveLength(2);
  });

  it('todo status diferente de fecha ganha mini-tabela', () => {
    for (const status of ['divergencia', 'só na ficha', 'só no app']) {
      const doc = montar([dia('2025-11-12', status, { d50: 90, total: 90 }, { d50: 60, total: 60 })]);
      expect(textos(doc).filter((s) => s === 'App').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('explica a ausência em vez de deixar uma coluna zerada parecendo erro', () => {
    const soFicha = textos(montar([dia('2025-11-14', 'só na ficha', {}, { d50: 29, total: 29 })]));
    expect(soFicha).toContain('sem lançamento no app');

    const soApp = textos(montar([dia('2025-11-14', 'só no app', { d50: 29, total: 29 }, {})]));
    expect(soApp).toContain('a ficha não tem este dia');
  });

  it('mostra o diferencial pequeno quando o dia fecha por tolerância', () => {
    const t = textos(montar([dia('2025-11-10', 'fecha', { d50: 90, total: 90 }, { d50: 89, total: 89 })]));
    expect(t).toContain('+00:01');
  });

  it('o rótulo do veredito e o diferencial não caem no mesmo lugar', () => {
    // Os dois disputam a linha do dia. Encaixar ambos à direita os sobrepõe,
    // e o leitor vê um borrão em vez de um número.
    const ops = montar([dia('2025-11-10', 'fecha', { d50: 90, total: 90 }, { d50: 89, total: 89 })])
      .paginas.flat();
    const rotulo = ops.find((o) => o.str === 'Fecha');
    // '+00:01' também sai na coluna Dif do herói; aqui
    // interessa o da linha do dia, o último da página.
    const difer = ops.findLast((o) => o.str === '+00:01');
    expect(rotulo.y).toBe(difer.y);
    expect(rotulo.x).toBeLessThan(difer.x - 60);
  });

  it('lista os dois clientes de um dia', () => {
    const t = textos(montar([
      dia('2025-11-13', 'fecha', { d50: 150, total: 150 }, { d50: 150, total: 150 }, ['ADAMI SA MADEIRAS', 'TIROL']),
    ]));
    expect(t.join(' ')).toContain('ADAMI SA MADEIRAS');
    expect(t.join(' ')).toContain('TIROL');
  });

  it('pinta o veredito com a cor dele', () => {
    const doc = montar([dia('2025-11-12', 'divergencia', { d50: 90, total: 90 }, { d50: 60, total: 60 })]);
    const rotulo = doc.paginas.flat().find((o) => o.str === 'Divergência');
    expect(rotulo.cor).toEqual([0.745, 0.071, 0.235]);
  });
});

describe('paginação', () => {
  const muitosDias = (n) => Array.from({ length: n }, (_, i) =>
    dia(`2025-11-${String((i % 25) + 1).padStart(2, '0')}`, 'fecha',
      { d50: 60, total: 60 }, { d50: 60, total: 60 }, ['ADAMI SA MADEIRAS']));

  it('um mês curto cabe numa página', () => {
    expect(montar(muitosDias(3)).paginas).toHaveLength(1);
  });

  it('um mês cheio transborda para mais páginas', () => {
    expect(montar(muitosDias(40)).paginas.length).toBeGreaterThan(1);
  });

  it('nenhum dia é partido entre páginas', () => {
    const doc = montar(muitosDias(40));
    // A data abre o bloco; se um bloco fosse partido, a mini-tabela ou os
    // clientes daquele dia cairiam numa página sem a data correspondente.
    for (const pagina of doc.paginas) {
      const ops = pagina.filter((o) => o.tipo === 'texto');
      const primeiraData = ops.findIndex((o) => /^\d{2}\/\d{2}$/.test(o.str));
      const clientes = ops.findIndex((o) => o.str === 'ADAMI SA MADEIRAS');
      if (clientes >= 0) expect(primeiraData).toBeGreaterThanOrEqual(0);
      if (clientes >= 0) expect(primeiraData).toBeLessThan(clientes);
    }
  });

  it('nada é desenhado abaixo da margem inferior', () => {
    const doc = montar(muitosDias(40));
    for (const pagina of doc.paginas) {
      for (const op of pagina) {
        const y = op.tipo === 'linha' ? op.y2 : (op.tipo === 'retangulo' ? op.y + op.h : op.y);
        expect(y).toBeLessThanOrEqual(595.28 - 20);
      }
    }
  });

  it('o PDF ignora o filtro da tela: sai o resultado inteiro', () => {
    const dias = [
      dia('2025-11-10', 'fecha', { d50: 60, total: 60 }, { d50: 60, total: 60 }),
      dia('2025-11-12', 'divergencia', { d50: 90, total: 90 }, { d50: 60, total: 60 }),
      dia('2025-11-13', 'fecha', { d50: 60, total: 60 }, { d50: 60, total: 60 }),
    ];
    const t = textos(montar(dias));
    expect(t).toContain('10/11');
    expect(t).toContain('12/11');
    expect(t).toContain('13/11');
  });

  // muitosDias(n) só gera 'fecha' — o bloco mais baixo que existe, sem
  // mini-tabela nem linha de ausência. As duas asserções abaixo (dia não
  // partido; nada abaixo da margem) precisam também ver blocos altos: uma
  // divergência com as quatro categorias, uma ausência com cliente. Senão as
  // três parcelas condicionais de alturaDoDia nunca são exercitadas aqui.
  const diaDivergenciaAlta = (data) => dia(data, 'divergencia',
    { d50: 60, d100: 30, n50: 20, n100: 10, total: 120 },
    { d50: 50, d100: 20, n50: 10, n100: 5, total: 85 });

  const diaSoNaFichaComCliente = (data) =>
    dia(data, 'só na ficha', {}, { d50: 40, total: 40 }, ['ADAMI SA MADEIRAS']);

  const diaSoNoApp = (data) => dia(data, 'só no app', { d50: 45, total: 45 }, {});

  const diaFechaBaixo = (data) => dia(data, 'fecha', { d50: 60, total: 60 }, { d50: 60, total: 60 });

  const muitosDiasMistos = (nCiclos) => {
    // A ordem importa: com um dia de cada por ciclo (D,S,A,F) o desalinhamento
    // de altura nunca cai perto o bastante da quebra de página para acusar
    // nada — sobra respiro. Repetir a 'só na ficha' no ciclo (D,S,S,A,F) foi o
    // padrão, dentre os testados, que reproduz de forma estável (robusto a
    // várias contagens de repetição) o efeito descrito no achado: o dia mais
    // alto emendado logo após um bloco médio estoura a margem quando
    // alturaDoDia subestima.
    const fabricas = [diaDivergenciaAlta, diaSoNaFichaComCliente, diaSoNaFichaComCliente, diaSoNoApp, diaFechaBaixo];
    const dias = [];
    for (let i = 0; i < nCiclos; i++) {
      for (const fabrica of fabricas) {
        const diaDoMes = (dias.length % 25) + 1;
        dias.push(fabrica(`2025-11-${String(diaDoMes).padStart(2, '0')}`));
      }
    }
    return dias;
  };

  it('com blocos altos (4 categorias, ausência com cliente), nenhum dia é partido entre páginas', () => {
    const doc = montar(muitosDiasMistos(8));
    expect(doc.paginas.length).toBeGreaterThan(1);
    for (const pagina of doc.paginas) {
      const ops = pagina.filter((o) => o.tipo === 'texto');
      const primeiraData = ops.findIndex((o) => /^\d{2}\/\d{2}$/.test(o.str));
      const clientes = ops.findIndex((o) => o.str === 'ADAMI SA MADEIRAS');
      if (clientes >= 0) expect(primeiraData).toBeGreaterThanOrEqual(0);
      if (clientes >= 0) expect(primeiraData).toBeLessThan(clientes);
    }
  });

  it('com blocos altos (4 categorias, ausência com cliente), nada é desenhado abaixo da margem inferior', () => {
    const doc = montar(muitosDiasMistos(8));
    for (const pagina of doc.paginas) {
      for (const op of pagina) {
        const y = op.tipo === 'linha' ? op.y2 : (op.tipo === 'retangulo' ? op.y + op.h : op.y);
        expect(y).toBeLessThanOrEqual(595.28 - 20);
      }
    }
  });

  // As asserções acima usam teto de 575.28 e um arranjo fixo de dias. Esta
  // aperta as duas coisas:
  //
  // 1. 575.28 existe só para caber o próprio rodapé, que desenha em 573.28.
  //    O limite de verdade do conteúdo é altura - RODAPE = 555.28.
  // 2. Um arranjo fixo só exercita a quebra nos pontos que a aritmética dele
  //    calha de produzir. Cada k empurra a sequência inteira para baixo, então
  //    todo tipo de dia passa pela borda da página em algum k.
  //
  // Sobre o tamanho de erro que isto pega, medido e não suposto: o pior y de
  // conteúdo nesta varredura é 531, contra o limite de 555.28 — 24pt de folga.
  // A folga é do próprio desenho: desenharDia devolve y + RESPIRO_DIA (9pt) e
  // tabelaCategorias devolve 12pt além da última linha, então o último glifo
  // fica bem acima da altura contabilizada. Consequência: um erro pequeno em
  // alturaDoDia (esquecer a linha de ausência, 12pt) é absorvido pela folga e
  // NÃO é pego aqui — verificado plantando esse erro, a suíte inteira segue
  // verde. E está certo que siga: com 24pt de folga aquilo não transborda
  // nada, não é defeito visível. O que esta asserção pega é erro acima de
  // ~24pt, contra ~44pt do teto de 575.28.
  //
  // O rodapé é desenhado por último, três operações por página (o filete e os
  // dois textos), então slice(0, -3) separa conteúdo de rodapé sem depender
  // do y — que é justamente o que está sendo medido.
  it('nenhum deslocamento faz o conteúdo invadir a faixa do rodapé', () => {
    for (let k = 0; k <= 20; k++) {
      const doc = montar([...muitosDias(k), ...muitosDiasMistos(3)]);
      for (const pagina of doc.paginas) {
        for (const op of pagina.slice(0, -3)) {
          const y = op.tipo === 'linha' ? op.y2 : (op.tipo === 'retangulo' ? op.y + op.h : op.y);
          expect(y, `deslocamento k=${k}`).toBeLessThanOrEqual(595.28 - 40);
        }
      }
    }
  });
});

import { gerarPdfConferencia } from './relatorioConferencia';
import { extractPdfText } from './pdfText';

describe('rodapé', () => {
  const muitos = Array.from({ length: 40 }, (_, i) =>
    dia(`2025-11-${String((i % 25) + 1).padStart(2, '0')}`, 'fecha',
      { d50: 60, total: 60 }, { d50: 60, total: 60 }));

  it('numera todas as páginas com o total certo', () => {
    const doc = montar(muitos);
    const m = doc.paginas.length;
    expect(m).toBeGreaterThan(1);
    for (let i = 0; i < m; i++) {
      expect(textosDaPagina(doc, i)).toContain(`${i + 1} de ${m}`);
    }
  });

  it('diz quando foi gerado e sob que tolerância', () => {
    const t = textos(montar([dia('2025-11-10', 'fecha', { d50: 60, total: 60 }, { d50: 60, total: 60 })]));
    expect(t.some((s) => s.includes('03/08/2026'))).toBe(true);
    expect(t.some((s) => s.includes('tolerância de 2 min'))).toBe(true);
    expect(t.some((s) => s.includes('data civil'))).toBe(true);
  });
});

describe('gerarPdfConferencia', () => {
  const args = {
    resultado: [dia('2025-11-10', 'divergencia', { d50: 90, total: 90 }, { d50: 60, total: 60 }, ['ADAMI SA MADEIRAS'])],
    ficha: fichaFalsa,
    refMonth: { year: 2025, month: 11 },
    tolerancia: 2,
    emitidoEm: new Date(2026, 7, 3, 14, 30),
  };

  it('devolve bytes de um PDF', () => {
    const bytes = gerarPdfConferencia({ ...args, totais: somaTotais(args.resultado) });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe('%PDF-1.4');
  });

  it('o leitor do próprio app lê de volta o documento inteiro', async () => {
    const bytes = gerarPdfConferencia({ ...args, totais: somaTotais(args.resultado) });
    const lidas = await extractPdfText(bytes.buffer);
    expect(lidas).toContain('CONFERÊNCIA DA FICHA');
    expect(lidas).toContain('JOAO PACCE ANDREONI');
    expect(lidas).toContain('ADAMI SA MADEIRAS');
    expect(lidas).toContain('Divergência');
    expect(lidas.some((s) => s.includes('A ficha reconhece'))).toBe(true);
  });

  // fmtDiff (format.js) emite o menos tipográfico (U+2212), igual à tela. O
  // EXTRA['−'] = 0x2d de pdfDoc.js existe para rebaixar esse caractere a
  // hífen ASCII na codificação WinAnsi — sem ele todo diferencial negativo
  // sairia como '?'. Este teste trava que a unificação da função não mudou
  // um byte do PDF: o hífen que sai é sempre o ASCII.
  it('diferencial negativo sai com hífen ASCII no PDF, nunca com ?', async () => {
    const dias = [dia('2025-11-10', 'fecha', { d50: 91, total: 91 }, { d50: 120, total: 120 })];
    const bytes = gerarPdfConferencia({
      resultado: dias,
      totais: somaTotais(dias),
      ficha: fichaFalsa,
      refMonth: { year: 2025, month: 11 },
      tolerancia: 2,
      emitidoEm: new Date(2026, 7, 3, 14, 30),
    });
    const lidas = await extractPdfText(bytes.buffer);
    expect(lidas).toContain('-00:29');
    expect(lidas.join(' ')).not.toContain('?');
  });
});
