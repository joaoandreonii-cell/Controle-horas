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
});
