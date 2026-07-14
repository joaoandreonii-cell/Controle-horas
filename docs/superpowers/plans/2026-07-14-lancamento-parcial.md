# Lançamento Parcial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir gravar a entrada de um dia sem a saída ("em aberto"), sem contabilizar no somatório mensal e com sinalização visual.

**Architecture:** As regras de lançamento saem do `src/App.jsx` (1900+ linhas, tudo num arquivo) para um módulo puro novo, `src/entry.js`, sem React e sem DOM. Ele passa a ser a única fonte de verdade sobre o que é um lançamento válido, quando gravar e quando um dia conta para o somatório. O `App.jsx` importa e chama. Só o módulo puro tem testes automatizados; as telas são verificadas à mão no aparelho.

**Tech Stack:** React 18 + Vite 5 + Tailwind 3, PWA via vite-plugin-pwa. Persistência em `localStorage`, sem backend. Vitest entra nesta entrega como primeira devDependency de teste do projeto.

## Global Constraints

Valem para toda tarefa. Copiados da spec `docs/superpowers/specs/2026-07-14-lancamento-parcial-design.md`.

- **Regra central:** entrada sozinha é válida e é gravada; saída sozinha nunca grava.
- **Forma do dado:** `end` é **omitido** quando ausente. Nunca gravar `end: ''`.
- **Um lançamento parcial não entra no somatório mensal.**
- **Não tocar** em `controle_horas_v3`, na migração (`src/App.jsx:212-254`) nem no `importJSON` (`src/App.jsx:1733`). Nenhuma chave nova, nenhuma migração.
- **Não tocar** nas regras de overflow de `src/index.css` (`html`, `body`, `#root` usam `overflow-x: clip`). Três commits recentes (`9a4247b`, `d3037d4`, `4a38b80`) consertaram rolagem; nada aqui precisa mexer nisso.
- **Testes só de funções puras.** Nada de React Testing Library, nada de teste de componente.
- **Strings de UI em português**, seguindo o tom minúsculo/curto do app existente.
- **PWA `autoUpdate`** (`vite.config.js:9`) mascara deploys. Em toda verificação manual, forçar a atualização do service worker (DevTools → Application → Service Workers → Update, ou hard reload), senão a mudança parece não ter subido.
- **Commits:** um por tarefa, sempre no branch `feat/lancamento-parcial`, **nunca na
  `main`**. Terminar toda mensagem com
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Squash no fim:** o dono do projeto quer **um único commit no branch, ao final do plano
  2** (deslize entre dias). Os commits por tarefa são checkpoints de trabalho e serão
  esmagados num só quando o plano 2 terminar. Eles existem porque a Task 6 depende de
  `git checkout HEAD -- src/App.jsx` para restaurar o código — sem os commits, esse passo
  apagaria a implementação inteira de forma irrecuperável. **Não faça o squash antes do
  fim do plano 2. Não faça merge na `main` nem abra PR sem pedir.**

---

### Task 1: Módulo puro `src/entry.js` + setup do Vitest

Estabelece a fundação: o projeto ganha testes, `parseHM` sai do `App.jsx` e nasce `entryState`, que nomeia o conceito de dia vazio/em aberto/completo. **Comportamento do app não muda nesta tarefa** — é refactor mais rede de testes.

**Files:**
- Create: `src/entry.js`
- Create: `src/entry.test.js`
- Create: `vitest.config.js`
- Modify: `package.json` (script `test` + devDependency `vitest`)
- Modify: `src/App.jsx:84-89` (remover `parseHM`), `src/App.jsx:1` (import), `src/App.jsx:1675` (usar `entryState`)

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces:
  - `parseHM(s: string) => number | null` — minutos desde a meia-noite, `null` se inválido.
  - `entryState(entry: object | undefined) => 'empty' | 'partial' | 'complete'`.

- [ ] **Step 1: Instalar o vitest**

```bash
npm i -D vitest
```

- [ ] **Step 2: Criar `vitest.config.js`**

Config própria, separada do `vite.config.js`, para que o plugin do PWA não seja carregado durante os testes. O `vitest.config.js` tem precedência sobre o `vite.config.js`.

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
})
```

- [ ] **Step 3: Adicionar o script de teste ao `package.json`**

No bloco `"scripts"`, deixar assim:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 4: Escrever o teste que falha**

Criar `src/entry.test.js`:

```js
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
```

- [ ] **Step 5: Rodar o teste e confirmar que falha**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./entry"` (o módulo ainda não existe).

