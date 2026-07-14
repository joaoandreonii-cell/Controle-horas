import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Settings, X, Plus, Copy,
  Check, Trash2, Calendar, Sparkles, AlertTriangle, Wand2,
  Home, CalendarDays, Pencil, Download, Upload, Moon, FileSpreadsheet,
  Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseHM, entryState, buildEntryPayload, sameEntry } from './entry';

/* ═════════════════════════════════════════════════════════════════════════
   UTILITIES
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

const formatDateBR = (s) => {
  const d = parseDate(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const DAY_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTH_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* Páscoa (Computus / Gauss) */
function getEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/* Defaults: nacionais + Catanduvas/SC */
function getHolidayDefaults(year) {
  const fixed = [
    [`${year}-01-01`, 'Confraternização Universal'],
    [`${year}-01-20`, 'São Sebastião (Padroeiro)'],
    [`${year}-03-16`, 'Aniversário de Catanduvas'],
    [`${year}-04-21`, 'Tiradentes'],
    [`${year}-05-01`, 'Dia do Trabalho'],
    [`${year}-09-07`, 'Independência do Brasil'],
    [`${year}-10-12`, 'N. Sra. Aparecida'],
    [`${year}-11-02`, 'Finados'],
    [`${year}-11-15`, 'Proclamação da República'],
    [`${year}-11-20`, 'Consciência Negra'],
    [`${year}-12-25`, 'Natal'],
  ];
  const easter = getEaster(year);
  return [
    ...fixed.map(([date, name]) => ({ date, name })),
    { date: formatDate(addDays(easter, -2)), name: 'Sexta-feira Santa' },
    { date: formatDate(addDays(easter, 60)), name: 'Corpus Christi' },
  ];
}

/* Time */
const formatDuration = (mins) => {
  if (!mins) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${pad(m)}`;
};

const formatDurationLong = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
};

const EXP_START = 7 * 60 + 40;   // 07:40
const EXP_END = 17 * 60 + 30;    // 17:30
const NIGHT_START = 23 * 60;
const NIGHT_END = 5 * 60;

const LUNCH_CONFIG = { start: 720, end: 780 }; // 12:00–13:00 fixo
const LUNCH_LABEL = '12:00–13:00';
const DEFAULT_SETTINGS = {};

function calculateOvertime(entryDateStr, startMin, endMin, holidaysSet, lunchCfg, breaks) {
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

function getPeriod(year, month) {
  const start = new Date(year, month - 2, 26);
  const end = new Date(year, month - 1, 25);
  return { start, end };
}

function getDaysInPeriod(start, end) {
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function getDefaultRefMonth() {
  const today = new Date();
  const day = today.getDate();
  const m = today.getMonth() + 1;
  const y = today.getFullYear();
  if (day >= 26) {
    if (m === 12) return { year: y + 1, month: 1 };
    return { year: y, month: m + 1 };
  }
  return { year: y, month: m };
}

/* ═════════════════════════════════════════════════════════════════════════
   STORAGE + MIGRATION
   ═════════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'controle_horas_v3';

async function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ok */ }

  // Tenta migrar do v2
  try {
    const v2Raw = localStorage.getItem('controle_horas_v2');
    if (v2Raw) {
      const parsed = JSON.parse(v2Raw);
      const migrated = {
        entries: parsed.entries || {},
        holidays: parsed.holidays || [],
        initializedYears: parsed.initializedYears || [],
        settings: DEFAULT_SETTINGS,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem('controle_horas_v2');
      localStorage.removeItem('controle_horas_v1');
      return migrated;
    }
  } catch (e) { /* ok */ }

  // Tenta migrar do v1
  try {
    const v1Raw = localStorage.getItem('controle_horas_v1');
    if (v1Raw) {
      const parsed = JSON.parse(v1Raw);
      const migrated = {
        entries: parsed.entries || {},
        holidays: parsed.customHolidays || [],
        initializedYears: [],
        settings: DEFAULT_SETTINGS,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem('controle_horas_v1');
      return migrated;
    }
  } catch (e) { /* ok */ }

  return { entries: {}, holidays: [], initializedYears: [], settings: DEFAULT_SETTINGS };
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Erro ao salvar:', e);
    return false;
  }
}

function ensureYearsInitialized(data, years) {
  let result = data;
  let changed = false;
  for (const y of years) {
    if (result.initializedYears.includes(y)) continue;
    const defaults = getHolidayDefaults(y);
    const existingDates = new Set(result.holidays.map((h) => h.date));
    const newOnes = defaults.filter((d) => !existingDates.has(d.date));
    result = {
      ...result,
      holidays: [...result.holidays, ...newOnes],
      initializedYears: [...result.initializedYears, y],
    };
    changed = true;
  }
  return changed ? result : data;
}

/* ═════════════════════════════════════════════════════════════════════════
   COMPONENTES UI BÁSICOS
   ═════════════════════════════════════════════════════════════════════════ */

function FontStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=Manrope:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap');

      @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @keyframes screen-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

      .animate-fade-in { animation: fade-in 0.18s ease-out; }
      .animate-slide-up { animation: slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1); }
      .animate-screen-in { animation: screen-in 0.22s ease-out; }

      /* Inputs — mobile-friendly */
      input[type="date"] {
        color-scheme: dark;
        -webkit-appearance: none;
        appearance: none;
      }
      input[type="date"]::-webkit-calendar-picker-indicator {
        filter: invert(0.6);
        cursor: pointer;
        width: 24px;
        height: 24px;
        padding: 0;
        margin-right: 4px;
      }
      /* Safe area iPhone com home indicator */
      .tab-bar-safe {
        padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
      }
      /* Evita zoom ao focar inputs no iOS (mínimo 16px) */
      @media (max-width: 768px) {
        input[type="date"],
        input[type="text"] {
          font-size: 16px !important;
        }
      }
    `}</style>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-200 to-amber-400 flex items-center justify-center text-stone-900">
        <Calendar size={14} strokeWidth={2.5} />
      </div>
      <div>
        <div className="text-base leading-none text-stone-100"
             style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>
          horas+
        </div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-stone-500 mt-0.5">
          controle de extras
        </div>
      </div>
    </div>
  );
}

