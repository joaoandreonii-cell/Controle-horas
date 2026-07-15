# Deslize entre dias

Data: 2026-07-14
Status: **para revisão do dono do projeto**

Insumos: `2026-07-14-deslize-entre-dias-NOTAS.md` (decisões já tomadas em brainstorming),
`2026-07-14-lancamento-parcial-design.md` (spec 1, implementada) e o `CLAUDE.md` da raiz.

## Objetivo

Deslizar lateralmente na tela principal para alternar entre o dia anterior e o seguinte,
podendo editar qualquer dia navegado. Hoje a tela principal é cravada no dia de hoje;
lançar em outro dia só pelo modal da aba de mês.

## Regra

O deslize horizontal troca o dia exibido. **Dias navegados são editáveis, igual ao de
hoje** — não é modo leitura. O mês de referência acompanha o dia exibido.

## Por que esta spec vem depois da spec 1

A spec 1 (lançamento parcial) já está no branch. Ela veio primeiro porque o deslize
tornaria comum o descarte de input pela metade, que é o que ela eliminou.

Mais importante: **existe um bug latente no `TodayScreen` que o deslize ativaria**, e ele
é a razão da arquitetura desta spec. Ver "O `key` é a feature" abaixo.

## Decisões (do brainstorming — fechadas)

1. **Dias navegados são editáveis.** Não é só leitura.
2. **`refMonth` acompanha o dia.** Ao cruzar a virada do período (dia 25 → 26), o mês de
   referência muda junto, e o "Acumulado" passa a mostrar o período ao qual o dia exibido
   pertence. A aba de mês também passa a abrir nesse período.
3. **`TodayScreen` se divide em duas peças** (ver "Arquitetura").
4. **Gesto por coordenadas**, sem interceptar nada: `onTouchStart` grava `x0`,`y0`;
   `onTouchEnd` lê `changedTouches[0]` e troca o dia se `|dx| > 60 && |dx| > |dy| * 2`.
   Sem `touchmove`, sem `preventDefault`, sem CSS novo, sem dependência nova.
5. **Sem arrasto acompanhando o dedo.** Exigiria re-render a cada `touchmove` e aí sim
   `preventDefault`. Limiar + animação de entrada dá o feedback com risco zero.
6. **`App` passa a ter `selectedDate`**, e `refMonth` é sincronizado a partir dela por uma
   função nova `refMonthForDate(dateStr)` — a mesma regra do `getDefaultRefMonth`
   (`src/App.jsx:189-199`), extraída para receber uma data em vez de chamar `new Date()`
   por dentro. O `getDefaultRefMonth()` atual vira `refMonthForDate(hoje)`.

## Decisões novas (respondidas em 2026-07-14)

7. **Limite: passado livre, futuro trava em hoje.** Deslizar para trás não tem limite —
   corrigir um esquecimento antigo é uso real, e é seguro (`refMonth` acompanha e os
   feriados se inicializam sozinhos). Deslizar para frente **para no dia de hoje**:
   lançar hora extra num dia que ainda não aconteceu é quase sempre engano de dedo, e o
   app existe para registrar o que já foi trabalhado.

   O gesto que tentaria passar de hoje simplesmente não faz nada. Sem mensagem de erro,
   sem toast: a ausência de movimento é o próprio feedback, e um aviso para um gesto
   acidental é ruído.

8. **Troca de aba: a data volta para hoje.** A aba se chama "hoje" — mostrar ontem nela é
   estranho. É também o comportamento que cai de graça: `{currentTab === 'today' ?
   <TodayScreen/> : <MonthScreen/>}` (`src/App.jsx:1868`) desmonta a tela ao trocar de
   aba. Ver "Consequência da decisão 8" abaixo, que não é de graça.

9. **Volta rápida: tocar no rótulo do hero.** Fora de hoje, o rótulo ("Ontem", "Amanhã" ou
   a data) vira um botão que volta para hoje. Em hoje, continua sendo só o texto "Hoje".
   Nenhum elemento novo na tela, e o alvo já está onde o olho procura.

## O `key` é a feature (não é detalhe de implementação)

O `TodayScreen` (`src/App.jsx:1171`) guarda o formulário em estado local (`1179-1182`) e
tem um auto-save (`1210`) que grava com `onSaveEntry(todayStr, payload)` (`1217`). O
efeito que sincroniza o formulário (`1200`) depende **só** de `[currentEntry?.start,
currentEntry?.end]`, com `eslint-disable-line` na `1206` — o aviso que pegaria isso foi
silenciado.

Isso é seguro hoje **apenas porque `todayStr` nunca muda**. O cenário de falha que o
deslize abriria:

> Segunda tem 08:00–17:00 com observação "reunião". Terça tem 08:00–17:00 com observação
> "obra". O usuário desliza de segunda para terça. Como `start` e `end` são idênticos nos
> dois dias, as dependências do efeito não mudam e **ele não dispara** — o formulário
> continua com "reunião" enquanto a tela já mostra terça. O usuário ajusta qualquer campo,
> o auto-save roda e grava `onSaveEntry(terça, { …, note: 'reunião' })`. **A "obra" da
> terça é sobrescrita em silêncio.**

Com `key={dateStr}`, o React desmonta e remonta ao trocar de dia: `useState(entry?.start
|| '')` reinicializa a partir do dia novo e `initRef` volta a `true`, pulando o auto-save
de montagem. O efeito de sincronização deixa de existir. **Não sobra array de dependências
para alguém errar depois.**

O `EntryEditor` (`617`) já é imune, por um mecanismo mais fraco: o efeito dele depende de
`[open, entry]` (`632`) — a identidade do objeto, que muda junto com o dia. É o padrão que
o `TodayScreen` errou ao destrinchar em primitivos.

## Arquitetura

`TodayScreen` (`1171-1462`) se divide em duas:

- **`DayScreen`** — o `TodayScreen` renomeado. Dona da data selecionada, do gesto, do
  cabeçalho, do hero e do card "Acumulado". **Sem estado de formulário.**
- **`DayEditor`** — extraída do miolo, renderizada como `<DayEditor key={dateStr} … />`.
  Dona de `start`/`end`/`breaks`/`note`, do `initRef` e do auto-save. Contrato: "edito
  exatamente um dia".

## Efeitos que somem, e o que isso quebra

O efeito de sincronização (`1197-1206`) **é deletado**. Junto com ele sai o guard
`lastSaved` que a spec 1 introduziu (commit `c943c57`) para impedir que o eco da própria
gravação limpasse o campo em edição: sem o efeito, não há eco, e o guard vira código
morto. **A `DayEditor` não deve nascer com `lastSaved`.**

### O buraco que isso abre: `importJSON`

`importJSON` (`1734-1741`) chama `persist` → `setData`, **sem recarregar a página**. Hoje,
importar um backup com a aba "hoje" aberta muda `data.entries`, `currentEntry` muda, e o
efeito de sincronização atualiza o formulário.

Sem o efeito, e com `key={dateStr}` inalterado (o dia não mudou), a `DayEditor` **não
remonta**: o formulário fica com os valores de antes do import, a tela passa a mentir
sobre o que está gravado, e a primeira edição faz o auto-save gravar o formulário velho
por cima do backup recém-importado.

O `CLAUDE.md` chama o export/import JSON de "a única válvula de escape" do projeto.
Quebrá-la é inaceitável, e as notas classificaram o risco de dados desta feature como
"nenhum" sem considerar este caminho.

**Correção, dentro do escopo desta spec:** `App` ganha um contador `dataVersion`,
incrementado **só** pelo `importJSON`. A key vira:

```jsx
<DayEditor key={`${dateStr}:${dataVersion}`} … />
```

Um import é uma substituição atacadista e deliberada de todos os dados — já confirmada por
`window.confirm` (`961`). Remontar o editor é exatamente o certo nesse caso. E como
`dataVersion` não muda em nenhum outro caminho, o auto-save normal continua sem remontar
nada, sem repetir o bug de campo limpo em edição que a spec 1 corrigiu.

Nota: uma versão estreita deste bug **já existe hoje** — o efeito atual não dispara quando
o import traz o mesmo `start`/`end` mas `note`/`breaks` diferentes. A correção acima
resolve o caso todo, não só o que o deslize introduziria.

## Consequência da decisão 8 (`refMonth` reseta ao voltar para a aba "hoje")

A decisão 2 diz que `refMonth` acompanha `selectedDate`. A decisão 8 diz que
`selectedDate` volta para hoje ao voltar para a aba "hoje". Somadas: **voltar para a aba
"hoje" traz `refMonth` de volta para o período de hoje.**

Efeito prático: navegar a aba de mês para maio pelas setas (`1691`), ir para a aba "hoje"
e voltar para a de mês passa a mostrar o período de hoje, não maio. Hoje o `refMonth`
sobrevive à troca de aba.

É uma mudança de comportamento pequena, e coerente com o modelo novo: o mês de referência
passa a ser "o período do dia que você está olhando", e a aba de mês navega a partir dali.