- [ ] **Step 6: Criar `src/entry.js`**

O `parseHM` é movido tal e qual de `src/App.jsx:84-89`, sem alteração de comportamento.

```js
/* ═════════════════════════════════════════════════════════════════════════
   ENTRADAS — regras puras de lançamento
   Sem React, sem DOM. Fonte única de verdade sobre o que é um lançamento
   válido, quando gravar, e quando um dia conta para o somatório.
   ═════════════════════════════════════════════════════════════════════════ */

export const parseHM = (s) => {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

// Estado do que está gravado num dia:
//   'empty'    — nada registrado
//   'partial'  — entrada registrada, saída ainda não ("em aberto")
//   'complete' — entrada e saída presentes; só este entra no somatório
//
// Checa presença, não validade: quem soma ainda precisa validar os horários,
// porque um backup importado pode trazer texto inválido.
export function entryState(entry) {
  if (!entry || !entry.start) return 'empty';
  if (!entry.end) return 'partial';
  return 'complete';
}
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `npm test`
Expected: PASS — 5 testes passando.

- [ ] **Step 8: Ligar o `App.jsx` ao módulo novo**

Em `src/App.jsx`, logo após o `import * as XLSX from 'xlsx';` (linha 7), adicionar:

```js
import { parseHM, entryState } from './entry';
```

Remover as linhas 84-89 (a definição antiga do `parseHM`) por completo. As 14 chamadas a `parseHM(...)` no arquivo continuam funcionando sem alteração, agora resolvidas pelo import.

- [ ] **Step 9: Usar `entryState` na guarda do somatório**

Em `src/App.jsx:1675`, trocar:

```js
      if (!e || !e.start || !e.end) { ots[ds] = null; continue; }
```

por:

```js
      if (entryState(e) !== 'complete') { ots[ds] = null; continue; }
```

A linha seguinte (`const sm = parseHM(e.start); const em = parseHM(e.end);`) e a validação de `1677` **permanecem intactas** — `entryState` checa presença, elas checam validade.

- [ ] **Step 10: Confirmar que o app continua idêntico**

Run: `npm run build`
Expected: build sem erros.

Run: `npm run dev` e abrir no navegador. Verificar que:
- um dia completo continua mostrando o horário e o total;
- o "Acumulado" do mês continua com o mesmo valor de antes da mudança;
- nenhum erro no console.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/entry.js src/entry.test.js src/App.jsx
git commit -F- <<'EOF'
refactor: extrair parseHM e entryState para modulo puro testavel

Primeira infraestrutura de teste do projeto (vitest, so funcoes puras).
O parseHM sai do App.jsx sem alteracao de comportamento e nasce o
entryState, que nomeia os tres estados de um dia: empty, partial e
complete. A guarda do somatorio (1675) passa a usa-lo.

Comportamento do app inalterado.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 2: Regras do lançamento parcial — `buildEntryPayload` e `sameEntry`

As duas funções novas que carregam a regra da feature. **Ainda não ligadas ao app** — esta tarefa entrega a regra provada em isolamento, e um revisor pode aprová-la ou rejeitá-la sem olhar uma linha de UI.

**Files:**
- Modify: `src/entry.js` (adicionar duas funções)
- Modify: `src/entry.test.js` (adicionar dois blocos `describe`)

**Interfaces:**
- Consumes: `parseHM` da Task 1.
- Produces:
  - `buildEntryPayload({ start, end, breaks, note }) => object | null` — o que gravar; `null` quando não há nada válido a gravar.
  - `sameEntry(entry, payload) => boolean` — se o gravado já é igual ao que seria gravado.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/entry.test.js`, e trocar a linha de import do topo por:

```js
import { parseHM, entryState, buildEntryPayload, sameEntry } from './entry';
```

```js
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
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — `buildEntryPayload is not a function` e `sameEntry is not a function`.

- [ ] **Step 3: Implementar as duas funções**

Adicionar ao final de `src/entry.js`:

```js
// Monta o que vai ser gravado a partir do formulário.
// Retorna null quando não há nada válido a gravar — a regra é que saída
// sozinha não vale. Saída inválida ou igual à entrada não impede o registro
// da entrada: o dia fica em aberto.
export function buildEntryPayload({ start, end, breaks, note }) {
  const sm = parseHM(start);
  if (sm == null) return null;

  const payload = { start };

  const em = parseHM(end);
  if (em != null && em !== sm) payload.end = end;

  const validBreaks = (breaks || []).filter(
    (b) => parseHM(b.start) != null && parseHM(b.end) != null
  );
  if (validBreaks.length > 0) payload.breaks = validBreaks;

  if (note && note.trim()) payload.note = note.trim();

  return payload;
}

