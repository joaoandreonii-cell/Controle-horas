# Lançamento parcial (entrada sem saída)

Data: 2026-07-14
Status: aprovado

## Objetivo

Permitir registrar a entrada de um dia sem ainda ter a saída — o uso natural de um app de
ponto: marcar ao chegar, completar ao sair. Hoje o app exige os dois campos e descarta em
silêncio o que foi digitado pela metade.

## Regra

Entrada sozinha é válida e é gravada. Saída sozinha continua proibida. Um lançamento
parcial não entra no somatório mensal e é sinalizado como "em aberto".

A regra vale igual nos dois caminhos de edição: a tela principal (auto-save) e o modal do
mês (`EntryEditor`, salvamento explícito por botão).

## Contexto

Esta spec saiu de um brainstorming sobre deslizar lateralmente entre dias na tela
principal. Aquela feature virou a spec 2 e vem depois desta — ver "Relação com a spec 2".

## Forma do dado

`entries[dia]` passa a aceitar `{ start }` sem `end`.

O `end` é **omitido** quando ausente, seguindo o padrão dos campos opcionais que já
existem (`breaks` e `note`, `src/App.jsx:1217-1218`), em vez de gravar `end: ''`.

Nenhuma chave nova, nenhuma migração, `controle_horas_v3` intacto.

## Mudanças

### 1. Auto-save da tela principal (`src/App.jsx:1210-1233`)

A condição atual é `if (sm != null && em != null && em !== sm)`. Passa a disparar com
`sm != null`, montando `const payload = { start }` e adicionando `end` apenas se
`em != null && em !== sm`.

Comportamento resultante:

- Entrada válida, saída vazia: grava `{ start }`.
- Entrada válida, saída inválida (mal digitada ou igual à entrada): grava `{ start }` e
  sinaliza o erro na saída. O registro da entrada não fica refém do erro na saída.
- Entrada vazia, saída preenchida: não grava e sinaliza que falta a entrada. Hoje já não
  grava, mas em silêncio.
- **Dia já completo com a saída apagada: rebaixa para `{ start }`** e o dia passa a "em
  aberto". Ver "Rebaixamento" abaixo.

A comparação `same` (`1221-1224`) precisa tratar `end` ausente. Com `currentEntry` sendo
`{ start }` e o campo `end` vazio, a comparação `currentEntry.end === end` avalia
`undefined === ''`, que é falso — `same` fica falso e o payload é regravado sem
necessidade, piscando o toast de "Salvo". Não chega a virar loop, porque as dependências
do efeito (`[start, end, breaks, note]`) não mudam após a gravação, mas a comparação
precisa considerar ausente e vazio como equivalentes.

### 1.1. Rebaixamento

Apagar a saída de um dia completo grava `{ start }` e remove a saída do armazenamento.
Tela e dado sempre batem, sem valor fantasma.

O preço, aceito conscientemente: apagar a saída para redigitar já a remove do
armazenamento. Se o usuário for interrompido nesse meio, perde o valor que estava
editando e precisa lembrá-lo. A entrada e o dia permanecem — a perda se limita ao campo
que ele mesmo estava alterando.

A alternativa (nunca remover uma saída gravada via auto-save) foi descartada: é o
comportamento de hoje, mas faz a tela mostrar o campo vazio enquanto o armazenamento
mantém o valor antigo, que reaparece ao recarregar.

### 2. `EntryEditor.handleSave` (`src/App.jsx:645-663`)

A guarda `if (!start || !end) { setError('Informe entrada e saída'); return; }` (`646`)
passa a exigir apenas `start`. Com `end` preenchido, valida como hoje (`647-648`). Com
`end` vazio, salva `{ start }`. Com `start` vazio e `end` preenchido:
`setError('Informe a entrada')`.

O botão de salvar continua explícito. Não há auto-save no modal.

### 3. `DayRow` — lista do mês (`src/App.jsx:565`, `596-614`)

Meio da linha: o ternário `entry?.start && entry?.end ? (start → end) : ('tocar para
lançar')` ganha um ramo intermediário para `entry?.start && !entry?.end`, exibindo
`08:00 → ——`.

Coluna da direita: o slot que hoje trata `ot && ot.total === 0 && entry?.start` →
`no ponto` (`610-611`) ganha um ramo anterior para entrada sem saída, exibindo
`EM ABERTO` em âmbar, no mesmo estilo tipográfico (`text-[10px] uppercase
tracking-wider`). O ponto cinza (`613`) continua exclusivo do dia realmente vazio.

Esta escolha reusa o slot que já existe para estados que não são duração e é a única sem
colisão: não disputa espaço com o nome do feriado (`586-589`) nem com a borda âmbar que
já significa "hoje" (`548`).

### 4. Tela principal — sinalização

