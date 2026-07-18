# Conferência da ficha de horas da empresa

Data: 2026-07-15
Status: **para revisão do dono do projeto**

Insumos: os 7 exemplos reais em `exemplos_ficha_horas/` (fora do repositório — ver "Privacidade"),
o `CLAUDE.md` da raiz, e três rodadas de perguntas respondidas pelo dono do projeto em
2026-07-15.

## Objetivo

Todo mês a empresa manda ao técnico uma ficha padronizada em PDF — *"Ocupação por
Funcionário"* — com as horas extras que ela reconhece. Hoje a conferência contra o que o app
registrou é feita no olho, linha por linha.

Esta spec cria uma **aba nova de conferência**: escolhe o mês de referência, importa o PDF,
consolida por dia e aponta onde a empresa e o app divergem.

É o motivo de existir de anotar as próprias horas. Sem a conferência, o app é um diário; com
ela, é uma prova.

## O documento

Cabeçalho, agrupamento por cliente, e uma linha por intervalo de atividade:

```
Ocupação por Funcionário       Data: 26/11/2025    Hora: 15:24:07
                               Data: 26/10/2025 até 25/11/2025
Funcionário: JOAO PACCE ANDREONI

Data...... Colaborador......... SCC....... OF............. Estrutura. Descrição Estrutura...
Cliente: 143 ADAMI SA MADEIRAS
10/11/2025 JOAO PACCE ANDREONI  2.05.02   143/022175/24  0000390405 MO ASTEC   387 ... 18:46 19:00 00:14 00:00 00:00 00:00
```

Colunas: `Data`, `Colaborador`, `SCC`, `OF`, `Estrutura`, `Descrição Estrutura`, `Rotina`,
`H.Inicial`, `H.Final`, `H 50%`, `H 100%`, `H 50% Not`, `H 100% Not`, `Motivo`. Destas,
`SCC`, `OF` e `Motivo` são descartáveis — as demais interessam.

Uma linha nova começa **sempre que muda a rotina ou a categoria de hora extra**. Por isso um
mesmo dia aparece em várias linhas, e é por isso que a comparação consolida por dia antes de
comparar.

## O que a leitura dos 7 exemplos provou

**O formato é rígido, e isso decide a arquitetura.** 195 linhas em 7 arquivos, 195 parseiam.
Cada linha é emitida como **um único `Tj`** em Courier — a linha inteira é um registro de
largura fixa. Todo cabeçalho tem **exatamente 194 caracteres**, e é autodescritivo: os pontos
são marcadores de largura (`Data......` = 10 = `26/11/2025`; `Estrutura.` = 10 = `0000390405`;
`Descrição Estrutura...........` = 30 = exatamente onde o texto trunca).

**O parser é autovalidável.** Toda linha satisfaz:

```
H.Final − H.Inicial = H 50% + H 100% + H 50% Not + H 100% Not
```

Isto é o achado que sustenta a feature inteira. Se a invariante quebrar, o parse derrapou — e
aí dá para **recusar alto**, em vez de produzir um relatório errado em silêncio. Um relatório
de conferência errado é pior que nenhum: ele faz o técnico assinar embaixo de um número que
não conferiu.

**O arquivo se declara.** O cabeçalho traz o técnico e o período — e o período é
`26/10/2025 até 25/11/2025`, **exatamente** a regra de mês de referência do app
(`refMonthForDate`, `src/period.js`). O arquivo diz a que mês pertence; não é preciso adivinhar
nem confiar no que o usuário selecionou.

Outros fatos que moldam o parser:

- Linhas de subtotal são marcadas por `/  /` no campo `Data` — ignorar.
- **Um dia pode ter vários clientes.** 02/05/2026 é ADAMI e TIROL.
- Três "sabores" de PDF entre os exemplos: streams comprimidas (FlateDecode + ObjStm) e
  streams **não comprimidas** (PDF-1.3); um produtor usa escapes octais (`\347\343` = "çã") e
  continuação de linha com barra invertida.
- O rótulo `Descrição` **não decodifica como latin-1**. Ancorar as colunas só em rótulos ASCII
  e derivar a da descrição por subtração.

## Os quatro desacordos entre o app e a ficha

Achados antes de qualquer decisão, porque cada um produziria divergência falsa.

### 1. O adicional noturno começa às 22:00 na ficha; o app usa 23:00

Definitivo. Três linhas atravessam a fronteira e todas cortam em 22:00:

| Linha | normal | noturno | corte |
|---|---|---|---|
| `25/03 21:30→22:20` | 30 min | 20 min | 22:00 |
| `01/04 21:40→22:20` | 20 min | 20 min | 22:00 |
| `07/12 21:00→23:59` | 60 min | 119 min | 22:00 |

