import { describe, it, expect } from 'vitest';
import { conferir, vereditoDoPeriodo } from './conferencia';

/* conferir é puro: recebe a ficha (o que a empresa reconhece) e o byDate do app
   (o que você registrou, já repartido por data civil), e devolve o veredito de
   cada dia. É onde as duas fontes se encontram — e onde um erro de mapa de
   categoria (H 50% Not da ficha ≠ n50 do app) daria um relatório errado. */

// Uma linha da ficha, como o parseFicha devolve (só o que conferir usa).
const L = (data, cats = {}, extra = {}) => ({
  data,
  h50: cats.h50 || 0, h100: cats.h100 || 0, h50Not: cats.h50Not || 0, h100Not: cats.h100Not || 0,
  cliente: extra.cliente || { codigo: '1', nome: 'CLIENTE X' },
  colaborador: extra.colaborador || 'FULANO',
  estrutura: extra.estrutura || '0000111111',
  descricaoEstrutura: extra.descr || 'MO TESTE',
  rotina: 'R', hIni: '00:00', hFim: '00:00',
});

// Categorias do app para uma data (como o byDate do calculateOvertime).
const A = (d50 = 0, d100 = 0, n50 = 0, n100 = 0) => ({ d50, d100, n50, n100, total: d50 + d100 + n50 + n100 });

const ficha = (linhas) => ({ tecnico: 'FULANO', periodo: null, linhas, erros: [] });

describe('conferir — o dia que fecha', () => {
  it('app e ficha idênticos: status fecha, diff zero', () => {
    const r = conferir({ ficha: ficha([L('2025-11-10', { h50: 40 })]), appByDate: { '2025-11-10': A(40) } });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ data: '2025-11-10', status: 'fecha', diff: { d50: 0, total: 0 } });
  });
});

describe('conferir — a tolerância de ±2 min', () => {
  it('o gap de 1 min da empresa fecha por tolerância', () => {
    // Ficha 39, app 40: diff de 1 min, dentro da tolerância. É o gap de 17:31→19:00.
    const r = conferir({ ficha: ficha([L('2025-11-10', { h50: 39 })]), appByDate: { '2025-11-10': A(40) } });
    expect(r[0].status).toBe('fecha');
    expect(r[0].diff.d50).toBe(1);
  });

  it('3 min de diferença já é divergência', () => {
    const r = conferir({ ficha: ficha([L('2025-11-10', { h50: 37 })]), appByDate: { '2025-11-10': A(40) } });
    expect(r[0].status).toBe('divergencia');
  });
});

describe('conferir — o almoço trabalhado diverge, e deve', () => {
  it('a ficha paga a hora do almoço que o app descontou', () => {
    // 16/05: a ficha reconhece 60 min que o app não representa. A divergência é
    // verdadeira — o relatório não mente, mostra o que cada lado diz.
    const r = conferir({ ficha: ficha([L('2026-05-16', { h50: 195 })]), appByDate: { '2026-05-16': A(135) } });
    expect(r[0].status).toBe('divergencia');
    expect(r[0].diff.d50).toBe(-60); // app - ficha
  });
});

describe('conferir — presença de um lado só', () => {
  it('dia na ficha e não no app: só na ficha', () => {
    const r = conferir({ ficha: ficha([L('2025-11-10', { h50: 40 })]), appByDate: {} });
    expect(r[0].status).toBe('só na ficha');
    expect(r[0].app).toEqual(A(0));
  });

  it('dia no app e não na ficha: só no app', () => {
    const r = conferir({ ficha: ficha([]), appByDate: { '2025-11-10': A(40) } });
    expect(r[0].status).toBe('só no app');
    expect(r[0].ficha).toEqual(A(0));
    expect(r[0].clientes).toEqual([]);
  });
});

describe('conferir — o mapa de categoria ficha→app', () => {
  it('H 50% Not da ficha bate com n50 do app', () => {
    const r = conferir({ ficha: ficha([L('2025-11-10', { h50Not: 30 })]), appByDate: { '2025-11-10': A(0, 0, 30, 0) } });
    expect(r[0].status).toBe('fecha');
  });

  it('categoria trocada é divergência, mesmo com o total igual', () => {
    // Ficha lança 30 min como diurno; o app calculou noturno. O total fecha, as
    // categorias não. É o erro que a comparação por categoria existe para pegar.
    const r = conferir({ ficha: ficha([L('2025-11-10', { h50: 30 })]), appByDate: { '2025-11-10': A(0, 0, 30, 0) } });
    expect(r[0].status).toBe('divergencia');
    expect(r[0].diff).toMatchObject({ d50: -30, n50: 30, total: 0 });
  });
});