// Compara o que está gravado com o que seria gravado, tratando campo ausente
// e campo vazio como equivalentes. Sem isso, um lançamento parcial regrava a
// cada render e pisca o toast de "Salvo" à toa.
export function sameEntry(entry, payload) {
  if (!entry || !payload) return false;
  if (entry.start !== payload.start) return false;
  if ((entry.end || '') !== (payload.end || '')) return false;
  if ((entry.note || '') !== (payload.note || '')) return false;

  const a = entry.breaks || [];
  const b = payload.breaks || [];
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.start === b[i].start && x.end === b[i].end);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — 22 testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/entry.js src/entry.test.js
git commit -F- <<'EOF'
feat: regras do lancamento parcial em funcoes puras

buildEntryPayload monta o que gravar: entrada sozinha vale e sai como
{ start } com o end omitido; saida sozinha retorna null; saida invalida
ou igual a entrada deixa o dia em aberto sem bloquear o registro da
entrada.

sameEntry compara gravado com o que seria gravado tratando campo ausente
e vazio como equivalentes, para nao regravar a toa.

Ainda nao ligadas ao App.jsx.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 3: Tela principal — auto-save parcial e sinalização

Liga a regra ao auto-save do `TodayScreen` e mostra ao usuário que falta a saída. Sinalização e auto-save vão juntos de propósito: gravar o parcial sem avisar cria um estado mudo na tela.

**Files:**
- Modify: `src/App.jsx:1210-1233` (auto-save), `src/App.jsx:2-6` (import do ícone), `src/App.jsx:1235-1238` (flag), `src/App.jsx:1329` (aviso novo antes do de `invalidTime`)

**Interfaces:**
- Consumes: `buildEntryPayload`, `sameEntry` da Task 2.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: Importar `buildEntryPayload` e `sameEntry`**

Na linha de import criada na Task 1, deixar assim:

```js
import { parseHM, entryState, buildEntryPayload, sameEntry } from './entry';
```

- [ ] **Step 2: Importar o ícone `Clock`**

No bloco de import do `lucide-react` (linhas 2-6), acrescentar `Clock`:

```js
import {
  ChevronLeft, ChevronRight, Settings, X, Plus, Copy,
  Check, Trash2, Calendar, Sparkles, AlertTriangle, Wand2,
  Home, CalendarDays, Pencil, Download, Upload, Moon, FileSpreadsheet,
  Clock,
} from 'lucide-react';
```

- [ ] **Step 3: Reescrever o auto-save**

Trocar o bloco inteiro de `src/App.jsx:1209-1233` por:

```jsx
  // Auto-save: grava a entrada assim que ela for válida, mesmo sem a saída.
  // Apagar a saída de um dia completo rebaixa o dia para "em aberto".
  useEffect(() => {
    if (initRef.current) { initRef.current = false; return; }
    const payload = buildEntryPayload({ start, end, breaks, note });
    if (!payload) return;
    if (sameEntry(currentEntry, payload)) return;

    onSaveEntry(todayStr, payload);
    setShowSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setShowSaved(false), 1600);
  }, [start, end, breaks, note]); // eslint-disable-line
```

- [ ] **Step 4: Adicionar a flag da saída faltante**

Logo abaixo de `const isNightShift = ...` (linha 1238), acrescentar:

```jsx
  const missingEnd = todaySm != null && !end;
```

A flag olha só para o campo vazio, não para horário incompleto. Enquanto o usuário digita ("1", "12", "12:3"), `parseHM` devolve `null` mas o campo não está vazio — sem isso, o aviso piscaria a cada tecla.

- [ ] **Step 5: Adicionar o aviso na tela**

Em `src/App.jsx`, imediatamente **antes** do bloco `{invalidTime && (` (linha 1329), inserir:

```jsx
          {missingEnd && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-950/40 border border-amber-900/50 text-amber-300 text-xs">
              <Clock size={13} className="flex-shrink-0" />
              Falta a saída — não entra no somatório
            </div>
          )}
```

Mesmo formato dos avisos que já existem ali (`invalidTime` em rosa, `isNightShift` em índigo). Os dois são excludentes com este: `invalidTime` exige os dois campos preenchidos.

