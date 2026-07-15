# Sensibilidade do Deslize e Botões de Dia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o deslize reconhecer flicks rápidos e o arco natural do polegar, e acrescentar botões `<` e `>` para trocar de dia.

**Architecture:** A decisão do gesto sai do `handleTouchEnd` e vira função pura em `src/swipe.js`, testada por tabela. O `DayScreen` ganha um `goToDay(delta)` único, por onde passam gesto e botões, para que o limite de hoje e a direção da animação não possam divergir entre eles.

**Tech Stack:** React 18, Vite 5, Tailwind 3.4, Vitest 4, lucide-react.

Spec: `docs/superpowers/specs/2026-07-15-sensibilidade-e-botoes-do-dia-design.md`

## Global Constraints

- **Nenhum `touchmove`, nenhum `preventDefault`, nenhum CSS novo.** É a linha vermelha do
  projeto: três commits (`9a4247b`, `d3037d4`, `4a38b80`) existem só para consertar a
  rolagem vertical por toque. `git diff main -- src/index.css` tem que sair vazio ao fim.
- **Nenhuma dependência nova.** `ChevronLeft` e `ChevronRight` já estão importados em
  `src/App.jsx:3`.
- **Não tocar em:** `controle_horas_v3`, a migração (`src/App.jsx:199`, `219-220`, `237`),
  a forma do que é gravado, o `key` da `DayEditor`, ou `src/index.css`.
- **Identificadores em inglês, comentários e textos de tela em português.** É a convenção
  do arquivo (`isToday`, `heroLabel`, `badgeKind`, `dayAnim`). A spec escreve `irParaDia`
  em prosa; no código o nome é `goToDay`.
- Números da regra, exatos, da spec: distância `45`, velocidade `0.4` px/ms, distância
  mínima do flick `18`, cone `|dx| > |dy|`.

---

### Task 1: `swipeIntent` — módulo puro `src/swipe.js`

A sensibilidade vira tabela testada em vez de "achei que ficou bom". As linhas negativas
importam tanto quanto as positivas: afrouxar o limiar sem prová-las troca um incômodo
(deslize ignorado) por outro (rolagem virando troca de dia).

**Files:**
- Create: `src/swipe.js`
- Test: `src/swipe.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `swipeIntent({ dx, dy, dt })` → `1` (avançar um dia) | `-1` (voltar um dia) |
  `null` (não é deslize). `dx`/`dy` em px, `dt` em ms.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/swipe.test.js`:

```js
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- --run src/swipe.test.js`
Expected: FAIL — `Failed to resolve import "./swipe"`.

- [ ] **Step 3: Criar `src/swipe.js`**

```js
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- --run`
Expected: PASS — 40 testes (28 de antes + 12 novos).

- [ ] **Step 5: Commit**

```bash
git add src/swipe.js src/swipe.test.js
git commit -F- <<'EOF'
feat: swipeIntent, a decisao do deslize como funcao pura testada

A sensibilidade e a feature desta spec, e "achei que ficou bom" nao e
verificavel. A regra vira tabela: as duas linhas que motivaram a spec (o arco
natural do polegar e o flick rapido e curto, hoje recusados) e as quatro que
NAO podem disparar — rolagem vertical, fling vertical, toque e arrasto curto.

As negativas importam tanto quanto as positivas: afrouxar o limiar sem prova-las
troca um incomodo por outro, e o outro seria uma rolagem virando troca de dia.

Devolve o delta (+1/-1/null), nao a direcao da animacao: o delta e a intencao,
o lado de onde a animacao entra e consequencia. O sinal tem teste proprio
porque o plano da spec 2 ja inverteu essa convencao uma vez.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 2: Ligar o `DayScreen` ao módulo e consolidar `goToDay`

O gesto deixa de decidir e passa a perguntar. Ao mesmo tempo, o caminho "trocar o dia"
vira um só — antes de a Task 3 acrescentar o segundo consumidor.

**Files:**
- Modify: `src/App.jsx` (import no topo; `handleTouchStart`, `handleTouchEnd` e o novo
  `goToDay` dentro de `DayScreen`)

**Interfaces:**
- Consumes: `swipeIntent({ dx, dy, dt })` da Task 1.
- Produces: `goToDay(delta)` e `canGoForward` dentro do `DayScreen` — a Task 3 usa os dois.

- [ ] **Step 1: Importar o módulo**

Em `src/App.jsx`, trocar a linha `import { refMonthForDate } from './period';` por:

```js
import { refMonthForDate } from './period';
import { swipeIntent } from './swipe';
```

- [ ] **Step 2: Acrescentar `goToDay` e `canGoForward`**

No `DayScreen`, logo **abaixo** do bloco `const [dayAnim, setDayAnim] = useState(null);`,
acrescentar:

```jsx
  // Passado é livre; para frente trava em hoje.
  const canGoForward = dateStr < todayStr;

  // Um caminho só para trocar o dia: o gesto e os botões da Task 3 passam por
  // aqui. Duas cópias do limite divergiriam na primeira vez que alguém mexesse
  // numa delas.
  const goToDay = (delta) => {
    const next = formatDate(addDays(parseDate(dateStr), delta));
    // Sem aviso: a ausência de movimento é o feedback, e um toast para um gesto
    // acidental é ruído.
    if (next > todayStr) return;
    setDayAnim(delta > 0 ? 'right' : 'left');
    onSelectDate(next);
  };
