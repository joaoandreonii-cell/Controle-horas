# Deslize Entre Dias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deslizar lateralmente na tela principal para alternar entre dias, podendo editar qualquer dia navegado, sem nunca gravar no dia errado.

**Architecture:** O `TodayScreen` (~290 linhas, cravado em hoje) se divide em `DayScreen` (data selecionada, gesto, cabeçalho, hero, "Acumulado" — sem estado de formulário) e `DayEditor` (`key={dateStr}:{dataVersion}`, formulário e auto-save de **um** dia). O `key` torna impossível por construção o formulário de um dia apontar para outro. A regra do mês de referência sai do `App.jsx` para um módulo puro novo, `src/period.js`, seguindo o que a spec 1 fez com `src/entry.js`. Só os módulos puros têm testes automatizados; as telas são verificadas à mão no aparelho.

**Tech Stack:** React 18 + Vite 5 + Tailwind 3, PWA via vite-plugin-pwa. Persistência em `localStorage`, sem backend. Vitest já instalado pela spec 1.

## Global Constraints

Valem para toda tarefa. Copiados da spec `docs/superpowers/specs/2026-07-14-deslize-entre-dias-design.md` e do `CLAUDE.md`.

- **PERDA DE DADO É IRREVERSÍVEL.** Todos os dados vivem só no `localStorage` de cada aparelho, na chave `controle_horas_v3`. Não há servidor, não há sincronização, **não existe cópia de nada** — nem o dono do projeto tem backup do que está nos aparelhos dos usuários. Esta feature tem **dois** caminhos de perda de dado, e cada um tem tarefa e verificação próprias: o vínculo formulário↔dia (Task 2) e o `importJSON` (Task 2). Na dúvida, verifique — não presuma.
- **A forma do dado não muda.** Nenhuma chave nova, nenhuma migração. `controle_horas_v3` intacto. O payload continua saindo do `buildEntryPayload` da spec 1.
- **Não tocar** na migração (`src/App.jsx:212-254`). A lógica do `importJSON` (`1734-1741`) não muda — ele só ganha o incremento do `dataVersion`.
- **Não tocar** no somatório (`1669-1689`), no Excel (`1819`), no WhatsApp (`1769`), no `calculateOvertime`, no `EntryEditor` (`617`) nem na aba de mês.
- **Não tocar** nas regras de overflow de `src/index.css` (`html`, `body`, `#root` usam `overflow-x: clip`, **nunca `hidden`** — `hidden` força `overflow-y` a computar como `auto` e mata a rolagem vertical por toque). Três commits recentes (`9a4247b`, `d3037d4`, `4a38b80`) consertaram exatamente isso. **Nenhuma tarefa aqui precisa mexer em CSS de overflow.**
- **O gesto não usa `preventDefault`, nem `touchmove`, nem CSS novo, nem dependência nova.** Limiar `|dx| > 60 && |dx| > |dy| * 2`.
- **Limite:** passado livre; para frente **trava em hoje**, silenciosamente (sem aviso, sem toast).
- **Testes só de funções puras.** Nada de React Testing Library, nada de teste de componente.
- **Strings de UI em português**, seguindo o tom minúsculo/curto do app existente.
- **PWA `autoUpdate`** (`vite.config.js:9`) mascara deploys. Em toda verificação manual, forçar a atualização do service worker (DevTools → Application → Service Workers → Update, ou hard reload), senão a mudança parece não ter subido.
- **Commits:** um por tarefa, sempre no branch `feat/lancamento-parcial`, **nunca na `main`**. Terminar toda mensagem com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Squash no fim:** o dono do projeto quer **um único commit no branch, ao final deste plano**. Os commits por tarefa são checkpoints e serão esmagados num só quando este plano terminar. **Não faça o squash antes do fim da Task 6. Não faça merge na `main` nem abra PR sem pedir.**

---

### Task 1: `refMonthForDate` — módulo puro `src/period.js`

O mês de referência não é o mês civil: o período vai do dia 26 do mês anterior até o dia 25 do mês de referência. Hoje essa regra está no `getDefaultRefMonth` (`src/App.jsx:189-199`), que chama `new Date()` por dentro e por isso só sabe responder sobre *hoje*. O deslize precisa perguntar "a que período pertence **esta** data?".

**Comportamento do app não muda nesta tarefa** — é refactor mais teste.

**Files:**
- Create: `src/period.js`
- Create: `src/period.test.js`
- Modify: `src/App.jsx:189-199` (`getDefaultRefMonth` passa a chamar `refMonthForDate`), `src/App.jsx:9` (import)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `refMonthForDate(dateStr: string) => { year: number, month: number }` — `dateStr` no formato `YYYY-MM-DD`; `month` é 1-12.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/period.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { refMonthForDate } from './period';

