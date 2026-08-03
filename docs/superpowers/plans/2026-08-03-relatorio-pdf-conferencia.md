# Relatório em PDF da conferência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar, a partir da conferência já calculada na tela, um PDF A5 de papel claro que o técnico manda pelo WhatsApp em um toque.

**Architecture:** Três módulos puros e um botão. `format.js` recebe os formatadores que hoje moram no `App.jsx`; `pdfDoc.js` escreve PDF à mão (base-14, sem compressão, sem dependência); `relatorioConferencia.js` transforma o resultado da conferência em páginas e depois em bytes. A `ConferenciaScreen` só chama e compartilha. Nada recalcula nada: o PDF nasce dos mesmos objetos que a tela renderiza.

**Tech Stack:** React 18 + Vite, Vitest (`environment: 'node'`, testes colocados em `src/*.test.js`), zero dependência nova.

**Spec:** `docs/superpowers/specs/2026-08-03-relatorio-pdf-conferencia-design.md`

## Global Constraints

- **Zero dependência nova.** Nada de `jsPDF`, nada de `pdfjs-dist`. O `package.json` não muda.
- **Nada é gravado.** Nenhum código deste plano pode escrever em `localStorage`, tocar `controle_horas_v3`, `data.entries`, ou a forma de qualquer dado persistido. Se um passo parecer exigir isso, pare e pergunte.
- **Streams do PDF sem compressão.** É o que permite o `extractPdfText` do próprio app verificar o escritor. Não use `CompressionStream`.
- **Página A5:** `419.53 × 595.28` pt. Margem `36` lateral, `40` topo e rodapé.
- **Determinismo:** nenhum `Date.now()`, `Math.random()` ou `/ID` no trailer dentro dos módulos puros. A data de emissão entra sempre por parâmetro (`emitidoEm`).
- **Tolerância:** `2` minutos, o `TOL` que a `ConferenciaScreen` já usa. Entra por parâmetro.
- **Cores (RGB 0–1, já convertidas dos hex da spec):**
  - tinta `[0.110, 0.098, 0.090]` · fraco `[0.471, 0.443, 0.424]` · régua `[0.906, 0.898, 0.894]`
  - fecha `[0.016, 0.471, 0.341]` · divergência `[0.745, 0.071, 0.235]` · só na ficha `[0.706, 0.325, 0.035]` · só no app `[0.012, 0.412, 0.631]`
- **Vocabulário de duração:** `formatDurationLong` produz `HH:MM` (`33:15`). O PDF fala igual à tela.
- **Idioma:** código, comentários e commits em português, como todo o projeto. Comentários explicam *por quê*, não *o quê* — siga o tom dos módulos existentes.
- **Rodar os testes:** `npm test`. Baseline antes de começar: **7 arquivos, 91 testes, todos passando.**

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/format.js` *(criar)* | Datas e durações em texto. Só recebe definições que hoje estão no `App.jsx`. |
| `src/format.test.js` *(criar)* | Caracterização dos formatadores, escrita **antes** da mudança. |
| `src/pdfDoc.js` *(criar)* | Primitivas de PDF: codificação WinAnsi, larguras base-14, medida, páginas, operações de desenho, serialização com xref. |
| `src/pdfDoc.test.js` *(criar)* | Escape, codificação, medida, xref, determinismo, ida e volta pelo `extractPdfText`. |
| `src/conferencia.js` *(modificar)* | Ganha `vereditoDoPeriodo` — o tom e a frase, hoje calculados dentro da `ConferenciaScreen`. |
| `src/conferencia.test.js` *(modificar)* | Casos do veredito. |
| `src/relatorioConferencia.js` *(criar)* | O documento: cabeçalho, herói, dia a dia, paginação, rodapé, nome do arquivo. |
| `src/relatorioConferencia.test.js` *(criar)* | Layout por tabela, sem inspecionar bytes. |
| `src/App.jsx` *(modificar)* | Importa `format.js`; usa `vereditoDoPeriodo`; ganha o botão e o compartilhamento. |

---

### Task 1: `src/format.js` — mover os formatadores

O relatório precisa de `formatDurationLong`, `formatDateBR`, `MONTH_FULL` e `DAY_SHORT`, que hoje são `const` privados do `App.jsx`. Copiá-los criaria duas verdades sobre o mesmo número. **Só as definições mudam de arquivo — nenhum call site muda.**

A ordem importa, e é a mesma que a spec 4 usou para extrair o `overtime`: primeiro o teste que trava o comportamento de hoje, depois o movimento. Se algum valor mudar, o teste avisa.

**Files:**
- Create: `src/format.js`
- Create: `src/format.test.js`
- Modify: `src/App.jsx:18-48` (remover definições), `src/App.jsx:92-107` (remover definições), `src/App.jsx:1-16` (adicionar import)

**Interfaces:**
- Consumes: nada.
- Produces: `pad(n) → string`, `formatDate(Date) → 'YYYY-MM-DD'`, `parseDate('YYYY-MM-DD') → Date`, `addDays(Date, n) → Date`, `formatDateBR('YYYY-MM-DD') → 'DD/MM/YYYY'`, `formatDuration(min) → '2h30' | '45min' | '2h' | '0h'`, `formatDurationLong(min) → 'HH:MM'`, `DAY_FULL`, `DAY_SHORT`, `MONTH_FULL`, `MONTH_SHORT` (arrays).

- [ ] **Step 1: Escrever o teste de caracterização**

Crie `src/format.test.js`. Ele importa de `./format`, que ainda não existe — é o ponto.

```js
import { describe, it, expect } from 'vitest';
import {
  pad, formatDate, parseDate, addDays, formatDateBR,
  formatDuration, formatDurationLong,
  DAY_FULL, DAY_SHORT, MONTH_FULL, MONTH_SHORT,
} from './format';

describe('pad', () => {
  it('completa com zero à esquerda até dois dígitos', () => {
    expect(pad(0)).toBe('00');
    expect(pad(7)).toBe('07');
    expect(pad(12)).toBe('12');
    expect(pad(123)).toBe('123');
  });
});

describe('formatDate / parseDate', () => {
  it('formata um Date como YYYY-MM-DD local', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDate(new Date(2025, 11, 31))).toBe('2025-12-31');
  });

  it('faz a volta sem escorregar de dia', () => {
    expect(formatDate(parseDate('2026-03-01'))).toBe('2026-03-01');
    expect(formatDate(parseDate('2025-10-26'))).toBe('2025-10-26');
  });
});

describe('addDays', () => {
  it('anda para frente e para trás atravessando o mês', () => {
    expect(formatDate(addDays(parseDate('2026-01-31'), 1))).toBe('2026-02-01');
    expect(formatDate(addDays(parseDate('2026-03-01'), -1))).toBe('2026-02-28');
  });

  it('não muda o Date recebido', () => {
    const d = parseDate('2026-05-10');
    addDays(d, 5);
    expect(formatDate(d)).toBe('2026-05-10');
  });
});

describe('formatDateBR', () => {
  it('vira DD/MM/AAAA', () => {
    expect(formatDateBR('2025-11-25')).toBe('25/11/2025');
    expect(formatDateBR('2026-01-05')).toBe('05/01/2026');
  });
});

describe('formatDuration', () => {
  it('zero e nulo viram 0h', () => {
    expect(formatDuration(0)).toBe('0h');
    expect(formatDuration(null)).toBe('0h');
    expect(formatDuration(undefined)).toBe('0h');
  });

  it('abaixo de uma hora sai em minutos', () => {
    expect(formatDuration(45)).toBe('45min');
    expect(formatDuration(1)).toBe('1min');
  });

  it('hora cheia omite os minutos', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(180)).toBe('3h');
  });

  it('hora quebrada traz os minutos com zero à esquerda', () => {
    expect(formatDuration(90)).toBe('1h30');
    expect(formatDuration(125)).toBe('2h05');
  });
});

describe('formatDurationLong', () => {
  it('sempre HH:MM, inclusive acima de 24h', () => {
    expect(formatDurationLong(0)).toBe('00:00');
    expect(formatDurationLong(14)).toBe('00:14');
    expect(formatDurationLong(90)).toBe('01:30');
    expect(formatDurationLong(1995)).toBe('33:15');
  });
});

