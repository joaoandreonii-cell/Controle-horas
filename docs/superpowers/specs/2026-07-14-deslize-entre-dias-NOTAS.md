# Deslize entre dias — notas de design (insumo para a spec 2)

Data: 2026-07-14
Status: **notas, não é a spec** — decisões já tomadas com o dono do projeto, prontas para
virar a spec formal.

> **Para quem for escrever a spec 2:** as decisões abaixo **já foram tomadas** com o dono
> do projeto num brainstorming. Não as reabra nem refaça as perguntas — ele já respondeu.
> Escreva a spec a partir daqui e pergunte **apenas** o que está listado em "Em aberto".
> Leia antes: `2026-07-14-lancamento-parcial-design.md` (spec 1) e o `CLAUDE.md` na raiz.

## O que é

Deslizar lateralmente na tela principal para alternar entre o dia anterior e o seguinte.

## Decisões tomadas

1. **Dias navegados são editáveis**, igual ao de hoje. Não é só leitura.
2. **`refMonth` acompanha o dia.** Ao cruzar a virada do período (dia 25 → 26), o mês de
   referência muda junto, e o "Acumulado" passa a mostrar o período ao qual o dia exibido
   pertence. A aba de mês também passa a abrir nesse período.
3. **Arquitetura: dividir o `TodayScreen` em duas peças.**
   - `DayScreen` (o `TodayScreen` renomeado) — dona do gesto, do cabeçalho, do hero e do
     card "Acumulado". **Sem estado de formulário.**
   - `DayEditor` — extraída do miolo, renderizada como `<DayEditor key={dateStr} … />`.
     Dona de `start`/`end`/`breaks`/`note`, do `initRef` e do auto-save. Contrato: "edito
     exatamente um dia".
4. **Gesto por coordenadas, sem interceptar nada.** `onTouchStart` grava `x0`,`y0`;
   `onTouchEnd` lê `changedTouches[0]` e troca o dia se `|dx| > 60 && |dx| > |dy| * 2`.
   Sem `touchmove`, sem `preventDefault`, sem CSS novo, sem dependência nova.
5. **Sem arrasto acompanhando o dedo.** Exigiria re-render a cada `touchmove` e aí sim
   `preventDefault`. Limiar + animação de entrada dá o feedback com risco zero.
6. **`App` passa a ter `selectedDate`**, e `refMonth` é sincronizado a partir dela por uma
   função nova `refMonthForDate(dateStr)` — a mesma regra do `getDefaultRefMonth`
   (`src/App.jsx:194-204`), extraída para receber uma data em vez de chamar `new Date()`
   por dentro. O `getDefaultRefMonth()` atual vira `refMonthForDate(hoje)`.

## Por que o `key` é o ponto central (não é detalhe de implementação)

Existe hoje um **bug latente** no `TodayScreen` que o deslize ativaria. É a razão de a
spec 1 vir antes e de a spec 2 ser desenhada assim.

O `TodayScreen` (`src/App.jsx:1176`) é cravado no dia de hoje. Ele guarda o formulário em
estado local (`1184-1187`) e tem um auto-save (`1210`) que grava com
`onSaveEntry(todayStr, payload)` (`1227`). O efeito que sincroniza o formulário quando o
dia muda (`1202`) depende **só** de `[currentEntry?.start, currentEntry?.end]`, e está com
`eslint-disable-line` na linha `1207` — o aviso que pegaria isso foi silenciado.

Isso é seguro hoje **apenas porque `todayStr` nunca muda**. O cenário de falha:

> Segunda tem 08:00–17:00 com observação "reunião". Terça tem 08:00–17:00 com observação
> "obra". O usuário desliza de segunda para terça. Como `start` e `end` são idênticos nos
> dois dias, as dependências do efeito não mudam e **ele não dispara** — o formulário
> continua com "reunião" enquanto a tela já mostra terça. O usuário ajusta qualquer campo,
> o auto-save roda e grava `onSaveEntry(terça, { …, note: 'reunião' })`. **A "obra" da
> terça é sobrescrita em silêncio.**

Com `key={dateStr}`, o React desmonta e remonta ao trocar de dia:
`useState(entry?.start || '')` (`1184`) reinicializa a partir do dia novo e `initRef`
(`1189`) volta a `true`, pulando o auto-save de montagem. O efeito da linha `1202` deixa
de existir. **Não sobra array de dependências para alguém errar depois.**

O `EntryEditor` (`622`) já é imune, por um mecanismo mais fraco: o efeito dele depende de
`[open, entry]` (`637`) — a identidade do objeto, que muda junto com o dia. É o padrão que
o `TodayScreen` errou ao destrinchar em primitivos.

## Alternativas rejeitadas (não reabrir)

