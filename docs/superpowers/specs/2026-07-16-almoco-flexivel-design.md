# Almoço flexível — o desconto rígido de 12:00–13:00 está errado

Data: 2026-07-16
Status: **problema registrado, à espera de decisão do dono do projeto**

Insumo: a conferência da ficha (spec 4) provou, contra os dados reais da empresa, que o modelo
de almoço do app diverge da realidade em três frentes distintas. Esta spec **registra o
achado**; o desenho da correção depende de decisões que só o dono do projeto pode tomar, porque
mexem no coração do cálculo e em como o app lê todo o histórico gravado.

## Por que isto não entrou na spec 4

A spec 4 (conferência) foi construída para **acusar** divergências, não para consertar o
cálculo. O almoço é cálculo. Corrigi-lo muda os totais que o app exibe, exporta e manda por
WhatsApp — e muda a leitura de lançamentos que já estão no `localStorage`. É um animal separado,
e o dono do projeto escolheu tratá-lo em plano próprio ("plano separado, depois").

Enquanto esta spec não existir, os 6 dias de almoço trabalhado **vão divergir na conferência, e
é certo que divirjam** — a divergência é verdadeira. Ironicamente, é a conferência que dá a
prova de que o almoço precisa mudar.

## O que o app faz hoje

`src/overtime.js`: `LUNCH_CONFIG = { start: 720, end: 780 }` — 12:00–13:00, fixo. O cálculo
**sempre** pula esse intervalo (`calculateOvertime`, o `continue` do almoço), sem exceção.

## As três maneiras de estar errado, cada uma provada por um dia real

**1. Desconta uma hora que não foi tirada.** 21/04/2026, Tiradentes:

```
08:00 – 13:00   (300 min)   →  a ficha pagou 05:00 INTEIRAS
```

Um turno de 5 horas, e a empresa não descontou almoço nenhum — porque um turno de até 6h não
exige intervalo (CLT Art. 71: intervalo obrigatório só acima de 6h). O app desconta a hora assim
mesmo e diz 04:00.

**2. Desconta a hora errada.** 16/05/2026, sábado:

```
07:45 – 11:00   (195 min)
11:00 – 12:00      ← almoço REAL: 60 min de folga
12:00 – 14:00   (120 min)   ← ele trabalhou, e a ficha pagou
```

O almoço dele foi 11:00–12:00. O app descontaria 12:00–13:00 — a hora em que ele estava
trabalhando — e não a hora em que ele comeu.

**3. Desconta a hora inteira quando só parte foi interrompida.** 12/11, 14/11, 15/06, 16/06 —
dias em que a ficha registra HE dentro de 12:00–13:00, porque o almoço real foi menor ou em
outro horário.

## O que o dono do projeto já disse (e por que não fecha ainda)

Na conversa da spec 4, o dono descreveu a regra como *"sempre descontar 1h de intervalo, não
necessariamente de 12:00 às 13:00"*. Mas **21/04 contradiz até isso**: lá não houve desconto
nenhum, porque o turno tinha menos de 6h. Então "sempre 1h" também erraria esse dia.

E sobre pausas: ele usa o campo de pausa *"apenas para intervalos que não sejam almoço"*, com o
requisito de que **uma pausa lançada entre 12:00 e 13:00 não seja descontada duas vezes** — o
que o `calculateOvertime` já trata hoje (`src/overtime.js`, a compensação da sobreposição
pausa↔almoço), e que qualquer correção precisa preservar.

## As perguntas em aberto (a decidir antes de desenhar)

1. **Como o app sabe quando houve almoço, e de quanto?** Hoje ele adivinha (12:00–13:00 fixo).
   As opções — janela flexível, marcar "almoço trabalhado" no dia, inferir pela duração do
   turno — têm custos diferentes de UI e de migração.
2. **A isenção abaixo de 6h é automática?** A CLT dá a regra; se o app a aplicar sozinho, muda
   os totais de todo turno curto já gravado.
3. **O que fazer com o histórico?** Mudar o cálculo muda a leitura de lançamentos antigos. Isso
   não perde dado (os `entries` guardam `start`/`end`/`breaks`, não os totais), mas muda os
   números exibidos para meses já fechados e talvez já reportados.

## Restrições que a correção herda

- **`calculateOvertime` é o coração.** Já está extraído e testado (`src/overtime.js`,
  `src/overtime.test.js`, spec 4 Task 1). Qualquer mudança começa por um teste que trave o
  comportamento novo antes de tocar a função.
- **Não perder dado.** A forma do que está no `localStorage` não pode mudar de um jeito que a
  versão antiga em cache leia errado (ver `CLAUDE.md`, a preocupação vital).
- **A pausa dentro do almoço não pode descontar duas vezes.** Está garantido hoje; a correção
  tem que continuar garantindo.

## Fora de escopo desta spec

O desenho da solução. Esta spec é o registro do problema e das perguntas — o "porquê" e o "o
quê". O "como" é a próxima conversa.
