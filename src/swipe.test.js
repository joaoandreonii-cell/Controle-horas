import { describe, it, expect } from 'vitest';
import { swipeIntent } from './swipe';

// dx < 0 = dedo para a esquerda = avançar um dia (+1)
// dx > 0 = dedo para a direita  = voltar um dia  (-1)

describe('swipeIntent — o que motivou a spec', () => {
  it('o arco natural do polegar troca o dia', () => {
    // O polegar gira na articulação: um deslize horizontal sobe no caminho.
    // A regra antiga (|dx| > |dy| * 2) recusava isto.
    expect(swipeIntent({ dx: -80, dy: 45, dt: 180 })).toBe(1);
    expect(swipeIntent({ dx: 80, dy: -45, dt: 180 })).toBe(-1);
  });

  it('um flick rápido e curto troca o dia', () => {
    // Pouca distância, muita velocidade. A regra antiga (|dx| > 60) recusava.
    expect(swipeIntent({ dx: -35, dy: 8, dt: 70 })).toBe(1);
    expect(swipeIntent({ dx: 35, dy: 8, dt: 70 })).toBe(-1);
  });
});

describe('swipeIntent — o que já funcionava e não pode regredir', () => {
  it('um arrasto lento e longo troca o dia', () => {
    expect(swipeIntent({ dx: -70, dy: 20, dt: 600 })).toBe(1);
  });
});

describe('swipeIntent — o que NÃO pode disparar', () => {
  it('uma rolagem vertical não troca o dia', () => {
    expect(swipeIntent({ dx: 25, dy: 280, dt: 200 })).toBeNull();
  });

  it('um fling vertical rápido não troca o dia', () => {
    expect(swipeIntent({ dx: 20, dy: 300, dt: 90 })).toBeNull();
  });

  it('um toque simples não troca o dia', () => {
    expect(swipeIntent({ dx: 3, dy: 2, dt: 60 })).toBeNull();
  });

  it('um arrasto curto e lento não troca o dia', () => {
    expect(swipeIntent({ dx: 30, dy: 5, dt: 500 })).toBeNull();
  });
});

describe('swipeIntent — os limites exatos', () => {
  it('a distância é exclusiva: 45 não passa, 46 passa', () => {
    // dt alto para isolar o ramo da distância do ramo do flick.
    expect(swipeIntent({ dx: -45, dy: 0, dt: 500 })).toBeNull();
    expect(swipeIntent({ dx: -46, dy: 0, dt: 500 })).toBe(1);
  });

  it('a velocidade é exclusiva: 0.4 não passa, acima passa', () => {
    // |dx| entre 18 e 45 isola o ramo do flick.
    expect(swipeIntent({ dx: -20, dy: 0, dt: 50 })).toBeNull();   // v = 0.40
    expect(swipeIntent({ dx: -21, dy: 0, dt: 50 })).toBe(1);      // v = 0.42
  });

  it('um flick rápido mas curto demais não conta', () => {
    // Rápido, mas |dx| não passa de 18: é tremor de toque, não deslize.
    expect(swipeIntent({ dx: -18, dy: 0, dt: 10 })).toBeNull();
  });

  it('dx igual a dy é recusado: a regra é maior, não maior-ou-igual', () => {
    expect(swipeIntent({ dx: -50, dy: 50, dt: 100 })).toBeNull();
  });

  it('dt zero não divide por zero nem vira flick', () => {
    expect(swipeIntent({ dx: -20, dy: 0, dt: 0 })).toBeNull();
    expect(swipeIntent({ dx: -100, dy: 0, dt: 0 })).toBe(1);
  });
});