```

- [ ] **Step 3: O `touchstart` passa a guardar o instante**

Trocar a última linha do `handleTouchStart` (`touchRef.current = { x0: t.clientX, y0: t.clientY };`) por:

```jsx
    touchRef.current = { x0: t.clientX, y0: t.clientY, t0: Date.now() };
```

`Date.now()` nos dois lados — não misturar com `e.timeStamp`, que tem outra origem.

- [ ] **Step 4: O `touchend` pergunta em vez de decidir**

Trocar o `handleTouchEnd` inteiro por:

```jsx
  const handleTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const intent = swipeIntent({
      dx: t.clientX - start.x0,
      dy: t.clientY - start.y0,
      dt: Date.now() - start.t0,
    });
    if (intent) goToDay(intent);
  };
```

O comentário de bloco acima do `touchRef` (`// Gesto: só coordenadas, sem touchmove...`)
continua verdadeiro e fica como está.

- [ ] **Step 5: Confirmar que nada regrediu**

Run: `npm test -- --run`
Expected: PASS — 40 testes.

Run: `npm run build`
Expected: build sem erros.

Run: `git diff main -- src/index.css`
Expected: vazio.

- [ ] **Step 6: Verificar à mão**

Run: `npm run dev` (com emulação de toque)

1. Um deslize rápido e curto troca o dia. **Era o sintoma relatado.**
2. Um deslize natural, sem cuidado de fazer reta, troca o dia. **Era o outro.**
3. Rolar a tela na vertical, com força, **não** troca o dia.
4. A rolagem vertical por toque continua funcionando, com o dedo em cima do card.
5. Em hoje, deslizar para frente continua não fazendo nada.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
fix: o deslize passa a reconhecer flick rapido e arco do polegar

O gesto deixa de decidir e passa a perguntar ao swipeIntent. O touchstart
guarda o instante — e so isso: continua sem touchmove e sem preventDefault,
entao a rolagem vertical por toque nao e tocada.

Ao mesmo tempo o caminho "trocar o dia" vira um so (goToDay), antes de os
botoes chegarem e virarem uma segunda copia da regra do limite.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 3: Os botões `<` e `>`

O gesto não é descoberto nem acessível. Os botões dão o alvo tocável, no padrão que a aba
de mês e o seletor de ano já usam.

**Files:**
- Modify: `src/App.jsx` (o bloco `{/* Hero */}` do `DayScreen`)

**Interfaces:**
- Consumes: `goToDay(delta)` e `canGoForward` da Task 2.
- Produces: nada.

- [ ] **Step 1: Trocar o bloco do hero**

No `DayScreen`, trocar o bloco inteiro que começa em `{/* Hero */}` e vai até o
`</div>` que fecha o `<div className="mb-6">` (o que contém o rótulo, a data, o dia da
semana e o badge) por:

