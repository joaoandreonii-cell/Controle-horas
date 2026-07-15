/* ═════════════════════════════════════════════════════════════════════════
   DESLIZE — foi um deslize horizontal? para que lado?
   Sem React, sem DOM: só aritmética sobre as coordenadas que o gesto coletou.
   Extraído para cá porque a sensibilidade é a feature, e "achei que ficou bom"
   não é verificável — a tabela em swipe.test.js é.
   ═════════════════════════════════════════════════════════════════════════ */

// Distância que um arrasto deliberado precisa percorrer. ~10% de uma tela de
// 430px, e bem longe de um toque (que anda 3-8px).
const DIST_MIN = 45;

// Um flick conta com menos distância, se for rápido o bastante: o dedo sai da
// tela cedo, então percorre pouco. 0.4px/ms = 400px/s — um flick deliberado
// fica em 500-2000px/s, um arrasto lento abaixo de 200px/s.
const FLICK_V_MIN = 0.4;
const FLICK_DIST_MIN = 18;

// Devolve +1 (avançar um dia), -1 (voltar um dia) ou null (não é deslize).
// A convenção mora aqui: o dedo para a esquerda avança, porque os dias são uma
// faixa horizontal com o passado à esquerda e o futuro à direita.
export function swipeIntent({ dx, dy, dt }) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // Cone de 45°: basta ser mais horizontal que vertical. Aceita o arco natural
  // do polegar; uma rolagem vertical real (dy de 200-400 contra dx de 20-40)
  // não chega perto.
  if (adx <= ady) return null;

  // dt === 0 é leitura degenerada: velocidade não dá para saber, então só a
  // distância pode salvar o gesto. Nunca Infinity.
  const v = dt > 0 ? adx / dt : 0;
  const longe = adx > DIST_MIN;
  const rapido = v > FLICK_V_MIN && adx > FLICK_DIST_MIN;
  if (!longe && !rapido) return null;

  return dx < 0 ? 1 : -1;
}