- **Corrigir as dependências do efeito e manter o `TodayScreen` inteiro.** Diff menor, mas
  exige raciocinar sobre a intercalação do efeito de sincronizar com o de auto-salvar em
  cada caminho, com o auto-save ainda fechando sobre uma data que muda. É o tipo de código
  "correto hoje" que gerou o `eslint-disable` original.
- **`scroll-snap` de CSS com três painéis.** Cria um container de scroll horizontal
  aninhado — a forma exata que o commit `4a38b80` ("scroll vertical quebrado por
  overflow-x:hidden aninhado") teve que desfazer. E a navegação infinita exige reposicionar
  o `scrollLeft` a cada snap, o que engasga nas WebViews Android do `d3037d4`.
- **Biblioteca de gesto (react-swipeable, framer-motion).** O app tem dependências mínimas
  e a lógica são ~20 linhas.

## Por que o gesto não pode quebrar a rolagem

Três dos quatro commits anteriores à spec 1 são correções de rolagem (`9a4247b`,
`d3037d4`, `4a38b80`), e `src/index.css:11-13` documenta que `overflow-x: clip` foi
escolhido no lugar de `hidden` porque `hidden` força `overflow-y` a computar como `auto` e
mata a rolagem vertical por toque.

Verificado: **não existe nenhum container de scroll horizontal na tela principal.** O
único `overflow-x-auto` do projeto (`src/App.jsx:1153`) está dentro de um modal. Também não
existe nenhum `onTouch*` nem `touch-action` no projeto.

Consequência que sustenta a decisão 4: um arrasto horizontal **não tem comportamento
nativo para cancelar**, então o gesto nunca precisa de `preventDefault` e portanto **não
pode** quebrar a rolagem vertical. Se o gesto não for claramente horizontal, o navegador
faz exatamente o que faz hoje.

## Detalhes decididos

- **Guardas do gesto:** ignorar multitoque (`e.touches.length > 1`); ignorar toques
  iniciados a menos de 24px da borda lateral (o "voltar" do iOS no navegador — em
  `display: standalone` não existe, mas quem usa pelo navegador sofre); ignorar se
  `e.target.closest('input, textarea, button')`, para não trocar o dia quando o usuário
  arrasta dentro de um campo.
- **Feedback visual:** já existem `@keyframes screen-in` (`src/App.jsx:295`) e
  `.animate-screen-in` (`299`), mas a animação é **vertical** (`translateY(8px)`) — errada
  para troca de dia. Adicionar dois keyframes horizontais no mesmo bloco `<style>`
  (`293-299`) e aplicar na `DayEditor`, que remonta a cada troca: a animação toca sozinha.
  Como `#root` tem `overflow-x: clip`, um `translateX` não cria barra nem overflow.
- **Rótulo do hero:** hoje é o texto fixo "Hoje" (`~1284`) acima de
  `{today.getDate()} de {MONTH_FULL[...]}`. Passa a rotular conforme o dia exibido:
  "Hoje" / "Ontem" / "Amanhã" / a data.
- **Timer da meia-noite** (`1193-1199`): para de mexer na data selecionada. Ele só atualiza
  a noção de que dia é hoje, e **só** move `selectedDate` se o usuário estiver justamente
  no dia que virou — preservando o comportamento atual. Olhando outro dia, ninguém é
  arrastado.
- **Feriados em anos não inicializados:** `ensureYearsInitialized` roda quando `refMonth`
  muda (`1636-1643`). Como `refMonth` acompanha o dia (decisão 2), navegar para outro ano
  inicializa os feriados sozinho. Sem a decisão 2 isso seria um bug de exibição — mas
  **nunca de dado gravado**, porque a hora extra é recalculada e nunca persistida: o
  payload é só `{start, end, breaks, note}` (`1216-1218`).

## Em aberto (perguntar ao dono do projeto)

- **Limite do deslize.** Dá para deslizar indefinidamente para trás e para frente? Faz
  sentido lançar horas num dia futuro? Tecnicamente é seguro sem limite (o `refMonth`
  acompanha e os feriados se inicializam), então é decisão de produto.
- **Troca de aba.** Ao sair para a aba de mês e voltar, a `selectedDate` volta para hoje ou
  permanece onde estava? A aba se chama "hoje" — mostrar ontem nela é estranho.
- **Volta rápida para hoje.** Estando em outro dia, existe um atalho para voltar a hoje
  (tocar no rótulo do hero, por exemplo) ou só deslizando?

## Risco de dados

**Nenhum.** A feature não toca `controle_horas_v3`, a migração, o `importJSON` nem a forma
do que é gravado. O único risco de dados era o vínculo formulário↔dia descrito acima, e o
`key` o elimina por construção.