describe('tabelas de nome', () => {
  it('trazem os nomes em português, com acento', () => {
    expect(DAY_SHORT).toEqual(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']);
    expect(DAY_FULL[2]).toBe('terça');
    expect(MONTH_FULL[2]).toBe('março');
    expect(MONTH_FULL[10]).toBe('novembro');
    expect(MONTH_SHORT[0]).toBe('jan');
    expect(MONTH_FULL).toHaveLength(12);
    expect(MONTH_SHORT).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- format`
Expected: FAIL — `Failed to resolve import "./format"`.

- [ ] **Step 3: Criar `src/format.js` com as definições movidas**

Recorte estas definições do `App.jsx` (linhas 22–48 e 92–107) e cole aqui, **sem alterar uma vírgula da lógica**, acrescentando `export`:

```js
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- format`
Expected: PASS, 8 blocos `describe`.

- [ ] **Step 5: Apagar as definições do `App.jsx` e importar**

No `App.jsx`, **apague** as linhas 22–48 (de `const pad =` até o fim de `MONTH_SHORT`) e as linhas de `const formatDuration` e `const formatDurationLong` (originalmente 92–107). Mantenha o resto do bloco `UTILITIES` (feriados, `getEaster`, `getPeriod`, …) onde está.

Acrescente ao topo, junto dos outros imports locais (perto de `import { extractPdfText } from './pdfText';`):

```js
import {
  pad, formatDate, parseDate, addDays, formatDateBR,
  formatDuration, formatDurationLong,
  DAY_FULL, DAY_SHORT, MONTH_FULL, MONTH_SHORT,
} from './format';
```

**Atenção:** `DEFAULT_SETTINGS` está entre as duas funções de duração (linha 106 original). Ele **fica** no `App.jsx`.

- [ ] **Step 6: Rodar a suíte inteira e o build**

Run: `npm test`
Expected: PASS — **8 arquivos**, e os **91 testes que já existiam continuam passando**, mais os novos de `format`. Nenhum teste antigo pode mudar de resultado; se algum mudar, a extração alterou comportamento e precisa voltar atrás.

Run: `npm run build`
Expected: build conclui sem erro. Se acusar `X is not defined`, faltou um nome no import ou sobrou uma definição duplicada.

- [ ] **Step 7: Commit**

```bash
git add src/format.js src/format.test.js src/App.jsx
git commit -m "refactor: extrai os formatadores de data e duracao para format.js

O relatorio em PDF precisa deles e o App.jsx nao exportava nada. So as
definicoes mudam de arquivo — nenhum call site muda. Teste de
caracterizacao escrito antes do movimento trava o comportamento.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `src/pdfDoc.js` — codificação, larguras e medida

A metade sem estado do escritor: transformar texto em bytes que um PDF aceita, e saber quanto cada string ocupa. Sem isso não há alinhamento à direita nem quebra de linha.

**Files:**
- Create: `src/pdfDoc.js`
- Create: `src/pdfDoc.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `paraWinAnsi(ch) → number`, `escaparPdf(str, fonte) → string`, `medir(str, fonte, tamanho) → number`, `quebrar(str, larguraMax, fonte, tamanho) → string[]`, `truncar(str, larguraMax, fonte, tamanho) → string`. `fonte ∈ 'normal' | 'bold' | 'simbolo'`.

- [ ] **Step 1: Escrever o teste**

Crie `src/pdfDoc.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { paraWinAnsi, escaparPdf, medir, quebrar, truncar } from './pdfDoc';

describe('paraWinAnsi', () => {
  it('deixa o ASCII imprimível passar', () => {
    expect(paraWinAnsi('A')).toBe(0x41);
    expect(paraWinAnsi(' ')).toBe(0x20);
    expect(paraWinAnsi('~')).toBe(0x7e);
  });

  it('deixa o latin-1 alto passar — é onde moram os acentos do português', () => {
    expect(paraWinAnsi('ç')).toBe(0xe7);
    expect(paraWinAnsi('ã')).toBe(0xe3);
    expect(paraWinAnsi('Ê')).toBe(0xca);
    expect(paraWinAnsi('·')).toBe(0xb7);
  });

  it('traduz a pontuação tipográfica que o WinAnsi põe em outro lugar', () => {
    expect(paraWinAnsi('—')).toBe(0x97);
    expect(paraWinAnsi('–')).toBe(0x96);
    expect(paraWinAnsi('…')).toBe(0x85);
    expect(paraWinAnsi('•')).toBe(0x95);
  });

  it('converte o menos tipográfico em hífen — o fmtDiff do app usa U+2212', () => {
    expect(paraWinAnsi('−')).toBe(0x2d);
  });

  it('o que não existe vira ?, e nunca quebra', () => {
    expect(paraWinAnsi('≠')).toBe(0x3f);
    expect(paraWinAnsi('日')).toBe(0x3f);
    expect(paraWinAnsi('🙂')).toBe(0x3f);
  });
});

describe('escaparPdf', () => {
  it('escapa parêntese e barra invertida', () => {
    expect(escaparPdf('a(b)c')).toBe('a\\(b\\)c');
    expect(escaparPdf('a\\b')).toBe('a\\\\b');
  });

  it('escreve o byte alto em octal — é o que o unescapePdfString do app lê', () => {
    expect(escaparPdf('ção')).toBe('\\347\\343o');
  });

  it('na fonte Symbol o ≠ vira o código dele, não ?', () => {
    expect(escaparPdf('≠', 'simbolo')).toBe('\\271');
    expect(escaparPdf('=', 'simbolo')).toBe('=');
  });
});

describe('medir', () => {
  it('usa as métricas base-14: os dígitos da Helvetica são todos 556', () => {
    expect(medir('0', 'normal', 1000)).toBe(556);
    expect(medir('99999', 'normal', 1000)).toBe(556 * 5);
  });

  it('escala com o corpo', () => {
    expect(medir('0', 'normal', 10)).toBeCloseTo(5.56, 5);
  });

  it('a bold é mais larga que a normal na mesma palavra', () => {
    expect(medir('novembro', 'bold', 10)).toBeGreaterThan(medir('novembro', 'normal', 10));
  });

  it('acento não faz a string encolher nem explodir', () => {
    const comAcento = medir('março', 'normal', 10);
    const semAcento = medir('marco', 'normal', 10);
    expect(Math.abs(comAcento - semAcento)).toBeLessThan(1);
  });

  it('string vazia mede zero', () => {
    expect(medir('', 'normal', 10)).toBe(0);
  });
});

describe('quebrar', () => {
  it('parte no espaço, respeitando a largura', () => {
    const linhas = quebrar('a ficha reconhece uma hora a menos do que voce lancou', 80, 'normal', 9);
    expect(linhas.length).toBeGreaterThan(1);
    for (const l of linhas) expect(medir(l, 'normal', 9)).toBeLessThanOrEqual(80);
  });

  it('não perde nem duplica palavra', () => {
    const texto = 'a ficha reconhece uma hora a menos';
    expect(quebrar(texto, 80, 'normal', 9).join(' ')).toBe(texto);
  });

  it('palavra sozinha maior que a largura sai numa linha só, sem laço infinito', () => {
    expect(quebrar('COOPERATIVAAGRARIAAGROINDUSTRIAL', 20, 'normal', 9)).toHaveLength(1);
  });
});

describe('truncar', () => {
  it('devolve intacto o que cabe', () => {
    expect(truncar('TIROL', 200, 'normal', 9)).toBe('TIROL');
  });

  it('corta e marca com reticências o que não cabe', () => {
    const s = truncar('COOPERATIVA AGRARIA AGROINDUSTRIAL LTDA', 60, 'normal', 9);
    expect(s.endsWith('…')).toBe(true);
    expect(medir(s, 'normal', 9)).toBeLessThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- pdfDoc`
Expected: FAIL — `Failed to resolve import "./pdfDoc"`.

- [ ] **Step 3: Escrever `src/pdfDoc.js` (a parte sem estado)**

```js
/* ═════════════════════════════════════════════════════════════════════════
   PDF ← DOCUMENTO — o escritor, sem biblioteca
   O gêmeo do pdfText.js: lá bytes viram texto, aqui texto vira bytes. A
   escolha de não usar jsPDF é a mesma que reprovou o pdfjs-dist na spec 4
   (~100 KB gzip num PWA aberto no celular em campo, precacheado pelo SW).

   As streams saem SEM COMPRESSÃO de propósito: assim o extractPdfText do
   próprio app lê de volta o que este módulo escreveu, e o escritor se
   verifica sozinho.
   ═════════════════════════════════════════════════════════════════════════ */

/* ─── Larguras base-14 ───────────────────────────────────────────────────
   Métricas da Adobe para Helvetica e Helvetica-Bold, em milésimos de em,
   nos códigos 0x20 a 0x7E. Os dez dígitos valem 556 nas duas — é por isso
   que uma coluna de números alinha sem fonte monoespaçada, o equivalente
   em PDF do tabular-nums que a tela usa. */
const W_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 222, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Uma letra acentuada tem a mesma largura de avanço da letra base: o acento
// é desenhado por cima, não ao lado. Derivar por aqui é mais confiável do
// que recitar de cabeça 96 números do intervalo alto, e o erro que sobra
// (o i acentuado avança 278 contra 222) some em meio ponto num corpo de 10.
// Onde precisa ser exato — dígito, dois-pontos, sinal — é tudo ASCII, acima.
const BASE_ACENTUADA = {
  0xc0: 'A', 0xc1: 'A', 0xc2: 'A', 0xc3: 'A', 0xc4: 'A', 0xc5: 'A',
  0xc7: 'C',
  0xc8: 'E', 0xc9: 'E', 0xca: 'E', 0xcb: 'E',
  0xcc: 'I', 0xcd: 'I', 0xce: 'I', 0xcf: 'I',
  0xd1: 'N',
  0xd2: 'O', 0xd3: 'O', 0xd4: 'O', 0xd5: 'O', 0xd6: 'O', 0xd8: 'O',
  0xd9: 'U', 0xda: 'U', 0xdb: 'U', 0xdc: 'U', 0xdd: 'Y',
  0xe0: 'a', 0xe1: 'a', 0xe2: 'a', 0xe3: 'a', 0xe4: 'a', 0xe5: 'a',
  0xe7: 'c',
  0xe8: 'e', 0xe9: 'e', 0xea: 'e', 0xeb: 'e',
  0xec: 'i', 0xed: 'i', 0xee: 'i', 0xef: 'i',
  0xf1: 'n',
  0xf2: 'o', 0xf3: 'o', 0xf4: 'o', 0xf5: 'o', 0xf6: 'o', 0xf8: 'o',
  0xf9: 'u', 0xfa: 'u', 0xfb: 'u', 0xfc: 'u', 0xfd: 'y', 0xff: 'y',
};

// Os poucos glifos altos que não derivam de letra nenhuma.
const W_EXTRA = { 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xb7: 278 };

const W_PADRAO = 556; // o que sobrar avança como um 'n' — layout sã, sem exatidão fingida

// A Symbol traz a própria codificação e não leva /Encoding. Só um glifo é
// usado: o ≠ do herói, que o WinAnsi simplesmente não tem.
const SYMBOL = { '≠': 0xb9 };
const W_SYMBOL = { 0xb9: 549, 0x3d: 549 };

/* ─── Codificação ─────────────────────────────────────────────────────── */

// Pontuação tipográfica que o WinAnsi guarda no intervalo 0x80–0x9F, onde o
// latin-1 não tem nada. E o U+2212: o fmtDiff do app usa o menos tipográfico,
// que o WinAnsi não tem — sem esta linha, todo diferencial negativo sairia '?'.
const EXTRA = {
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '•': 0x95, '–': 0x96, '—': 0x97, '…': 0x85,
  '−': 0x2d,
};

export function paraWinAnsi(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x20 && cp <= 0x7e) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  const e = EXTRA[ch];
  return e === undefined ? 0x3f : e; // '?' — degrada, nunca quebra
}

const byteDe = (ch, fonte) =>
  (fonte === 'simbolo' && SYMBOL[ch] !== undefined) ? SYMBOL[ch] : paraWinAnsi(ch);

// O miolo de uma string literal PDF. O byte alto sai em octal, que é
// exatamente o que o unescapePdfString do pdfText.js desescapa na volta.
export function escaparPdf(str, fonte = 'normal') {
  let out = '';
  for (const ch of str) {
    const b = byteDe(ch, fonte);
    if (b === 0x28) { out += '\\('; continue; }
    if (b === 0x29) { out += '\\)'; continue; }
    if (b === 0x5c) { out += '\\\\'; continue; }
    if (b >= 0x80) { out += '\\' + b.toString(8).padStart(3, '0'); continue; }
    out += String.fromCharCode(b);
  }
  return out;
}

/* ─── Medida ──────────────────────────────────────────────────────────── */

function larguraDe(ch, fonte) {
  const b = byteDe(ch, fonte);
  if (fonte === 'simbolo') return W_SYMBOL[b] ?? 500;
  const tabela = fonte === 'bold' ? W_BOLD : W_NORMAL;
  if (b >= 0x20 && b <= 0x7e) return tabela[b - 0x20];
  const base = BASE_ACENTUADA[b];
  if (base) return tabela[base.charCodeAt(0) - 0x20];
  return W_EXTRA[b] ?? W_PADRAO;
}

export function medir(str, fonte, tamanho) {
  let total = 0;
  for (const ch of str) total += larguraDe(ch, fonte);
  return (total * tamanho) / 1000;
}

export function quebrar(str, larguraMax, fonte, tamanho) {
  const linhas = [];
  let atual = '';
  for (const palavra of str.split(' ')) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    // O !atual deixa passar a palavra sozinha maior que a linha: cortá-la
    // seria pior, e sem isso o laço nunca avançaria.
    if (!atual || medir(tentativa, fonte, tamanho) <= larguraMax) { atual = tentativa; continue; }
    linhas.push(atual);
    atual = palavra;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function truncar(str, larguraMax, fonte, tamanho) {
  if (medir(str, fonte, tamanho) <= larguraMax) return str;
  let s = str;
  while (s.length > 1 && medir(`${s}…`, fonte, tamanho) > larguraMax) s = s.slice(0, -1);
  return `${s}…`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- pdfDoc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pdfDoc.js src/pdfDoc.test.js
git commit -m "feat: pdfDoc — codificacao WinAnsi, larguras base-14 e medida

O gemeo do pdfText.js. O U+2212 do fmtDiff vira hifen e o simbolo nao
existe em WinAnsi: sem essas duas linhas o diferencial negativo e o
glifo do heroi sairiam como '?'.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/pdfDoc.js` — o documento e os bytes

Páginas, operações de desenho acumuladas como objetos, e a serialização com tabela xref. As operações ficam inspecionáveis: é o que torna o layout da Task 5 e 6 testável sem olhar um byte.

**Files:**
- Modify: `src/pdfDoc.js` (acrescentar ao final)
- Modify: `src/pdfDoc.test.js` (acrescentar ao final)

**Interfaces:**
- Consumes: `escaparPdf`, `medir` da Task 2.
- Produces: `criarDoc({ largura, altura, margem }) → doc`, com `doc.largura`, `doc.altura`, `doc.margem`, `doc.paginas` (array de arrays de ops), `doc.novaPagina()`, `doc.irParaPagina(i)`, `doc.texto(x, y, str, opts)`, `doc.linha(x1, y1, x2, y2, opts)`, `doc.retangulo(x, y, w, h, opts)`, `doc.bytes({ titulo, emitidoEm }) → Uint8Array`.
- **Convenção de eixo:** `y` é a **distância a partir do topo da página**, e num texto é a **linha de base**. O PDF conta de baixo para cima; a conversão fica escondida aqui, para o código de layout pensar como a tela pensa.
- Op de texto: `{ tipo: 'texto', x, y, str, fonte, tamanho, cor, alinhamento, tracking }`.

- [ ] **Step 1: Escrever o teste**

Acrescente a `src/pdfDoc.test.js`:

```js
import { criarDoc } from './pdfDoc';
import { extractPdfText } from './pdfText';

const doc5 = () => criarDoc({ largura: 419.53, altura: 595.28, margem: 36 });
const latin1 = (bytes) => String.fromCharCode(...bytes);

describe('criarDoc — páginas e operações', () => {
  it('nasce com uma página e nenhuma operação', () => {
    const doc = doc5();
    expect(doc.paginas).toHaveLength(1);
    expect(doc.paginas[0]).toHaveLength(0);
  });

  it('acumula a operação na página corrente', () => {
    const doc = doc5();
    doc.texto(10, 20, 'oi');
    doc.novaPagina();
    doc.texto(10, 20, 'tchau');
    expect(doc.paginas).toHaveLength(2);
    expect(doc.paginas[0][0].str).toBe('oi');
    expect(doc.paginas[1][0].str).toBe('tchau');
  });

  it('irParaPagina volta a desenhar numa página anterior — é como o rodapé sabe o N/M', () => {
    const doc = doc5();
    doc.novaPagina();
    doc.irParaPagina(0);
    doc.texto(10, 580, '1/2');
    expect(doc.paginas[0]).toHaveLength(1);
    expect(doc.paginas[1]).toHaveLength(0);
  });

  it('guarda o texto com os atributos que o layout pediu', () => {
    const doc = doc5();
    doc.texto(10, 20, 'App', { fonte: 'bold', tamanho: 9, cor: [1, 0, 0], alinhamento: 'dir' });
    expect(doc.paginas[0][0]).toMatchObject({
      tipo: 'texto', x: 10, y: 20, str: 'App', fonte: 'bold', tamanho: 9, alinhamento: 'dir',
    });
  });
});

describe('criarDoc — bytes', () => {
  const emitidoEm = new Date(2026, 7, 3, 14, 30, 0);

  it('sai com cabeçalho e fecho de PDF', () => {
    const doc = doc5();
    doc.texto(36, 50, 'oi');
    const s = latin1(doc.bytes({ titulo: 'teste', emitidoEm }));
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declara no /Count o número de páginas', () => {
    const doc = doc5();
    doc.novaPagina();
    doc.novaPagina();
    const s = latin1(doc.bytes({ titulo: 'teste', emitidoEm }));
    expect(s).toContain('/Count 3');
  });

  it('cada offset do xref aponta para onde o objeto realmente começa', () => {
    const doc = doc5();
    doc.texto(36, 50, 'ção (com) \\ tudo');
    doc.novaPagina();
    doc.texto(36, 50, 'segunda');
    const s = latin1(doc.bytes({ titulo: 'teste', emitidoEm }));

    const inicio = s.indexOf('xref\n') + 'xref\n'.length;
    const [, totalStr] = s.slice(inicio, s.indexOf('\n', inicio)).split(' ');
    const total = Number(totalStr);
    const corpo = s.indexOf('\n', inicio) + 1;

    for (let n = 1; n < total; n++) {
      const entrada = s.substr(corpo + n * 20, 20);
      const offset = Number(entrada.slice(0, 10));
      expect(s.startsWith(`${n} 0 obj`, offset)).toBe(true);
    }
    expect(s.substr(corpo, 20)).toBe('0000000000 65535 f \n');
  });

  it('o startxref aponta para a palavra xref', () => {
    const doc = doc5();
    doc.texto(36, 50, 'oi');
    const s = latin1(doc.bytes({ titulo: 'teste', emitidoEm }));
    const offset = Number(s.slice(s.lastIndexOf('startxref\n') + 10).split('\n')[0]);
    expect(s.startsWith('xref', offset)).toBe(true);
  });

  it('mesma entrada, mesmos bytes', () => {
    const um = doc5(); um.texto(36, 50, 'março');
    const dois = doc5(); dois.texto(36, 50, 'março');
    expect(latin1(um.bytes({ titulo: 't', emitidoEm }))).toBe(latin1(dois.bytes({ titulo: 't', emitidoEm })));
  });

  it('inverte o eixo: y é medido do topo', () => {
    const doc = doc5();
    doc.texto(36, 40, 'topo');
    const s = latin1(doc.bytes({ titulo: 't', emitidoEm }));
    expect(s).toContain(`1 0 0 1 36 ${(595.28 - 40).toFixed(2)} Tm`);
  });
});

describe('ida e volta — o leitor do app lê o que o escritor escreveu', () => {
  it('devolve as mesmas strings, acento incluído', async () => {
    const doc = doc5();
    doc.texto(36, 50, 'CONFERÊNCIA DA FICHA');
    doc.texto(36, 70, 'março de 2026 · 33:15');
    doc.novaPagina();
    doc.texto(36, 50, 'ADAMI SA MADEIRAS (143)');

    const bytes = doc.bytes({ titulo: 'Conferência', emitidoEm: new Date(2026, 7, 3) });
    const lidas = await extractPdfText(bytes.buffer);

    expect(lidas).toContain('CONFERÊNCIA DA FICHA');
    expect(lidas).toContain('março de 2026 · 33:15');
    expect(lidas).toContain('ADAMI SA MADEIRAS (143)');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- pdfDoc`
Expected: FAIL — `criarDoc is not a function` (os testes da Task 2 continuam passando).

- [ ] **Step 3: Implementar**

Acrescente ao final de `src/pdfDoc.js`:

```js
/* ─── O documento ─────────────────────────────────────────────────────── */

const num = (v) => (Math.round(v * 100) / 100).toString();
const corPdf = ([r, g, b]) => `${num(r)} ${num(g)} ${num(b)}`;
const NOME_FONTE = { normal: 'F1', bold: 'F2', simbolo: 'F3' };

export function criarDoc({ largura, altura, margem }) {
  const paginas = [[]];
  let atual = 0;

  const doc = {
    largura, altura, margem, paginas,

    novaPagina() { paginas.push([]); atual = paginas.length - 1; return doc; },
    irParaPagina(i) { atual = i; return doc; },

    texto(x, y, str, opts = {}) {
      paginas[atual].push({
        tipo: 'texto', x, y, str,
        fonte: opts.fonte ?? 'normal',
        tamanho: opts.tamanho ?? 10,
        cor: opts.cor ?? [0, 0, 0],
        alinhamento: opts.alinhamento ?? 'esq',
        tracking: opts.tracking ?? 0,
      });
      return doc;
    },

    linha(x1, y1, x2, y2, opts = {}) {
      paginas[atual].push({
        tipo: 'linha', x1, y1, x2, y2,
        cor: opts.cor ?? [0, 0, 0],
        espessura: opts.espessura ?? 0.5,
      });
      return doc;
    },

    retangulo(x, y, w, h, opts = {}) {
      paginas[atual].push({ tipo: 'retangulo', x, y, w, h, cor: opts.cor ?? [0, 0, 0] });
      return doc;
    },

    bytes: (meta) => serializar(doc, meta),
  };

  return doc;
}

// Uma operação vira operadores de conteúdo. O y do layout conta do topo; o
// PDF conta de baixo, e a inversão mora só aqui.
function opParaConteudo(op, altura) {
  if (op.tipo === 'texto') {
    let x = op.x;
    if (op.alinhamento !== 'esq') {
      const w = medir(op.str, op.fonte, op.tamanho) + op.tracking * Math.max(0, op.str.length - 1);
      x = op.alinhamento === 'dir' ? op.x - w : op.x - w / 2;
    }
    const tc = op.tracking ? `${num(op.tracking)} Tc ` : '';
    return `BT ${tc}/${NOME_FONTE[op.fonte]} ${num(op.tamanho)} Tf ${corPdf(op.cor)} rg `
         + `1 0 0 1 ${num(x)} ${num(altura - op.y)} Tm (${escaparPdf(op.str, op.fonte)}) Tj ET`;
  }
  if (op.tipo === 'linha') {
    return `${corPdf(op.cor)} RG ${num(op.espessura)} w `
         + `${num(op.x1)} ${num(altura - op.y1)} m ${num(op.x2)} ${num(altura - op.y2)} l S`;
  }
  return `${corPdf(op.cor)} rg ${num(op.x)} ${num(altura - op.y - op.h)} ${num(op.w)} ${num(op.h)} re f`;
}

const pad2 = (n) => String(n).padStart(2, '0');
const dataPdf = (d) =>
  `D:${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  + `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;

function serializar(doc, { titulo = '', emitidoEm = new Date(0) } = {}) {
  const { largura, altura, paginas } = doc;

  // 1 Catalog · 2 Pages · 3-5 fontes · 6 Info · depois, por página, o Page e o
  // Contents. A Symbol NÃO leva /Encoding: ela traz a própria.
  const PRIMEIRA_PAGINA = 7;
  const idPagina = (i) => PRIMEIRA_PAGINA + i * 2;
  const idConteudo = (i) => PRIMEIRA_PAGINA + i * 2 + 1;

  const corpos = [];
  corpos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  corpos[2] = `<< /Type /Pages /Count ${paginas.length} /Kids [${paginas.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] >>`;
  corpos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  corpos[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  corpos[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>';
  corpos[6] = `<< /Title (${escaparPdf(titulo)}) /Producer (horas+) /Creator (horas+) /CreationDate (${dataPdf(emitidoEm)}) >>`;

  paginas.forEach((ops, i) => {
    corpos[idPagina(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(largura)} ${num(altura)}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${idConteudo(i)} 0 R >>`;
    const conteudo = ops.map((op) => opParaConteudo(op, altura)).join('\n');
    corpos[idConteudo(i)] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
  });

  // O arquivo é montado como texto latin-1, em que 1 caractere é 1 byte —
  // por isso dá para contar offset com length. A conversão vem no fim.
  const total = corpos.length;
  let arquivo = '%PDF-1.4\n';
  const offsets = [];
  for (let n = 1; n < total; n++) {
    offsets[n] = arquivo.length;
    arquivo += `${n} 0 obj\n${corpos[n]}\nendobj\n`;
  }

  const inicioXref = arquivo.length;
  arquivo += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) {
    arquivo += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  arquivo += `trailer\n<< /Size ${total} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  const bytes = new Uint8Array(arquivo.length);
  for (let i = 0; i < arquivo.length; i++) bytes[i] = arquivo.charCodeAt(i) & 0xff;
  return bytes;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- pdfDoc`
Expected: PASS, incluindo o bloco "ida e volta".

Se a ida e volta falhar, o `extractPdfText` não achou as strings: confira que o conteúdo saiu **sem compressão** e que existe um `\n` logo depois de `stream`.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, nada quebrado.

- [ ] **Step 6: Commit**

```bash
git add src/pdfDoc.js src/pdfDoc.test.js
git commit -m "feat: pdfDoc — paginas, operacoes de desenho e serializacao com xref

O y do layout conta do topo e a inversao para o eixo do PDF mora num
lugar so. As operacoes ficam inspecionaveis para o layout ser testavel
sem olhar byte. Teste de fecho: o extractPdfText do app le de volta o
que este modulo escreveu, acento incluido.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `vereditoDoPeriodo` — o tom e a frase, num lugar só

A frase do veredito ("A ficha reconhece 1h00 a menos…") e o tom são calculados hoje **dentro do corpo da `ConferenciaScreen`** (`src/App.jsx:2082-2100`). O PDF precisa dos mesmos. Copiar seria criar duas verdades sobre o mesmo veredito.

Vai para `conferencia.js`, que é onde o vocabulário nasce.

**Files:**
- Modify: `src/conferencia.js` (acrescentar ao final)
- Modify: `src/conferencia.test.js` (acrescentar ao final)
- Modify: `src/App.jsx:2082-2100`

**Interfaces:**
- Consumes: `formatDurationLong` de `./format` (Task 1).
- Produces: `vereditoDoPeriodo({ resultado, totais, tolerancia }) → { tom, glifo, frase }`, com `tom ∈ 'confere' | 'quase' | 'menos' | 'mais'` e `glifo ∈ '=' | '≠'`.

- [ ] **Step 1: Escrever o teste**

Acrescente a `src/conferencia.test.js`:

```js
import { vereditoDoPeriodo } from './conferencia';

const totaisCom = (appTotal, fichaTotal) => ({
  app: { d50: 0, d100: 0, n50: 0, n100: 0, total: appTotal },
  ficha: { d50: 0, d100: 0, n50: 0, n100: 0, total: fichaTotal },
  diff: { d50: 0, d100: 0, n50: 0, n100: 0, total: appTotal - fichaTotal },
});
const dias = (...status) => status.map((s, i) => ({ data: `2025-11-0${i + 1}`, status: s }));

describe('vereditoDoPeriodo', () => {
  it('tudo fechando é confere', () => {
    const v = vereditoDoPeriodo({ resultado: dias('fecha', 'fecha'), totais: totaisCom(120, 120), tolerancia: 2 });
    expect(v.tom).toBe('confere');
    expect(v.glifo).toBe('=');
    expect(v.frase).toBe('Tudo confere — o total e cada dia fecham com a ficha.');
  });

  it('total fechando com dia torto é quase — a cor vem dos dias, não do total', () => {
    const v = vereditoDoPeriodo({ resultado: dias('fecha', 'divergencia'), totais: totaisCom(120, 120), tolerancia: 2 });
    expect(v.tom).toBe('quase');
    expect(v.glifo).toBe('=');
    expect(v.frase).toBe('O total fecha, mas 1 dia não bate — veja na lista.');
  });

  it('plural de dias tortos', () => {
    const v = vereditoDoPeriodo({
      resultado: dias('divergencia', 'só na ficha', 'fecha'), totais: totaisCom(121, 120), tolerancia: 2,
    });
    expect(v.frase).toBe('O total fecha, mas 2 dias não batem — veja na lista.');
  });

  it('a ficha reconhecendo menos é o caso que pede atenção', () => {
    const v = vereditoDoPeriodo({ resultado: dias('divergencia'), totais: totaisCom(180, 120), tolerancia: 2 });
    expect(v.tom).toBe('menos');
    expect(v.glifo).toBe('≠');
    expect(v.frase).toBe('A ficha reconhece 01:00 a menos do que você lançou no app.');
  });

  it('a ficha reconhecendo mais é notícia boa', () => {
    const v = vereditoDoPeriodo({ resultado: dias('divergencia'), totais: totaisCom(120, 180), tolerancia: 2 });
    expect(v.tom).toBe('mais');
    expect(v.glifo).toBe('≠');
    expect(v.frase).toBe('A ficha reconhece 01:00 a mais do que você lançou no app.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- conferencia`
Expected: FAIL — `vereditoDoPeriodo is not a function`.

- [ ] **Step 3: Implementar**

Acrescente ao final de `src/conferencia.js` (e no topo, `import { formatDurationLong } from './format';`):

```js
// O veredito do período em palavras. Mora aqui, e não na tela, porque o
// relatório em PDF diz exatamente a mesma coisa — e duas cópias discordariam
// na primeira vez que alguém mexesse numa delas.
//
// O tom vem dos DIAS, não da diferença total: dois desvios opostos podem se
// anular no total sem que nada esteja certo. Daí o 'quase'.
export function vereditoDoPeriodo({ resultado, totais, tolerancia = 2 }) {
  const problemas = resultado.length - resultado.filter((d) => d.status === 'fecha').length;
  const dTot = totais.diff.total;

  if (problemas === 0) {
    return { tom: 'confere', glifo: '=', frase: 'Tudo confere — o total e cada dia fecham com a ficha.' };
  }
  if (Math.abs(dTot) <= tolerancia) {
    const quantos = problemas === 1 ? '1 dia não bate' : `${problemas} dias não batem`;
    return { tom: 'quase', glifo: '=', frase: `O total fecha, mas ${quantos} — veja na lista.` };
  }
  if (dTot > 0) {
    return { tom: 'menos', glifo: '≠', frase: `A ficha reconhece ${formatDurationLong(dTot)} a menos do que você lançou no app.` };
  }
  return { tom: 'mais', glifo: '≠', frase: `A ficha reconhece ${formatDurationLong(-dTot)} a mais do que você lançou no app.` };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- conferencia`
Expected: PASS.

- [ ] **Step 5: Fazer a `ConferenciaScreen` usar a função**

Em `src/App.jsx`, troque o bloco que hoje calcula `tom` e `frase` (originalmente linhas 2082–2100, começando em `let tom = null;`) por:

```js
  // O veredito do herói. A cor vem dos dias (ver CONF_TONS); a frase diz em
  // palavras o que o glifo resume. O cálculo mora em conferencia.js porque o
  // relatório em PDF diz exatamente a mesma coisa.
  const veredito = totais && resumo
    ? vereditoDoPeriodo({ resultado, totais, tolerancia: TOL })
    : null;
  const tom = veredito ? CONF_TONS[veredito.tom] : null;
  const frase = veredito ? veredito.frase : null;
```

Acrescente `vereditoDoPeriodo` ao import existente:

```js
import { conferir, vereditoDoPeriodo } from './conferencia';
```

Em `CONF_TONS` (`src/App.jsx:1687-1692`), **apague a propriedade `glifo` das quatro entradas** — ela agora vem do veredito. E onde o JSX desenha o glifo (`src/App.jsx:2274`, `{tom.glifo}`), troque por `{veredito.glifo}`.

- [ ] **Step 6: Rodar tudo e conferir na tela**

Run: `npm test`
Expected: PASS.

Run: `npm run dev`, abra a aba de conferência, importe uma ficha e confirme que a faixa do herói mostra a mesma frase e o mesmo glifo de antes. **Este passo é visual e não tem teste automatizado — olhe.**

- [ ] **Step 7: Commit**

```bash
git add src/conferencia.js src/conferencia.test.js src/App.jsx
git commit -m "refactor: veredito do periodo sai da tela e vai para conferencia.js

O relatorio em PDF diz a mesma frase que o heroi. Duas copias
discordariam na primeira vez que alguem mexesse numa delas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `src/relatorioConferencia.js` — cabeçalho e herói

**Files:**
- Create: `src/relatorioConferencia.js`
- Create: `src/relatorioConferencia.test.js`

**Interfaces:**
- Consumes: `criarDoc`, `medir`, `quebrar`, `truncar` de `./pdfDoc`; `vereditoDoPeriodo` de `./conferencia`; `formatDurationLong`, `formatDateBR`, `MONTH_FULL`, `DAY_SHORT`, `parseDate` de `./format`.
- Produces: `montarRelatorio({ resultado, totais, ficha, refMonth, tolerancia, emitidoEm }) → doc`, `nomeArquivoRelatorio(refMonth) → string`.
- Formato de `refMonth`: `{ year: 2025, month: 11 }`. De `ficha`: `{ tecnico, periodo: { inicio, fim } }` com datas `'YYYY-MM-DD'`.

- [ ] **Step 1: Escrever o teste**

Crie `src/relatorioConferencia.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { montarRelatorio, nomeArquivoRelatorio } from './relatorioConferencia';

const cat = (o = {}) => ({ d50: 0, d100: 0, n50: 0, n100: 0, total: 0, ...o });

const dia = (data, status, app, fic, clientes = []) => ({
  data, status,
  app: cat(app), ficha: cat(fic),
  diff: cat({
    d50: (app.d50 || 0) - (fic.d50 || 0), d100: (app.d100 || 0) - (fic.d100 || 0),
    n50: (app.n50 || 0) - (fic.n50 || 0), n100: (app.n100 || 0) - (fic.n100 || 0),
    total: (app.total || 0) - (fic.total || 0),
  }),
  clientes: clientes.map((nome, i) => ({ codigo: String(100 + i), nome })),
  colaborador: 'JOAO PACCE ANDREONI',
  linhasFicha: [],
});

const somaTotais = (dias) => {
  const app = cat(); const fic = cat(); const diff = cat();
  for (const d of dias) for (const k of Object.keys(app)) { app[k] += d.app[k]; fic[k] += d.ficha[k]; }
  for (const k of Object.keys(app)) diff[k] = app[k] - fic[k];
  return { app, ficha: fic, diff };
};

const fichaFalsa = {
  tecnico: 'JOAO PACCE ANDREONI',
  periodo: { inicio: '2025-10-26', fim: '2025-11-25' },
};

const montar = (dias, extra = {}) => montarRelatorio({
  resultado: dias,
  totais: somaTotais(dias),
  ficha: fichaFalsa,
  refMonth: { year: 2025, month: 11 },
  tolerancia: 2,
  emitidoEm: new Date(2026, 7, 3, 14, 30),
  ...extra,
});

const textos = (doc) => doc.paginas.flat().filter((o) => o.tipo === 'texto').map((o) => o.str);
const textosDaPagina = (doc, i) => doc.paginas[i].filter((o) => o.tipo === 'texto').map((o) => o.str);

describe('nomeArquivoRelatorio', () => {
  it('traz mês e ano, legível na lista de anexos', () => {
    expect(nomeArquivoRelatorio({ year: 2025, month: 11 })).toBe('conferencia-novembro-2025.pdf');
  });

  it('tira o acento — março sairia torto do outro lado', () => {
    expect(nomeArquivoRelatorio({ year: 2026, month: 3 })).toBe('conferencia-marco-2026.pdf');
  });
});

describe('cabeçalho', () => {
  it('identifica o app, o técnico e o período da ficha', () => {
    const t = textos(montar([dia('2025-11-10', 'fecha', { d50: 14, total: 14 }, { d50: 14, total: 14 })]));
    expect(t).toContain('horas+');
    expect(t).toContain('CONFERÊNCIA DA FICHA');
    expect(t).toContain('JOAO PACCE ANDREONI');
    expect(t.some((s) => s.includes('26/10/2025') && s.includes('25/11/2025'))).toBe(true);
    expect(t.some((s) => s.includes('novembro') && s.includes('2025'))).toBe(true);
  });
});

describe('herói', () => {
  it('põe os dois totais e a frase do veredito', () => {
    const dias = [dia('2025-11-10', 'fecha', { d50: 120, total: 120 }, { d50: 120, total: 120 })];
    const t = textos(montar(dias));
    expect(t).toContain('App');
    expect(t).toContain('Ficha');
    expect(t.filter((s) => s === '02:00')).toHaveLength(2);
    expect(t).toContain('Tudo confere — o total e cada dia fecham com a ficha.');
  });

  it('quebra a frase longa em linhas que cabem na coluna', () => {
    const dias = [dia('2025-11-10', 'divergencia', { d50: 180, total: 180 }, { d50: 120, total: 120 })];
    const doc = montar(dias);
    const t = textos(doc);
    expect(t.join(' ')).toContain('A ficha reconhece 01:00 a menos');
  });

  it('desenha o glifo do veredito na fonte Symbol quando não fecha', () => {
    const dias = [dia('2025-11-10', 'divergencia', { d50: 180, total: 180 }, { d50: 120, total: 120 })];
    const simbolos = montar(dias).paginas.flat().filter((o) => o.fonte === 'simbolo');
    expect(simbolos).toHaveLength(1);
    expect(simbolos[0].str).toBe('≠');
  });

  it('só lista categoria que tem minutos de algum lado', () => {
    const dias = [dia('2025-11-10', 'fecha', { d50: 120, total: 120 }, { d50: 120, total: 120 })];
    const t = textosDaPagina(montar(dias), 0);
    expect(t).toContain('50% diurno');
    expect(t).not.toContain('100% noturno');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- relatorioConferencia`
Expected: FAIL — `Failed to resolve import "./relatorioConferencia"`.

- [ ] **Step 3: Implementar**

Crie `src/relatorioConferencia.js`:

```js
/* ═════════════════════════════════════════════════════════════════════════
   RELATÓRIO DA CONFERÊNCIA — o veredito vira documento
   Recebe o resultado JÁ CALCULADO pela tela e devolve páginas. Não recalcula
   nada: um segundo cálculo divergiria do primeiro, e aí o PDF — que sai do
   aparelho e vai parar na conversa de outra pessoa — mentiria.

   A5 (metade exata da A4, mesma proporção) porque o leitor é o WhatsApp no
   celular: uma A4 encolhe para 60% numa tela de 360px e obriga zoom.
   ═════════════════════════════════════════════════════════════════════════ */

import { criarDoc, medir, quebrar, truncar } from './pdfDoc';
import { vereditoDoPeriodo } from './conferencia';
import { formatDurationLong, formatDateBR, parseDate, MONTH_FULL, DAY_SHORT } from './format';

export const PAGINA = { largura: 419.53, altura: 595.28, margem: 36 };
const TOPO = 40;
const RODAPE = 40;

const TINTA = [0.110, 0.098, 0.090];
const FRACO = [0.471, 0.443, 0.424];
const REGUA = [0.906, 0.898, 0.894];

const VEREDITO = {
  fecha:          { rotulo: 'Fecha',       cor: [0.016, 0.471, 0.341] },
  divergencia:    { rotulo: 'Divergência', cor: [0.745, 0.071, 0.235] },
  'só na ficha':  { rotulo: 'Só na ficha', cor: [0.706, 0.325, 0.035] },
  'só no app':    { rotulo: 'Só no app',   cor: [0.012, 0.412, 0.631] },
};

// O tom do período pinta a faixa do herói. Mesmas famílias da tela, no degrau
// 700 — que é como aquelas cores viram tinta sobre branco.
const TOM = {
  confere: VEREDITO.fecha.cor,
  quase:   VEREDITO['só na ficha'].cor,
  menos:   VEREDITO.divergencia.cor,
  mais:    VEREDITO.fecha.cor,
};

const CATS = [
  { k: 'd50', rotulo: '50% diurno' },
  { k: 'd100', rotulo: '100% diurno' },
  { k: 'n50', rotulo: '50% noturno' },
  { k: 'n100', rotulo: '100% noturno' },
];

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function nomeArquivoRelatorio(refMonth) {
  return `conferencia-${semAcento(MONTH_FULL[refMonth.month - 1])}-${refMonth.year}.pdf`;
}

// O zero vira travessão para não poluir a coluna — igual ao fmtDiff da tela.
const fmtDif = (min) => (min === 0 ? '—' : (min > 0 ? '+' : '-') + formatDurationLong(Math.abs(min)));

// As três colunas de número, todas alinhadas à direita na mesma geometria —
// no herói e em cada dia, para o olho descer reto pela página.
function colunas(doc) {
  const dif = doc.largura - doc.margem;
  return { dif, ficha: dif - 52, app: dif - 98, rotulo: doc.margem };
}

function tabelaCategorias(doc, y, { app, ficha, diff }, { comTotal }) {
  const c = colunas(doc);
  const linhas = CATS.filter((cat) => app[cat.k] > 0 || ficha[cat.k] > 0);

  doc.texto(c.app, y, 'App', { tamanho: 6.5, cor: FRACO, alinhamento: 'dir', tracking: 0.4 });
  doc.texto(c.ficha, y, 'Ficha', { tamanho: 6.5, cor: FRACO, alinhamento: 'dir', tracking: 0.4 });
  doc.texto(c.dif, y, 'Dif', { tamanho: 6.5, cor: FRACO, alinhamento: 'dir', tracking: 0.4 });
  y += 11;

  for (const cat of linhas) {
    doc.texto(c.rotulo, y, cat.rotulo, { tamanho: 8.5, cor: FRACO });
    doc.texto(c.app, y, formatDurationLong(app[cat.k]), { tamanho: 8.5, cor: TINTA, alinhamento: 'dir' });
    doc.texto(c.ficha, y, formatDurationLong(ficha[cat.k]), { tamanho: 8.5, cor: TINTA, alinhamento: 'dir' });
    doc.texto(c.dif, y, fmtDif(diff[cat.k]), { tamanho: 8.5, cor: FRACO, alinhamento: 'dir' });
    y += 12;
  }

  if (comTotal && linhas.length >= 2) {
    doc.linha(c.rotulo, y - 8, c.dif, y - 8, { cor: REGUA });
    doc.texto(c.rotulo, y + 2, 'Total', { fonte: 'bold', tamanho: 8.5, cor: TINTA });
    doc.texto(c.app, y + 2, formatDurationLong(app.total), { fonte: 'bold', tamanho: 8.5, cor: TINTA, alinhamento: 'dir' });
    doc.texto(c.ficha, y + 2, formatDurationLong(ficha.total), { fonte: 'bold', tamanho: 8.5, cor: TINTA, alinhamento: 'dir' });
    doc.texto(c.dif, y + 2, fmtDif(diff.total), { fonte: 'bold', tamanho: 8.5, cor: FRACO, alinhamento: 'dir' });
    y += 16;
  }
  return y;
}

function cabecalho(doc, { ficha, refMonth }) {
  const dir = doc.largura - doc.margem;
  doc.texto(doc.margem, TOPO, 'horas+', { fonte: 'bold', tamanho: 13, cor: TINTA });
  doc.texto(dir, TOPO, 'CONFERÊNCIA DA FICHA', { tamanho: 7, cor: FRACO, alinhamento: 'dir', tracking: 0.9 });
  doc.linha(doc.margem, TOPO + 8, dir, TOPO + 8, { cor: REGUA });

  let y = TOPO + 26;
  if (ficha.tecnico) {
    doc.texto(doc.margem, y, ficha.tecnico, { fonte: 'bold', tamanho: 10.5, cor: TINTA });
    y += 13;
  }
  const periodo = ficha.periodo
    ? `${formatDateBR(ficha.periodo.inicio)} a ${formatDateBR(ficha.periodo.fim)}`
    : '';
  const mes = `${MONTH_FULL[refMonth.month - 1]} de ${refMonth.year}`;
  doc.texto(doc.margem, y, periodo ? `${periodo} · ${mes}` : mes, { tamanho: 8.5, cor: FRACO });
  return y + 16;
}

function heroi(doc, y, { resultado, totais, tolerancia }) {
  const dir = doc.largura - doc.margem;
  const v = vereditoDoPeriodo({ resultado, totais, tolerancia });
  const cor = TOM[v.tom];

  doc.texto(doc.margem, y, 'TOTAL DO PERÍODO', { tamanho: 7, cor: FRACO, tracking: 0.9 });
  doc.texto(dir, y, resultado.length === 1 ? '1 dia com horas' : `${resultado.length} dias com horas`,
    { tamanho: 7, cor: FRACO, alinhamento: 'dir' });
  y += 16;

  doc.texto(doc.margem, y, 'App', { tamanho: 7, cor: FRACO, tracking: 0.6 });
  doc.texto(dir, y, 'Ficha', { tamanho: 7, cor: FRACO, alinhamento: 'dir', tracking: 0.6 });
  y += 22;

  doc.texto(doc.margem, y, formatDurationLong(totais.app.total), { fonte: 'bold', tamanho: 24, cor: TINTA });
  doc.texto(doc.largura / 2, y - 3, v.glifo, { fonte: 'simbolo', tamanho: 17, cor, alinhamento: 'centro' });
  doc.texto(dir, y, formatDurationLong(totais.ficha.total), { fonte: 'bold', tamanho: 24, cor, alinhamento: 'dir' });
  y += 18;

  // A faixa do veredito: fundo a 5% da cor sobre branco, filete de 2pt à
  // esquerda. Sem canto arredondado — em PDF isso é bezier, e não vale.
  const larguraTexto = doc.largura - doc.margem * 2 - 18;
  const linhas = quebrar(v.frase, larguraTexto, 'normal', 9);
  const alturaFaixa = linhas.length * 12 + 12;
  const tinta5 = cor.map((c) => 1 - (1 - c) * 0.09);
  doc.retangulo(doc.margem, y, doc.largura - doc.margem * 2, alturaFaixa, { cor: tinta5 });
  doc.retangulo(doc.margem, y, 2, alturaFaixa, { cor });
  let ly = y + 15;
  for (const l of linhas) {
    doc.texto(doc.margem + 12, ly, l, { tamanho: 9, cor });
    ly += 12;
  }
  y += alturaFaixa + 18;

  y = tabelaCategorias(doc, y, totais, { comTotal: true });
  doc.linha(doc.margem, y, dir, y, { cor: REGUA });
  return y + 20;
}

export function montarRelatorio({ resultado, totais, ficha, refMonth, tolerancia = 2, emitidoEm }) {
  const doc = criarDoc(PAGINA);
  let y = cabecalho(doc, { ficha, refMonth });
  y = heroi(doc, y, { resultado, totais, tolerancia });
  return doc;
}
```

`emitidoEm` entra na assinatura já agora porque a Task 7 vai usá-lo no rodapé; aqui ele
ainda não tem uso, e tudo bem.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- relatorioConferencia`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/relatorioConferencia.js src/relatorioConferencia.test.js
git commit -m "feat: relatorio da conferencia — cabecalho e heroi em A5

A5 porque o leitor e o WhatsApp no celular: uma A4 encolhe para 60%
numa tela de 360px. Recebe o resultado ja calculado e nao recalcula
nada — um segundo calculo divergiria do primeiro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Dia a dia e paginação

**Files:**
- Modify: `src/relatorioConferencia.js`
- Modify: `src/relatorioConferencia.test.js`

**Interfaces:**
- Consumes: tudo da Task 5.
- Produces: `montarRelatorio` passa a desenhar todos os dias, paginando. Nenhuma assinatura nova exposta.

- [ ] **Step 1: Escrever o teste**

Acrescente a `src/relatorioConferencia.test.js` (as ajudas `dia`, `montar`, `textos` já estão no arquivo):

```js
describe('dia a dia', () => {
  it('traz todos os dias, com data, dia da semana e veredito', () => {
    const dias = [
      dia('2025-11-10', 'fecha', { d50: 14, total: 14 }, { d50: 14, total: 14 }, ['ADAMI SA MADEIRAS']),
      dia('2025-11-12', 'divergencia', { d50: 90, total: 90 }, { d50: 60, total: 60 }, ['TIROL']),
    ];
    const t = textos(montar(dias));
    expect(t).toContain('10/11');
    expect(t).toContain('seg');
    expect(t).toContain('Fecha');
    expect(t).toContain('12/11');
    expect(t).toContain('qua');
    expect(t).toContain('Divergência');
    expect(t).toContain('ADAMI SA MADEIRAS');
    expect(t).toContain('TIROL');
  });

  it('o dia que fecha não ganha mini-tabela', () => {
    const doc = montar([dia('2025-11-10', 'fecha', { d50: 14, total: 14 }, { d50: 14, total: 14 })]);
    // 'App' aparece uma vez no herói e uma no cabeçalho da tabela do herói — nunca três.
    expect(textos(doc).filter((s) => s === 'App')).toHaveLength(2);
  });

  it('todo status diferente de fecha ganha mini-tabela', () => {
    for (const status of ['divergencia', 'só na ficha', 'só no app']) {
      const doc = montar([dia('2025-11-12', status, { d50: 90, total: 90 }, { d50: 60, total: 60 })]);
      expect(textos(doc).filter((s) => s === 'App').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('explica a ausência em vez de deixar uma coluna zerada parecendo erro', () => {
    const soFicha = textos(montar([dia('2025-11-14', 'só na ficha', {}, { d50: 29, total: 29 })]));
    expect(soFicha).toContain('sem lançamento no app');

    const soApp = textos(montar([dia('2025-11-14', 'só no app', { d50: 29, total: 29 }, {})]));
    expect(soApp).toContain('a ficha não tem este dia');
  });

  it('mostra o diferencial pequeno quando o dia fecha por tolerância', () => {
    const t = textos(montar([dia('2025-11-10', 'fecha', { d50: 90, total: 90 }, { d50: 89, total: 89 })]));
    expect(t).toContain('+00:01');
  });

  it('o rótulo do veredito e o diferencial não caem no mesmo lugar', () => {
    // Os dois disputam a linha do dia. Encaixar ambos à direita os sobrepõe,
    // e o leitor vê um borrão em vez de um número.
    const ops = montar([dia('2025-11-10', 'fecha', { d50: 90, total: 90 }, { d50: 89, total: 89 })])
      .paginas.flat();
    const rotulo = ops.find((o) => o.str === 'Fecha');
    const difer = ops.find((o) => o.str === '+00:01');
    expect(rotulo.y).toBe(difer.y);
    expect(rotulo.x).toBeLessThan(difer.x - 60);
  });

  it('lista os dois clientes de um dia', () => {
    const t = textos(montar([
      dia('2025-11-13', 'fecha', { d50: 150, total: 150 }, { d50: 150, total: 150 }, ['ADAMI SA MADEIRAS', 'TIROL']),
    ]));
    expect(t.join(' ')).toContain('ADAMI SA MADEIRAS');
    expect(t.join(' ')).toContain('TIROL');
  });

  it('pinta o veredito com a cor dele', () => {
    const doc = montar([dia('2025-11-12', 'divergencia', { d50: 90, total: 90 }, { d50: 60, total: 60 })]);
    const rotulo = doc.paginas.flat().find((o) => o.str === 'Divergência');
    expect(rotulo.cor).toEqual([0.745, 0.071, 0.235]);
  });
});

describe('paginação', () => {
  const muitosDias = (n) => Array.from({ length: n }, (_, i) =>
    dia(`2025-11-${String((i % 25) + 1).padStart(2, '0')}`, 'fecha',
      { d50: 60, total: 60 }, { d50: 60, total: 60 }, ['ADAMI SA MADEIRAS']));

  it('um mês curto cabe numa página', () => {
    expect(montar(muitosDias(3)).paginas).toHaveLength(1);
  });

  it('um mês cheio transborda para mais páginas', () => {
    expect(montar(muitosDias(40)).paginas.length).toBeGreaterThan(1);
  });

  it('nenhum dia é partido entre páginas', () => {
    const doc = montar(muitosDias(40));
    // A data abre o bloco; se um bloco fosse partido, a mini-tabela ou os
    // clientes daquele dia cairiam numa página sem a data correspondente.
    for (const pagina of doc.paginas) {
      const ops = pagina.filter((o) => o.tipo === 'texto');
      const primeiraData = ops.findIndex((o) => /^\d{2}\/\d{2}$/.test(o.str));
      const clientes = ops.findIndex((o) => o.str === 'ADAMI SA MADEIRAS');
      if (clientes >= 0) expect(primeiraData).toBeGreaterThanOrEqual(0);
      if (clientes >= 0) expect(primeiraData).toBeLessThan(clientes);
    }
  });

  it('nada é desenhado abaixo da margem inferior', () => {
    const doc = montar(muitosDias(40));
    for (const pagina of doc.paginas) {
      for (const op of pagina) {
        const y = op.tipo === 'linha' ? op.y2 : (op.tipo === 'retangulo' ? op.y + op.h : op.y);
        expect(y).toBeLessThanOrEqual(595.28 - 20);
      }
    }
  });

  it('o PDF ignora o filtro da tela: sai o resultado inteiro', () => {
    const dias = [
      dia('2025-11-10', 'fecha', { d50: 60, total: 60 }, { d50: 60, total: 60 }),
      dia('2025-11-12', 'divergencia', { d50: 90, total: 90 }, { d50: 60, total: 60 }),
      dia('2025-11-13', 'fecha', { d50: 60, total: 60 }, { d50: 60, total: 60 }),
    ];
    const t = textos(montar(dias));
    expect(t).toContain('10/11');
    expect(t).toContain('12/11');
    expect(t).toContain('13/11');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- relatorioConferencia`
Expected: FAIL — os testes novos falham (`expected [...] to contain '10/11'`); os da Task 5 continuam passando.

- [ ] **Step 3: Implementar**

Em `src/relatorioConferencia.js`, acrescente antes de `montarRelatorio`:

```js
const LINHA_DIA = 15;
const LINHA_CLIENTE = 12;
const LINHA_CAT = 12;
const CABECALHO_CAT = 11;
const RESPIRO_DIA = 9;

// Medir antes de posicionar é o que permite nunca partir um dia entre páginas:
// um dia cortado ao meio é exatamente o que faz alguém ler o número errado.
function alturaDoDia(diaConf) {
  const cats = CATS.filter((c) => diaConf.app[c.k] > 0 || diaConf.ficha[c.k] > 0);
  let h = LINHA_DIA;
  if (diaConf.clientes.length) h += LINHA_CLIENTE;
  if (diaConf.status !== 'fecha') h += CABECALHO_CAT + cats.length * LINHA_CAT;
  if (diaConf.status === 'só na ficha' || diaConf.status === 'só no app') h += LINHA_CLIENTE;
  return h + RESPIRO_DIA;
}

const AUSENCIA = {
  'só na ficha': 'sem lançamento no app',
  'só no app': 'a ficha não tem este dia',
};

function desenharDia(doc, diaConf, y) {
  const dir = doc.largura - doc.margem;
  const v = VEREDITO[diaConf.status];
  const [, mes, d] = diaConf.data.split('-');
  const dow = DAY_SHORT[parseDate(diaConf.data).getDay()];

  // A linha lê da esquerda para a direita: 12/11 qua Divergência … +00:30 01:30.
  // O rótulo fica à esquerda, e não encostado no total, porque o diferencial
  // também disputa o lado direito — encaixar os dois lá sobrepõe um no outro.
  doc.texto(doc.margem, y, `${d}/${mes}`, { fonte: 'bold', tamanho: 10, cor: TINTA });
  doc.texto(doc.margem + 32, y, dow, { tamanho: 8, cor: FRACO });
  doc.texto(doc.margem + 56, y, v.rotulo, { tamanho: 7.5, cor: v.cor, tracking: 0.3 });

  // 'Só na ficha' é o único caso em que o app não tem número nenhum: aí o
  // total do cabeçalho é o da ficha, senão seria sempre 00:00.
  const total = diaConf.status === 'só na ficha' ? diaConf.ficha.total : diaConf.app.total;
  doc.texto(dir, y, formatDurationLong(total), { fonte: 'bold', tamanho: 10, cor: TINTA, alinhamento: 'dir' });

  // O dia que fecha com um minuto de diferença ainda deve isso ao leitor —
  // pequeno e cinza, sem virar alarme.
  if (diaConf.status === 'fecha' && diaConf.diff.total !== 0) {
    doc.texto(dir - 46, y, fmtDif(diaConf.diff.total), { tamanho: 7.5, cor: FRACO, alinhamento: 'dir' });
  }
  y += LINHA_DIA;

  if (diaConf.clientes.length) {
    const nomes = diaConf.clientes.map((c) => c.nome).join(' · ');
    doc.texto(doc.margem, y, truncar(nomes, doc.largura - doc.margem * 2, 'normal', 8), { tamanho: 8, cor: FRACO });
    y += LINHA_CLIENTE;
  }

  if (AUSENCIA[diaConf.status]) {
    doc.texto(doc.margem, y, AUSENCIA[diaConf.status], { tamanho: 8, cor: v.cor });
    y += LINHA_CLIENTE;
  }

  if (diaConf.status !== 'fecha') {
    y = tabelaCategorias(doc, y, diaConf, { comTotal: false });
  }

  return y + RESPIRO_DIA;
}

function cabecalhoMagro(doc, { refMonth }) {
  const dir = doc.largura - doc.margem;
  doc.texto(doc.margem, TOPO, 'horas+', { fonte: 'bold', tamanho: 9, cor: FRACO });
  doc.texto(dir, TOPO, `conferência · ${MONTH_FULL[refMonth.month - 1]} de ${refMonth.year}`,
    { tamanho: 7, cor: FRACO, alinhamento: 'dir', tracking: 0.5 });
  doc.linha(doc.margem, TOPO + 7, dir, TOPO + 7, { cor: REGUA });
  return TOPO + 26;
}
```

E substitua o corpo de `montarRelatorio` por:

```js
export function montarRelatorio({ resultado, totais, ficha, refMonth, tolerancia = 2, emitidoEm }) {
  const doc = criarDoc(PAGINA);
  let y = cabecalho(doc, { ficha, refMonth });
  y = heroi(doc, y, { resultado, totais, tolerancia });

  doc.texto(doc.margem, y, 'DIA A DIA', { tamanho: 7, cor: FRACO, tracking: 0.9 });
  y += 16;

  const limite = doc.altura - RODAPE;
  for (const diaConf of resultado) {
    if (y + alturaDoDia(diaConf) > limite) {
      doc.novaPagina();
      y = cabecalhoMagro(doc, { refMonth });
    }
    y = desenharDia(doc, diaConf, y);
  }

  return doc;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- relatorioConferencia`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/relatorioConferencia.js src/relatorioConferencia.test.js
git commit -m "feat: relatorio — dia a dia e paginacao que nunca parte um dia

Medir o bloco antes de posicionar e o que garante isso: um dia cortado
ao meio e exatamente o que faz alguem ler o numero errado. O documento
sai do resultado inteiro, nunca da lista filtrada da tela.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Rodapé, numeração e `gerarPdfConferencia`

O rodapé só pode ser desenhado depois que todas as páginas existem — o `N de M` precisa do M.

**Files:**
- Modify: `src/relatorioConferencia.js`
- Modify: `src/relatorioConferencia.test.js`

**Interfaces:**
- Consumes: tudo das Tasks 5 e 6.
- Produces: `gerarPdfConferencia({ resultado, totais, ficha, refMonth, tolerancia, emitidoEm }) → Uint8Array`.

- [ ] **Step 1: Escrever o teste**

Acrescente a `src/relatorioConferencia.test.js`:

```js
import { gerarPdfConferencia } from './relatorioConferencia';
import { extractPdfText } from './pdfText';

describe('rodapé', () => {
  const muitos = Array.from({ length: 40 }, (_, i) =>
    dia(`2025-11-${String((i % 25) + 1).padStart(2, '0')}`, 'fecha',
      { d50: 60, total: 60 }, { d50: 60, total: 60 }));

  it('numera todas as páginas com o total certo', () => {
    const doc = montar(muitos);
    const m = doc.paginas.length;
    expect(m).toBeGreaterThan(1);
    for (let i = 0; i < m; i++) {
      expect(textosDaPagina(doc, i)).toContain(`${i + 1} de ${m}`);
    }
  });

  it('diz quando foi gerado e sob que tolerância', () => {
    const t = textos(montar([dia('2025-11-10', 'fecha', { d50: 60, total: 60 }, { d50: 60, total: 60 })]));
    expect(t.some((s) => s.includes('03/08/2026'))).toBe(true);
    expect(t.some((s) => s.includes('tolerância de 2 min'))).toBe(true);
    expect(t.some((s) => s.includes('data civil'))).toBe(true);
  });
});

describe('gerarPdfConferencia', () => {
  const args = {
    resultado: [dia('2025-11-10', 'divergencia', { d50: 90, total: 90 }, { d50: 60, total: 60 }, ['ADAMI SA MADEIRAS'])],
    ficha: fichaFalsa,
    refMonth: { year: 2025, month: 11 },
    tolerancia: 2,
    emitidoEm: new Date(2026, 7, 3, 14, 30),
  };

  it('devolve bytes de um PDF', () => {
    const bytes = gerarPdfConferencia({ ...args, totais: somaTotais(args.resultado) });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe('%PDF-1.4');
  });

  it('o leitor do próprio app lê de volta o documento inteiro', async () => {
    const bytes = gerarPdfConferencia({ ...args, totais: somaTotais(args.resultado) });
    const lidas = await extractPdfText(bytes.buffer);
    expect(lidas).toContain('CONFERÊNCIA DA FICHA');
    expect(lidas).toContain('JOAO PACCE ANDREONI');
    expect(lidas).toContain('ADAMI SA MADEIRAS');
    expect(lidas).toContain('Divergência');
    expect(lidas.some((s) => s.includes('A ficha reconhece'))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- relatorioConferencia`
Expected: FAIL — `gerarPdfConferencia is not a function` e o rodapé ausente.

- [ ] **Step 3: Implementar**

Acrescente a `src/relatorioConferencia.js`:

```js
// O rodapé é a última coisa a ser desenhada porque o "N de M" precisa do M.
function rodape(doc, { refMonth, tolerancia, emitidoEm }) {
  const dir = doc.largura - doc.margem;
  const y = doc.altura - 22;
  const total = doc.paginas.length;
  const nota = `horas+ · ${MONTH_FULL[refMonth.month - 1]} de ${refMonth.year} · gerado em `
    + `${emitidoEm.getDate().toString().padStart(2, '0')}/`
    + `${(emitidoEm.getMonth() + 1).toString().padStart(2, '0')}/${emitidoEm.getFullYear()}`
    + ` · comparação por data civil, tolerância de ${tolerancia} min`;

  for (let i = 0; i < total; i++) {
    doc.irParaPagina(i);
    doc.linha(doc.margem, y - 10, dir, y - 10, { cor: REGUA });
    doc.texto(doc.margem, y, nota, { tamanho: 6.5, cor: FRACO });
    doc.texto(dir, y, `${i + 1} de ${total}`, { tamanho: 6.5, cor: FRACO, alinhamento: 'dir' });
  }
}

export function gerarPdfConferencia(args) {
  const doc = montarRelatorio(args);
  const { refMonth } = args;
  return doc.bytes({
    titulo: `Conferência da ficha — ${MONTH_FULL[refMonth.month - 1]} de ${refMonth.year}`,
    emitidoEm: args.emitidoEm,
  });
}
```

E no fim de `montarRelatorio`, antes do `return doc`, acrescente:

```js
  rodape(doc, { refMonth, tolerancia, emitidoEm: emitidoEm ?? new Date(0) });
  doc.irParaPagina(0);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- relatorioConferencia`
Expected: PASS.

Run: `npm test`
Expected: PASS, suíte inteira.

- [ ] **Step 5: Olhar o arquivo com os próprios olhos**

Nenhum teste prova que um PDF **abre**. Gere um de verdade:

```bash
node --input-type=module -e "
import { gerarPdfConferencia } from './src/relatorioConferencia.js';
import { writeFileSync } from 'node:fs';
const cat = (o={}) => ({ d50:0, d100:0, n50:0, n100:0, total:0, ...o });
const dia = (data, status, app, fic, cli=[]) => ({
  data, status, app: cat(app), ficha: cat(fic),
  diff: cat({ d50:(app.d50||0)-(fic.d50||0), d100:(app.d100||0)-(fic.d100||0),
    n50:(app.n50||0)-(fic.n50||0), n100:(app.n100||0)-(fic.n100||0),
    total:(app.total||0)-(fic.total||0) }),
  clientes: cli.map((nome,i)=>({ codigo:String(100+i), nome })), colaborador:'', linhasFicha:[],
});
const resultado = [
  dia('2025-11-03','fecha',{d50:14,total:14},{d50:14,total:14},['ADAMI SA MADEIRAS']),
  dia('2025-11-12','divergencia',{d50:90,total:90},{d50:60,total:60},['TIROL']),
  dia('2025-11-14','só na ficha',{},{d50:29,total:29},['COOPERATIVA AGRARIA AGROINDUSTRIAL LTDA']),
  dia('2025-11-16','fecha',{d50:180,n50:60,total:240},{d50:180,n50:59,total:239},['SOPASTA','ESTRELA']),
];
const app = cat(); const fic = cat(); const diff = cat();
for (const d of resultado) for (const k of Object.keys(app)) { app[k]+=d.app[k]; fic[k]+=d.ficha[k]; }
for (const k of Object.keys(app)) diff[k]=app[k]-fic[k];
const bytes = gerarPdfConferencia({
  resultado, totais:{ app, ficha:fic, diff },
  ficha:{ tecnico:'JOAO PACCE ANDREONI', periodo:{ inicio:'2025-10-26', fim:'2025-11-25' } },
  refMonth:{ year:2025, month:11 }, tolerancia:2, emitidoEm:new Date(2026,7,3,14,30),
});
writeFileSync('amostra-conferencia.pdf', bytes);
console.log('escrito:', bytes.length, 'bytes');
"
```

Abra `amostra-conferencia.pdf`. Confira: **abre sem aviso**; os acentos de "CONFERÊNCIA" e "Divergência" estão certos; o `≠` aparece; as colunas de número alinham à direita; o nome comprido do cliente foi truncado com `…`; o rodapé numera.

Apague depois: `rm amostra-conferencia.pdf` (não commite).

- [ ] **Step 6: Commit**

```bash
git add src/relatorioConferencia.js src/relatorioConferencia.test.js
git commit -m "feat: relatorio — rodape numerado e gerarPdfConferencia

O rodape e desenhado por ultimo porque o 'N de M' precisa do M. Teste
de fecho: o extractPdfText le de volta o documento inteiro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: O botão na `ConferenciaScreen`

**Files:**
- Modify: `src/App.jsx` (imports; `ConferenciaScreen` — botão logo abaixo do herói)

**Interfaces:**
- Consumes: `gerarPdfConferencia`, `nomeArquivoRelatorio` de `./relatorioConferencia`.
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Importar e escrever o compartilhamento**

No topo do `App.jsx`, junto dos outros imports locais:

```js
import { gerarPdfConferencia, nomeArquivoRelatorio } from './relatorioConferencia';
```

`Share2` já precisa vir do `lucide-react` — acrescente-o ao import existente de ícones (onde já entram `Upload`, `FileText`, `AlertTriangle`, `X`).

Dentro de `ConferenciaScreen`, depois do bloco que calcula `veredito`, acrescente:

```js
  // Gerar e mandar. O documento sai do `resultado` INTEIRO, nunca de
  // `listaDias`: um relatório que reflete em silêncio o filtro da tela mente
  // por omissão, e quem receber no WhatsApp não tem como saber que havia um.
  const [gerando, setGerando] = useState(false);

  const gerarRelatorio = async () => {
    if (!resultado || !resultado.length) return;
    setGerando(true);
    try {
      const bytes = gerarPdfConferencia({
        resultado, totais, ficha, refMonth, tolerancia: TOL, emitidoEm: new Date(),
      });
      const nome = nomeArquivoRelatorio(refMonth);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const file = new File([blob], nome, { type: 'application/pdf' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (e) {
          // Cancelar não é erro: o usuário fechou a bandeja de propósito.
          if (e?.name === 'AbortError') return;
          // Qualquer outra falha cai no download, abaixo.
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setGerando(false);
    }
  };
```

- [ ] **Step 2: Pôr o botão logo abaixo do herói**

Na `ConferenciaScreen`, entre o `</section>` que fecha o herói e o `<section>` do "Dia a dia", insira:

```jsx
              {/* Depois de ler o veredito, o gesto natural é mandar. Nesta
                  altura o CTA de importar já colapsou no chip "Trocar", então
                  este é o botão principal da tela. */}
              <button
                onClick={gerarRelatorio}
                disabled={gerando}
                className="w-full mb-6 py-3 rounded-xl bg-amber-500/10 border border-amber-700/40 hover:bg-amber-500/15 hover:border-amber-600/50 disabled:opacity-50 transition flex items-center justify-center gap-2 text-amber-200 text-sm font-medium"
              >
                <Share2 size={15} />
                {gerando ? 'Gerando…' : 'Relatório em PDF'}
              </button>
```

Ele fica dentro do bloco `resultado.length === 0 ? … : (…)`, no ramo em que há dias — assim não aparece quando não há nada a relatar. E como todo o trecho está dentro de `{resultado && (…)}`, ele **não existe** quando a ficha tem erro de invariante, quando o período é ilegível ou quando a ficha é de outro mês.

- [ ] **Step 3: Rodar tudo e provar no navegador**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: sem erro.

Run: `npm run dev`. Então:
1. Importe uma ficha de `exemplos_ficha_horas/`.
2. Confirme que o botão aparece **abaixo do herói**.
3. Antes de clicar, no console: `const antes = localStorage.getItem('controle_horas_v3')`.
4. Clique. No desktop deve baixar o PDF; abra-o.
5. No console: `localStorage.getItem('controle_horas_v3') === antes` → **tem que ser `true`**. Se não for, pare: alguma coisa gravou, e isso viola a garantia central da spec.
6. Filtre por "Divergência" na tela, gere de novo, e confirme que o PDF continua trazendo **todos** os dias.
7. Navegue para outro mês e confirme que o botão **some** junto com o resultado.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: botao de relatorio em PDF na aba de conferencia

navigator.share com arquivo quando da, download por ancora quando nao
da, e cancelar nao e erro. O documento sai do resultado inteiro, nunca
da lista filtrada — um relatorio que reflete um filtro em silencio
mente por omissao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Verificação no aparelho

Nada disto tem teste automatizado, e é o que decide se a feature serve.

**Files:** nenhum. É verificação.

- [ ] **Step 1: Publicar e forçar a atualização do Service Worker**

O PWA usa `autoUpdate` (`vite.config.js:9`): o SW serve código antigo por um tempo depois do deploy. **Antes de testar qualquer coisa no aparelho**, force: DevTools → Application → Service Workers → Update, ou hard reload. Sem isso, você está testando o código velho e vai concluir errado.

- [ ] **Step 2: Conferir contra as sete fichas reais**

Para cada PDF de `exemplos_ficha_horas/`: importe, gere o relatório, abra. Confira que o total do herói bate com o que a tela mostra, e que o número de dias do "dia a dia" é o mesmo da lista.

- [ ] **Step 3: Ler no celular, sem zoom**

Mande o PDF para si mesmo pelo WhatsApp. Abra no visualizador do celular. **A pergunta é uma só: dá para ler sem dar zoom?** Se não der, o corpo precisa crescer — é o motivo de a página ser A5.

- [ ] **Step 4: Provar que nada foi gravado**

No aparelho, com o app aberto, antes e depois de gerar:

```js
localStorage.getItem('controle_horas_v3')
```

As duas leituras têm que ser idênticas. Este é o dado insubstituível do projeto: não há backup, nem no aparelho nem em servidor nenhum.

- [ ] **Step 5: Registrar o resultado na spec**

Acrescente à spec, no final da seção "Risco de dados", um bloco **"Verificado em execução em AAAA-MM-DD"** com o que você observou de fato — no formato que a spec 4 usa (linhas 265–289). Escreva o que aconteceu, não o que devia acontecer; se alguma coisa não foi verificada, diga que não foi.

```bash
git add docs/superpowers/specs/2026-08-03-relatorio-pdf-conferencia-design.md
git commit -m "docs: registra a verificacao em execucao do relatorio em PDF

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Notas para quem for implementar

- **`npm test` roda tudo.** `npm test -- <padrão>` filtra por nome de arquivo.
- **Não instale nada.** Se algo parecer exigir uma dependência, o desenho está errado — pare e pergunte.
- **A ordem das tasks importa.** A 1 destrava a 5; a 2 e a 3 destravam a 5 e a 6; a 4 destrava a 5.
- **Se um teste da suíte antiga mudar de resultado**, você mudou comportamento sem querer. Volte atrás em vez de ajustar o teste.
- **Ao mexer no `App.jsx`, cuidado com a rolagem:** `html`/`body`/`#root` usam `overflow-x: clip`, nunca `hidden` (`src/index.css:11-29`). Três commits já consertaram isso.
