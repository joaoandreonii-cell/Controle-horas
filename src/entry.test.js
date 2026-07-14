import { describe, it, expect } from 'vitest';
import { parseHM, entryState } from './entry';

describe('parseHM', () => {
  it('converte HH:MM em minutos desde a meia-noite', () => {
    expect(parseHM('08:00')).toBe(480);
    expect(parseHM('00:00')).toBe(0);
    expect(parseHM('23:59')).toBe(1439);
  });

  it('rejeita valores inválidos', () => {
    expect(parseHM('')).toBe(null);
    expect(parseHM('24:00')).toBe(null);
    expect(parseHM('12:60')).toBe(null);
    expect(parseHM('12')).toBe(null);
    expect(parseHM(undefined)).toBe(null);
  });
});

describe('entryState', () => {
  it('classifica dia sem nada como empty', () => {
    expect(entryState(undefined)).toBe('empty');
    expect(entryState({})).toBe('empty');
  });

  it('classifica entrada sem saída como partial', () => {
    expect(entryState({ start: '08:00' })).toBe('partial');
    expect(entryState({ start: '08:00', end: '' })).toBe('partial');
  });

  it('classifica entrada e saída como complete', () => {
    expect(entryState({ start: '08:00', end: '17:00' })).toBe('complete');
  });
});