A alternativa que evitaria isso — o "Acumulado" da `DayScreen` derivar o período direto de
`selectedDate`, e `refMonth` continuar sendo estado próprio da aba de mês — exigiria
**calcular o somatório de dois períodos diferentes**. Duplicar o `useMemo` de `totals`
(`1669-1689`) é mexer no caminho de leitura mais sensível do app para ganhar pouco.
Descartada por isso, mas é uma escolha, e está aqui para ser revista.

## Gesto — detalhes

- **Guardas:** ignorar multitoque (`e.touches.length > 1`); ignorar toques iniciados a
  menos de 24px da borda lateral (o "voltar" do iOS no navegador — em `display:
  standalone` não existe, mas quem usa pelo navegador sofre); ignorar se
  `e.target.closest('input, textarea, button')`, para não trocar o dia quando o usuário
  arrasta dentro de um campo.
- **Limiar:** `|dx| > 60 && |dx| > |dy| * 2`.
- Deslizar para a **esquerda** avança um dia (trava em hoje, decisão 7); para a **direita**
  volta um dia (sem limite).

### Por que o gesto não pode quebrar a rolagem

Três dos quatro commits anteriores à spec 1 são correções de rolagem (`9a4247b`,
`d3037d4`, `4a38b80`), e `src/index.css:11-13` documenta que `overflow-x: clip` foi
escolhido no lugar de `hidden` porque `hidden` força `overflow-y` a computar como `auto` e
mata a rolagem vertical por toque.

Verificado: **não existe nenhum container de scroll horizontal na tela principal.** O
único `overflow-x-auto` do projeto (`src/App.jsx:1153`) está dentro de um modal. Também
não existe nenhum `onTouch*` nem `touch-action` no projeto.

Consequência: um arrasto horizontal **não tem comportamento nativo para cancelar**, então
o gesto nunca precisa de `preventDefault` e portanto **não pode** quebrar a rolagem
vertical. Se o gesto não for claramente horizontal, o navegador faz o que já faz hoje.

## Detalhes decididos

- **Feedback visual:** já existem `@keyframes screen-in` (`src/App.jsx:290`) e
  `.animate-screen-in` (`294`), mas a animação é **vertical** (`translateY(8px)`) — errada
  para troca de dia. Adicionar dois keyframes horizontais no mesmo bloco `<style>`
  (`288-294`) e aplicar na `DayEditor`, que remonta a cada troca: a animação toca sozinha.
  Como `#root` tem `overflow-x: clip`, um `translateX` não cria barra nem overflow.
- **Rótulo do hero:** hoje é o texto fixo "Hoje" (`~1279`) acima de `{today.getDate()} de
  {MONTH_FULL[...]}`. Passa a rotular conforme o dia exibido: "Hoje" / "Ontem" / "Amanhã" /
  a data. Fora de hoje, vira botão (decisão 9).
- **Timer da meia-noite** (`1188-1194`): para de mexer na data selecionada. Ele só atualiza
  a noção de que dia é hoje, e **só** move `selectedDate` se o usuário estiver justamente
  no dia que virou — preservando o comportamento atual. Olhando outro dia, ninguém é
  arrastado.
- **Feriados em anos não inicializados:** `ensureYearsInitialized` roda quando `refMonth`
  muda (`1635-1644`). Como `refMonth` acompanha o dia (decisão 2), navegar para outro ano
  inicializa os feriados sozinho. Sem a decisão 2 isso seria um bug de exibição — mas
  **nunca de dado gravado**, porque a hora extra é recalculada e nunca persistida: o
  payload é só `{start, end, breaks, note}`.

## O que não muda

- **Forma do dado.** Nenhuma chave nova, nenhuma migração, `controle_horas_v3` intacto. O
  payload continua saindo do `buildEntryPayload` da spec 1.
- **Somatório** (`1669-1689`), **Excel** (`1819`), **WhatsApp** (`1769`),
  **`calculateOvertime`**: intocados.
- **Migração** (`212-254`) e **`importJSON`**: o `importJSON` só ganha o incremento do
  `dataVersion`; a lógica dele não muda.
- **`EntryEditor`** e a aba de mês: intocados. Tocar num dia no mês continua abrindo o
  modal.
- **`src/index.css`**: intocado.

## Risco de dados

**Um, identificado nesta spec e corrigido nela:** o `importJSON` deixaria de refletir na
tela sem o efeito de sincronização, e a primeira edição gravaria o formulário velho por
cima do backup. Resolvido pelo `dataVersion` na key.

Fora isso, a feature não toca `controle_horas_v3`, a migração nem a forma do que é
gravado. O outro risco — o vínculo formulário↔dia — é o que o `key` elimina por
construção.

