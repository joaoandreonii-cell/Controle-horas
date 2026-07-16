import { describe, it, expect } from 'vitest';
import { calculateOvertime, LUNCH_CONFIG } from './overtime';

/* Teste de caracterização: trava o comportamento de HOJE, antes de a extração
   mover uma linha. calculateOvertime é o coração — todo número do app sai dele —
   e o App.jsx só exporta App, então até aqui não havia como testá-lo.

   Vários casos são linhas REAIS da ficha da empresa, anotadas como tal. Onde o
   app e a ficha discordam, quem manda aqui é o app: caracterização registra o
   que é, não o que deveria ser. */

const hm = (h, m = 0) => h * 60 + m;
const SEM_FERIADO = new Set();
const nada = { d50: 0, d100: 0, n50: 0, n100: 0, total: 0 };

describe('calculateOvertime — dia útil', () => {
  it('antes do expediente é 50% diurno', () => {
    // 02/06/2026, terça. Linha real da ficha: 05:30–07:40 = 02:10.
    expect(calculateOvertime('2026-06-02', hm(5, 30), hm(7, 40), SEM_FERIADO, LUNCH_CONFIG, []))
      .toEqual({ ...nada, d50: 130, total: 130 });
  });

  it('depois do expediente é 50% diurno', () => {
    // Linha real da ficha: 17:30–18:00 = 00:30.
    expect(calculateOvertime('2026-06-02', hm(17, 30), hm(18), SEM_FERIADO, LUNCH_CONFIG, []))
      .toEqual({ ...nada, d50: 30, total: 30 });
  });

  it('o expediente inteiro não gera hora extra', () => {
    expect(calculateOvertime('2026-06-02', hm(7, 40), hm(17, 30), SEM_FERIADO, LUNCH_CONFIG, []))
      .toEqual(nada);
  });
});

describe('calculateOvertime — a categoria sai do dia da semana', () => {
  it('sábado: a jornada toda é 50%', () => {
    // 16/05/2026, sábado. Linha real da ficha: 07:45–11:00 = 03:15.
    expect(calculateOvertime('2026-05-16', hm(7, 45), hm(11), SEM_FERIADO, LUNCH_CONFIG, []))
      .toEqual({ ...nada, d50: 195, total: 195 });
  });

  it('domingo: a jornada toda é 100%', () => {
    // 07/12/2025, domingo. Linha real da ficha: 21:00–23:59.
    expect(calculateOvertime('2025-12-07', hm(21), hm(23, 59), SEM_FERIADO, LUNCH_CONFIG, []))
      .toEqual({ ...nada, d100: 120, n100: 59, total: 179 });
  });

  it('feriado: 100%, e o almoço é descontado', () => {
    // 21/04/2026, Tiradentes, terça. Linha real da ficha: 08:00–13:00 — e a ficha
    // pagou 05:00 INTEIRAS, porque um turno de 5h não exige intervalo. O app
    // desconta o almoço assim mesmo e diz 04:00. A divergência é real e fica: é o
    // que a spec 5 vai consertar.
    expect(calculateOvertime('2026-04-21', hm(8), hm(13), new Set(['2026-04-21']), LUNCH_CONFIG, []))
      .toEqual({ ...nada, d100: 240, total: 240 });
  });
});

describe('calculateOvertime — pausas', () => {
  it('uma pausa dentro do almoço não é descontada duas vezes', () => {
    // Sem a compensação, o expediente esticaria 60min e o resultado cairia para 70.
    expect(calculateOvertime('2026-06-02', hm(7), hm(19), SEM_FERIADO, LUNCH_CONFIG, [
      { start: hm(12), end: hm(13) },
    ])).toEqual({ ...nada, d50: 130, total: 130 });
  });

  it('uma pausa fora do almoço estende o expediente', () => {
    // Parou 1h às 10:00, então repõe: o expediente vai até 18:30 e só depois é HE.
    expect(calculateOvertime('2026-06-02', hm(7), hm(19), SEM_FERIADO, LUNCH_CONFIG, [
      { start: hm(10), end: hm(11) },
    ])).toEqual({ ...nada, d50: 70, total: 70 });
  });
});

describe('calculateOvertime — a fronteira noturna, hoje em 23:00', () => {
  it('21:30→22:20 num dia útil não vê noturno nenhum', () => {
    // 25/03/2026, quarta. Linha real da ficha: 00:50, que a EMPRESA divide em
    // 30min normais + 20min noturnos, cortando às 22:00. O app corta às 23:00 e
    // não divide nada. É o bug que a task seguinte conserta.
    expect(calculateOvertime('2026-03-25', hm(21, 30), hm(22, 20), SEM_FERIADO, LUNCH_CONFIG, []))
      .toEqual({ ...nada, d50: 50, total: 50 });
  });
});

describe('calculateOvertime — o turno que cruza a meia-noite', () => {
  it('cai todo no dia de início, e conhece a data civil de cada minuto', () => {
    // 15/07/2026 (quarta) 22:00 → 16/07 (quinta) 02:00.
    expect(calculateOvertime('2026-07-15', hm(22), hm(2), SEM_FERIADO, LUNCH_CONFIG, []))
      .toEqual({ ...nada, d50: 60, n50: 180, total: 240 });
  });
});