- [ ] **Step 6: Confirmar que os testes puros continuam passando**

Run: `npm test`
Expected: PASS — 22 testes.

- [ ] **Step 7: Verificar à mão**

Run: `npm run dev`

Com o DevTools aberto (Application → Local Storage → chave `controle_horas_v3`):

1. Num dia vazio, digitar só a entrada `08:00`. Esperado: o toast "Salvo" aparece; o aviso âmbar "Falta a saída — não entra no somatório" aparece; no localStorage o dia é `{"start":"08:00"}` **sem a chave `end`**.
2. Conferir que o "Acumulado" do mês **não mudou**.
3. Digitar a saída `17:00`. Esperado: o aviso âmbar some, o card de horas extras aparece, o "Acumulado" passa a incluir o dia.
4. Apagar o campo da saída. Esperado: o dia volta a `{"start":"08:00"}` no localStorage, o aviso âmbar volta, o "Acumulado" desconta as horas.
5. Apagar a entrada deixando só a saída `17:00`. Esperado: **nada é gravado** — o dia some do localStorage ou fica como estava.
6. Recarregar a página com um dia parcial. Esperado: a entrada reaparece preenchida, a saída vazia, o aviso âmbar presente.
7. Digitar entrada e saída **iguais** (`08:00`/`08:00`). Esperado: o aviso rosa "Entrada e saída não podem ser iguais" aparece e o gravado é `{"start":"08:00"}`.
8. Conferir que o toast "Salvo" **não fica piscando** sozinho num dia parcial em repouso.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
feat: tela principal grava lancamento parcial e sinaliza saida faltante

O auto-save passa a usar buildEntryPayload/sameEntry: a entrada e gravada
assim que valida, mesmo sem a saida, e apagar a saida de um dia completo
rebaixa o dia para "em aberto". Saida sem entrada continua nao gravando.

Aviso ambar "Falta a saida" no mesmo padrao dos avisos ja existentes,
mostrado so quando o campo esta vazio (nao enquanto se digita).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 4: Modal do mês — mesma regra no `EntryEditor`

O modal aberto pela tela de mês precisa aceitar a mesma coisa que a tela principal, senão o app recusa numa tela o que aceita na outra. Ele mantém o salvamento explícito por botão — só a validação e a montagem do payload mudam.

**Files:**
- Modify: `src/App.jsx:645-663` (`handleSave`)

**Interfaces:**
- Consumes: `buildEntryPayload`, `parseHM` da Task 2 / Task 1.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: Reescrever o `handleSave`**

Trocar o bloco de `src/App.jsx:645-663` por:

```jsx
  const handleSave = () => {
    if (!start) { setError('Informe a entrada'); return; }
    if (sm == null) { setError('Horário de entrada inválido'); return; }
    if (end) {
      if (em == null) { setError('Horário de saída inválido'); return; }
      if (em === sm) { setError('Entrada e saída não podem ser iguais'); return; }
    }
    for (const b of breaks) {
      if (!b.start || !b.end) { setError('Preencha todos os campos das pausas'); return; }
      const bs = parseHM(b.start);
      const be = parseHM(b.end);
      if (bs == null || be == null) { setError('Horário de pausa inválido'); return; }
      if (be <= bs) { setError('Fim da pausa deve ser após o início'); return; }
    }
    setError('');
    onSave(buildEntryPayload({ start, end, breaks, note }));
    onClose();
  };
```

`sm` e `em` já existem no escopo (linhas 641-642). O modal **bloqueia** uma saída malformada em vez de silenciosamente rebaixar para `{ start }`, porque aqui o salvamento é explícito: descartar em silêncio o que o usuário digitou e acabou de mandar salvar seria pior. Com o campo **vazio**, salva `{ start }` — que é a regra da spec.

- [ ] **Step 2: Confirmar que os testes puros continuam passando**

Run: `npm test`
Expected: PASS — 22 testes.

- [ ] **Step 3: Verificar à mão**

Run: `npm run dev`

Na aba do mês, tocar num dia para abrir o modal:

1. Preencher só a entrada `08:00` e salvar. Esperado: salva; no localStorage o dia é `{"start":"08:00"}` sem `end`.
2. Reabrir o mesmo dia. Esperado: a entrada aparece preenchida e a saída vazia.
3. Preencher só a saída e salvar. Esperado: erro "Informe a entrada", não salva.
4. Entrada `08:00` e saída `08:00`, salvar. Esperado: erro "Entrada e saída não podem ser iguais", não salva.
5. Abrir um dia completo, apagar a saída e salvar. Esperado: rebaixa para `{"start":"08:00"}` e o "Acumulado" desconta.
6. Regressão: um dia completo normal continua salvando igual, e as validações de pausa continuam funcionando.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
feat: modal do mes aceita lancamento parcial