O app tem `NIGHT_START = 23 * 60` e diz ao usuário "Adicional noturno: 23:00 às 05:00". A CLT,
Art. 73 §2º, diz 22:00. **É um bug anterior a esta spec**, e a empresa está certa.

Não muda o total de dia nenhum — só a partição entre `50% diurno` e `50% noturno`. Mas são
exatamente os números que vão no WhatsApp e no Excel.

### 2. Almoço trabalhado

6 dos 80 dias têm HE dentro de 12:00–13:00 (21/04: 60 min; 16/05: 60 min; 12/11: 30 min;
14/11: 29 min). O app **sempre** desconta almoço, então estruturalmente não consegue
representar esses minutos.

Ver "O almoço" abaixo — é o achado mais valioso da investigação, e não é desta spec.

### 3. Gaps de um minuto

A empresa abre a linha seguinte em +1 minuto (`17:31→19:00`, depois `19:01→19:30`). 9 dos 80
dias fecham 1–2 minutos a menos que um cálculo contínuo.

### 4. Meia-noite

A ficha **nunca** cruza: o fim mais tarde em 195 linhas é `23:59`. O app cruza e joga o turno
inteiro no dia de início ("Turno noturno — cruza meia-noite"). Um turno 22:00→02:00 divergiria
em **dois** dias de uma vez.

## Decisões

1. **`NIGHT_START` vai para 22:00.** Alinha o app com a CLT e com a empresa. A comparação por
   categoria **exige** isso: sem o conserto, todo dia com HE entre 22:00 e 23:00 acusaria
   divergência falsa.
2. **Compara o total do dia E as 4 categorias.** Pega erro de categoria (a empresa lançar como
   50% um domingo que é 100%), não só de volume.
3. **Tolerância de ±2 minutos** em cada número comparado. Absorve os gaps de 1 minuto da
   empresa, que são 9 dos 80 dias.
4. **O PDF importado vive só na memória.** Nunca no `localStorage`. Cota cheia é o que impede o
   app de salvar os lançamentos — e "Erro ao salvar — armazenamento cheio" já é um erro tratado
   no app. O PDF não pode competir por essa cota. Ao recarregar, reimporta.
5. **A aba é 100% leitura.** Jamais escreve em `controle_horas_v3`. Faltou um dia? O técnico
   lança pela aba Hoje/Mês, como sempre.
6. **A meia-noite é repartida por data civil, só na comparação.** O app continua exibindo como
   hoje; a comparação atribui os minutos a cada data civil, igual à convenção da ficha.
7. **Só a tela, por ora.** Sem export do relatório — dá para acrescentar depois se fizer falta.
8. **O parse é autovalidável e recusa alto.** Invariante quebrada é erro, não aviso.

## Arquitetura

O trabalho sujo (bytes do PDF) fica fino e isolado; a lógica fica pura e testada por tabela —
o padrão que o projeto já usa em `entry.js`, `period.js` e `swipe.js`.

```
src/overtime.js     calculateOvertime extraído do App.jsx (puro)
src/pdfText.js      bytes do PDF → strings Tj (async, API do navegador)
src/ficha.js        strings → { tecnico, periodo, linhas } (puro)
src/conferencia.js  ficha + dayOTs → veredito por dia (puro)
ConferenciaScreen   a aba
```

### `src/overtime.js` — por que extrair

`calculateOvertime` é o coração: todo número do app depende dele. O `App.jsx` **só exporta
`App`**, então hoje não há como testá-lo. Trocar `NIGHT_START` sem teste seria mexer no
coração no escuro.

A ordem importa: **primeiro** o teste de caracterização travando o comportamento de hoje (com
23:00), **depois** a extração (nenhum valor muda), **só então** o 22:00 — e aí a mudança
aparece como um diff intencional nos testes, não como uma surpresa.

### `byDate` — a meia-noite sem duplicar o cálculo

O loop de `calculateOvertime` já conhece o dia (`dayOffset`); só não separa por ele. Ele passa
a devolver também:

```js
byDate: { '2026-05-16': { d50, n50, d100, n100, total }, ... }
```

**Aditivo**: quem chama hoje ignora e nada muda. A conferência usa `byDate` em vez de
reimplementar o cálculo — duas cópias do cálculo divergiriam na primeira vez que alguém
mexesse numa delas, e aí o relatório mentiria.

### `src/pdfText.js` — sem dependência nova

`extractPdfText(arrayBuffer)` → `Promise<string[]>`, as strings `Tj` na ordem de emissão.
Descompressão por `DecompressionStream('deflate')`, API nativa do navegador. FlateDecode é zlib
com header, então `'deflate'` — não `'deflate-raw'`. Stream que não descomprime é usada crua (é
o caso dos PDF-1.3). Desescapa `\(`, `\)`, `\\`, octal `\ddd` (mod 256) e continuação de linha.

