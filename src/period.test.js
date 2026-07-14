import { describe, it, expect } from 'vitest';
import { refMonthForDate } from './period';

describe('refMonthForDate', () => {
  it('antes do dia 26, o mês de referência é o próprio mês', () => {
    expect(refMonthForDate('2026-07-01')).toEqual({ year: 2026, month: 7 });
    expect(refMonthForDate('2026-07-14')).toEqual({ year: 2026, month: 7 });
    expect(refMonthForDate('2026-07-25')).toEqual({ year: 2026, month: 7 });
  });

  it('do dia 26 em diante, já conta para o mês seguinte', () => {
    expect(refMonthForDate('2026-07-26')).toEqual({ year: 2026, month: 8 });
    expect(refMonthForDate('2026-07-31')).toEqual({ year: 2026, month: 8 });
  });

  it('a virada 25 → 26 troca de período', () => {
    expect(refMonthForDate('2026-07-25')).toEqual({ year: 2026, month: 7 });
    expect(refMonthForDate('2026-07-26')).toEqual({ year: 2026, month: 8 });
  });

  it('dezembro vira janeiro do ano seguinte', () => {
    expect(refMonthForDate('2026-12-25')).toEqual({ year: 2026, month: 12 });
    expect(refMonthForDate('2026-12-26')).toEqual({ year: 2027, month: 1 });
    expect(refMonthForDate('2026-12-31')).toEqual({ year: 2027, month: 1 });
  });

  it('janeiro se comporta como qualquer outro mês', () => {
    expect(refMonthForDate('2026-01-01')).toEqual({ year: 2026, month: 1 });
    expect(refMonthForDate('2026-01-25')).toEqual({ year: 2026, month: 1 });
    expect(refMonthForDate('2026-01-26')).toEqual({ year: 2026, month: 2 });
  });

  it('fevereiro bissexto não é caso especial: só o dia importa', () => {
    expect(refMonthForDate('2028-02-29')).toEqual({ year: 2028, month: 3 });
  });
});