describe('refMonthForDate', () => {
  it('antes do dia 26, o mês de referência é o próprio mês', () => {
    expect(refMonthForDate('2026-07-01')).toEqual({ year: 2026, month: 7 });
    expect(refMonthForDate('2026-07-14')).toEqual({ year: 2026, month: 7 });
    expect(refMonthForDate('2026-07-25')).toEqual({ year: 2026, month: 7 });
  });

  it('do dia 26 em diante, já conta para o mês seguinte', () => {
    expect(refMonthForDate('2026-07-26')).toEqual({ year: 2026, month: 8 });
    expect(refMonthForDate('2026-07-31')).toEqual({ year: 2026, month: 8 });
  });

  it('a virada 25 → 26 troca de período', () => {
    expect(refMonthForDate('2026-07-25')).toEqual({ year: 2026, month: 7 });
    expect(refMonthForDate('2026-07-26')).toEqual({ year: 2026, month: 8 });
  });

  it('dezembro vira janeiro do ano seguinte', () => {
    expect(refMonthForDate('2026-12-25')).toEqual({ year: 2026, month: 12 });
    expect(refMonthForDate('2026-12-26')).toEqual({ year: 2027, month: 1 });
    expect(refMonthForDate('2026-12-31')).toEqual({ year: 2027, month: 1 });
  });

  it('janeiro se comporta como qualquer outro mês', () => {
    expect(refMonthForDate('2026-01-01')).toEqual({ year: 2026, month: 1 });
    expect(refMonthForDate('2026-01-25')).toEqual({ year: 2026, month: 1 });
    expect(refMonthForDate('2026-01-26')).toEqual({ year: 2026, month: 2 });
  });

  it('fevereiro bissexto não é caso especial: só o dia importa', () => {
    expect(refMonthForDate('2028-02-29')).toEqual({ year: 2028, month: 3 });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./period"` (o módulo ainda não existe).

- [ ] **Step 3: Criar `src/period.js`**

```js
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test`
Expected: PASS — 28 testes (22 da spec 1 + 6 novos).

- [ ] **Step 5: Ligar o `App.jsx` ao módulo novo**

Em `src/App.jsx`, logo abaixo do import de `./entry` (linha 9), adicionar:

```js
import { refMonthForDate } from './period';
```

Trocar o bloco `getDefaultRefMonth` inteiro (`src/App.jsx:189-199`) por:

```js
function getDefaultRefMonth() {
  return refMonthForDate(formatDate(new Date()));
}
```

`formatDate` já existe (`src/App.jsx:15`) e produz exatamente `YYYY-MM-DD`. A função antiga lia `getDate()`/`getMonth()+1`/`getFullYear()` do mesmo `new Date()`; a nova lê os mesmos números do `formatDate` dele. Mesmo resultado, para toda data.

- [ ] **Step 6: Confirmar que o app continua idêntico**

Run: `npm test`
Expected: PASS — 28 testes.

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/period.js src/period.test.js src/App.jsx
git commit -F- <<'EOF'
refactor: extrair refMonthForDate para modulo puro testavel

O mes de referencia nao e o mes civil: o periodo vai do dia 26 do mes
anterior ate o dia 25. Essa regra estava presa no getDefaultRefMonth, que
chamava new Date() por dentro e so sabia responder sobre hoje. O deslize
precisa perguntar a que periodo uma data qualquer pertence.

getDefaultRefMonth passa a ser refMonthForDate(hoje). Comportamento do app
inalterado.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 2: Dividir `TodayScreen` em `DayScreen` + `DayEditor`

**Esta é a tarefa que existe por causa de dados.** Ela não adiciona nenhuma feature visível: divide o componente e elimina, por construção, o vínculo errado entre formulário e dia.

O bug latente que o deslize ativaria: o `TodayScreen` guarda o formulário em estado local e tem um efeito de sincronização (`1197-1206`) que depende **só** de `[currentEntry?.start, currentEntry?.end]`, com `eslint-disable-line`. Dois dias seguidos com o mesmo `start`/`end` e observações diferentes: ao trocar de dia, as dependências não mudam, o efeito não dispara, e o formulário continua com a observação do dia anterior. Qualquer edição faz o auto-save gravar a observação errada no dia novo, **em silêncio**.

Com `key={dateStr}`, o React desmonta e remonta: `useState(entry?.start || '')` reinicializa do dia novo, `initRef` volta a `true`. O efeito de sincronização **deixa de existir**.

**E o buraco que isso abre:** sem aquele efeito, importar um backup JSON com a aba "hoje" aberta deixaria o formulário com os valores de antes do import (o `importJSON` não recarrega a página, `1734-1741`), e a primeira edição gravaria o formulário velho por cima do backup. O `CLAUDE.md` chama o export/import de "a única válvula de escape" do projeto. Por isso a key inclui `dataVersion`, incrementado **só** pelo import.

Ao fim desta tarefa a tela continua cravada em hoje e **visualmente idêntica**.

**Files:**
- Modify: `src/App.jsx:1171-1462` (`TodayScreen` → `DayScreen` + `DayEditor`), `src/App.jsx:1612-1621` (`dataVersion` no `App`), `src/App.jsx:1734-1741` (`importJSON` incrementa), `src/App.jsx:1868-1879` (render)

**Interfaces:**
- Consumes: `buildEntryPayload`, `sameEntry`, `entryState`, `parseHM` de `./entry` (spec 1, já importados na linha 9).
- Produces:
  - `DayScreen({ data, holidaysMap, refMonth, monthlyTotals, lunchConfig, dataVersion, onSaveEntry, onDeleteEntry, onOpenSettings, onGoToMonth })`
  - `DayEditor({ dateStr, entry, holidaysMap, lunchConfig, onSaveEntry, onDeleteEntry })`
  - `App` passa a ter `dataVersion: number`, incrementado só pelo `importJSON`.

- [ ] **Step 1: Adicionar `dataVersion` ao `App`**

Em `src/App.jsx`, logo abaixo de `const [showCopy, setShowCopy] = useState(false);` (linha 1621), acrescentar:

```jsx
  // Incrementado SÓ pelo importJSON. Entra na key da DayEditor para forçar a
  // remontagem do formulário quando os dados são substituídos por baixo dele —
  // sem isso, a tela ficaria mostrando o dado de antes do import e a primeira
  // edição gravaria por cima do backup recém-importado.
  const [dataVersion, setDataVersion] = useState(0);
```

- [ ] **Step 2: `importJSON` incrementa o `dataVersion`**

Trocar o bloco de `src/App.jsx:1734-1741` por:

```jsx
  const importJSON = (imported) => {
    const withDefaults = {
      entries: imported.entries || {},
      holidays: imported.holidays || [],
      initializedYears: imported.initializedYears || [],
      settings: imported.settings || DEFAULT_SETTINGS,
    };
    persist(withDefaults);
    setDataVersion((v) => v + 1);
  };
```

A lógica de import não muda — só o contador é novo.

- [ ] **Step 3: Trocar `TodayScreen` por `DayScreen` + `DayEditor`**

Trocar o bloco inteiro de `src/App.jsx:1171` (`function TodayScreen({`) até o `}` que fecha o componente (a linha imediatamente antes de `function MonthScreen({`) por:

```jsx
function DayScreen({
  data, holidaysMap, refMonth, monthlyTotals, lunchConfig, dataVersion,
  onSaveEntry, onDeleteEntry, onOpenSettings, onGoToMonth,
}) {
  const [today, setToday] = useState(() => new Date());
  const todayStr = formatDate(today);
  const dateStr = todayStr;

  // Atualiza "hoje" se o dia mudar (app aberto pela meia-noite)
  useEffect(() => {
    const check = setInterval(() => {
      const now = new Date();
      if (formatDate(now) !== formatDate(today)) setToday(now);
    }, 60_000);
    return () => clearInterval(check);
  }, [today]);

  const day = parseDate(dateStr);
  const dow = day.getDay();
  const isSunday = dow === 0;
  const isSaturday = dow === 6;
  const isHoliday = holidaysMap.has(dateStr);
  const holidayName = holidaysMap.get(dateStr);
  const badgeKind = isHoliday ? 'holiday' : (isSunday ? 'sunday' : (isSaturday ? 'saturday' : null));

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
          {day.getDate()} de {MONTH_FULL[day.getMonth()]}
        </div>
        <div className="text-stone-400 text-sm mt-1.5 capitalize">
          {DAY_FULL[dow]}
        </div>
        {badgeKind && (
          <div className="mt-3"><DayBadge kind={badgeKind} name={holidayName} /></div>
        )}
      </div>

      <DayEditor
        key={`${dateStr}:${dataVersion}`}
        dateStr={dateStr}
        entry={data.entries[dateStr]}
        holidaysMap={holidaysMap}
        lunchConfig={lunchConfig}
        onSaveEntry={onSaveEntry}
        onDeleteEntry={onDeleteEntry}
      />

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

// Edita EXATAMENTE um dia — o da prop `dateStr`.
// Renderizada com key={dateStr}:{dataVersion}, então remonta ao trocar de dia
// e ao importar um backup. É a remontagem que garante que o formulário nunca
// aponte para outro dia: não existe efeito de sincronização, e portanto não
// sobra array de dependências para alguém errar depois.
function DayEditor({ dateStr, entry, holidaysMap, lunchConfig, onSaveEntry, onDeleteEntry }) {
  const [start, setStart] = useState(entry?.start || '');
  const [end, setEnd] = useState(entry?.end || '');
  const [breaks, setBreaks] = useState(entry?.breaks || []);
  const [note, setNote] = useState(entry?.note || '');
  const [showSaved, setShowSaved] = useState(false);
  const initRef = useRef(true);
  const savedTimer = useRef(null);

  // Este componente remonta a cada troca de dia: não deixar timer pendente.
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  // Auto-save: grava a entrada assim que ela for válida, mesmo sem a saída.
  // Apagar a saída de um dia completo rebaixa o dia para "em aberto".
  useEffect(() => {
    if (initRef.current) { initRef.current = false; return; }
    const payload = buildEntryPayload({ start, end, breaks, note });
    if (!payload) return;
    if (sameEntry(entry, payload)) return;

    onSaveEntry(dateStr, payload);
    setShowSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setShowSaved(false), 1600);
  }, [start, end, breaks, note]); // eslint-disable-line

  const sm = parseHM(start);
  const em = parseHM(end);
  const invalidTime = sm != null && em != null && em === sm;
  const isNightShift = sm != null && em != null && em < sm;
  const missingEnd = sm != null && !end;

  const dayOT = useMemo(() => {
    const s = parseHM(start);
    const e = parseHM(end);
    if (s == null || e == null || e === s) return null;
    const set = new Set(holidaysMap.keys());
    const parsedBreaks = (breaks || [])
      .map(b => ({ start: parseHM(b.start), end: parseHM(b.end) }))
      .filter(b => b.start != null && b.end != null);
    return calculateOvertime(dateStr, s, e, set, lunchConfig, parsedBreaks);
  }, [start, end, breaks, holidaysMap, dateStr, lunchConfig]);

  const fillStandard = () => { setStart('07:40'); setEnd('17:30'); };
  const handleClear = () => { setStart(''); setEnd(''); setBreaks([]); setNote(''); onDeleteEntry(dateStr); };

  const addBreak = () => setBreaks([...breaks, { start: '', end: '' }]);
  const updateBreak = (i, field, val) =>
    setBreaks(breaks.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  const removeBreak = (i) => setBreaks(breaks.filter((_, idx) => idx !== i));

  const hasEntry = !!entry?.start;

  return (
    <>
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
                    className="w-8 h-8 flex-shrink-0 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-stone-800 flex items-center justify-center transition"
                    aria-label="Remover pausa"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addBreak}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-stone-700 text-stone-500 text-xs hover:bg-stone-800/40 hover:text-stone-300 transition"
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
            {dayOT ? formatDurationLong(dayOT.total) : '—'}
          </div>
          <div className="text-stone-500 text-xs pb-1">hh:mm</div>
        </div>

        {dayOT && dayOT.total > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            {dayOT.d50 > 0 && <StatCard label="50% diurno" value={formatDurationLong(dayOT.d50)} accentClass="bg-amber-400" />}
            {dayOT.d100 > 0 && <StatCard label="100% diurno" value={formatDurationLong(dayOT.d100)} accentClass="bg-rose-400" />}
            {dayOT.n50 > 0 && <StatCard label="50% noturno" value={formatDurationLong(dayOT.n50)} accentClass="bg-indigo-400" />}
            {dayOT.n100 > 0 && <StatCard label="100% noturno" value={formatDurationLong(dayOT.n100)} accentClass="bg-violet-400" />}
          </div>
        )}

        {dayOT && dayOT.total === 0 && (
          <div className="text-xs text-stone-500 mt-2">Hoje não houve horas extras</div>
        )}

        {!dayOT && (
          <div className="text-xs text-stone-500 mt-2">Lance entrada e saída para calcular</div>
        )}
      </div>
    </>
  );
}
```

Notas para quem implementa:

- O `lastSaved` que existia no `TodayScreen` (commit `c943c57`) **sai junto com o efeito de sincronização**. Ele existia só para impedir que o eco da própria gravação limpasse o campo em edição. Sem o efeito, não há eco. **Não recrie o `lastSaved` na `DayEditor`.**
- O `sameEntry(entry, payload)` do auto-save agora compara com a **prop** `entry`, não com um `currentEntry` local.
- Os textos "Horas extras de hoje", "Hoje não houve horas extras" e "Limpar lançamento de hoje" continuam dizendo "hoje" **de propósito nesta tarefa** — a tela ainda está cravada em hoje. A Task 5 os corrige junto com o rótulo do hero.

- [ ] **Step 4: Atualizar o render do `App`**

Em `src/App.jsx`, trocar `<TodayScreen` por `<DayScreen` e acrescentar a prop `dataVersion`. O bloco (`1868-1879`) fica:

```jsx
      {currentTab === 'today' ? (
        <DayScreen
          data={data}
          holidaysMap={holidaysMap}
          refMonth={refMonth}
          monthlyTotals={totals}
          lunchConfig={lunchConfig}
          dataVersion={dataVersion}
          onSaveEntry={saveEntry}
          onDeleteEntry={deleteEntry}
          onOpenSettings={() => setShowSettings(true)}
          onGoToMonth={() => setCurrentTab('month')}
        />
      ) : (
```

- [ ] **Step 5: Confirmar que os testes puros continuam passando**

Run: `npm test`
Expected: PASS — 28 testes.

Run: `npm run build`
Expected: build sem erros. **Se o build reclamar de `TodayScreen` não definido, sobrou uma referência ao nome antigo.**

- [ ] **Step 6: Verificar à mão**

Run: `npm run dev`

Com o DevTools aberto (Application → Local Storage → `controle_horas_v3`):

1. **Regressão:** a tela de hoje está visualmente idêntica à de antes — hero, card de lançamento, avisos, preview de horas extras, "Acumulado". Nenhum erro no console.
2. Lançar entrada e saída: grava no dia certo, o toast "salvo" aparece.
3. Lançamento parcial (só a entrada): grava `{"start":"08:00"}` sem a chave `end`, o aviso âmbar aparece.
4. Apagar a saída de um dia completo: rebaixa para `{ start }`.
5. **O bug que a spec 1 corrigiu não voltou:** num dia completo `08:00`–`19:30`, tocar na saída e digitar `1945`. O campo tem que ficar `19:45`, **não** `94:5`. (Se voltou, alguém recriou o efeito de sincronização.)
6. Trocar para a aba de mês e voltar: a tela de hoje reaparece correta.
7. **O buraco do import (o motivo do `dataVersion`):**
   a. Na aba "hoje", lançar `08:00`–`19:30` e exportar o JSON (Ajustes → exportar).
   b. Mudar a saída para `20:30` (o dado agora difere do backup).
   c. **Sem sair da aba "hoje"**, importar o backup do passo (a) e confirmar.
   d. **Esperado: o formulário passa a mostrar `19:30`** — o valor do backup.
   e. Mudar a observação e conferir no `localStorage` que a saída continua `19:30`. **Se aparecer `20:30`, o `dataVersion` não está na key e o import foi sobrescrito.**

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
refactor: dividir TodayScreen em DayScreen e DayEditor

A DayEditor edita exatamente um dia e e renderizada com key={dateStr}, o
que faz o React remontar ao trocar de dia: o formulario reinicializa do dia
novo e o initRef volta a true. O efeito de sincronizacao, que dependia so
de [currentEntry?.start, currentEntry?.end] com eslint-disable, deixa de
existir — e com ele o guard lastSaved, que so existia por causa do eco.

Sem esse efeito, o deslize gravaria a observacao de um dia no dia vizinho
quando os dois tivessem o mesmo start/end: as dependencias nao mudariam, o
efeito nao dispararia e o auto-save gravaria o formulario velho.

A key inclui um dataVersion incrementado so pelo importJSON. Sem ele,
importar um backup com a aba "hoje" aberta deixaria o formulario com o dado
de antes do import (o import nao recarrega a pagina) e a primeira edicao
gravaria por cima do backup — a unica valvula de escape do projeto.

Comportamento visivel inalterado: a tela continua cravada em hoje.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 3: `selectedDate` no `App` e `refMonth` acompanhando o dia

A plumbing da navegação. Ao fim desta tarefa ainda não há gesto — mas a data exibida deixa de ser "hoje" e passa a ser "a data selecionada", e o mês de referência acompanha.

**Files:**
- Modify: `src/App.jsx:1612-1621` (`selectedDate` no `App`), `src/App.jsx` (`selectDate`, o reset da aba, o render), `DayScreen` (recebe `selectedDate`/`onSelectDate`, timer da meia-noite)

**Interfaces:**
- Consumes: `refMonthForDate` da Task 1; `DayScreen`/`DayEditor` da Task 2.
- Produces:
  - `App` tem `selectedDate: string` (`YYYY-MM-DD`) e `selectDate(dateStr: string)`, que seta `selectedDate` **e** `refMonth`.
  - `DayScreen` passa a receber `selectedDate: string` e `onSelectDate: (dateStr: string) => void`.

- [ ] **Step 1: Adicionar `selectedDate` e `selectDate` ao `App`**

Em `src/App.jsx`, logo abaixo de `const [dataVersion, setDataVersion] = useState(0);` (Task 2), acrescentar:

```jsx
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()));
```

E logo abaixo do `persist` (`~1652`), acrescentar:

```jsx
  // Única porta para trocar o dia exibido. O mês de referência acompanha o dia,
  // então o "Acumulado" e a aba de mês sempre mostram o período a que o dia
  // exibido pertence.
  const selectDate = (dateStr) => {
    setSelectedDate(dateStr);
    setRefMonth(refMonthForDate(dateStr));
  };
```

- [ ] **Step 2: A aba "hoje" volta para hoje**

A aba se chama "hoje" — mostrar ontem nela é estranho.

A barra é renderizada como `<TabBar current={currentTab} onChange={setCurrentTab} />` (`src/App.jsx:1901`), e o `TabBar` (`493-512`) chama `onChange('today')` / `onChange('month')`. O ajuste é na prop, no `App`: **não** mexa no `TabBar` nem no `TabButton`.

Trocar a linha `<TabBar current={currentTab} onChange={setCurrentTab} />` por:

```jsx
      <TabBar
        current={currentTab}
        onChange={(tab) => {
          setCurrentTab(tab);
          if (tab === 'today') selectDate(formatDate(new Date()));
        }}
      />
```

Ir para a aba de mês não mexe na data selecionada — só voltar para "hoje" reseta. O `onGoToMonth` da `DayScreen` (`setCurrentTab('month')`) continua como está.

- [ ] **Step 3: Passar `selectedDate` e `onSelectDate` para a `DayScreen`**

No render do `App`, o bloco da `DayScreen` fica:

```jsx
      {currentTab === 'today' ? (
        <DayScreen
          data={data}
          holidaysMap={holidaysMap}
          refMonth={refMonth}
          monthlyTotals={totals}
          lunchConfig={lunchConfig}
          dataVersion={dataVersion}
          selectedDate={selectedDate}
          onSelectDate={selectDate}
          onSaveEntry={saveEntry}
          onDeleteEntry={deleteEntry}
          onOpenSettings={() => setShowSettings(true)}
          onGoToMonth={() => setCurrentTab('month')}
        />
      ) : (
```

- [ ] **Step 4: A `DayScreen` usa `selectedDate`**

Trocar a assinatura e o topo da `DayScreen` (da linha `function DayScreen({` até a linha `const badgeKind = ...`) por:

```jsx
function DayScreen({
  data, holidaysMap, refMonth, monthlyTotals, lunchConfig, dataVersion,
  selectedDate, onSelectDate,
  onSaveEntry, onDeleteEntry, onOpenSettings, onGoToMonth,
}) {
  const [today, setToday] = useState(() => new Date());
  const todayStr = formatDate(today);
  const dateStr = selectedDate;

  // Atualiza "hoje" se o dia mudar (app aberto pela meia-noite).
  // Só arrasta a data selecionada se o usuário estiver justamente no dia que
  // virou — olhando outro dia, ninguém é movido de lugar.
  useEffect(() => {
    const check = setInterval(() => {
      const now = new Date();
      const nowStr = formatDate(now);
      if (nowStr !== formatDate(today)) {
        const wasOnToday = selectedDate === formatDate(today);
        setToday(now);
        if (wasOnToday) onSelectDate(nowStr);
      }
    }, 60_000);
    return () => clearInterval(check);
  }, [today, selectedDate, onSelectDate]);

  const day = parseDate(dateStr);
  const dow = day.getDay();
  const isSunday = dow === 0;
  const isSaturday = dow === 6;
  const isHoliday = holidaysMap.has(dateStr);
  const holidayName = holidaysMap.get(dateStr);
  const badgeKind = isHoliday ? 'holiday' : (isSunday ? 'sunday' : (isSaturday ? 'saturday' : null));
```

O resto da `DayScreen` não muda: ela já usa `dateStr` e `day` em todo lugar.

- [ ] **Step 5: Confirmar que os testes puros continuam passando**

Run: `npm test`
Expected: PASS — 28 testes.

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 6: Verificar à mão**

Run: `npm run dev`

Ainda não há gesto — a verificação aqui é de **regressão**:

1. A tela de hoje continua idêntica e funcionando: lançar, parcial, rebaixamento, "Acumulado".
2. Trocar para a aba de mês e voltar: mostra hoje, "Acumulado" no período de hoje.
3. Na aba de mês, navegar para outro mês pelas setas, voltar para "hoje" e voltar para o mês: **mostra o período de hoje, não o mês navegado.** É a consequência documentada na spec (decisão 2 + decisão 8), não um bug.
4. Nenhum erro no console.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
feat: App passa a ter selectedDate, e refMonth acompanha o dia

selectDate() e a unica porta para trocar o dia exibido: seta selectedDate e
sincroniza refMonth via refMonthForDate, entao o "Acumulado" e a aba de mes
sempre mostram o periodo a que o dia exibido pertence.

A aba "hoje" volta para hoje ao ser aberta — ela se chama "hoje". Isso faz
o refMonth voltar para o periodo de hoje junto, perdendo a navegacao manual
de mes; e a consequencia documentada na spec, aceita.

O timer da meia-noite so move a data selecionada se o usuario estiver
justamente no dia que virou.

Ainda sem gesto: nenhuma mudanca visivel.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 4: O gesto

**Files:**
- Modify: `src/App.jsx` (`DayScreen`: refs do toque, handlers, `onTouchStart`/`onTouchEnd` no contêiner)

**Interfaces:**
- Consumes: `selectedDate`/`onSelectDate` da Task 3.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: Adicionar os handlers do gesto na `DayScreen`**

Logo abaixo do `const badgeKind = ...`, acrescentar:

```jsx
  // Gesto: só coordenadas, sem touchmove e sem preventDefault.
  // Um arrasto horizontal não tem comportamento nativo para cancelar, então o
  // gesto nunca precisa cancelar nada — e portanto não pode quebrar a rolagem
  // vertical por toque, que três commits recentes tiveram que consertar.
  const touchRef = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches.length > 1) { touchRef.current = null; return; }
    const t = e.touches[0];
    // Perto da borda lateral é o "voltar" do iOS no navegador. Em standalone
    // não existe, mas quem usa pelo navegador sofre.
    if (t.clientX < 24 || t.clientX > window.innerWidth - 24) { touchRef.current = null; return; }
    // Arrastar dentro de um campo não troca o dia.
    if (e.target.closest('input, textarea, button')) { touchRef.current = null; return; }
    touchRef.current = { x0: t.clientX, y0: t.clientY };
  };

  const handleTouchEnd = (e) => {
    const t0 = touchRef.current;
    touchRef.current = null;
    if (!t0) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - t0.x0;
    const dy = t.clientY - t0.y0;
    if (Math.abs(dx) <= 60 || Math.abs(dx) <= Math.abs(dy) * 2) return;

    // Esquerda avança um dia, direita volta um dia.
    const delta = dx < 0 ? 1 : -1;
    const next = formatDate(addDays(parseDate(dateStr), delta));
    // Passado é livre; para frente trava em hoje. Sem aviso: a ausência de
    // movimento é o feedback, e um toast para um gesto acidental é ruído.
    if (next > todayStr) return;
    onSelectDate(next);
  };
```

`addDays` e `parseDate` já existem (`src/App.jsx:18` e `23`). A comparação `next > todayStr` funciona por serem strings `YYYY-MM-DD`, que ordenam lexicograficamente igual à ordem cronológica.

- [ ] **Step 2: Ligar os handlers ao contêiner da `DayScreen`**

Trocar a `<div>` de abertura do return da `DayScreen` por:

```jsx
    <div
      className="px-4 pt-5 max-w-md mx-auto animate-screen-in"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
```

Nenhum `touch-action`, nenhum CSS novo, nenhum `preventDefault`.

- [ ] **Step 3: Confirmar que os testes puros continuam passando**

Run: `npm test`
Expected: PASS — 28 testes.

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 4: Verificar à mão — no aparelho ou com emulação de toque**

Run: `npm run dev`

O gesto é de toque: no desktop, ativar a emulação de dispositivo do DevTools (Toggle device toolbar), senão `onTouchStart` não dispara.

1. Deslizar para a direita: volta um dia. O hero muda de data.
2. Deslizar para a esquerda: avança um dia.
3. **Estando em hoje, deslizar para a esquerda não faz nada.** Sem erro, sem toast.
4. Voltar vários dias, cruzando a virada 25 → 26: o "Acumulado" muda de período.
5. **Rolagem vertical continua funcionando por toque**, inclusive com o dedo começando em cima do card de lançamento. (Se quebrou, alguém pôs `preventDefault` ou CSS de overflow.)
6. Rolar na vertical não troca o dia sem querer.
7. Arrastar na horizontal **dentro de um campo de hora** não troca o dia.
8. **O cenário do `key` (o motivo da Task 2):** montar dois dias seguidos com o **mesmo** `start`/`end` e observações diferentes ("reunião" e "obra"). Deslizar de um para o outro. Esperado: o formulário mostra a observação **do dia exibido**. Editar a saída e conferir no `localStorage` que a observação do vizinho **não** foi copiada por cima.
9. Editar um dia navegado: grava no dia certo (conferir a chave no `localStorage`).
10. Lançamento parcial num dia navegado: grava `{ start }` e mostra o aviso âmbar.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
feat: deslizar lateralmente troca o dia na tela principal

Gesto por coordenadas: touchstart grava a origem, touchend mede e troca o
dia se |dx| > 60 e |dx| > |dy| * 2. Sem touchmove, sem preventDefault, sem
CSS novo, sem dependencia nova — um arrasto horizontal nao tem
comportamento nativo para cancelar, entao o gesto nao pode quebrar a
rolagem vertical por toque.

Guardas: multitoque, 24px das bordas laterais (o "voltar" do iOS no
navegador) e arrasto dentro de input/textarea/button.

Passado e livre; para frente trava em hoje, em silencio.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 5: Rótulo do hero, volta para hoje e a animação

Fecha a feature pelo lado de quem usa: dizer que dia é esse, deixar voltar, e dar o feedback do gesto.

**Files:**
- Modify: `src/App.jsx:288-294` (keyframes), `DayScreen` (hero), `DayEditor` (classe da animação e os textos com "hoje")

**Interfaces:**
- Consumes: `selectedDate`/`onSelectDate` da Task 3; o gesto da Task 4.
- Produces: nada.

- [ ] **Step 1: Adicionar os keyframes horizontais**

A `.animate-screen-in` existente é **vertical** (`translateY(8px)`) — errada para troca de dia. No bloco `<style>` do `FontStyles`, trocar as linhas `288-294` por:

```
      @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @keyframes screen-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes day-in-left { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
      @keyframes day-in-right { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }

      .animate-fade-in { animation: fade-in 0.18s ease-out; }
      .animate-slide-up { animation: slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1); }
      .animate-screen-in { animation: screen-in 0.22s ease-out; }
      .animate-day-in-left { animation: day-in-left 0.2s ease-out; }
      .animate-day-in-right { animation: day-in-right 0.2s ease-out; }
```

Como `#root` tem `overflow-x: clip`, um `translateX` não cria barra nem overflow. **Não mexer no `src/index.css`.**

- [ ] **Step 2: A `DayScreen` informa a direção e o rótulo**

Acrescentar, logo abaixo do `const touchRef = useRef(null);`:

```jsx
  const [dayAnim, setDayAnim] = useState(null);
```

No `handleTouchEnd`, trocar as duas últimas linhas (`if (next > todayStr) return;` e `onSelectDate(next);`) por:

```jsx
    if (next > todayStr) return;
    setDayAnim(delta > 0 ? 'left' : 'right');
    onSelectDate(next);
```

Acrescentar, logo abaixo do `const badgeKind = ...`:

```jsx
  const yesterdayStr = formatDate(addDays(parseDate(todayStr), -1));
  const heroLabel = dateStr === todayStr ? 'Hoje'
    : dateStr === yesterdayStr ? 'Ontem'
    : formatDateBR(dateStr);
  const isToday = dateStr === todayStr;
```

"Amanhã" não entra: o limite da spec impede chegar lá. `formatDateBR` já existe (`src/App.jsx:29`).

- [ ] **Step 3: O rótulo do hero vira botão fora de hoje**

Trocar o bloco do rótulo (`<div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-medium mb-2">Hoje</div>`) por:

```jsx
        {isToday ? (
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-medium mb-2">
            Hoje
          </div>
        ) : (
          <button
            onClick={() => { setDayAnim('right'); onSelectDate(todayStr); }}
            className="mb-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.18em] text-amber-400/90 font-medium hover:text-amber-300 transition"
          >
            {heroLabel}
            <span className="normal-case tracking-normal text-stone-500">· voltar para hoje</span>
          </button>
        )}
```

- [ ] **Step 4: A `DayEditor` toca a animação ao remontar**

A `DayEditor` remonta a cada troca de dia, então a animação toca sozinha. Passar a direção:

No render da `DayScreen`, trocar o bloco `<DayEditor … />` por:

```jsx
      <DayEditor
        key={`${dateStr}:${dataVersion}`}
        dateStr={dateStr}
        entry={data.entries[dateStr]}
        holidaysMap={holidaysMap}
        lunchConfig={lunchConfig}
        anim={dayAnim}
        onSaveEntry={onSaveEntry}
        onDeleteEntry={onDeleteEntry}
      />
```

Na `DayEditor`, trocar a assinatura por:

```jsx
function DayEditor({ dateStr, entry, holidaysMap, lunchConfig, anim, onSaveEntry, onDeleteEntry }) {
```

E trocar o `<>` de abertura do return por:

```jsx
    <div className={anim === 'left' ? 'animate-day-in-left' : anim === 'right' ? 'animate-day-in-right' : undefined}>
```

E o `</>` de fechamento por `</div>`.

- [ ] **Step 5: Os textos que dizem "hoje"**

Com a tela mostrando outro dia, "Horas extras de hoje" mente. A spec não cita esses textos, mas eles são parte de a tela dizer a verdade sobre o dia exibido. Na `DayEditor`:

- `Horas extras de hoje` → `Horas extras do dia`
- `Hoje não houve horas extras` → `Sem horas extras neste dia`
- `Limpar lançamento de hoje` → `Limpar lançamento do dia`

- [ ] **Step 6: Confirmar que os testes puros continuam passando**

Run: `npm test`
Expected: PASS — 28 testes.

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 7: Verificar à mão**

Run: `npm run dev` (com emulação de toque para o gesto)

1. Em hoje: o rótulo é o texto "Hoje", **não** é botão (não tem hover, não clica).
2. Deslizar para trás um dia: o rótulo vira "Ontem · voltar para hoje", em âmbar, clicável.
3. Deslizar mais um: o rótulo vira a data (`12/07/2026`).
4. Tocar no rótulo: volta para hoje, com animação.
5. A animação entra pelo lado certo: deslizando para trás (dia anterior) ela vem da esquerda; para frente, da direita.
6. **Nenhuma barra de rolagem horizontal aparece** durante a animação.
7. **A rolagem vertical continua funcionando por toque.**
8. Os três textos novos aparecem: "Horas extras do dia", "Limpar lançamento do dia", e "Sem horas extras neste dia" num dia sem extra.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
feat: rotulo do hero, volta para hoje e animacao horizontal

O rotulo do hero passa a dizer que dia esta em tela: "Hoje", "Ontem" ou a
data. Fora de hoje ele vira botao e volta para hoje — nenhum elemento novo
na tela, e o alvo ja esta onde o olho procura.

A .animate-screen-in existente e vertical (translateY), errada para troca
de dia. Dois keyframes horizontais novos, aplicados na DayEditor, que
remonta a cada troca: a animacao toca sozinha. Como #root tem
overflow-x: clip, o translateX nao cria barra nem overflow.

Os textos que diziam "hoje" passam a falar do dia exibido: numa tela
mostrando ontem, "Horas extras de hoje" mentia.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 6: Verificação de dados de ponta a ponta

A feature não muda a forma do dado, então não há problema de compatibilidade como na spec 1. Mas ela mexe em **onde** o formulário grava, e é aí que mora o risco. Esta tarefa **prova rodando** que nenhum dos dois caminhos de perda está aberto, em vez de confiar na leitura.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-deslize-entre-dias-design.md` (registrar o resultado)

**Interfaces:**
- Consumes: tudo das tarefas 1-5.
- Produces: nada.

- [ ] **Step 1: Montar o cenário do `key`**

Run: `npm run dev` (com emulação de toque)

No `localStorage`, montar **dois dias seguidos com `start` e `end` idênticos e observações diferentes** — é o cenário exato que o efeito antigo errava:

```json
"2026-07-12": { "start": "08:00", "end": "17:00", "note": "reuniao" },
"2026-07-13": { "start": "08:00", "end": "17:00", "note": "obra" }
```

- [ ] **Step 2: Provar que o vínculo formulário↔dia está certo**

1. Abrir o dia 12. O formulário mostra "reuniao".
2. Deslizar para o dia 13. **O formulário mostra "obra"** — não "reuniao".
3. No dia 13, mudar a saída para `18:00`.
4. Conferir no `localStorage`: o dia 13 é `{start:'08:00', end:'18:00', note:'obra'}` e **o dia 12 continua `{start:'08:00', end:'17:00', note:'reuniao'}`, intacto**.
5. Deslizar de volta para o 12: o formulário mostra "reuniao" e `17:00`.

- [ ] **Step 3: Provar que o import não é sobrescrito**

1. Na aba "hoje", lançar `08:00`–`19:30` e exportar o JSON (Ajustes → exportar).
2. Mudar a saída para `20:30`.
3. **Sem sair da aba "hoje"**, importar o backup e confirmar.
4. O formulário passa a mostrar `19:30`.
5. Editar a observação e conferir no `localStorage` que a saída continua `19:30`.

- [ ] **Step 4: Provar que a rolagem não quebrou**

Este projeto tem três commits só para consertar rolagem (`9a4247b`, `d3037d4`, `4a38b80`).

1. Rolar a tela principal na vertical **por toque**, com o dedo começando em cima do card de lançamento. Tem que rolar.
2. Rolar na vertical não troca o dia.
3. Nenhuma barra de rolagem horizontal, nem durante a animação.
4. Conferir que `src/index.css` **não foi tocado**: `git diff main -- src/index.css` tem que sair vazio.

- [ ] **Step 5: Regressão da spec 1**

1. Lançamento parcial num dia navegado: grava `{ start }` sem a chave `end`, aviso âmbar aparece.
2. `EM ABERTO` continua aparecendo na lista do mês.
3. Num dia completo, tocar na saída e digitar `1945`: o campo fica `19:45`, **não** `94:5`.
4. O modal da aba de mês continua aceitando só a entrada.

- [ ] **Step 6: Rodar a verificação final**

Run: `npm test`
Expected: PASS — 28 testes.

Run: `npm run build`
Expected: build sem erros.

Run: `git diff main -- src/index.css`
Expected: vazio.

- [ ] **Step 7: Registrar o resultado na spec**

Em `docs/superpowers/specs/2026-07-14-deslize-entre-dias-design.md`, na seção "Risco de dados", acrescentar ao final:

```markdown
**Verificado em execução em 2026-07-14** (Task 6 do plano): os dois caminhos de perda
foram exercitados no navegador. Dois dias seguidos com o mesmo `start`/`end` e observações
diferentes — o cenário exato que o efeito antigo errava: deslizar de um para o outro mostra
a observação do dia certo, e editar o dia novo não toca o vizinho. Importar um backup com a
aba "hoje" aberta passa a refletir na tela, e a edição seguinte não ressuscita o valor de
antes do import. A rolagem vertical por toque continua funcionando e o `src/index.css` não
foi tocado.
```

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-07-14-deslize-entre-dias-design.md
git commit -F- <<'EOF'
docs: registrar verificacao de dados do deslize entre dias

Os dois caminhos de perda que a spec identificou foram exercitados rodando,
em vez de confiar na leitura: o vinculo formulario<->dia (dois dias com o
mesmo start/end e observacoes diferentes) e o importJSON com a aba "hoje"
aberta. A rolagem vertical por toque tambem foi conferida.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Cobertura da spec

| Requisito da spec | Onde |
|---|---|
| Decisão 1 — dias navegados são editáveis | Task 3 (`dateStr` = `selectedDate`), Task 4 (gesto) |
| Decisão 2 — `refMonth` acompanha o dia | Task 3 (`selectDate`) |
| Decisão 3 — `DayScreen` + `DayEditor` | Task 2 |
| Decisão 4 — gesto por coordenadas, sem `preventDefault` | Task 4 |
| Decisão 5 — sem arrasto acompanhando o dedo | Task 4 (nenhum `touchmove`) |
| Decisão 6 — `selectedDate` no `App`, `refMonthForDate` | Task 1 (função), Task 3 (estado) |
| Decisão 7 — passado livre, futuro trava em hoje | Task 4 (`if (next > todayStr) return`) |
| Decisão 8 — a aba "hoje" volta para hoje | Task 3 (`onClick` da aba) |
| Decisão 9 — rótulo do hero volta para hoje | Task 5 |
| `key` elimina o vínculo formulário↔dia | Task 2, provado em Task 6 |
| `dataVersion` protege o `importJSON` | Task 2, provado em Task 6 |
| Efeito de sincronização e `lastSaved` deletados | Task 2 |
| Guardas do gesto (multitoque, borda, campos) | Task 4 |
| Keyframes horizontais | Task 5 |
| Timer da meia-noite não arrasta quem olha outro dia | Task 3 |
| Feriados em anos não inicializados | Nenhuma tarefa: `ensureYearsInitialized` já roda quando `refMonth` muda (`1635-1644`), e a decisão 2 faz `refMonth` acompanhar o dia |
| Rolagem não quebra | Task 4 e Task 6 verificam; nenhuma tarefa toca CSS |
| Forma do dado, somatório, Excel, WhatsApp, migração, `EntryEditor` intocados | Nenhuma tarefa os toca |

## Fora de escopo

Da spec, e não implementado por nenhuma tarefa acima:

- Arrasto acompanhando o dedo.
- Deslize na aba de mês.
- Navegar para outro dia a partir da aba de mês (continua abrindo o modal).
- Unificar a duplicação de formulário entre `EntryEditor` e `DayEditor`.
- A migração destrutiva (`230-231`, `248`).
