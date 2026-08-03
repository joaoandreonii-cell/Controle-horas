import { describe, it, expect } from 'vitest';
import {
  pad, formatDate, parseDate, addDays, formatDateBR,
  formatDuration, formatDurationLong,
  DAY_FULL, DAY_SHORT, MONTH_FULL, MONTH_SHORT,
} from './format';

describe('pad', () => {
  it('completa com zero à esquerda até dois dígitos', () => {
    expect(pad(0)).toBe('00');
    expect(pad(7)).toBe('07');
    expect(pad(12)).toBe('12');
    expect(pad(123)).toBe('123');
  });
});

describe('formatDate / parseDate', () => {
  it('formata um Date como YYYY-MM-DD local', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDate(new Date(2025, 11, 31))).toBe('2025-12-31');
  });

  it('faz a volta sem escorregar de dia', () => {
    expect(formatDate(parseDate('2026-03-01'))).toBe('2026-03-01');
    expect(formatDate(parseDate('2025-10-26'))).toBe('2025-10-26');
  });
});

describe('addDays', () => {
  it('anda para frente e para trás atravessando o mês', () => {
    expect(formatDate(addDays(parseDate('2026-01-31'), 1))).toBe('2026-02-01');
    expect(formatDate(addDays(parseDate('2026-03-01'), -1))).toBe('2026-02-28');
  });

  it('não muda o Date recebido', () => {
    const d = parseDate('2026-05-10');
    addDays(d, 5);
    expect(formatDate(d)).toBe('2026-05-10');
  });
});

describe('formatDateBR', () => {
  it('vira DD/MM/AAAA', () => {
    expect(formatDateBR('2025-11-25')).toBe('25/11/2025');
    expect(formatDateBR('2026-01-05')).toBe('05/01/2026');
  });
});

describe('formatDuration', () => {
  it('zero e nulo viram 0h', () => {
    expect(formatDuration(0)).toBe('0h');
    expect(formatDuration(null)).toBe('0h');
    expect(formatDuration(undefined)).toBe('0h');
  });

  it('abaixo de uma hora sai em minutos', () => {
    expect(formatDuration(45)).toBe('45min');
    expect(formatDuration(1)).toBe('1min');
  });

  it('hora cheia omite os minutos', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(180)).toBe('3h');
  });

  it('hora quebrada traz os minutos com zero à esquerda', () => {
    expect(formatDuration(90)).toBe('1h30');
    expect(formatDuration(125)).toBe('2h05');
  });
});

describe('formatDurationLong', () => {
  it('sempre HH:MM, inclusive acima de 24h', () => {
    expect(formatDurationLong(0)).toBe('00:00');
    expect(formatDurationLong(14)).toBe('00:14');
    expect(formatDurationLong(90)).toBe('01:30');
    expect(formatDurationLong(1995)).toBe('33:15');
  });
});

describe('tabelas de nome', () => {
  it('trazem os nomes em português, com acento', () => {
    expect(DAY_SHORT).toEqual(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']);
    expect(DAY_FULL[2]).toBe('terça');
    expect(MONTH_FULL[2]).toBe('março');
    expect(MONTH_FULL[10]).toBe('novembro');
    expect(MONTH_SHORT[0]).toBe('jan');
    expect(MONTH_FULL).toHaveLength(12);
    expect(MONTH_SHORT).toHaveLength(12);
  });
});
