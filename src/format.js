/* ═════════════════════════════════════════════════════════════════════════
   FORMATO — datas e durações em texto
   Vieram do topo do App.jsx quando o relatório em PDF passou a precisar
   deles. Duas cópias dos mesmos formatadores discordariam sobre o mesmo
   número na primeira vez que alguém mexesse numa delas, e aí a tela e o
   PDF diriam coisas diferentes.
   ═════════════════════════════════════════════════════════════════════════ */

export const pad = (n) => String(n).padStart(2, '0');

export const formatDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const formatDateBR = (s) => {
  const d = parseDate(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const DAY_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MONTH_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const formatDuration = (mins) => {
  if (!mins) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${pad(m)}`;
};

export const formatDurationLong = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
};

// Minutos com sinal, em h:mm. O zero vira travessão para não poluir a lista.
// Compartilhado entre a tela e o relatório em PDF: duas cópias discordariam
// sobre o mesmo número na primeira vez que alguém mexesse numa delas.
export const fmtDiff = (min) => {
  if (min === 0) return '—';
  return (min > 0 ? '+' : '−') + formatDurationLong(Math.abs(min));
};
