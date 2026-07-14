/* ═════════════════════════════════════════════════════════════════════════
   PERÍODO — o mês de referência não é o mês civil
   Sem React, sem DOM. O período de um mês de referência vai do dia 26 do mês
   anterior até o dia 25 dele.
   ═════════════════════════════════════════════════════════════════════════ */

// Mês de referência ao qual uma data pertence.
// A partir do dia 26, a data já conta para o mês seguinte.
export function refMonthForDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (d >= 26) {
    if (m === 12) return { year: y + 1, month: 1 };
    return { year: y, month: m + 1 };
  }
  return { year: y, month: m };
}
