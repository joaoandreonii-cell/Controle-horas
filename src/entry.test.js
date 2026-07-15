import { describe, it, expect } from 'vitest';
import { parseHM, entryState, buildEntryPayload, sameEntry } from './entry';

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

describe('buildEntryPayload', () => {
  it('grava só a entrada quando a saída está vazia', () => {
    expect(buildEntryPayload({ start: '08:00', end: '', breaks: [], note: '' }))
      .toEqual({ start: '08:00' });
  });

  it('omite o end em vez de gravar string vazia', () => {
    const p = buildEntryPayload({ start: '08:00', end: '', breaks: [], note: '' });
    expect('end' in p).toBe(false);
  });

  it('grava entrada e saída quando as duas são válidas', () => {
    expect(buildEntryPayload({ start: '08:00', end: '17:00', breaks: [], note: '' }))
      .toEqual({ start: '08:00', end: '17:00' });
  });

  it('não grava nada quando só há saída', () => {
    expect(buildEntryPayload({ start: '', end: '17:00', breaks: [], note: '' })).toBe(null);
  });

  it('não grava nada quando a entrada é inválida', () => {
    expect(buildEntryPayload({ start: '99:99', end: '17:00', breaks: [], note: '' })).toBe(null);
  });

  it('fica em aberto quando a saída é igual à entrada', () => {
    expect(buildEntryPayload({ start: '08:00', end: '08:00', breaks: [], note: '' }))
      .toEqual({ start: '08:00' });
  });

  it('fica em aberto quando a saída é inválida', () => {
    expect(buildEntryPayload({ start: '08:00', end: '99:99', breaks: [], note: '' }))
      .toEqual({ start: '08:00' });
  });

  it('rebaixa um dia completo quando a saída é apagada', () => {
    expect(buildEntryPayload({ start: '08:00', end: '', breaks: [], note: 'obra' }))
      .toEqual({ start: '08:00', note: 'obra' });
  });

  it('preserva pausas e observação no lançamento parcial', () => {
    expect(buildEntryPayload({
      start: '08:00',
      end: '',
      breaks: [{ start: '10:00', end: '10:15' }],
      note: 'reunião',
    })).toEqual({
      start: '08:00',
      breaks: [{ start: '10:00', end: '10:15' }],
      note: 'reunião',
    });
  });

  it('descarta pausas incompletas', () => {
    expect(buildEntryPayload({
      start: '08:00',
      end: '17:00',
      breaks: [{ start: '10:00', end: '' }],
      note: '',
    })).toEqual({ start: '08:00', end: '17:00' });
  });

  it('o que ele grava como parcial é classificado como partial', () => {
    const p = buildEntryPayload({ start: '08:00', end: '', breaks: [], note: '' });
    expect(entryState(p)).toBe('partial');
  });
});

describe('sameEntry', () => {
  it('trata end ausente e end vazio como equivalentes', () => {
    expect(sameEntry({ start: '08:00' }, { start: '08:00' })).toBe(true);
  });

  it('detecta o rebaixamento como mudança', () => {
    expect(sameEntry({ start: '08:00', end: '17:00' }, { start: '08:00' })).toBe(false);
  });

  it('detecta a saída sendo preenchida', () => {
    expect(sameEntry({ start: '08:00' }, { start: '08:00', end: '17:00' })).toBe(false);
  });

  it('trata observação ausente e vazia como equivalentes', () => {
    expect(sameEntry({ start: '08:00', end: '17:00' }, { start: '08:00', end: '17:00' })).toBe(true);
    expect(sameEntry({ start: '08:00', end: '17:00', note: 'x' }, { start: '08:00', end: '17:00' })).toBe(false);
  });

  it('compara pausas', () => {
    expect(sameEntry(
      { start: '08:00', end: '17:00', breaks: [{ start: '10:00', end: '10:15' }] },
      { start: '08:00', end: '17:00', breaks: [{ start: '10:00', end: '10:15' }] },
    )).toBe(true);
    expect(sameEntry(
      { start: '08:00', end: '17:00', breaks: [{ start: '10:00', end: '10:15' }] },
      { start: '08:00', end: '17:00' },
    )).toBe(false);
  });

  it('é falso quando não há nada gravado', () => {
    expect(sameEntry(undefined, { start: '08:00' })).toBe(false);
  });
});
