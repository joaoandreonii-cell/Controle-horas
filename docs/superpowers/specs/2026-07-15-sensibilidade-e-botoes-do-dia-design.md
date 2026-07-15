# Sensibilidade do deslize e botões de dia

Data: 2026-07-15
Status: **para revisão do dono do projeto**

Insumos: `2026-07-14-deslize-entre-dias-design.md` (spec 2, implementada) e o `CLAUDE.md`
da raiz. Esta spec é o retorno de campo da spec 2.

## Objetivo

O deslize da spec 2 está no aparelho e **não reconhece bem**. Relato do dono do projeto:
"o deslize do dedo precisa ser muito longo, deslizes rápidos não funcionam muito bem."
Além disso, o gesto é o único jeito de trocar de dia — não há alvo tocável.

Esta spec conserta o reconhecimento e acrescenta botões `<` e `>`.

## O que o relato descarta

O sintoma é de **reconhecimento**, não de feedback. O dono do projeto **não** relatou que
a tela parece morta enquanto o dedo arrasta; relatou que o gesto é recusado.

Isso é decisivo: **a decisão 5 da spec 2 continua de pé** (sem arrasto acompanhando o
dedo). Arrasto acompanhando o dedo exigiria `touchmove` e travamento do gesto, e aí
`preventDefault` — o caminho exato que quebrou a rolagem vertical por toque em `9a4247b`,
`d3037d4` e `4a38b80`. Não vamos por ali para consertar um problema que não é esse.

## Diagnóstico

A regra de hoje (`src/App.jsx`, `handleTouchEnd`):

```js
if (Math.abs(dx) <= 60 || Math.abs(dx) <= Math.abs(dy) * 2) return;
```

Dois culpados, um para cada sintoma:

1. **`|dx| > |dy| * 2` mata o arco natural do polegar.** O polegar gira em torno da
   articulação: um deslize horizontal natural sobe ou desce no caminho. A regra exige que
   o movimento seja duas vezes mais horizontal que vertical, então um deslize de
   `dx=80, dy=45` — perfeitamente normal — é recusado (`80 <= 90`).

2. **Não existe velocidade, só distância.** Um flick rápido percorre pouca distância antes
   de o dedo sair da tela. `dx=35` num gesto de 70ms é inequivocamente intencional, e morre
   no `|dx| > 60`. É o "deslizes rápidos não funcionam muito bem", literal.

## Decisões

1. **Distância OU velocidade.** Um flick rápido conta com pouca distância; um arrasto
   lento precisa de mais. Hoje só existe distância.
2. **Cone de 45°.** `|dx| > |dy|` em vez de `|dx| > |dy| * 2`. Basta ser mais horizontal
   que vertical.
3. **A decisão vira função pura, em módulo testável.** `src/swipe.js`, igual a `entry.js` e
   `period.js`. A sensibilidade deixa de ser "achei que ficou bom" e vira tabela testada.
4. **Continua sem `touchmove` e sem `preventDefault`.** O `touchstart` passa a guardar o
   instante, só isso. Nenhum CSS novo, nenhuma dependência nova.
5. **Botões `<` e `>` no hero, centralizados, no padrão da aba de mês.**
6. **O `>` fica desabilitado em hoje**, não escondido.
7. **Um caminho só para trocar o dia.** Gesto e botões chamam a mesma função.
8. **Um dia por gesto.** Um deslize longo ou rápido continua andando um dia só.

## A regra nova

```
rapido = v > 0.4 px/ms  E  |dx| > 18
longe  = |dx| > 45
troca se (longe OU rapido) E |dx| > |dy|
```

`v = |dx| / dt`, com `dt` em milissegundos.

### Os números, e por que cada um

| Número | Valor | Por quê |
|---|---|---|
| Distância | `45` (era `60`) | ~10% de uma tela de 430px. Longe o bastante de um toque (`dx` de 3-8px) para nunca confundir. |
| Velocidade | `0.4 px/ms` | = 400px/s. Um flick deliberado fica em 500-2000px/s; um arrasto lento fica abaixo de 200px/s. O corte separa os dois com folga. |
| Distância mínima do flick | `18` | Impede que um toque rápido com tremor conte como flick. Um toque real não chega perto. |
| Cone | `|dx| > |dy|` (era `* 2`) | 45°. Aceita o arco do polegar; uma rolagem vertical real (`dy` de 200-400 contra `dx` de 20-40) continua recusada com folga. |

