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
    // 2 no herói (App/Ficha) + 2 na linha '50% diurno' da tabela logo abaixo
    expect(t.filter((s) => s === '02:00')).toHaveLength(4);
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