function Sheet({ open, onClose, children, maxHeight = '90vh' }) {
  useEffect(() => {
    if (open) {
      const y = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${y}px`;
      document.body.style.width = '100%';
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, y);
      };
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md bg-stone-900 rounded-t-3xl border-t border-stone-800 shadow-2xl animate-slide-up overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 flex justify-center pt-2.5 pointer-events-none z-10">
          <div className="w-10 h-1 bg-stone-700 rounded-full" />
        </div>
        <div className="overflow-y-auto" style={{ maxHeight, WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function maskTime(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ':' + digits.slice(2);
}

function TimeMaskedInput({ value, onChange, className, style }) {
  const ref = useRef(null);
  const handleChange = (e) => {
    const masked = maskTime(e.target.value);
    onChange(masked);
    if (masked.length === 5) {
      const h = parseInt(masked.slice(0, 2), 10);
      const m = parseInt(masked.slice(3, 5), 10);
      if (h > 23 || m > 59) onChange('');
    }
  };
  const handleFocus = () => {
    if (!value) {
      const now = new Date();
      onChange(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
      setTimeout(() => ref.current?.select(), 0);
    } else {
      setTimeout(() => ref.current?.select(), 0);
    }
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') ref.current?.blur();
  };
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      placeholder="--:--"
      maxLength={5}
      value={value}
      onChange={handleChange}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      className={className}
      style={style}
    />
  );
}

function TimeField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-medium block mb-2">
        {label}
      </label>
      <TimeMaskedInput
        value={value}
        onChange={onChange}
        className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3.5 py-3.5 text-stone-100 text-base tabular-nums focus:outline-none focus:border-amber-700/60 transition"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      />
    </div>
  );
}

function StatCard({ label, value, accentClass }) {
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/50 p-3.5">
      <div className="flex items-center gap-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${accentClass}`} />
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-stone-400 font-medium">
          {label}
        </span>
      </div>
      <div className="mt-1 text-2xl text-stone-100 tabular-nums"
           style={{ fontFamily: "'Fraunces', serif" }}>
        {value}
      </div>
    </div>
  );
}

function DayBadge({ kind, name }) {
  if (kind === 'holiday') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-800 border border-stone-700">
        <Sparkles size={11} className="text-rose-400 flex-shrink-0" />
        <span className="text-rose-300">Feriado · 100%</span>
        {name && (
          <>
            <span className="text-stone-500">·</span>
            <span className="text-stone-400 truncate max-w-[140px]">{name}</span>
          </>
        )}
      </div>
    );
  }
  if (kind === 'sunday') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-800 border border-stone-700">
        <span className="text-rose-300">Domingo · 100%</span>
      </div>
    );
  }
  if (kind === 'saturday') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-800 border border-stone-700">
        <span className="text-amber-300">Sábado · 50%</span>
      </div>
    );
  }
  return null;
}

/* ─── Tab bar ─── */
function TabBar({ current, onChange }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-stone-950/95 backdrop-blur-md border-t border-stone-900 tab-bar-safe">
      <div className="max-w-md mx-auto flex">
        <TabButton
          icon={<Home size={19} />}
          label="Hoje"
          active={current === 'today'}
          onClick={() => onChange('today')}
        />
        <TabButton
          icon={<CalendarDays size={19} />}
          label="Mês"
          active={current === 'month'}
          onClick={() => onChange('month')}
        />
      </div>
    </div>
  );
}

function TabButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 flex flex-col items-center gap-1 transition ${
        active ? 'text-amber-200' : 'text-stone-500 hover:text-stone-300'
      }`}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-[0.14em] font-medium">{label}</span>
    </button>
  );
}

/* ─── Linha de dia (tela Mês) ─── */
function DayRow({ day, entry, ot, isHoliday, holidayName, isToday, onClick }) {
  const dow = day.getDay();
  const isSunday = dow === 0;
  const isSaturday = dow === 6;
  const is100Day = isSunday || isHoliday;
  const breaksCount = entry?.breaks?.length || 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left active:scale-[0.99] transition-transform"
    >
      <div className={`flex items-center gap-3 py-3 px-3 rounded-2xl border ${
        isToday
          ? 'bg-stone-900/80 border-amber-900/40'
          : 'bg-stone-900/30 border-stone-800/60 hover:bg-stone-900/60'
      }`}>
        <div className="w-12 flex-shrink-0">
          <div className={`text-xl leading-none tabular-nums ${
            is100Day ? 'text-rose-300' : 'text-stone-100'
          }`} style={{ fontFamily: "'Fraunces', serif" }}>
            {pad(day.getDate())}
          </div>
          <div className={`text-[10px] uppercase tracking-wider mt-1 ${
            is100Day ? 'text-rose-400/80' : isSaturday ? 'text-amber-400/70' : 'text-stone-500'
          }`}>
            {DAY_SHORT[dow]} · {MONTH_SHORT[day.getMonth()]}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {entry?.start && entry?.end ? (
            <div>
              <div className="text-sm text-stone-200 tabular-nums"
                   style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {entry.start} <span className="text-stone-600">→</span> {entry.end}
              </div>
              {breaksCount > 0 && (
                <div className="text-[10px] text-stone-500 mt-0.5">
                  + {breaksCount} pausa{breaksCount > 1 ? 's' : ''}
                </div>
              )}
              {entry?.note && (
                <div className="text-[10px] text-stone-500 mt-0.5 truncate italic max-w-[180px]">
                  {entry.note}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-stone-500 italic">tocar para lançar</div>
          )}
          {isHoliday && (
            <div className="text-[10px] text-rose-400/90 mt-0.5 truncate flex items-center gap-1">
              <Sparkles size={9} className="flex-shrink-0" />
              <span className="truncate">{holidayName}</span>
            </div>
          )}
          {isSunday && !isHoliday && (
            <div className="text-[10px] text-rose-400/80 mt-0.5">domingo · 100%</div>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          {ot && ot.total > 0 ? (
            <>
              <div className="text-base text-amber-300 tabular-nums leading-none"
                   style={{ fontFamily: "'Fraunces', serif" }}>
                {formatDuration(ot.total)}
              </div>
              <div className="flex gap-1 justify-end mt-1">
                {ot.d50 > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                {ot.n50 > 0 && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                {ot.d100 > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                {ot.n100 > 0 && <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
              </div>
            </>
          ) : ot && ot.total === 0 && entry?.start ? (
            <div className="text-[10px] text-stone-600 uppercase tracking-wider">no ponto</div>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-stone-700 ml-auto" />
          )}
        </div>
      </div>
    </button>
  );
}

/* ─── Editor de entrada (sheet) ─── */
function EntryEditor({ open, onClose, day, isHoliday, holidayName, entry, onSave, onDelete }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [breaks, setBreaks] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setStart(entry?.start || '');
      setEnd(entry?.end || '');
      setBreaks(entry?.breaks || []);
      setNote(entry?.note || '');
      setError('');
    }
  }, [open, entry]);

  if (!day) return null;

  const sm = parseHM(start);
  const em = parseHM(end);
  const isNightShift = sm != null && em != null && em < sm;

  const handleSave = () => {
    if (!start || !end) { setError('Informe entrada e saída'); return; }
    if (sm == null || em == null) { setError('Horário inválido'); return; }
    if (em === sm) { setError('Entrada e saída não podem ser iguais'); return; }
    for (const b of breaks) {
      if (!b.start || !b.end) { setError('Preencha todos os campos das pausas'); return; }
      const bs = parseHM(b.start);
      const be = parseHM(b.end);
      if (bs == null || be == null) { setError('Horário de pausa inválido'); return; }
      if (be <= bs) { setError('Fim da pausa deve ser após o início'); return; }
    }
    setError('');
    const validBreaks = breaks.filter(b => b.start && b.end);
    const payload = { start, end };
    if (validBreaks.length > 0) payload.breaks = validBreaks;
    if (note.trim()) payload.note = note.trim();
    onSave(payload);
    onClose();
  };

  const fillStandard = () => { setStart('07:40'); setEnd('17:30'); };

  const addBreak = () => setBreaks([...breaks, { start: '', end: '' }]);
  const updateBreak = (i, field, val) =>
    setBreaks(breaks.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  const removeBreak = (i) => setBreaks(breaks.filter((_, idx) => idx !== i));

  const dow = day.getDay();
  const badgeKind = isHoliday ? 'holiday' : (dow === 0 ? 'sunday' : (dow === 6 ? 'saturday' : null));

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-6 pt-8 pb-7">
        <div className="mb-5">
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-stone-500 font-medium">
            {DAY_FULL[dow]}
          </div>
          <div className="text-3xl text-stone-100 mt-1" style={{ fontFamily: "'Fraunces', serif" }}>
            {day.getDate()} de {MONTH_FULL[day.getMonth()]}
          </div>
          {badgeKind && <div className="mt-2"><DayBadge kind={badgeKind} name={holidayName} /></div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Entrada" value={start} onChange={setStart} />
          <TimeField label="Saída" value={end} onChange={setEnd} />
        </div>

        <button
          onClick={fillStandard}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-stone-700 text-stone-400 text-sm hover:bg-stone-800/40 hover:text-stone-200 transition"
        >
          <Wand2 size={14} />
          Preencher expediente padrão
        </button>

        {isNightShift && !error && (
          <div className="mt-3 flex items-center gap-2 text-indigo-400 text-xs">
            <Moon size={13} />
            Turno noturno — cruza meia-noite
          </div>
        )}

        {em != null && sm != null && em === sm && !error && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs">
            <AlertTriangle size={13} />
            Entrada e saída não podem ser iguais
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 text-rose-400 text-xs">
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        {/* Pausas extras */}
        <div className="mt-4 pt-4 border-t border-stone-800/40">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-stone-500 font-medium mb-3">
            Pausas extras
          </div>

          {breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <TimeMaskedInput
                value={b.start}
                onChange={(v) => updateBreak(i, 'start', v)}
                className="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded-lg px-2.5 py-2 text-stone-100 text-sm tabular-nums focus:outline-none focus:border-amber-700/60"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
              <span className="text-stone-600 text-xs flex-shrink-0">→</span>
              <TimeMaskedInput
                value={b.end}
                onChange={(v) => updateBreak(i, 'end', v)}
                className="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded-lg px-2.5 py-2 text-stone-100 text-sm tabular-nums focus:outline-none focus:border-amber-700/60"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
              <button
                onClick={() => removeBreak(i)}
                className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-stone-500 hover:text-rose-400 hover:bg-stone-800 transition"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          <button
            onClick={addBreak}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-stone-700/60 text-stone-500 text-xs hover:bg-stone-800/40 hover:text-stone-300 transition"
          >
            <Plus size={12} />
            Adicionar pausa
          </button>
        </div>

        {/* Observações */}
        <div className="mt-4">
          <label className="text-[10.5px] uppercase tracking-[0.14em] text-stone-500 font-medium block mb-2">
            Observações
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: viagem a campo, plantão..."
            rows={2}
            className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3.5 py-3 text-stone-100 text-sm focus:outline-none focus:border-amber-700/60 transition resize-none"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          />
        </div>

        <div className="mt-3 text-[11.5px] text-stone-500 leading-relaxed">
          Almoço <span className="text-stone-400">{LUNCH_LABEL}</span> descontado automaticamente quando estiver dentro do turno.
        </div>

        <div className="mt-6 flex gap-2.5">
          {entry?.start && (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="px-4 py-3.5 rounded-xl border border-stone-800 text-stone-400 hover:bg-stone-800 hover:text-rose-400 transition flex items-center justify-center"
              aria-label="Apagar"
            >
              <Trash2 size={17} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3.5 rounded-xl border border-stone-800 text-stone-300 hover:bg-stone-800 transition font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3.5 rounded-xl bg-amber-200 text-stone-900 hover:bg-amber-100 transition font-semibold"
          >
            Salvar
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/* ─── Item de feriado (com edição inline) ─── */
function HolidayItem({ holiday, isEditing, onStartEdit, onCancelEdit, onSubmit, onDelete }) {
  const [date, setDate] = useState(holiday.date);
  const [name, setName] = useState(holiday.name);

  useEffect(() => {
    if (isEditing) { setDate(holiday.date); setName(holiday.name); }
  }, [isEditing, holiday]);

  if (isEditing) {
    return (
      <div className="rounded-2xl border border-amber-900/40 bg-stone-900 p-3.5 space-y-3 animate-fade-in">
        <div>
          <label className="text-[10.5px] uppercase tracking-[0.14em] text-stone-500 font-medium block mb-1.5">Data</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 text-sm tabular-nums focus:outline-none focus:border-amber-700/60"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          />
        </div>
        <div>
          <label className="text-[10.5px] uppercase tracking-[0.14em] text-stone-500 font-medium block mb-1.5">Descrição</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-700/60"
            placeholder="Ex: Carnaval"
          />
        </div>
        <div className="flex gap-2 pt-1">
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-3 py-2.5 rounded-xl border border-stone-800 text-stone-400 hover:bg-stone-800 hover:text-rose-400 transition flex items-center justify-center"
              aria-label="Apagar"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            onClick={onCancelEdit}
            className="flex-1 px-3 py-2.5 rounded-xl border border-stone-800 text-stone-300 hover:bg-stone-800 transition text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSubmit({ date, name: name.trim() })}
            disabled={!date || !name.trim()}
            className="flex-1 px-3 py-2.5 rounded-xl bg-amber-200 text-stone-900 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm font-semibold"
          >
            Salvar
          </button>
        </div>
      </div>
    );
  }

  const d = parseDate(holiday.date);
  const dow = d.getDay();

  return (
    <button
      onClick={onStartEdit}
      className="w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-xl bg-stone-900/50 border border-stone-800 hover:bg-stone-800/60 transition active:scale-[0.99]"
    >
      <div className="flex-shrink-0 w-14 text-center">
        <div className="text-base text-stone-100 tabular-nums leading-none"
             style={{ fontFamily: "'Fraunces', serif" }}>
          {pad(d.getDate())}/{pad(d.getMonth() + 1)}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-stone-500 mt-1">
          {DAY_SHORT[dow]}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-stone-200 truncate">{holiday.name}</div>
        <div className="text-[10px] text-stone-500 mt-0.5">{d.getFullYear()}</div>
      </div>
      <Pencil size={13} className="text-stone-600 flex-shrink-0" />
    </button>
  );
}

/* ─── Settings sheet ─── */
function SettingsSheet({ open, onClose, holidays, onUpdate, onAdd, onRemove, onExportJSON, onImportJSON }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [editingIndex, setEditingIndex] = useState(null);
  const [draftAdd, setDraftAdd] = useState({ date: '', name: '' });
  const fileInputRef = useRef(null);



  useEffect(() => {
    if (!open) {
      setEditingIndex(null);
      setDraftAdd({ date: '', name: '' });
    }
  }, [open]);

  const yearHolidays = useMemo(() => {
    return holidays
      .map((h, i) => ({ ...h, _i: i }))
      .filter((h) => h.date.startsWith(String(year)))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, year]);

  const navigateYear = (delta) => setYear(year + delta);



  const handleStartAdd = () => {
    const fallbackDate = `${year}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    setDraftAdd({ date: fallbackDate, name: '' });
    setEditingIndex(-1);
  };

  const handleSubmitAdd = ({ date, name }) => {
    if (!date || !name.trim()) return;
    if (holidays.some(h => h.date === date)) {
      alert('Já existe um feriado nesta data.');
      return;
    }
    onAdd({ date, name: name.trim() });
    setEditingIndex(null);
    setDraftAdd({ date: '', name: '' });
    setYear(parseInt(date.slice(0, 4)));
  };

  const handleSubmitEdit = (idx, payload) => {
    if (!payload.date || !payload.name.trim()) return;
    onUpdate(idx, payload);
    setEditingIndex(null);
  };

  const handleRemove = (idx) => {
    onRemove(idx);
    setEditingIndex(null);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!imported.entries || !imported.holidays) {
          alert('Arquivo inválido — campos obrigatórios ausentes.');
          return;
        }
        if (!window.confirm('Isso substituirá todos os dados atuais. Continuar?')) return;
        onImportJSON(imported);
      } catch {
        alert('Erro ao ler o arquivo JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Sheet open={open} onClose={onClose} maxHeight="92vh">
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.16em] text-stone-500 font-medium">
              configurações
            </div>
            <div className="text-2xl text-stone-100 mt-1" style={{ fontFamily: "'Fraunces', serif" }}>
              Ajustes
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300"
          >
            <X size={17} />
          </button>
        </div>



        {/* Feriados */}
        <div className="mb-6 pt-5 border-t border-stone-800/60">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-stone-500 font-medium mb-2">
            Feriados
          </div>
          <p className="text-[12px] text-stone-400 leading-relaxed mb-4">
            Os feriados nacionais e municipais de Catanduvas/SC já vêm preenchidos. Toque em qualquer um para editar ou remover.
          </p>

          {/* Year navigator */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigateYear(-1)}
              className="w-9 h-9 rounded-full bg-stone-900 border border-stone-800 hover:bg-stone-800 flex items-center justify-center text-stone-400"
              aria-label="Ano anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 text-center">
              <div className="text-2xl text-stone-100 tabular-nums leading-none"
                   style={{ fontFamily: "'Fraunces', serif" }}>
                {year}
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500 mt-1">
                {yearHolidays.length} feriado{yearHolidays.length === 1 ? '' : 's'}
              </div>
            </div>
            <button
              onClick={() => navigateYear(1)}
              className="w-9 h-9 rounded-full bg-stone-900 border border-stone-800 hover:bg-stone-800 flex items-center justify-center text-stone-400"
              aria-label="Próximo ano"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Add form ou botão */}
          {editingIndex === -1 ? (
            <div className="mb-3">
              <HolidayItem
                holiday={draftAdd}
                isEditing={true}
                onCancelEdit={() => { setEditingIndex(null); setDraftAdd({ date: '', name: '' }); }}
                onSubmit={handleSubmitAdd}
                onDelete={null}
              />
            </div>
          ) : (
            <button
              onClick={handleStartAdd}
              className="w-full mb-3 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-stone-700 text-stone-400 text-sm hover:bg-stone-800/40 hover:text-stone-200 transition"
            >
              <Plus size={15} />
              Adicionar feriado
            </button>
          )}

          {/* Lista de feriados do ano */}
          {yearHolidays.length === 0 && editingIndex !== -1 ? (
            <div className="rounded-xl border border-dashed border-stone-800 p-5 text-center text-stone-500 text-xs">
              Nenhum feriado em {year}
            </div>
          ) : (
            <div className="space-y-1.5">
              {yearHolidays.map((h) => (
                <HolidayItem
                  key={`${h._i}-${h.date}`}
                  holiday={h}
                  isEditing={editingIndex === h._i}
                  onStartEdit={() => setEditingIndex(h._i)}
                  onCancelEdit={() => setEditingIndex(null)}
                  onSubmit={(payload) => handleSubmitEdit(h._i, payload)}
                  onDelete={() => handleRemove(h._i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Dados / Backup */}
        <div className="pt-5 border-t border-stone-800/60">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-stone-500 font-medium mb-3">
            Backup de dados
          </div>
          <div className="space-y-2">
            <button
              onClick={onExportJSON}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-stone-800 text-stone-300 text-sm hover:bg-stone-800/60 transition font-medium"
            >
              <Download size={15} />
              Exportar backup
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-stone-800 text-stone-300 text-sm hover:bg-stone-800/60 transition font-medium"
            >
              <Upload size={15} />
              Importar backup
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
          <div className="text-[10px] text-stone-600 mt-2">
            Exporte seus dados para transferir entre dispositivos ou como cópia de segurança.
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-stone-800/60">
          <div className="text-[10px] text-stone-500 leading-relaxed">
            <strong className="text-stone-400">Regras de cálculo:</strong> domingos e feriados = 100%, demais horas extras = 50%. Adicional noturno: 23:00 às 05:00. Almoço {LUNCH_LABEL} descontado. Período: dia 26 do mês anterior até 25 do mês de referência.
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ─── Modal de cópia ─── */
function CopyModal({ open, onClose, text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.16em] text-stone-500 font-medium">exportar</div>
            <div className="text-2xl text-stone-100 mt-1" style={{ fontFamily: "'Fraunces', serif" }}>
              Resumo do mês
            </div>
          </div>
          <button onClick={onClose}
                  className="w-9 h-9 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300">
            <X size={17} />
          </button>
        </div>

        <pre
          className="text-[11.5px] text-stone-200 bg-stone-950 border border-stone-800 rounded-xl p-3.5 overflow-x-auto whitespace-pre leading-relaxed"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
{text}
        </pre>

        <button
          onClick={handleCopy}
          className={`mt-4 w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition ${
            copied ? 'bg-emerald-300 text-stone-900' : 'bg-amber-200 text-stone-900 hover:bg-amber-100'
          }`}
        >
          {copied ? <><Check size={17} /> Copiado!</> : <><Copy size={16} /> Copiar para área de transferência</>}
        </button>
      </div>
    </Sheet>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   TELAS
   ═════════════════════════════════════════════════════════════════════════ */

function TodayScreen({
  data, holidaysMap, refMonth, monthlyTotals, lunchConfig,
  onSaveEntry, onDeleteEntry, onOpenSettings, onGoToMonth,
}) {
  const [today, setToday] = useState(() => new Date());
  const todayStr = formatDate(today);
  const currentEntry = data.entries[todayStr];

  const [start, setStart] = useState(currentEntry?.start || '');
  const [end, setEnd] = useState(currentEntry?.end || '');
  const [breaks, setBreaks] = useState(currentEntry?.breaks || []);
  const [note, setNote] = useState(currentEntry?.note || '');
  const [showSaved, setShowSaved] = useState(false);
  const initRef = useRef(true);
  const savedTimer = useRef(null);
  const lastSaved = useRef(null);

  // Atualiza "hoje" se o dia mudar (app aberto pela meia-noite)
  useEffect(() => {
    const check = setInterval(() => {
      const now = new Date();
      if (formatDate(now) !== formatDate(today)) setToday(now);
    }, 60_000);
    return () => clearInterval(check);
  }, [today]);

  // Sincroniza com mudanças externas (ex: editou pelo mês).
  // Ignora o eco da nossa própria gravação: sem isso, o rebaixamento feito pelo
  // auto-save volta como mudança externa e limpa o campo que está sendo digitado.
  useEffect(() => {
    if (lastSaved.current && sameEntry(currentEntry, lastSaved.current)) return;
    setStart(currentEntry?.start || '');
    setEnd(currentEntry?.end || '');
    setBreaks(currentEntry?.breaks || []);
    setNote(currentEntry?.note || '');
  }, [currentEntry?.start, currentEntry?.end]); // eslint-disable-line

  // Auto-save: grava a entrada assim que ela for válida, mesmo sem a saída.
  // Apagar a saída de um dia completo rebaixa o dia para "em aberto".
  useEffect(() => {
    if (initRef.current) { initRef.current = false; return; }
    const payload = buildEntryPayload({ start, end, breaks, note });
    if (!payload) return;
    if (sameEntry(currentEntry, payload)) return;

    lastSaved.current = payload;
    onSaveEntry(todayStr, payload);
    setShowSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setShowSaved(false), 1600);
  }, [start, end, breaks, note]); // eslint-disable-line

  const todaySm = parseHM(start);
  const todayEm = parseHM(end);
  const invalidTime = todaySm != null && todayEm != null && todayEm === todaySm;
  const isNightShift = todaySm != null && todayEm != null && todayEm < todaySm;
  const missingEnd = todaySm != null && !end;

  const todayOT = useMemo(() => {
    const sm = parseHM(start);
    const em = parseHM(end);
    if (sm == null || em == null || em === sm) return null;
    const set = new Set(holidaysMap.keys());
    const parsedBreaks = (breaks || [])
      .map(b => ({ start: parseHM(b.start), end: parseHM(b.end) }))
      .filter(b => b.start != null && b.end != null);
    return calculateOvertime(todayStr, sm, em, set, lunchConfig, parsedBreaks);
  }, [start, end, breaks, holidaysMap, todayStr, lunchConfig]);

  const dow = today.getDay();
  const isSunday = dow === 0;
  const isSaturday = dow === 6;
  const isHoliday = holidaysMap.has(todayStr);
  const holidayName = holidaysMap.get(todayStr);
  const badgeKind = isHoliday ? 'holiday' : (isSunday ? 'sunday' : (isSaturday ? 'saturday' : null));

  const fillStandard = () => { setStart('07:40'); setEnd('17:30'); };
  const handleClear = () => { setStart(''); setEnd(''); setBreaks([]); setNote(''); onDeleteEntry(todayStr); };

  const addBreak = () => setBreaks([...breaks, { start: '', end: '' }]);
  const updateBreak = (i, field, val) =>
    setBreaks(breaks.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  const removeBreak = (i) => setBreaks(breaks.filter((_, idx) => idx !== i));

  const hasEntry = !!currentEntry?.start;


  return (
    <div className="px-4 pt-5 max-w-md mx-auto animate-screen-in">
      {/* Header */}
      <header className="flex items-center justify-between mb-7">
        <Logo />
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-full bg-stone-900 border border-stone-800 hover:bg-stone-800 flex items-center justify-center text-stone-400 hover:text-stone-200 transition"
          aria-label="Configurações"
        >
          <Settings size={15} />
        </button>
      </header>

      {/* Hero */}
      <div className="mb-6">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-medium mb-2">
          Hoje
        </div>
        <div className="text-4xl text-stone-100 leading-[1.05]"
             style={{ fontFamily: "'Fraunces', serif", fontWeight: 400 }}>
          {today.getDate()} de {MONTH_FULL[today.getMonth()]}
        </div>
        <div className="text-stone-400 text-sm mt-1.5 capitalize">
          {DAY_FULL[dow]}
        </div>
        {badgeKind && (
          <div className="mt-3"><DayBadge kind={badgeKind} name={holidayName} /></div>
        )}
      </div>

      {/* Card de lançamento */}
      <div className="rounded-3xl border border-stone-800 bg-gradient-to-br from-stone-900/80 to-stone-900/40 p-5 mb-5 relative overflow-hidden">
        <div className="absolute -top-12 -right-10 w-40 h-40 rounded-full bg-amber-500/[0.05] blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-medium">
              Lançamento
            </div>
            {showSaved && (
              <div className="flex items-center gap-1 text-[11px] text-emerald-400 animate-fade-in">
                <Check size={12} /> salvo
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TimeField label="Entrada" value={start} onChange={setStart} />
            <TimeField label="Saída" value={end} onChange={setEnd} />
          </div>

          <button
            onClick={fillStandard}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-stone-700 text-stone-400 text-sm hover:bg-stone-800/40 hover:text-stone-200 transition"
          >
            <Wand2 size={14} />
            Preencher expediente padrão
          </button>

          {missingEnd && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-950/40 border border-amber-900/50 text-amber-300 text-xs">
              <Clock size={13} className="flex-shrink-0" />
              Falta a saída — não entra no somatório
            </div>
          )}

          {invalidTime && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-950/50 border border-rose-900/60 text-rose-300 text-xs">
              <AlertTriangle size={13} className="flex-shrink-0" />
              Entrada e saída não podem ser iguais
            </div>
          )}

          {isNightShift && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-950/50 border border-indigo-900/40 text-indigo-300 text-xs">
              <Moon size={13} className="flex-shrink-0" />
              Turno noturno — cruza meia-noite
            </div>
          )}

          {/* Pausas extras */}
          {(breaks.length > 0 || (start && end && !invalidTime)) && (
            <div className="mt-4 pt-3 border-t border-stone-800/30">
              <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 font-medium mb-2">
                Pausas extras
              </div>
              {breaks.map((b, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <TimeMaskedInput
                    value={b.start}
                    onChange={(v) => updateBreak(i, 'start', v)}
                    className="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded-lg px-2.5 py-2 text-stone-100 text-sm tabular-nums focus:outline-none focus:border-amber-700/60"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <span className="text-stone-600 text-xs flex-shrink-0">→</span>
                  <TimeMaskedInput
                    value={b.end}
                    onChange={(v) => updateBreak(i, 'end', v)}
                    className="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded-lg px-2.5 py-2 text-stone-100 text-sm tabular-nums focus:outline-none focus:border-amber-700/60"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <button
                    onClick={() => removeBreak(i)}
                    className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-stone-500 hover:text-rose-400 hover:bg-stone-800 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={addBreak}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-stone-700/60 text-stone-500 text-xs hover:bg-stone-800/40 hover:text-stone-300 transition"
              >
                <Plus size={12} />
                Adicionar pausa
              </button>
            </div>
          )}

          {/* Observações */}
          {(start && end && !invalidTime) && (
            <div className="mt-3">
              <label className="text-[10px] uppercase tracking-[0.14em] text-stone-500 font-medium block mb-1.5">
                Observações
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: viagem a campo, plantão..."
                rows={2}
                className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-700/60 transition resize-none"
                style={{ fontFamily: "'Manrope', sans-serif" }}
              />
            </div>
          )}

          <div className="mt-3 text-[11px] text-stone-600">
            Almoço {LUNCH_LABEL} descontado automaticamente.
          </div>

          {hasEntry && !invalidTime && (
            <button
              onClick={handleClear}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-stone-500 text-xs hover:text-rose-400 transition"
            >
              <Trash2 size={12} />
              Limpar lançamento de hoje
            </button>
          )}
        </div>
      </div>

      {/* Preview de horas extras */}
      <div className="rounded-3xl border border-stone-800 bg-stone-900/30 p-5 mb-4">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-medium">
          Horas extras de hoje
        </div>
        <div className="flex items-end gap-2 mt-2">
          <div className="text-4xl text-stone-100 leading-none tabular-nums"
               style={{ fontFamily: "'Fraunces', serif", fontWeight: 400 }}>
            {todayOT ? formatDurationLong(todayOT.total) : '—'}
          </div>
          <div className="text-stone-500 text-xs pb-1">hh:mm</div>
        </div>

        {todayOT && todayOT.total > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            {todayOT.d50 > 0 && <StatCard label="50% diurno" value={formatDurationLong(todayOT.d50)} accentClass="bg-amber-400" />}
            {todayOT.d100 > 0 && <StatCard label="100% diurno" value={formatDurationLong(todayOT.d100)} accentClass="bg-rose-400" />}
            {todayOT.n50 > 0 && <StatCard label="50% noturno" value={formatDurationLong(todayOT.n50)} accentClass="bg-indigo-400" />}
            {todayOT.n100 > 0 && <StatCard label="100% noturno" value={formatDurationLong(todayOT.n100)} accentClass="bg-violet-400" />}
          </div>
        )}

        {todayOT && todayOT.total === 0 && (
          <div className="text-xs text-stone-500 mt-2">Hoje não houve horas extras</div>
        )}

        {!todayOT && (
          <div className="text-xs text-stone-500 mt-2">Lance entrada e saída para calcular</div>
        )}
      </div>

      {/* Atalho para o mês */}
      <button
        onClick={onGoToMonth}
        className="w-full rounded-2xl border border-stone-800 bg-stone-900/30 p-4 hover:bg-stone-900/60 transition flex items-center justify-between text-left active:scale-[0.99]"
      >
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-stone-500">
            Acumulado · {MONTH_FULL[refMonth.month - 1]} {refMonth.year}
          </div>
          <div className="text-2xl text-stone-100 mt-1 tabular-nums"
               style={{ fontFamily: "'Fraunces', serif" }}>
            {formatDurationLong(monthlyTotals.total)}
          </div>
        </div>
        <div className="flex items-center gap-1 text-stone-400 text-xs">
          ver mês
          <ChevronRight size={14} />
        </div>
      </button>
    </div>
  );
}

function MonthScreen({
  data, days, dayOTs, totals, holidaysMap, refMonth,
  onNavigateMonth, onSelectDay, onOpenSettings, onOpenCopy, onExportXLSX,
}) {
  const todayStr = formatDate(new Date());
  const { start, end } = useMemo(
    () => getPeriod(refMonth.year, refMonth.month),
    [refMonth]
  );

  const monthLabel = MONTH_FULL[refMonth.month - 1];
  const periodLabel = `${pad(start.getDate())} ${MONTH_SHORT[start.getMonth()]} → ${pad(end.getDate())} ${MONTH_SHORT[end.getMonth()]}`;


  return (
    <div className="px-4 pt-5 max-w-md mx-auto animate-screen-in">
      <header className="flex items-center justify-between mb-5">
        <Logo />
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-full bg-stone-900 border border-stone-800 hover:bg-stone-800 flex items-center justify-center text-stone-400 hover:text-stone-200 transition"
          aria-label="Configurações"
        >
          <Settings size={15} />
        </button>
      </header>

      <section className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => onNavigateMonth(-1)}
            className="w-10 h-10 rounded-full bg-stone-900 border border-stone-800 hover:bg-stone-800 flex items-center justify-center text-stone-400 transition"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-3xl text-stone-100 leading-none capitalize"
                 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400 }}>
              {monthLabel}
            </div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 mt-1.5">
              {refMonth.year} · {periodLabel}
            </div>
          </div>
          <button
            onClick={() => onNavigateMonth(1)}
            className="w-10 h-10 rounded-full bg-stone-900 border border-stone-800 hover:bg-stone-800 flex items-center justify-center text-stone-400 transition"
            aria-label="Próximo mês"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <section className="mb-7">
        <div className="rounded-3xl border border-stone-800 bg-gradient-to-br from-stone-900/80 to-stone-900/40 p-5 relative overflow-hidden">
          <div className="absolute -top-12 -right-10 w-40 h-40 rounded-full bg-amber-500/[0.04] blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-medium">
              Total no período
            </div>
            <div className="flex items-end gap-2 mt-2">
              <div className="text-5xl text-stone-100 leading-none tabular-nums"
                   style={{ fontFamily: "'Fraunces', serif", fontWeight: 400 }}>
                {formatDurationLong(totals.total)}
              </div>
              <div className="text-stone-500 text-sm pb-1.5">hh:mm</div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <StatCard label="50% diurno" value={formatDurationLong(totals.d50)} accentClass="bg-amber-400" />
              <StatCard label="100% diurno" value={formatDurationLong(totals.d100)} accentClass="bg-rose-400" />
              <StatCard label="50% noturno" value={formatDurationLong(totals.n50)} accentClass="bg-indigo-400" />
              <StatCard label="100% noturno" value={formatDurationLong(totals.n100)} accentClass="bg-violet-400" />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={onOpenCopy}
                disabled={totals.total === 0}
                className="py-3 rounded-xl bg-stone-100/[0.04] border border-stone-800 hover:bg-stone-100/[0.07] hover:border-stone-700 transition flex items-center justify-center gap-2 text-stone-300 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Copy size={14} />
                Copiar resumo
              </button>
              <button
                onClick={onExportXLSX}
                disabled={totals.total === 0}
                className="py-3 rounded-xl bg-stone-100/[0.04] border border-stone-800 hover:bg-stone-100/[0.07] hover:border-stone-700 transition flex items-center justify-center gap-2 text-stone-300 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet size={14} />
                Exportar Excel
              </button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-medium">
            Dia a dia
          </div>
          <div className="text-[10.5px] text-stone-600">
            {days.length} dias
          </div>
        </div>

        <div className="space-y-1.5">
          {days.map((day) => {
            const ds = formatDate(day);
            const isHoliday = holidaysMap.has(ds);
            return (
              <DayRow
                key={ds}
                day={day}
                entry={data.entries[ds]}
                ot={dayOTs[ds]}
                isHoliday={isHoliday}
                holidayName={holidaysMap.get(ds)}
                isToday={ds === todayStr}
                onClick={() => onSelectDay(ds)}
              />
            );
          })}
        </div>
      </section>

      <div className="mt-8 pt-5 border-t border-stone-900 text-center">
        <div className="text-[10px] text-stone-600 leading-relaxed px-6">
          Expediente 07:40–12:00 e 13:00–17:30 · Almoço {LUNCH_LABEL} descontado · Adicional noturno 23:00–05:00
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   APP
   ═════════════════════════════════════════════════════════════════════════ */

export default function App() {
  const [currentTab, setCurrentTab] = useState('today');
  const [refMonth, setRefMonth] = useState(getDefaultRefMonth);
  const [data, setData] = useState({ entries: {}, holidays: [], initializedYears: [], settings: DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);

  const [editingDate, setEditingDate] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCopy, setShowCopy] = useState(false);

  // Carregamento inicial + init dos anos
  useEffect(() => {
    loadData().then((d) => {
      const today = new Date();
      const initialized = ensureYearsInitialized(d, [today.getFullYear(), today.getFullYear() + 1]);
      setData(initialized);
      if (initialized !== d) saveData(initialized);
      setLoading(false);
    });
  }, []);

  // Garante anos do período em foco
  useEffect(() => {
    if (loading) return;
    const { start, end } = getPeriod(refMonth.year, refMonth.month);
    const yearsNeeded = [start.getFullYear(), end.getFullYear()];
    const updated = ensureYearsInitialized(data, yearsNeeded);
    if (updated !== data) {
      setData(updated);
      saveData(updated);
    }
  }, [refMonth, loading]); // eslint-disable-line

  const persist = (newData) => {
    setData(newData);
    if (!saveData(newData)) {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 5000);
    }
  };

  const lunchConfig = LUNCH_CONFIG;

  const { start: periodStart, end: periodEnd } = useMemo(
    () => getPeriod(refMonth.year, refMonth.month),
    [refMonth]
  );
  const days = useMemo(() => getDaysInPeriod(periodStart, periodEnd), [periodStart, periodEnd]);

  const holidaysMap = useMemo(() => {
    const map = new Map();
    for (const h of data.holidays) map.set(h.date, h.name);
    return map;
  }, [data.holidays]);

  const holidaysSet = useMemo(() => new Set(holidaysMap.keys()), [holidaysMap]);

  const { totals, dayOTs } = useMemo(() => {
    let d50 = 0, d100 = 0, n50 = 0, n100 = 0;
    const ots = {};
    for (const day of days) {
      const ds = formatDate(day);
      const e = data.entries[ds];
      if (entryState(e) !== 'complete') { ots[ds] = null; continue; }
      const sm = parseHM(e.start); const em = parseHM(e.end);
      if (sm == null || em == null || em === sm) { ots[ds] = null; continue; }
      const entryBreaks = (e.breaks || [])
        .map(b => ({ start: parseHM(b.start), end: parseHM(b.end) }))
        .filter(b => b.start != null && b.end != null);
      const r = calculateOvertime(ds, sm, em, holidaysSet, lunchConfig, entryBreaks);
      d50 += r.d50; d100 += r.d100; n50 += r.n50; n100 += r.n100;
      ots[ds] = r;
    }
    return {
      totals: { d50, d100, n50, n100, total: d50 + d100 + n50 + n100 },
      dayOTs: ots,
    };
  }, [days, data.entries, holidaysSet, lunchConfig]);

  const navigateMonth = (delta) => {
    const m = refMonth.month + delta;
    if (m > 12) setRefMonth({ year: refMonth.year + 1, month: 1 });
    else if (m < 1) setRefMonth({ year: refMonth.year - 1, month: 12 });
    else setRefMonth({ year: refMonth.year, month: m });
  };

  const saveEntry = (dateStr, payload) => {
    persist({ ...data, entries: { ...data.entries, [dateStr]: payload } });
  };

  const deleteEntry = (dateStr) => {
    const newEntries = { ...data.entries };
    delete newEntries[dateStr];
    persist({ ...data, entries: newEntries });
  };

  const addHoliday = (h) => persist({ ...data, holidays: [...data.holidays, h] });
  const updateHoliday = (idx, payload) => {
    const newHolidays = data.holidays.map((h, i) => i === idx ? payload : h);
    persist({ ...data, holidays: newHolidays });
  };
  const removeHoliday = (idx) => {
    persist({ ...data, holidays: data.holidays.filter((_, i) => i !== idx) });
  };

  const updateSettings = (newSettings) => {
    persist({ ...data, settings: newSettings });
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `horas-plus-backup-${formatDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importJSON = (imported) => {
    const withDefaults = {
      entries: imported.entries || {},
      holidays: imported.holidays || [],
      initializedYears: imported.initializedYears || [],
      settings: imported.settings || DEFAULT_SETTINGS,
    };
    persist(withDefaults);
  };



  const buildCopyText = () => {
    const monthLabel = `${MONTH_FULL[refMonth.month - 1]} ${refMonth.year}`;
    const periodLabel = `${formatDateBR(formatDate(periodStart))} a ${formatDateBR(formatDate(periodEnd))}`;

    const lines = [];
    lines.push(`*Horas Extras — ${monthLabel}*`);
    lines.push(periodLabel);
    lines.push(`Almoço: ${LUNCH_LABEL}`);
    lines.push('');
    lines.push('*Resumo*');
    if (totals.d50) lines.push(`  50% diurno ······ ${formatDurationLong(totals.d50)}`);
    if (totals.n50) lines.push(`  50% noturno ····· ${formatDurationLong(totals.n50)}`);
    if (totals.d100) lines.push(`  100% diurno ····· ${formatDurationLong(totals.d100)}`);
    if (totals.n100) lines.push(`  100% noturno ···· ${formatDurationLong(totals.n100)}`);
    lines.push('  ───────────────────────');
    lines.push(`  *Total ·········· ${formatDurationLong(totals.total)}*`);
    lines.push('');
    lines.push('*Detalhamento*');

    let any = false;
    for (const day of days) {
      const ds = formatDate(day);
      const ot = dayOTs[ds];
      const e = data.entries[ds];
      if (!ot || ot.total === 0) continue;
      any = true;
      const dnum = `${pad(day.getDate())}/${pad(day.getMonth() + 1)}`;
      const dn = DAY_SHORT[day.getDay()];
      const isH = holidaysSet.has(ds);
      const holidayName = holidaysMap.get(ds);
      const tag = isH ? ` _(feriado — ${holidayName})_` : day.getDay() === 0 ? ' _(domingo)_' : '';

      lines.push('');
      lines.push(`${dnum} ${dn}${tag}`);

      const breaksInfo = e.breaks?.length ? ` · pausa ${e.breaks.map(b => `${b.start}–${b.end}`).join(', ')}` : '';
      lines.push(`  ${e.start} → ${e.end}${breaksInfo}`);

      const parts = [];
      if (ot.d50) parts.push(`${formatDuration(ot.d50)} 50%d`);
      if (ot.n50) parts.push(`${formatDuration(ot.n50)} 50%n`);
      if (ot.d100) parts.push(`${formatDuration(ot.d100)} 100%d`);
      if (ot.n100) parts.push(`${formatDuration(ot.n100)} 100%n`);
      lines.push(`  ${parts.join(' · ')} = *${formatDuration(ot.total)}*`);

      if (e.note) lines.push(`  _obs: ${e.note}_`);
    }
    if (!any) lines.push('\n  (nenhuma hora extra registrada)');

    return lines.join('\n');
  };

  const exportXLSX = () => {
    const monthLabel = `${MONTH_FULL[refMonth.month - 1]} ${refMonth.year}`;
    const periodLabel = `${formatDateBR(formatDate(periodStart))} a ${formatDateBR(formatDate(periodEnd))}`;

    const rows = [];
    rows.push([`Controle de Horas Extras — ${monthLabel}`]);
    rows.push([`Período: ${periodLabel}`]);
    rows.push([`Almoço: ${LUNCH_LABEL}`]);
    rows.push([]);
    rows.push(['Categoria', 'Horas']);
    rows.push(['50% diurno', formatDurationLong(totals.d50)]);
    rows.push(['50% noturno', formatDurationLong(totals.n50)]);
    rows.push(['100% diurno', formatDurationLong(totals.d100)]);
    rows.push(['100% noturno', formatDurationLong(totals.n100)]);
    rows.push(['TOTAL', formatDurationLong(totals.total)]);
    rows.push([]);
    rows.push(['Data', 'Dia', 'Tipo', 'Entrada', 'Saída', 'Pausas', '50%d', '50%n', '100%d', '100%n', 'Total', 'Observações']);

    for (const day of days) {
      const ds = formatDate(day);
      const ot = dayOTs[ds];
      const e = data.entries[ds];
      if (!ot || ot.total === 0) continue;
      const dnum = `${pad(day.getDate())}/${pad(day.getMonth() + 1)}`;
      const dn = DAY_SHORT[day.getDay()];
      const isH = holidaysSet.has(ds);
      const tipo = isH ? 'feriado' : day.getDay() === 0 ? 'domingo' : '';
      const pausas = e.breaks?.length ? e.breaks.map(b => `${b.start}-${b.end}`).join(', ') : '';
      rows.push([
        dnum, dn, tipo, e.start, e.end, pausas,
        formatDurationLong(ot.d50), formatDurationLong(ot.n50),
        formatDurationLong(ot.d100), formatDurationLong(ot.n100),
        formatDurationLong(ot.total), e.note || '',
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 5 }, { wch: 9 }, { wch: 8 }, { wch: 8 },
      { wch: 20 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 },
      { wch: 7 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    XLSX.writeFile(wb, `horas-plus-${formatDate(new Date())}.xlsx`);
  };

  const editingDay = editingDate ? parseDate(editingDate) : null;
  const editingEntry = editingDate ? data.entries[editingDate] : null;
  const editingHolidayName = editingDate ? holidaysMap.get(editingDate) : null;
  const editingIsHoliday = !!editingHolidayName;

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <FontStyles />
        <div className="text-stone-500 text-sm" style={{ fontFamily: "'Manrope', sans-serif" }}>
          carregando…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24"
         style={{ fontFamily: "'Manrope', sans-serif" }}>
      <FontStyles />

      {saveError && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-rose-600 text-white text-center text-sm py-2.5 px-4 animate-fade-in">
          <AlertTriangle size={14} className="inline mr-1.5 -mt-0.5" />
          Erro ao salvar — armazenamento cheio. Exporte seus dados como backup.
        </div>
      )}

      {currentTab === 'today' ? (
        <TodayScreen
          data={data}
          holidaysMap={holidaysMap}
          refMonth={refMonth}
          monthlyTotals={totals}
          lunchConfig={lunchConfig}
          onSaveEntry={saveEntry}
          onDeleteEntry={deleteEntry}
          onOpenSettings={() => setShowSettings(true)}
          onGoToMonth={() => setCurrentTab('month')}
        />
      ) : (
        <MonthScreen
          data={data}
          days={days}
          dayOTs={dayOTs}
          totals={totals}
          holidaysMap={holidaysMap}
          refMonth={refMonth}
          onNavigateMonth={navigateMonth}
          onSelectDay={(ds) => setEditingDate(ds)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenCopy={() => setShowCopy(true)}
          onExportXLSX={exportXLSX}
        />
      )}

      <TabBar current={currentTab} onChange={setCurrentTab} />

      <EntryEditor
        open={!!editingDate}
        onClose={() => setEditingDate(null)}
        day={editingDay}
        isHoliday={editingIsHoliday}
        holidayName={editingHolidayName}
        entry={editingEntry}
        onSave={(payload) => saveEntry(editingDate, payload)}
        onDelete={() => deleteEntry(editingDate)}
      />

      <SettingsSheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        holidays={data.holidays}
        onAdd={addHoliday}
        onUpdate={updateHoliday}
        onRemove={removeHoliday}
        onExportJSON={exportJSON}
        onImportJSON={importJSON}
      />

      <CopyModal
        open={showCopy}
        onClose={() => setShowCopy(false)}
        text={buildCopyText()}
      />
    </div>
  );
}