### Tabela de comportamento

Esta tabela é o teste. Cada linha vira um caso em `src/swipe.test.js`.

| Gesto | dx, dy, dt | v | Hoje | Depois |
|---|---|---|---|---|
| Arco natural do polegar | 80, 45, 180ms | 0.44 | **ignora** | troca |
| Flick rápido e curto | 35, 8, 70ms | 0.50 | **ignora** | troca |
| Arrasto lento e longo | 70, 20, 600ms | 0.12 | troca | troca |
| Rolagem vertical | 25, 280, 200ms | 0.13 | ignora | ignora |
| Fling vertical rápido | 20, 300, 90ms | 0.22 | ignora | ignora |
| Toque simples | 3, 2, 60ms | 0.05 | ignora | ignora |
| Arrasto curto e lento | 30, 5, 500ms | 0.06 | ignora | ignora |

As quatro últimas linhas são as que **não podem** disparar. Elas importam tanto quanto as
duas primeiras: afrouxar o limiar sem prová-las é trocar um incômodo por outro.

## Interface do módulo novo

`src/swipe.js` — puro, sem React, sem DOM:

```js
// Devolve +1 (avançar um dia), -1 (voltar um dia) ou null (não é deslize).
// A convenção "dedo para a esquerda avança" mora aqui, e é testável.
export function swipeIntent({ dx, dy, dt }) { ... }
```

Devolve o **delta**, não a direção da animação. O delta é a intenção; de que lado a
animação entra é consequência, e o `irParaDia` já deriva isso num lugar só. Devolver
`'left'`/`'right'` obrigaria a ler que `'right'` significa avançar — a mesma inversão que
o plano da spec 2 errou no Step 2 da Task 5.

Com isso o `handleTouchEnd` inteiro vira:

```js
const intent = swipeIntent({ dx, dy, dt });
if (intent) irParaDia(intent);
```

O `DayScreen` fica com o gesto reduzido a: coletar coordenadas, perguntar ao módulo, agir.
A convenção "esquerda avança, direita volta" sai de dentro do `handleTouchEnd` — onde hoje
está solta e sem teste — e passa a ter caso de teste próprio.

## Os botões

Padrão já existente no app — a aba de mês (`onNavigateMonth`) e o seletor de ano das
configurações (`navigateYear`) usam o mesmo desenho:

```
        HOJE
  (<)  15 de julho  (>)
        Quarta
     [ domingo · 100% ]
```

- Botões redondos `w-10 h-10 rounded-full bg-stone-900 border border-stone-800`, com
  `ChevronLeft`/`ChevronRight` em `size={18}` — os dois já importados.
- `aria-label`: "Dia anterior" e "Próximo dia".
- O hero passa de alinhado à esquerda para **centralizado**, para caber no padrão. O
  rótulo, a data, o dia da semana e o badge acompanham.
- O rótulo do hero (`Hoje` / `Ontem · voltar para hoje`) continua existindo e centraliza
  junto. Ele não vira redundante: os botões andam um dia por vez, e ele pula de volta para
  hoje de qualquer distância.

### O `>` em hoje

Desabilitado e apagado (`disabled`, opacidade reduzida, sem `hover`), não escondido:
esconder muda o layout conforme o dia e deixa a borda do tempo misteriosa. Um botão
apagado diz "aqui acaba" sem precisar de aviso.

Usa o mesmo `dateStr < todayStr` que trava o gesto — não é uma segunda cópia da regra.

## Consolidação

Com os botões passam a existir três caminhos que trocam o dia: gesto, `<`/`>` e "voltar
para hoje". Os três precisam do mesmo limite e da mesma direção de animação. Vira uma
função dentro do `DayScreen`:

```js
const irParaDia = (delta) => {
  const next = formatDate(addDays(parseDate(dateStr), delta));
  if (next > todayStr) return;
  setDayAnim(delta > 0 ? 'right' : 'left');
  onSelectDate(next);
};
```