### `src/ficha.js` — o parser

```js
parseFicha(strings) → { tecnico, periodo: { inicio, fim }, linhas: [...], erros: [...] }
```

Acha o cabeçalho de 194 chars, deriva as colunas dele, fatia cada linha por offset de
caractere, e checa a invariante em cada uma. Havendo erro, a tela recusa e diz qual linha.

### `src/conferencia.js` — o veredito

```js
conferir({ ficha, byDate, tolerancia = 2 }) → [{ data, clientes[], estrutura,
  descricaoEstrutura, colaborador, app, ficha, diff, status }]
```

`status ∈ 'fecha' | 'divergencia' | 'só na ficha' | 'só no app'`.

## O almoço — registrado aqui, consertado noutra spec

O achado mais valioso da investigação, e **fora do escopo desta spec** por decisão do dono do
projeto.

O app tem `LUNCH_CONFIG = { start: 720, end: 780 }` — 12:00–13:00, fixo. A ficha mostra que
isso está errado de **três** maneiras distintas:

**Desconta uma hora que não foi tirada.** 21/04/2026, Tiradentes:

```
08:00 - 13:00   (300 min)   →  a ficha pagou 05:00 inteiras
```

Um turno de 5h, e a empresa não descontou almoço nenhum — porque um turno de 5h não exige
intervalo (a CLT só obriga acima de 6h).

**Desconta a hora errada.** 16/05/2026, sábado:

```
07:45 - 11:00  (195 min)
11:00 - 12:00     ← almoço REAL: 60 min de folga
12:00 - 14:00  (120 min)   ← ele trabalhou, e a ficha pagou
```

O almoço dele foi 11:00–12:00. O app descontaria 12:00–13:00 — a hora em que ele estava
trabalhando — e não a hora em que ele comeu.

**Desconta a hora inteira quando só parte foi interrompida.** 12/11, 14/11, 15/06, 16/06.

O dono do projeto descreveu a regra como "sempre descontar 1h de intervalo, não necessariamente
de 12:00 às 13:00" — mas 21/04 contradiz até isso: lá não houve desconto nenhum. E ele usa
pausas "apenas para intervalos que não sejam almoço", com o requisito de que uma pausa entre
12:00 e 13:00 **não** seja descontada duas vezes.

Consertar isso muda `calculateOvertime`, muda totais, e muda como o app lê todo o histórico
gravado. É um animal diferente da leitura do PDF e precisa de spec própria (spec 5).

**Nesta spec, esses 6 dias vão divergir — e é certo que divirjam.** A divergência é verdadeira:
o app realmente não sabe desses minutos. O relatório não mente; ele mostra o que cada lado diz.
Ironicamente, é a conferência que dá a prova de que o almoço precisa mudar.

## Privacidade

Os 7 exemplos trazem nome de cliente real (ADAMI, SOPASTA, ESTRELA, COOPERATIVA AGRARIA,
TIROL), números de OF e o nome do técnico. O repositório tem remote no GitHub.

- `exemplos_ficha_horas/` está no `.gitignore`. **Nenhum PDF real entra em commit.**
- Os testes rodam contra **fixtures sintéticos**, com clientes fictícios e a mesma estrutura de
  194 colunas — inclusive uma variante com escape octal.
- Os 7 arquivos reais servem a uma verificação manual local, que não vai para o git.

## Risco de dados

O ponto vital do projeto. O que esta spec faz e não faz:

- **A aba nunca escreve.** Não toca `controle_horas_v3`, não toca a migração, não toca a forma
  do que é gravado, não toca o `key` da `DayEditor`. Lê `data.entries`, calcula, exibe.
- **O PDF não entra no `localStorage`.** Não compete pela cota que os lançamentos precisam.
- **O 22:00 não muda dado gravado.** `entries` guarda `start`/`end`/`breaks`; as categorias são
  **calculadas**, nunca gravadas. A forma do que está no `localStorage` é idêntica antes e
  depois — nenhuma migração, nenhuma versão antiga em cache lendo errado. O que muda é o que o
  app **exibe e exporta**, para todo o histórico.
- **`byDate` é aditivo.** Quem chama `calculateOvertime` hoje continua recebendo o que recebia.

O risco real desta spec não é perder dado: é **afirmar que um mês fecha quando não fecha**. Daí
a invariante obrigatória e a recusa alta.

**Verificado em execução em 2026-07-16** (Task 9 do plano):