```jsx
      {/* Hero */}
      <div className="mb-6">
        <div className="text-center">
          {isToday ? (
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-medium mb-2">
              Hoje
            </div>
          ) : (
            <button
              onClick={() => { setDayAnim('right'); onSelectDate(todayStr); }}
              className="mb-2 mx-auto flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.18em] text-amber-400/90 font-medium hover:text-amber-300 transition"
            >
              {heroLabel}
              <span className="normal-case tracking-normal text-stone-500">· voltar para hoje</span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => goToDay(-1)}
            className="w-10 h-10 flex-shrink-0 rounded-full bg-stone-900 border border-stone-800 hover:bg-stone-800 flex items-center justify-center text-stone-400 transition"
            aria-label="Dia anterior"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex-1 min-w-0 text-center">
            <div className="text-4xl text-stone-100 leading-[1.05]"
                 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400 }}>
              {day.getDate()} de {MONTH_FULL[day.getMonth()]}
            </div>
            <div className="text-stone-400 text-sm mt-1.5 capitalize">
              {DAY_FULL[dow]}
            </div>
          </div>

          <button
            onClick={() => goToDay(1)}
            disabled={!canGoForward}
            className="w-10 h-10 flex-shrink-0 rounded-full bg-stone-900 border border-stone-800 flex items-center justify-center text-stone-400 transition enabled:hover:bg-stone-800 disabled:opacity-30"
            aria-label="Próximo dia"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {badgeKind && (
          <div className="mt-3 flex justify-center"><DayBadge kind={badgeKind} name={holidayName} /></div>
        )}
      </div>
```

Notas do que mudou e por quê:
- O hero passa de alinhado à esquerda para centralizado, para caber no padrão `< rótulo >`
  da aba de mês (`src/App.jsx`, `MonthScreen`, o bloco do `onNavigateMonth`).
- `mx-auto` no botão "voltar para hoje": ele é `flex`, então sem isso não centraliza.
- `flex-shrink-0` nos chevrons e `min-w-0` no meio: uma data longa ("29 de dezembro") não
  pode espremer os botões.
- `enabled:hover:` em vez de `hover:` no `>`: um botão desabilitado não pode acender.
- `disabled:opacity-30`: apagado, não escondido. Esconder mudaria o layout conforme o dia
  e deixaria a borda do tempo misteriosa.

- [ ] **Step 2: Confirmar que nada regrediu**

Run: `npm test -- --run`
Expected: PASS — 40 testes.

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 3: Verificar à mão**

Run: `npm run dev`

1. Os botões `<` e `>` andam um dia, com a animação vindo do lado certo: `<` traz o dia da
   esquerda, `>` traz o dia da direita.
2. Em hoje o `>` está apagado, não clica e não acende no hover; o `<` funciona.
3. Fora de hoje o `>` está aceso e funciona.
4. O rótulo, a data, o dia da semana e o badge estão centralizados.
5. O "voltar para hoje" continua funcionando e está centralizado.
6. Tocar num botão **não** dispara o gesto (o dia anda um só, nunca dois).
7. Nenhuma barra de rolagem horizontal.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -F- <<'EOF'
feat: botoes < e > para trocar de dia no hero

O gesto nao e descoberto nem acessivel: quem nao sabe que existe nao acha, e
quem nao pode desliza nao usa. Os botoes dao o alvo tocavel, no padrao que a
aba de mes e o seletor de ano ja usam — o hero centraliza para caber nele.

Os dois passam pelo goToDay da task anterior, entao o limite de hoje e a
direcao da animacao sao os mesmos do gesto, por construcao. O > fica apagado em
hoje, nao escondido: esconder mudaria o layout conforme o dia e deixaria a
borda do tempo misteriosa.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 4: Verificação e registro

A spec não toca dados, mas os botões tornaram fácil andar muitos dias depressa — e isso é
novo. Esta tarefa prova que andar não grava, e fecha a spec.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-sensibilidade-e-botoes-do-dia-design.md`

**Interfaces:**
- Consumes: tudo das tarefas 1-3.
- Produces: nada.

- [ ] **Step 1: Provar que andar de dia não grava**

Run: `npm run dev`

No console do navegador, com a aba "hoje" aberta:

```js
const ls = () => JSON.parse(localStorage.getItem('controle_horas_v3')).entries;
const antes = JSON.stringify(ls());
// agora clicar em "<" dez vezes seguidas, depressa, e voltar em ">" dez vezes
// e então:
JSON.stringify(ls()) === antes;   // tem que ser true
```

Expected: `true`. O `initRef` da `DayEditor` bloqueia a gravação na montagem; nenhum dos
vinte passos pode escrever.

- [ ] **Step 2: Provar que o vínculo formulário↔dia não regrediu**

No `localStorage`, montar dois dias seguidos com o mesmo `start`/`end` e observações
diferentes — o cenário que a spec 2 já provou, agora alcançado pelos botões:

```json
"2026-07-12": { "start": "08:00", "end": "17:00", "note": "reuniao" },
"2026-07-13": { "start": "08:00", "end": "17:00", "note": "obra" }
```

Chegar no dia 12 **pelos botões** e conferir que o formulário mostra "reuniao"; um clique
em `>` mostra "obra". Editar o 13 e conferir que o 12 continua intacto.

- [ ] **Step 3: Rodar a verificação final**

Run: `npm test -- --run`
Expected: PASS — 40 testes.

Run: `npm run build`
Expected: build sem erros.

Run: `git diff main -- src/index.css`
Expected: vazio.

Run: `grep -n "preventDefault\|onTouchMove\|touchmove" src/App.jsx`
Expected: só a linha do comentário (`// Gesto: só coordenadas, sem touchmove...`).