Gesto e botões chamam `irParaDia`. O "voltar para hoje" continua separado: é um salto para
uma data, não um passo de `delta`.

**Sem isso, os botões seriam uma segunda cópia da regra do limite** — e duas cópias
divergem na primeira vez que alguém mexer numa delas.

## Risco de dados

**Nenhum.** Esta spec não toca `controle_horas_v3`, nem a migração, nem a forma do que é
gravado, nem o `key` da `DayEditor`. Ela mexe em: um módulo puro novo, o `handleTouchEnd`,
e o JSX do hero.

Dois pontos já garantidos que esta spec **não pode** quebrar, e que a verificação tem que
reconfirmar:

- **Navegar não grava.** O `initRef` da `DayEditor` bloqueia a gravação na montagem. Com
  botões, ficou fácil andar muitos dias depressa — nenhum desses passos pode escrever.
  A Task 6 da spec 2 provou isso rodando para o gesto; vale reprovar para os botões.
- **Tocar num botão não dispara o gesto.** O `handleTouchStart` já sai fora em
  `e.target.closest('input, textarea, button')`. Os chevrons são `<button>`, então já estão
  cobertos — mas isso vira acidental se alguém trocar a tag depois.

## Risco de rolagem

O ponto sensível do projeto. O que protege:

- O `touchstart` passa a guardar `Date.now()`. É um campo a mais no objeto que já existe.
- **Nenhum `touchmove`, nenhum `preventDefault`, nenhum CSS novo.** `git diff` em
  `src/index.css` tem que continuar vazio.
- O cone afrouxa de 2:1 para 1:1, o que aumenta em tese a chance de uma rolagem virar troca
  de dia. A tabela acima cobre isso com quatro casos negativos. Uma rolagem vertical real
  tem `dy` de 200-400 contra `dx` de 20-40 — não chega perto de `|dx| > |dy|`.

Um falso positivo aqui, vale dizer, **não perde dado**: troca o dia exibido, e o vizinho
continua intacto (provado na Task 6 da spec 2). O custo é um susto, não um prejuízo.

## Teste

Automatizado, `src/swipe.test.js` — a tabela de comportamento inteira, as sete linhas,
positivas e negativas. Mais:

- Os limites exatos: `|dx|` de 45 e 46, `v` de 0.4 e 0.41, `|dx| == |dy|` (tem que recusar:
  a regra é `>`, não `>=`).
- **O sinal:** `dx` negativo devolve `+1` e `dx` positivo devolve `-1`. É a convenção que o
  plano da spec 2 já inverteu uma vez; agora ela tem teste.
- `dt` de `0` não pode dividir por zero nem devolver `Infinity` como flick válido.

Manual, no aparelho — é o único juiz do que motivou a spec:

- **Um deslize rápido e curto troca o dia.** Era o sintoma relatado.
- **Um deslize natural, sem cuidado de fazer reta, troca o dia.** Era o outro.
- Rolar a tela na vertical, com força, **não** troca o dia.
- Rolar na vertical por toque continua funcionando, com o dedo em cima do card.
- Os botões `<` e `>` andam um dia, com a animação vindo do lado certo.
- Em hoje o `>` está apagado e não faz nada; o `<` funciona.
- Andar muitos dias depressa nos botões não grava nada (conferir no `localStorage`).

## Fora de escopo

- **Arrasto acompanhando o dedo.** O relato é de reconhecimento, não de feedback. Reabrir
  só se, depois desta spec, o gesto reconhecer bem e ainda assim parecer morto.
- Pular vários dias num deslize longo ou muito rápido.
- Deslize na aba de mês.
- Limiar configurável pelo usuário.

## Alternativas rejeitadas (não reabrir)

- **Só baixar o `60` para `40`.** Não conserta o flick rápido, que é metade do relato: um
  flick de 35px continuaria recusado.
- **Distância como % da largura da tela.** O app é `max-w-md` (448px) e roda em telefone;
  a largura varia pouco. Um número em px é previsível e testável sem simular viewport.
- **`touch-action: pan-y` no contêiner.** Resolveria o travamento do gesto se fôssemos
  fazer arrasto acompanhando o dedo. Não vamos, então é CSS novo sem motivo — e CSS de
  rolagem é exatamente o que este projeto já consertou três vezes.