- **Caminho de dados, contra os 7 PDFs reais.** `parseFicha` leu as 185 linhas de dados dos
  sete arquivos com **zero erros de invariante**, todo cabeçalho com 194 caracteres, todo
  período e todo cliente corretos — inclusive o produtor com escape octal e o mês com cinco
  clientes distintos. O `conferir`, exercitado com um `appByDate` derivado e perturbado de
  propósito, devolveu os quatro status certos (fecha idêntico; fecha por tolerância a +1 min;
  divergência a +30 min; só na ficha ao remover o dia do app; só no app ao acrescentar um dia).
- **A tela, no navegador, com upload de um PDF real.** Importar a ficha caiu na aba, saltou
  para o mês que ela declara (Dezembro 2025), e com o app vazio mostrou os 18 dias como "só na
  ficha", cada card com o detalhe por categoria e o cliente certo. Navegar para outro mês
  passou a avisar "esta ficha é de outro mês" e **parou de comparar**. Nenhum erro do app no
  console (só ruído de uma extensão do navegador, alheia).
- **Os `entries` do `localStorage` saíram IDÊNTICOS ao que entraram** — `entries_identicas:
  true`, comparado byte a byte antes e depois do import. O dado insubstituível não foi tocado.
  As outras chaves do aparelho (de outros apps) também ficaram intactas.

**Uma ressalva honesta sobre o "a aba nunca escreve":** a aba em si não grava, mas o salto
automático para o mês da ficha muda o `refMonth`, e isso dispara o `ensureYearsInitialized` que
**já existia** — o mesmo write que acontece ao navegar para um ano novo na aba de mês. No teste,
ele acrescentou os feriados-padrão de 2025 e `2025` ao `initializedYears` (o `localStorage`
cresceu de 1393 para 2039 bytes). Isso **nunca toca `entries`**, só feriados (defaults
regeneráveis), e é **necessário**: sem os feriados de 2025, a classificação de domingos e
feriados do cálculo do app estaria errada justamente no mês que se está conferindo. A garantia
que importa — nenhum lançamento criado, alterado ou apagado — vale, e foi observada.

## Teste

Automatizado:

- **Caracterização do `overtime`**, escrita antes da extração e passando idêntica depois: dia
  útil, sábado, domingo, feriado, pausas, pausa dentro do almoço (não pode descontar duas
  vezes), turno cruzando meia-noite.
- **O 22:00**: os totais por dia **não mudam**; só migram minutos de diurno para noturno.
- **O parser**: fixtures sintéticos, variante com escape octal, subtotal ignorado, e invariante
  quebrada — que **tem** que recusar.
- **A conferência**: dia que fecha; dia com gap de 1 min (fecha por tolerância); dia com almoço
  trabalhado (diverge, e deve); dia só na ficha; dia só no app; dia com dois clientes; turno
  cruzando a meia-noite.

Manual, local, com os 7 PDFs reais: 195/195 linhas, todo cabeçalho com 194 chars, toda
invariante fechando. E, no `npm run dev`: importar, conferir, e **provar pelo `localStorage`
que a aba não gravou nada**.

No aparelho, forçar a atualização do Service Worker antes de concluir qualquer coisa — senão o
teste é do código velho.

## Fora de escopo

- **Consertar o almoço.** Spec 5.
- Exportar o relatório da conferência (WhatsApp/Excel). A tela primeiro; export se fizer falta.
- Importar dias da ficha para dentro do app. A ficha só tem os intervalos de HE, não a jornada
  — ela não sabe o bastante para criar um lançamento.
- Editar lançamentos pela aba nova.
- Conferir vários meses de uma vez.

## Alternativas rejeitadas (não reabrir)

- **`pdfjs-dist`.** Resolveria a descompressão e os escapes, e custaria centenas de KB num PWA
  que o técnico abre no celular em campo — com precache do Service Worker por cima. E não
  entregaria o que importa: o valor está em fatiar a linha por offset de caractere, que teria
  de ser escrito de qualquer jeito. A invariante é a rede de proteção que torna o parser à mão
  seguro; sem ela, a escolha seria outra.
- **Regex sobre o texto reflowado (`pdftotext`).** O fatiamento por largura fixa recuperou 10
  linhas que o reflow do `pdftotext` tinha embaralhado. Reflow perde a coluna; a coluna é o
  contrato.
- **Tolerância configurável nos ajustes.** Mais uma peça para manter, para resolver um problema
  que ±2 min já resolve. Reabrir se a empresa mudar o comportamento dos gaps.
- **Zero tolerância.** ~11% dos dias acusariam por causa de um gap de 1 minuto que é da empresa,
  não do técnico. Ruído que ensina a ignorar o relatório.
- **Guardar o resultado da conferência no `localStorage`.** A cota é dos lançamentos. O PDF
  reimporta em dois toques.
- **Botão "importar este dia" na aba.** Ver "Fora de escopo": a ficha não sabe a jornada, e a
  aba que escreve deixa de ser a aba que só lê.