O EntryEditor passa a exigir so a entrada. Com a saida preenchida, valida
como antes; com a saida vazia, salva { start }. A montagem do payload sai
do handleSave e passa a usar buildEntryPayload, alinhando a regra com a
tela principal.

Mantido o salvamento explicito por botao: saida malformada bloqueia em vez
de rebaixar, porque num salvamento explicito descartar em silencio o que
foi digitado seria pior.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 5: Lista do mês — "EM ABERTO" no `DayRow`

Sem isto, um lançamento parcial fica invisível na tela onde ele mais importa: a lista do mês o mostraria como um dia em branco.

**Files:**
- Modify: `src/App.jsx:534-614` (`DayRow`)

**Interfaces:**
- Consumes: `entryState` da Task 1.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: Calcular o estado no topo do `DayRow`**

Logo abaixo de `const breaksCount = entry?.breaks?.length || 0;` (linha 539), acrescentar:

```jsx
  const state = entryState(entry);
```

- [ ] **Step 2: Mostrar o horário em aberto com traço**

Trocar a abertura do ternário em `src/App.jsx:565` — de `{entry?.start && entry?.end ? (` — e o bloco do horário, de forma que fique assim:

```jsx
          {state !== 'empty' ? (
            <div>
              <div className="text-sm text-stone-200 tabular-nums"
                   style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {entry.start} <span className="text-stone-600">→</span>{' '}
                {state === 'complete'
                  ? entry.end
                  : <span className="text-stone-600">——</span>}
              </div>
```

O restante do bloco (`breaksCount > 0`, `entry?.note`, o `) : (` com o `tocar para lançar`) permanece exatamente como está.

- [ ] **Step 3: Mostrar "em aberto" na coluna da direita**

Trocar o bloco de `src/App.jsx:596-615` por:

```jsx
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
          ) : state === 'partial' ? (
            <div className="text-[10px] text-amber-400/90 uppercase tracking-wider">em aberto</div>
          ) : ot && ot.total === 0 && entry?.start ? (
            <div className="text-[10px] text-stone-600 uppercase tracking-wider">no ponto</div>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-stone-700 ml-auto" />
          )}
        </div>
```

A ordem importa: o ramo `partial` tem que vir **antes** do `no ponto`. Num dia parcial o `ot` é `null`, então `ot && ot.total === 0` é falso e a linha cairia no ponto cinza, ficando idêntica a um dia vazio.

- [ ] **Step 4: Confirmar que os testes puros continuam passando**

Run: `npm test`
Expected: PASS — 22 testes.

- [ ] **Step 5: Verificar à mão**

Run: `npm run dev`

Na aba do mês:

1. Com um dia parcial gravado, a linha mostra `08:00 → ——` à esquerda e `EM ABERTO` em âmbar à direita.
2. Um dia completo com extra continua mostrando o horário e a duração em âmbar com as bolinhas.
3. Um dia completo sem extra continua mostrando `NO PONTO`.
4. Um dia vazio continua mostrando `tocar para lançar` e o ponto cinza.
5. Um dia parcial **num feriado**: o `EM ABERTO` aparece à direita e o nome do feriado na sublinha, sem colidir.
6. Tocar num dia parcial abre o modal com a entrada preenchida.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
feat: lista do mes sinaliza lancamento em aberto

DayRow passa a usar entryState e ganha um estado intermediario: dia
parcial mostra "08:00 -> --" a esquerda e EM ABERTO em ambar a direita,
no mesmo slot tipografico do "no ponto".

O slot da direita foi escolhido por ser o unico sem colisao: a sublinha
ja e do nome do feriado e a borda ambar do card ja significa "hoje".

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 6: Verificação de compatibilidade com a versão antiga

A feature muda a forma do dado gravado, e o PWA roda com `autoUpdate` — parte dos usuários fica na versão antiga por um tempo após o deploy. A spec afirma, com base em leitura do código, que nenhum caminho perde dado. Esta tarefa **prova isso rodando**, em vez de confiar na leitura.

**Files:**
- Nenhum. Tarefa de verificação; não produz código.

**Interfaces:**
- Consumes: tudo das tarefas 1-5.
- Produces: nada.

