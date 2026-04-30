import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Settings, X, Plus, Copy,
  Check, Trash2, Calendar, Sparkles, AlertTriangle, Wand2,
  Home, CalendarDays, Pencil,
} from 'lucide-react';

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
const parseHM = (s) => {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

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

const EXP1_START = 7 * 60 + 40;
const EXP1_END = 12 * 60;
const EXP2_START = 13 * 60;
const EXP2_END = 17 * 60 + 30;
const LUNCH_START = 12 * 60;
const LUNCH_END = 13 * 60;
const NIGHT_START = 23 * 60;
const NIGHT_END = 5 * 60;

function calculateOvertime(entryDateStr, startMin, endMin, holidaysSet) {
  let d50 = 0, d100 = 0, n50 = 0, n100 = 0;
  let adjustedEnd = endMin;
  if (endMin <= startMin) adjustedEnd = endMin + 24 * 60;

  const entryDate = parseDate(entryDateStr);

  for (let t = startMin; t < adjustedEnd; t++) {
    const dayOffset = Math.floor(t / 1440);
    const minuteOfDay = t - dayOffset * 1440;

    if (minuteOfDay >= LUNCH_START && minuteOfDay < LUNCH_END) continue;

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
      const inExp =
        (minuteOfDay >= EXP1_START && minuteOfDay < EXP1_END) ||
        (minuteOfDay >= EXP2_START && minuteOfDay < EXP2_END);
      if (inExp) continue;
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

const STORAGE_KEY = 'controle_horas_v2';

async function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ok */ }

  // Tenta migrar do v1
  try {
    const oldRaw = localStorage.getItem('controle_horas_v1');
    if (oldRaw) {
      const parsed = JSON.parse(oldRaw);
      const migrated = {
        entries: parsed.entries || {},
        holidays: parsed.customHolidays || [],
        initializedYears: [],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (e) { /* ok */ }

  return { entries: {}, holidays: [], initializedYears: [] };
}

async function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Erro ao salvar:', e);
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

      /* Inputs de horário — mobile-friendly */
      input[type="time"],
      input[type="date"] {
        color-scheme: dark;
        -webkit-appearance: none;
        appearance: none;
      }
      input[type="time"]::-webkit-calendar-picker-indicator,
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
        input[type="time"],
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
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
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
        style={{ maxHeight }}
      >
        <div className="absolute top-0 left-0 right-0 flex justify-center pt-2.5 pointer-events-none z-10">
          <div className="w-10 h-1 bg-stone-700 rounded-full" />
        </div>
        <div className="overflow-y-auto" style={{ maxHeight }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function TimeField({ label, value, onChange }) {
  const handleChange = (e) => {
    let v = e.target.value.replace(/[^0-9:]/g, '');
    if (v.length === 2 && !v.includes(':')) v = v + ':';
    if (v.length > 5) v = v.slice(0, 5);
    onChange(v);
  };

  const handleBlur = () => {
    if (!value) return;
    const clean = value.replace(/[^0-9]/g, '');
    if (clean.length >= 3) {
      const h = clean.slice(0, 2);
      const m = clean.slice(2, 4);
      const hNum = Math.min(23, parseInt(h, 10));
      const mNum = Math.min(59, parseInt(m || '0', 10));
      onChange(`${pad(hNum)}:${pad(mNum)}`);
    }
  };

  return (
    <div>
      <label className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-medium block mb-2">
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="00:00"
        maxLength={5}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3.5 py-4 text-stone-100 text-xl tabular-nums focus:outline-none focus:border-amber-700/60 transition text-center tracking-widest"
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
            <div className="text-sm text-stone-200 tabular-nums"
                 style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {entry.start} <span className="text-stone-600">→</span> {entry.end}
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
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setStart(entry?.start || '');
      setEnd(entry?.end || '');
      setError('');
    }
  }, [open, entry]);

  if (!day) return null;

  const sm = parseHM(start);
  const em = parseHM(end);

  const handleSave = () => {
    if (!start || !end) { setError('Informe entrada e saída'); return; }
    if (sm == null || em == null) { setError('Horário inválido'); return; }
    if (em <= sm) { setError('Saída não pode ser anterior ou igual à entrada'); return; }
    setError('');
    onSave({ start, end });
    onClose();
  };

  const fillStandard = () => { setStart('07:40'); setEnd('17:30'); };

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

        {/* Aviso em tempo real quando saída <= entrada */}
        {em != null && sm != null && em <= sm && !error && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs">
            <AlertTriangle size={13} />
            Saída anterior ou igual à entrada — corrija antes de salvar
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 text-rose-400 text-xs">
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        <div className="mt-4 text-[11.5px] text-stone-500 leading-relaxed">
          O período entre <span className="text-stone-400">12:00</span> e <span className="text-stone-400">13:00</span> será descontado automaticamente como almoço quando estiver dentro do turno.
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

/* ─── Settings sheet (lista completa de feriados) ─── */
function SettingsSheet({ open, onClose, holidays, onUpdate, onAdd, onRemove }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [editingIndex, setEditingIndex] = useState(null); // null | -1 (add) | number
  const [draftAdd, setDraftAdd] = useState({ date: '', name: '' });

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

  return (
    <Sheet open={open} onClose={onClose} maxHeight="92vh">
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.16em] text-stone-500 font-medium">
              configurações
            </div>
            <div className="text-2xl text-stone-100 mt-1" style={{ fontFamily: "'Fraunces', serif" }}>
              Feriados
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300"
          >
            <X size={17} />
          </button>
        </div>

        <p className="text-[12.5px] text-stone-400 leading-relaxed mb-5">
          Os feriados nacionais e municipais de Catanduvas/SC já vêm preenchidos. Toque em qualquer um para editar ou remover. Use o botão abaixo para adicionar novos.
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

        <div className="mt-6 pt-5 border-t border-stone-800/60">
          <div className="text-[10px] text-stone-500 leading-relaxed">
            <strong className="text-stone-400">Regras de cálculo:</strong> domingos e feriados = 100%, demais horas extras = 50%. Adicional noturno: 23:00 às 05:00. Almoço 12:00–13:00 sempre descontado. Período: dia 26 do mês anterior até 25 do mês de referência.
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
  data, holidaysMap, refMonth, monthlyTotals,
  onSaveEntry, onDeleteEntry, onOpenSettings, onGoToMonth,
}) {
  const today = useMemo(() => new Date(), []);
  const todayStr = formatDate(today);
  const currentEntry = data.entries[todayStr];

  const [start, setStart] = useState(currentEntry?.start || '');
  const [end, setEnd] = useState(currentEntry?.end || '');
  const [showSaved, setShowSaved] = useState(false);
  const initRef = useRef(true);
  const savedTimer = useRef(null);

  // Sincroniza com mudanças externas (ex: editou pelo mês)
  useEffect(() => {
    setStart(currentEntry?.start || '');
    setEnd(currentEntry?.end || '');
  }, [currentEntry?.start, currentEntry?.end]);

  // Auto-save quando entrada e saída estão válidas e corretas
  useEffect(() => {
    if (initRef.current) { initRef.current = false; return; }
    const sm = parseHM(start);
    const em = parseHM(end);
    if (sm != null && em != null) {
      if (em <= sm) return; // não salva se saída anterior ou igual à entrada
      const same = currentEntry && currentEntry.start === start && currentEntry.end === end;
      if (!same) {
        onSaveEntry(todayStr, { start, end });
        setShowSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setShowSaved(false), 1600);
      }
    }
  }, [start, end]); // eslint-disable-line

  // Aviso de saída inválida na tela Hoje
  const todaySm = parseHM(start);
  const todayEm = parseHM(end);
  const invalidTime = todaySm != null && todayEm != null && todayEm <= todaySm;

  const todayOT = useMemo(() => {
    const sm = parseHM(start);
    const em = parseHM(end);
    if (sm == null || em == null) return null;
    const set = new Set(holidaysMap.keys());
    return calculateOvertime(todayStr, sm, em, set);
  }, [start, end, holidaysMap, todayStr]);

  const dow = today.getDay();
  const isSunday = dow === 0;
  const isSaturday = dow === 6;
  const isHoliday = holidaysMap.has(todayStr);
  const holidayName = holidaysMap.get(todayStr);
  const badgeKind = isHoliday ? 'holiday' : (isSunday ? 'sunday' : (isSaturday ? 'saturday' : null));

  const fillStandard = () => { setStart('07:40'); setEnd('17:30'); };
  const handleClear = () => { setStart(''); setEnd(''); onDeleteEntry(todayStr); };

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

          {invalidTime && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-950/50 border border-rose-900/60 text-rose-300 text-xs">
              <AlertTriangle size={13} className="flex-shrink-0" />
              Saída não pode ser anterior ou igual à entrada
            </div>
          )}

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
            {todayOT.n50 > 0 && <StatCard label="50% noturno" value={formatDurationLong(todayOT.n50)} accentClass="bg-indigo-400" />}
            {todayOT.d100 > 0 && <StatCard label="100% diurno" value={formatDurationLong(todayOT.d100)} accentClass="bg-rose-400" />}
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
  onNavigateMonth, onSelectDay, onOpenSettings, onOpenCopy,
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
              <StatCard label="50% noturno" value={formatDurationLong(totals.n50)} accentClass="bg-indigo-400" />
              <StatCard label="100% diurno" value={formatDurationLong(totals.d100)} accentClass="bg-rose-400" />
              <StatCard label="100% noturno" value={formatDurationLong(totals.n100)} accentClass="bg-violet-400" />
            </div>

            <button
              onClick={onOpenCopy}
              disabled={totals.total === 0}
              className="mt-4 w-full py-3 rounded-xl bg-stone-100/[0.04] border border-stone-800 hover:bg-stone-100/[0.07] hover:border-stone-700 transition flex items-center justify-center gap-2 text-stone-300 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Copy size={14} />
              Exportar resumo
            </button>
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
          Expediente 07:40–12:00 e 13:00–17:30 · Almoço 1h descontado · Adicional noturno 23:00–05:00
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
  const [data, setData] = useState({ entries: {}, holidays: [], initializedYears: [] });
  const [loading, setLoading] = useState(true);

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

  const persist = (newData) => { setData(newData); saveData(newData); };

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
      if (!e || !e.start || !e.end) { ots[ds] = null; continue; }
      const sm = parseHM(e.start); const em = parseHM(e.end);
      if (sm == null || em == null) { ots[ds] = null; continue; }
      const r = calculateOvertime(ds, sm, em, holidaysSet);
      d50 += r.d50; d100 += r.d100; n50 += r.n50; n100 += r.n100;
      ots[ds] = r;
    }
    return {
      totals: { d50, d100, n50, n100, total: d50 + d100 + n50 + n100 },
      dayOTs: ots,
    };
  }, [days, data.entries, holidaysSet]);

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

  const buildCopyText = () => {
    const monthLabel = `${MONTH_FULL[refMonth.month - 1]} ${refMonth.year}`;
    const periodLabel = `${formatDateBR(formatDate(periodStart))} a ${formatDateBR(formatDate(periodEnd))}`;

    const lines = [];
    lines.push(`Controle de Horas Extras — ${monthLabel}`);
    lines.push(`Período: ${periodLabel}`);
    lines.push('');
    lines.push('═══════════════════════════════');
    lines.push(`50%  diurno    ${formatDurationLong(totals.d50).padStart(8)}`);
    lines.push(`50%  noturno   ${formatDurationLong(totals.n50).padStart(8)}`);
    lines.push(`100% diurno    ${formatDurationLong(totals.d100).padStart(8)}`);
    lines.push(`100% noturno   ${formatDurationLong(totals.n100).padStart(8)}`);
    lines.push('───────────────────────────────');
    lines.push(`TOTAL          ${formatDurationLong(totals.total).padStart(8)}`);
    lines.push('═══════════════════════════════');
    lines.push('');
    lines.push('Detalhamento (apenas dias com horas extras):');
    lines.push('');
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
      const tag = isH ? ' (feriado)' : day.getDay() === 0 ? ' (domingo)' : '';
      const parts = [];
      if (ot.d50) parts.push(`${formatDuration(ot.d50)} 50%d`);
      if (ot.n50) parts.push(`${formatDuration(ot.n50)} 50%n`);
      if (ot.d100) parts.push(`${formatDuration(ot.d100)} 100%d`);
      if (ot.n100) parts.push(`${formatDuration(ot.n100)} 100%n`);
      lines.push(`${dnum} ${dn}${tag}  ${e.start}-${e.end}  → ${formatDuration(ot.total)}  [${parts.join(', ')}]`);
    }
    if (!any) lines.push('  (nenhuma hora extra registrada)');

    return lines.join('\n');
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

      {currentTab === 'today' ? (
        <TodayScreen
          data={data}
          holidaysMap={holidaysMap}
          refMonth={refMonth}
          monthlyTotals={totals}
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
      />

      <CopyModal
        open={showCopy}
        onClose={() => setShowCopy(false)}
        text={buildCopyText()}
      />
    </div>
  );
}