- [ ] **Step 4: Registrar o resultado na spec**

Em `docs/superpowers/specs/2026-07-15-sensibilidade-e-botoes-do-dia-design.md`, ao final da
seção "Risco de dados", acrescentar o texto abaixo — **preenchendo os resultados com o que
foi de fato observado nos steps 1-3, não com o que se esperava observar.** Se algum step
falhou, escrever que falhou; não copiar este texto como se tudo tivesse passado:

```markdown
**Verificado em execução em 2026-07-15** (Task 4 do plano): andar vinte dias seguidos nos
botões, depressa, não gravou nada — o `entries` do `localStorage` saiu idêntico ao que
entrou. O vínculo formulário↔dia continua certo quando alcançado pelos botões em vez do
gesto: dois dias com o mesmo `start`/`end` e observações diferentes mostram cada um a sua,
e editar um não toca o vizinho. Nenhum `touchmove` nem `preventDefault` no código, e
`git diff main -- src/index.css` sai vazio.

**Pendente de confirmação no aparelho:** o reconhecimento em si. A tabela do
`swipe.test.js` prova que a regra faz o que a spec diz, mas se `45px` e `0.4px/ms` são os
números certos para o polegar do dono do projeto é uma aposta até ele deslizar. É o que
motivou a spec, e é a única coisa que nenhum teste aqui decide.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-15-sensibilidade-e-botoes-do-dia-design.md
git commit -F- <<'EOF'
docs: registrar verificacao da sensibilidade e dos botoes

Andar muitos dias depressa nos botoes nao grava nada, e o vinculo
formulario<->dia continua certo quando alcancado pelos botoes em vez do gesto.

O reconhecimento em si fica pendente de confirmacao no aparelho: quem julga se
o deslize "pegou" e o dedo do dono do projeto, e a tabela do swipe.test.js e
uma aposta sobre o que ele vai sentir, nao a prova.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Cobertura da spec

| Requisito da spec | Onde |
|---|---|
| Decisão 1 — distância OU velocidade | Task 1 (`longe`/`rapido`) |
| Decisão 2 — cone de 45° | Task 1 (`adx <= ady`) |
| Decisão 3 — função pura em módulo testável | Task 1 |
| Decisão 4 — sem `touchmove`/`preventDefault`/CSS | Task 2 (só `Date.now()` no start); Task 4 confere |
| Decisão 5 — botões centralizados no padrão do mês | Task 3 |
| Decisão 6 — `>` desabilitado em hoje | Task 3 (`disabled={!canGoForward}`) |
| Decisão 7 — um caminho só para trocar o dia | Task 2 (`goToDay`), consumido na Task 3 |
| Decisão 8 — um dia por gesto | Task 1 (devolve ±1, nunca ±N) |
| Tabela de comportamento (7 linhas) | Task 1, Step 1 |
| Limites exatos (45/46, 0.4, `dx==dy`, `dt=0`) | Task 1, Step 1 |
| Sinal do `dx` tem teste | Task 1, Step 1 |
| Navegar não grava | Task 4, Step 1 |
| Tocar num botão não dispara o gesto | Task 3, Step 3 item 6 (já coberto pelo `closest('button')`) |
| Risco de rolagem | Task 2 Step 6, Task 4 Step 3 |

## Fora de escopo

- Arrasto acompanhando o dedo.
- Pular vários dias num deslize longo ou muito rápido.
- Deslize na aba de mês.
- Limiar configurável pelo usuário.