- [ ] **Step 1: Gravar um parcial com a versão nova**

Run: `npm run dev`

Criar um dia parcial (`{"start":"08:00"}`) e um dia completo com extra. No DevTools, copiar o conteúdo da chave `controle_horas_v3` para um arquivo à parte.

- [ ] **Step 2: Voltar o código para a versão anterior à feature**

```bash
git stash list
git log --oneline -8
git checkout main -- src/App.jsx
```

Isto devolve o `src/App.jsx` ao estado da `main` (sem a feature), preservando o `localStorage` do navegador, que é onde o dado vive.

- [ ] **Step 3: Rodar a versão antiga contra o dado novo**

Run: `npm run dev` e recarregar com hard reload (Ctrl+Shift+R). Verificar, com o console aberto:

1. **Nenhum erro** no console e nenhum `NaN` em tela.
2. O "Acumulado" do mês mostra **exatamente** as horas do dia completo — o parcial não soma e não corrompe o total.
3. Na lista do mês, o dia parcial aparece como `tocar para lançar` (é a divergência cosmética esperada e documentada).
4. Tocar no dia parcial abre o modal **com a entrada `08:00` preenchida** — o dado está íntegro.
5. Fechar o modal sem salvar e conferir no localStorage que `{"start":"08:00"}` **continua lá**, intacto.
6. Exportar o Excel e copiar o texto do WhatsApp: o dia parcial é pulado, sem linha quebrada.

- [ ] **Step 4: Restaurar a versão nova**

```bash
git checkout HEAD -- src/App.jsx
```

Run: `npm run dev` com hard reload. Confirmar que o dia parcial volta a mostrar `EM ABERTO` e que o dado é o mesmo do Step 1 — a ida e volta entre versões não alterou nada.

- [ ] **Step 5: Rodar a verificação final**

Run: `npm test`
Expected: PASS — 22 testes.

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 6: Registrar o resultado na spec**

Em `docs/superpowers/specs/2026-07-14-lancamento-parcial-design.md`, na seção "Compatibilidade com a versão antiga em cache", acrescentar ao final:

```markdown
**Verificado em execução em 2026-07-14** (Task 6 do plano): um `{ start }` gravado pela
versão nova e lido pela versão anterior não soma no total, não gera NaN, é pulado nos
exports e mantém o dado íntegro — o modal antigo abre com a entrada preenchida. A ida e
volta entre as versões não altera o armazenamento.
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-07-14-lancamento-parcial-design.md
git commit -F- <<'EOF'
docs: registrar verificacao de compatibilidade com a versao antiga

A spec afirmava, por leitura do codigo, que nenhum caminho perde dado com
a forma nova. Verificado rodando a versao anterior do App.jsx contra um
lancamento parcial gravado pela versao nova.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Cobertura da spec

| Requisito da spec | Onde |
|---|---|
| `entries[dia]` aceita `{ start }` sem `end`, com `end` omitido | Task 2 |
| Auto-save dispara com `sm != null` | Task 3 |
| Entrada válida + saída vazia grava `{ start }` | Task 2 (regra), Task 3 (ligação) |
| Entrada válida + saída inválida grava `{ start }` e sinaliza | Task 2, Task 3 |
| Entrada vazia + saída preenchida não grava e sinaliza | Task 2, Task 3 (tela), Task 4 (modal) |
| Rebaixamento (seção 1.1) | Task 2, Task 3 |
| `same` trata `end` ausente e vazio como equivalentes | Task 2 |
| `EntryEditor.handleSave` exige só `start` | Task 4 |
| `DayRow` — `08:00 → ——` e `EM ABERTO` em âmbar | Task 5 |
| Sinalização na tela principal | Task 3 |
| Somatório ignora o parcial | Task 1 (`entryState` na guarda) |
| Excel / WhatsApp / `calculateOvertime` inalterados | Nenhuma tarefa os toca — verificado em Task 5 e Task 6 |
| Storage / migração / `importJSON` intocados | Nenhuma tarefa os toca |
| Compatibilidade com a versão em cache | Task 6 |

## Fora de escopo

Da spec, e não implementado por nenhuma tarefa acima:

- O deslize entre dias (spec 2).
- Unificar a duplicação de formulário entre `EntryEditor` (`622`) e `TodayScreen` (`1176`).
- Auto-save no modal do mês.
- A migração destrutiva (`src/App.jsx:230-231`, `248`) — problema real e conhecido do projeto, mas independente desta feature.