**Verificado em execução em 2026-07-15** (Task 6 do plano): os dois caminhos de perda
foram exercitados no navegador. Dois dias seguidos com o mesmo `start`/`end` e observações
diferentes — o cenário exato que o efeito antigo errava: deslizar de um para o outro mostra
a observação do dia certo, e editar o dia novo não toca o vizinho (o dia 12 continuou
`{start:'08:00', end:'17:00', note:'reuniao'}` depois de o dia 13 virar `18:00`). Importar
um backup com a aba "hoje" aberta passa a refletir na tela — o formulário estava com
`20:30` e passou a mostrar o `19:30` do backup — e a edição seguinte não ressuscita o valor
de antes do import. O lançamento parcial num dia navegado continua gravando `{ start }` sem
a chave `end`, e o `EM ABERTO` continua na lista do mês. A rolagem vertical por toque
continua funcionando (`overflow-y: visible` em `html`/`body`/`#root`, `touch-action: auto`,
nenhum `preventDefault` nem `touchmove` no código) e o `src/index.css` não foi tocado.

Ressalva do ambiente: a injeção de teclas e cliques reais do navegador não funcionou nesta
sessão, então os campos foram dirigidos pelo mesmo evento `input` de onde sai o `onChange`
do React — o caminho de `handleChange`/`maskTime`/auto-save é o real, mas a tradução
tecla→valor do próprio navegador não foi exercitada. **Falta confirmar no aparelho:** tocar
na saída de um dia completo e digitar `1945` tem que dar `19:45`, não `94:5`.

## Teste

Automatizado, só de função pura (`src/entry.test.js` ou um módulo novo):

- `refMonthForDate(dateStr)`: dia 25 e dia 26 caem em períodos diferentes; viradas de ano
  (25/12 → 26/12 → janeiro seguinte); igualdade com o `getDefaultRefMonth` de hoje.

Manual, no aparelho:

- Deslizar para trás e para frente; o dia muda e a animação toca.
- **Deslizar para frente em hoje não faz nada.**
- Deslizar para trás sem limite, cruzando a virada 25 → 26: o "Acumulado" muda de período.
- Cruzar para outro ano: os feriados aparecem, sem erro.
- **O cenário do `key`:** dois dias seguidos com o mesmo `start`/`end` e observações
  diferentes. Deslizar de um para o outro e conferir que o formulário mostra a observação
  do dia certo. Editar e conferir que não sobrescreveu o vizinho.
- Editar um dia navegado: grava no dia certo (conferir no `localStorage`).
- Lançamento parcial num dia navegado: continua gravando `{ start }` e sinalizando.
- Tocar no rótulo do hero fora de hoje volta para hoje; em hoje não é botão.
- Ir para a aba de mês e voltar: mostra hoje.
- **Rolagem vertical continua funcionando por toque** — na tela principal e com o dedo
  começando em cima do card de lançamento.
- Rolar na vertical não troca o dia sem querer; arrastar dentro de um campo também não.
- **Importar um backup JSON com a aba "hoje" aberta:** o formulário passa a mostrar o dado
  importado, e editar em seguida não ressuscita o valor de antes.
- Regressão: o dia de hoje continua idêntico ao de antes da feature.

O `autoUpdate` mascara deploys — forçar a atualização do service worker ao testar.

## Fora de escopo

- Arrasto acompanhando o dedo (decisão 5).
- Deslize na aba de mês.
- Navegar para outro dia a partir da aba de mês (continua abrindo o modal).
- Unificar a duplicação de formulário entre `EntryEditor` e a `DayEditor` nova. A extração
  da `DayEditor` deixa isso mais tentador, mas continua sendo outra tarefa.
- A migração destrutiva (`230-231`, `248`) — problema real e conhecido, independente
  desta feature.

## Alternativas rejeitadas (não reabrir)

- **Corrigir as dependências do efeito e manter o `TodayScreen` inteiro.** Diff menor, mas
  exige raciocinar sobre a intercalação do efeito de sincronizar com o de auto-salvar em
  cada caminho, com o auto-save ainda fechando sobre uma data que muda. É o tipo de código
  "correto hoje" que gerou o `eslint-disable` original.
- **`scroll-snap` de CSS com três painéis.** Cria um container de scroll horizontal
  aninhado — a forma exata que o commit `4a38b80` teve que desfazer. E a navegação infinita
  exige reposicionar o `scrollLeft` a cada snap, o que engasga nas WebViews Android do
  `d3037d4`.
- **Biblioteca de gesto (react-swipeable, framer-motion).** O app tem dependências mínimas
  e a lógica são ~20 linhas.