Junto ao campo de saída, com `start` válido e `end` vazio, exibir uma linha curta —
"falta a saída · não entra no somatório" — no mesmo lugar e estilo dos avisos que já
existem para `invalidTime` (`1329`) e `isNightShift` (`1336`).

Os blocos condicionados a `start && end && !invalidTime` (`1344`, `1383`) continuam
escondidos no parcial: o card de horas extras e a seção de pausas só fazem sentido com o
dia fechado. O `hasEntry` (`1266`) já é `!!currentEntry?.start`, então o botão de limpar
(`1403`) já funciona no parcial sem mudança.

## O que não muda

- **Somatório** (`1669-1689`): a guarda `!e.start || !e.end` (`1675`) já produz
  exatamente o comportamento pedido — o parcial é ignorado e não soma nada.
- **Excel** (`1817`) e **WhatsApp** (`1767`): já pulam via `!ot`.
- **`calculateOvertime`** (`115`): nunca chega a ser chamada sem `end`.
- **Storage, migração e `importJSON`**: intocados.

## Compatibilidade com a versão antiga em cache

O app é um PWA com `registerType: 'autoUpdate'` (`vite.config.js:9`), então parte dos
usuários roda código antigo por um tempo após o deploy. Como esta mudança altera a forma
do dado gravado, cada consumidor foi verificado.

Um `{ start }` gravado pela versão nova e lido pela versão antiga:

| Consumidor | Guarda existente | Efeito |
|---|---|---|
| Somatório (`1675`) | `!e.start \|\| !e.end` | Ignorado, não soma |
| Lista do mês (`565`) | `entry?.start && entry?.end` | Mostra "tocar para lançar" |
| WhatsApp (`1767`) | `!ot \|\| ot.total === 0` | Pulado |
| Excel (`1817`) | `!ot \|\| ot.total === 0` | Pulado |
| `todayOT` (`1243`) | `em == null` | Retorna null |
| Auto-save antigo (`1214`) | `em != null` | Não toca o dado |
| `handleSave` antigo (`646`) | `!start \|\| !end` | Não regrava até completar |

Nenhum caminho perde dado, dá NaN ou quebra. A única divergência é cosmética: na versão
antiga o parcial aparece como um dia vazio na lista do mês, embora o dado esteja íntegro
e o modal o mostre ao abrir (`631`). Some quando o service worker atualizar.

## Teste

Manual, no aparelho:

- Gravar `{ start }` sozinho e conferir que o somatório do mês não muda.
- Conferir "EM ABERTO" na lista do mês, inclusive num feriado, sem colidir com o nome.
- Completar a saída depois e conferir que o dia passa a somar.
- Apagar a saída de um dia completo: vira "em aberto" e o somatório desconta aquelas
  horas.
- Saída sem entrada: não grava e sinaliza.
- Mesma regra no modal do mês, inclusive o rebaixamento ao salvar sem a saída.
- Regressão: dia completo continua idêntico e "no ponto" continua aparecendo.
- Abrir, com a versão antiga (SW não atualizado), um parcial gravado pela nova: sem NaN,
  sem quebra, dado preservado.

O `autoUpdate` mascara deploys — forçar a atualização do service worker ao testar, senão
a mudança parece não ter subido.

## Fora de escopo

- O deslize entre dias (spec 2).
- Unificar a duplicação de formulário entre `EntryEditor` (`622`) e `TodayScreen`
  (`1176`) — `fillStandard` (`665`/`1258`), `addBreak` (`667`/`1261`), montagem do
  payload (`658-660`/`1216-1218`). É real, mas o `EntryEditor` está correto e consertar
  isso não serve a esta feature.
- Auto-save no modal do mês.

## Relação com a spec 2 (deslize entre dias)

Esta spec vem primeiro. O deslize tornaria comum o descarte de input pela metade — que é
o que esta feature elimina. Com o lançamento parcial já no lugar, o deslize chega sem
esse caso de borda.

Do brainstorming, já decidido para a spec 2 e registrado aqui para não se perder:

- `TodayScreen` se divide em `DayScreen` (data selecionada, gesto, cabeçalho,
  "Acumulado") e `DayEditor` (`key={dateStr}`, formulário e auto-save de um único dia).
  O `key` torna impossível por construção o formulário de um dia apontar para outro —
  a causa do bug latente no efeito da linha `1202`, hoje mascarado pelo
  `eslint-disable-line` da linha `1207`.
- Gesto por `touchstart`/`touchend` com trava de eixo (`|dx| > 60 && |dx| > |dy| * 2`),
  sem `preventDefault`, sem CSS novo, sem dependência nova — para não reabrir os bugs de
  rolagem dos commits `9a4247b`, `d3037d4` e `4a38b80`.
- `refMonth` acompanha o dia ao cruzar a virada do período (dia 25 → 26).