describe('conferir — vários clientes no mesmo dia', () => {
  it('consolida as categorias e junta os clientes', () => {
    const r = conferir({
      ficha: ficha([
        L('2026-05-02', { h50: 40 }, { cliente: { codigo: '143', nome: 'ADAMI' } }),
        L('2026-05-02', { h100: 60 }, { cliente: { codigo: '9025', nome: 'TIROL' } }),
      ]),
      appByDate: { '2026-05-02': A(40, 60) },
    });
    expect(r[0].status).toBe('fecha');
    expect(r[0].ficha).toEqual(A(40, 60));
    expect(r[0].clientes).toEqual([{ codigo: '143', nome: 'ADAMI' }, { codigo: '9025', nome: 'TIROL' }]);
  });

  it('não repete um cliente que aparece em duas linhas do dia', () => {
    const r = conferir({
      ficha: ficha([
        L('2026-05-02', { h50: 40 }, { cliente: { codigo: '143', nome: 'ADAMI' } }),
        L('2026-05-02', { h50: 20 }, { cliente: { codigo: '143', nome: 'ADAMI' } }),
      ]),
      appByDate: { '2026-05-02': A(60) },
    });
    expect(r[0].clientes).toEqual([{ codigo: '143', nome: 'ADAMI' }]);
  });
});

describe('conferir — ordenação', () => {
  it('devolve os dias em ordem de data', () => {
    const r = conferir({
      ficha: ficha([L('2025-11-20', { h50: 10 }), L('2025-11-05', { h50: 10 })]),
      appByDate: { '2025-11-12': A(10) },
    });
    expect(r.map((d) => d.data)).toEqual(['2025-11-05', '2025-11-12', '2025-11-20']);
  });
});

const totaisCom = (appTotal, fichaTotal) => ({
  app: { d50: 0, d100: 0, n50: 0, n100: 0, total: appTotal },
  ficha: { d50: 0, d100: 0, n50: 0, n100: 0, total: fichaTotal },
  diff: { d50: 0, d100: 0, n50: 0, n100: 0, total: appTotal - fichaTotal },
});
const dias = (...status) => status.map((s, i) => ({ data: `2025-11-0${i + 1}`, status: s }));

describe('vereditoDoPeriodo', () => {
  it('tudo fechando é confere', () => {
    const v = vereditoDoPeriodo({ resultado: dias('fecha', 'fecha'), totais: totaisCom(120, 120), tolerancia: 2 });
    expect(v.tom).toBe('confere');
    expect(v.glifo).toBe('=');
    expect(v.frase).toBe('Tudo confere — o total e cada dia fecham com a ficha.');
  });

  it('total fechando com dia torto é quase — a cor vem dos dias, não do total', () => {
    const v = vereditoDoPeriodo({ resultado: dias('fecha', 'divergencia'), totais: totaisCom(120, 120), tolerancia: 2 });
    expect(v.tom).toBe('quase');
    expect(v.glifo).toBe('=');
    expect(v.frase).toBe('O total fecha, mas 1 dia não bate — veja na lista.');
  });

  it('plural de dias tortos', () => {
    const v = vereditoDoPeriodo({
      resultado: dias('divergencia', 'só na ficha', 'fecha'), totais: totaisCom(121, 120), tolerancia: 2,
    });
    expect(v.frase).toBe('O total fecha, mas 2 dias não batem — veja na lista.');
  });

  it('a ficha reconhecendo menos é o caso que pede atenção', () => {
    const v = vereditoDoPeriodo({ resultado: dias('divergencia'), totais: totaisCom(180, 120), tolerancia: 2 });
    expect(v.tom).toBe('menos');
    expect(v.glifo).toBe('≠');
    expect(v.frase).toBe('A ficha reconhece 01:00 a menos do que você lançou no app.');
  });

  it('a ficha reconhecendo mais é notícia boa', () => {
    const v = vereditoDoPeriodo({ resultado: dias('divergencia'), totais: totaisCom(120, 180), tolerancia: 2 });
    expect(v.tom).toBe('mais');
    expect(v.glifo).toBe('≠');
    expect(v.frase).toBe('A ficha reconhece 01:00 a mais do que você lançou no app.');
  });
});
