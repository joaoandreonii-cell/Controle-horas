/* ═════════════════════════════════════════════════════════════════════════
   HORA EXTRA — o cálculo, extraído do App.jsx para poder ser testado
   Sem React, sem DOM. É o coração do app: todo número exibido, somado,
   mandado por WhatsApp e exportado para Excel sai daqui. Ficava solto dentro
   do App.jsx, que só exporta App — então não havia como travá-lo por teste
   antes de mexer. A extração é pura: nenhum valor muda.
   ═════════════════════════════════════════════════════════════════════════ */

const pad = (n) => String(n).padStart(2, '0');

const formatDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const EXP_START = 7 * 60 + 40;   // 07:40
export const EXP_END = 17 * 60 + 30;    // 17:30
export const NIGHT_START = 23 * 60;
export const NIGHT_END = 5 * 60;

export const LUNCH_CONFIG = { start: 720, end: 780 }; // 12:00–13:00 fixo
export const LUNCH_LABEL = '12:00–13:00';

export function calculateOvertime(entryDateStr, startMin, endMin, holidaysSet, lunchCfg, breaks) {
  let d50 = 0, d100 = 0, n50 = 0, n100 = 0;
  let adjustedEnd = endMin;
  if (endMin <= startMin) adjustedEnd = endMin + 24 * 60;

  const entryDate = parseDate(entryDateStr);

  // Calcula minutos de pausas extras que caem dentro do expediente (dias úteis).
  // Esses minutos "estendem" o fim do expediente — o funcionário deve repor o tempo.
  let breakMinsInSchedule = 0;
  if (breaks) {
    for (const b of breaks) {
      const overlapStart = Math.max(b.start, EXP_START);
      const overlapEnd = Math.min(b.end, EXP_END);
      if (overlapStart < overlapEnd) breakMinsInSchedule += overlapEnd - overlapStart;
    }
  }
  // Também desconta a sobreposição da pausa com o almoço (almoço já não conta como expediente)
  if (lunchCfg && breaks) {
    for (const b of breaks) {
      const overlapStart = Math.max(b.start, Math.max(lunchCfg.start, EXP_START));
      const overlapEnd = Math.min(b.end, Math.min(lunchCfg.end, EXP_END));
      if (overlapStart < overlapEnd) breakMinsInSchedule -= overlapEnd - overlapStart;
    }
  }
  const effectiveExpEnd = EXP_END + breakMinsInSchedule;

  outer: for (let t = startMin; t < adjustedEnd; t++) {
    const dayOffset = Math.floor(t / 1440);
    const minuteOfDay = t - dayOffset * 1440;

    if (lunchCfg && minuteOfDay >= lunchCfg.start && minuteOfDay < lunchCfg.end) continue;

    if (breaks) {
      for (const b of breaks) {
        if (minuteOfDay >= b.start && minuteOfDay < b.end) continue outer;
      }
    }

    const actualDate = addDays(entryDate, dayOffset);
    const dow = actualDate.getDay();
    const dateStr = formatDate(actualDate);

    const isSunday = dow === 0;
    const isSaturday = dow === 6;
    const isHoliday = holidaysSet.has(dateStr);
    const is100 = isSunday || isHoliday;

    const isNight = minuteOfDay >= NIGHT_START || minuteOfDay < NIGHT_END;

    if (is100) {
      if (isNight) n100++; else d100++;
    } else if (isSaturday) {
      if (isNight) n50++; else d50++;
    } else {
      if (minuteOfDay >= EXP_START && minuteOfDay < effectiveExpEnd) continue;
      if (isNight) n50++; else d50++;
    }
  }

  return { d50, d100, n50, n100, total: d50 + d100 + n50 + n100 };
}
