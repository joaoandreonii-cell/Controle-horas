# Relatório em PDF da conferência

Data: 2026-08-03
Status: **para revisão do dono do projeto**

Insumos: a spec 4 (`2026-07-15-conferencia-da-ficha-design.md`) e o código que ela produziu
(`src/conferencia.js`, `src/ficha.js`, `src/pdfText.js`, `ConferenciaScreen` em `src/App.jsx`),
o `CLAUDE.md` da raiz, e uma rodada de perguntas respondidas pelo dono do projeto em 2026-08-03.

## Objetivo

A spec 4 fechou dizendo, na seção "Fora de escopo": *"Exportar o relatório da conferência
(WhatsApp/Excel). A tela primeiro; export se fizer falta."*

Fez falta. A conferência hoje morre na tela do aparelho: você importa a ficha, lê o veredito,
e não tem como levar aquilo para lugar nenhum. Esta spec dá ao veredito um corpo — **um PDF
que se manda pelo WhatsApp**.

O leitor é quem recebe no celular. Isso decide tudo o que vem abaixo.

## As três decisões que o leitor decidiu

### 1. A5, não A4

Uma A4 (595pt de largura) numa tela de celular de 360px encolhe para 60%: corpo de 10pt
renderiza a 6px e o leitor dá zoom em todo parágrafo. A5 é ISO padrão, **metade exata da A4 e
com a mesma proporção** (420 × 595,28pt): encolhe só para 86%, e o mesmo corpo de 10pt sai a
~8,6px — a densidade de uma página web comum.

Imprimir continua certo: a proporção é idêntica à da A4, então "ajustar à página" amplia sem
distorcer.

### 2. Papel claro

O app é escuro e bonito, mas um PDF de fundo preto numa conversa de WhatsApp lê como erro ou
como print de tela, e queima tinta no dia em que alguém imprimir. A identidade do app atravessa
pela hierarquia, pelo ritmo tipográfico e pelas cores de acento — não pelo fundo.

As quatro cores do veredito sobrevivem, no degrau 700, que é como aquelas cores viram tinta
sobre branco:

| veredito | tela | papel |
|---|---|---|
| fecha | emerald-300 | `#047857` |
| divergência | rose-300 | `#be123c` |
| só na ficha | amber-300 | `#b45309` |
| só no app | sky-300 | `#0369a1` |

Texto `#1c1917` (stone-900), secundário `#78716c` (stone-500), réguas `#e7e5e4` (stone-200).

### 3. Escritor de PDF próprio, sem biblioteca

A spec 4 rejeitou o `pdfjs-dist` para **ler** PDF: *"centenas de KB num PWA que o técnico abre
no celular em campo — com precache do Service Worker por cima"*. A frase vale igual para
**escrever**. O `jsPDF` custaria ~100 KB gzip no bundle; os três módulos desta spec custam
~7 KB gzip, tabelas de largura incluídas.

## O achado que sustenta esta spec

**O app já sabe ler PDF, e por isso o escritor tem como se autoverificar.**

`extractPdfText` varre `stream…endstream`, tenta descomprimir, usa cru quando não descomprime, e
devolve as strings literais desescapadas — inclusive o octal `\ddd`. Se o escritor emitir
**streams sem compressão** e acentos em octal, o leitor do próprio app lê de volta, byte a byte,
o que o escritor acabou de escrever.

É a mesma jogada da invariante da spec 4 (`H.Final − H.Inicial = soma das categorias`): lá o
parser se prova sozinho, aqui o escritor. O teste de fecho gera um PDF e o passa pelo
`extractPdfText`, afirmando que as linhas esperadas voltam.

Isso também obriga uma decisão que de outro modo seria arbitrária: **sem compressão**. Custa
tamanho — um relatório de 18 dias fica em ~20–25 KB em vez de ~8 KB — e é irrelevante para um
anexo de WhatsApp. Em troca, o arquivo é legível a olho num editor de texto e verificável pelo
próprio app.

## Arquitetura

Cada módulo com um propósito, puro, testado por tabela — o padrão de `entry.js`, `period.js`,
`overtime.js`, `ficha.js`, `conferencia.js`.

```
src/format.js               os formatadores, MOVIDOS do App.jsx (nenhum call site muda)
src/pdfDoc.js               primitivas: página, texto, régua, retângulo, cor, medida, bytes
src/relatorioConferencia.js resultado da conferência → páginas → bytes (puro)
ConferenciaScreen           o botão e o compartilhamento
```

### `src/format.js` — por que mover

`pad`, `formatDate`, `formatDateBR`, `formatDuration`, `formatDurationLong`, `MONTH_FULL`,
`MONTH_SHORT` e `DAY_SHORT` vivem no topo do `App.jsx` (linhas 22–47 e 92–107) e não são
exportados. O relatório precisa deles.

A alternativa é copiá-los para o módulo do relatório — e aí o PDF e a tela formatariam a mesma
duração de dois jeitos no dia em que alguém mexesse num dos dois. É exatamente o argumento que a
spec 4 usou para o `byDate`: *"duas cópias do cálculo divergiriam na primeira vez que alguém
mexesse numa delas, e aí o relatório mentiria."*

**O risco da extração é baixo por construção: só as definições mudam de arquivo.** Os 41 usos de
`formatDurationLong` e todos os demais call sites ficam idênticos; o `App.jsx` ganha uma linha de
`import`. Nada de forma de dado, nada de `localStorage`, nada de migração.

Nota de vocabulário: `formatDurationLong` produz `HH:MM` (`33:15`), não `33h15`. O PDF fala o
mesmo dialeto da tela.

### `src/pdfDoc.js` — as primitivas

```js
criarDoc({ largura, altura, margem }) → doc
doc.novaPagina()
doc.texto(x, y, str, { fonte, tamanho, cor, alinhamento })   // 'esq' | 'dir' | 'centro'
doc.linha(x1, y1, x2, y2, { cor, espessura })
doc.retangulo(x, y, w, h, { cor })
doc.medir(str, fonte, tamanho) → pt
doc.paginas                                                   // inspecionável em teste
doc.bytes({ titulo, emitidoEm }) → Uint8Array
```

As operações ficam acumuladas por página **como objetos**, e só o `bytes()` serializa. É o que
torna o layout testável sem inspecionar byte nenhum.

**Fontes.** Base-14, nenhuma embutida: `/Helvetica` e `/Helvetica-Bold` com
`/Encoding /WinAnsiEncoding`, e `/Symbol` **sem** `/Encoding` (Symbol traz a própria). Os dígitos
da Helvetica têm todos largura 556 — são tabulares por construção, que é o equivalente em PDF do
`tabular-nums` que a tela usa em todo número.

**Tabelas de largura.** Os 256 valores de cada uma das duas Helvéticas, das métricas base-14 da
Adobe. Dados estáticos, ~600 bytes cada em forma compacta. É a parte chata e correta: sem elas
não há alinhamento à direita nem quebra de linha honesta.

**Codificação.** Unicode → byte WinAnsi:

- `0x20`–`0x7E` e `0xA0`–`0xFF`: idênticos (cobrem á à â ã ç é ê í ó ô õ ú ü ñ e maiúsculas, e o
  `·` em `0xB7`)
- `—` U+2014 → `0x97`; `–` U+2013 → `0x96`; `'` `'` → `0x91` `0x92`; `"` `"` → `0x93` `0x94`;
  `•` → `0x95`
- **`−` U+2212 → `0x2D`** (hífen ASCII). O `fmtDiff` do app usa o sinal de menos tipográfico, que
  não existe em WinAnsi. Sem esta linha, todo diferencial negativo sairia como `?`.
- **`≠` U+2260 → não existe em WinAnsi.** Vai desenhado na fonte Symbol, código `0xB9`, largura
  549. Sem ele o herói perde o glifo que é a assinatura da tela.
- Qualquer outro: `?`. **Nunca quebra.** Um nome de cliente com caractere exótico degrada, não
  derruba o relatório.

Escape na string literal: `\(`, `\)`, `\\`, e todo byte ≥ `0x80` em octal `\ddd` — que é
precisamente o que o `unescapePdfString` do app desescapa.

**Determinismo.** Nenhum valor aleatório, sem `/ID` no trailer, `/CreationDate` derivado do
`emitidoEm` recebido. Mesma entrada, mesmos bytes — sem isso não há teste de bytes.

**Sem cantos arredondados.** PDF só faz curva com bezier, e o retângulo reto é limpo e honesto
com o meio.

### `src/relatorioConferencia.js` — o documento

```js
montarRelatorio({ resultado, totais, ficha, refMonth, tolerancia, emitidoEm }) → doc
gerarPdfConferencia(args) → Uint8Array
nomeArquivoRelatorio(refMonth) → 'conferencia-novembro-2025.pdf'
```

**Recebe tudo já calculado. Não recalcula nada.** `resultado` e `totais` são os mesmos objetos que
a `ConferenciaScreen` renderiza. `emitidoEm` entra por parâmetro — sem isso o teste seria
não-determinístico e a data do rodapé, incontrolável.

Layout de cada dia como um bloco de altura conhecida, medido antes de posicionado. **Um dia nunca
é partido entre páginas**: um dia cortado ao meio é exatamente o tipo de coisa que faz alguém ler
o número errado. Não coube, vai inteiro para a página seguinte.

## O documento

### Estrutura

**Cabeçalho** (página 1, completo; páginas seguintes, uma linha magra)
`horas+` · CONFERÊNCIA DA FICHA · nome do técnico · período da ficha e mês de referência.

**Herói**
Os dois totais frente a frente — `App 33:15` **≠** `Ficha 32:15` — a frase do veredito numa faixa
com filete de 2pt na cor do veredito e fundo a 5%, e a tabela App / Ficha / Dif por categoria.
A frase e o tom são os mesmos que a tela calcula (`CONF_TONS`), inclusive a regra de que **a cor
vem dos dias, não da diferença total** — dois desvios opostos podem se anular no total sem que
nada esteja certo.

**Dia a dia**
Todos os dias, em ordem de data. Cada um: `12/11 qua`, a palavra do veredito na cor dele, o total,
e os clientes numa linha secundária.

- Dia que **fecha**: uma linha, e mais nada. Se o diferencial não for zero mas couber na
  tolerância, ele aparece pequeno e cinza ao lado — honesto e quieto.
- **Todo dia com status diferente de `fecha`** ganha abaixo a mini-tabela App / Ficha / Dif, só
  com as categorias que têm minutos de algum lado. Isso vale para os três: `divergencia`,
  `só na ficha` e `só no app`.
- **Só na ficha** ganha ainda a linha "sem lançamento no app"; **só no app**, a linha "a ficha não
  tem este dia". Sem elas, uma coluna zerada na mini-tabela lê como erro de cálculo em vez de
  ausência.

O total no cabeçalho do dia é o do lado do app, exceto em "só na ficha", onde o app não tem nada e
o número é o da ficha. Onde houvesse ambiguidade — a divergência — a mini-tabela está logo abaixo
dizendo os dois.

**Rodapé** (toda página)
`horas+ · conferência · novembro 2025 · gerado em 03/08/2026 · comparação por data civil,
tolerância de 2 min · 2/3`

### O PDF ignora o filtro da tela

Não é óbvio e é importante: se você está com o filtro "Divergência" ativo e gera o relatório, ele
sai **completo**. O PDF nasce de `resultado`, nunca de `listaDias`.

Um relatório que reflete em silêncio um filtro de tela é um relatório que mente por omissão — e
quem o receber no WhatsApp não tem como saber que havia um filtro.

### Tipografia

Margem de 36pt nas laterais e 40pt em cima e embaixo: coluna útil de 348pt. Corpo 10pt,
entrelinha 1,35. Números do herói 26pt bold. Data do dia 10,5pt bold, clientes 8,5pt, rótulo de
seção 7,5pt em versal com `Tc` (espaçamento entre caracteres — o `tracking` da tela), rodapé 7pt.

Um mês típico de 18 dias com três problemas ocupa 2 a 3 páginas.

## Compartilhar

```
navigator.canShare?.({ files }) → navigator.share({ files: [File] })
                                → bandeja do Android com o WhatsApp ali, um toque
sem suporte, ou erro                → download por âncora (o mesmo padrão do exportJSON)
AbortError (cancelou)               → nada. Cancelar não é erro.
```

Nome: `conferencia-novembro-2025.pdf` — legível na lista de anexos, e **sem acento de verdade**:
`MONTH_FULL` traz `março`, então o nome passa por uma remoção de diacríticos
(`normalize('NFD')` e fora os `̀-ͯ`), senão março sairia acentuado justamente no mês em
que ninguém repararia até o arquivo chegar torto do outro lado.

O `/Info` do PDF traz `/Title (Conferência da ficha — novembro 2025)` e `/Producer (horas+)`, que
é o que WhatsApp e Drive mostram como nome do documento.

## O botão

Na `ConferenciaScreen`, largura cheia, logo abaixo do herói — é o momento natural: você leu o
veredito, agora manda. Nesse ponto o CTA de importar já colapsou no chip "Trocar", então o botão
do relatório assume como ação principal, na mesma família âmbar.

**Só existe quando `resultado` existe e tem pelo menos um dia.** Onde a tela se recusa a comparar
— ficha com erro de invariante, período ilegível, mês diferente do selecionado — não há botão.
Esta é a defesa estrutural contra o único risco que importa aqui.

## Risco de dados

O ponto vital do projeto. O que esta spec faz e não faz:

- **Não escreve nada.** O gerador recebe `resultado` e `totais` prontos, devolve bytes. Não toca
  `controle_horas_v3`, não toca `data.entries`, não toca a migração, não toca a forma do que é
  gravado. A `ConferenciaScreen` continua 100% leitura, como a spec 4 estabeleceu.
- **Nada é persistido.** O `Blob` vive na memória, vai para o `share` ou para a âncora, e a object
  URL é revogada. O PDF gerado não compete pela cota do `localStorage` — pela mesma razão que o
  PDF importado não compete.
- **Nenhuma forma de dado muda.** Sem migração, sem versão antiga em cache lendo errado. A
  extração para `format.js` move definições entre arquivos e não altera um único valor.
- **`format.js` não muda comportamento.** Os testes de caracterização dos formatadores travam
  isso antes da mudança de arquivo, na mesma ordem que a spec 4 usou para extrair o `overtime`:
  primeiro o teste, depois o movimento, e nenhum valor muda.

O risco real, aqui como na spec 4, não é perder dado: é **um documento afirmar que o mês fecha
quando não fecha** — e agora esse documento sai do aparelho e vai parar na conversa de outra
pessoa. Um erro na tela você corrige olhando de novo; um PDF errado no WhatsApp já foi.

As defesas são estruturais, não são avisos:

1. O PDF sai dos mesmos objetos que a tela renderiza. Não há segundo cálculo para divergir.
2. Onde a tela se recusa a comparar, o botão não existe.
3. O filtro da tela não atravessa para o documento.
4. O escritor é verificado pelo leitor do próprio app.

## Teste

Automatizado, por tabela:

- **Caracterização de `format.js`**, escrita antes da extração e passando idêntica depois.
- **`pdfDoc`**: escape de `(`, `)` e `\`; acento em octal; o mapa WinAnsi (incluindo `−`→`-` e o
  `≠` indo para a Symbol); caractere fora do mapa virando `?` sem quebrar; medida de largura de
  string conhecida; alinhamento à direita; xref cujo offset de cada objeto aponta para uma
  posição onde o arquivo lê literalmente `N 0 obj`; `%%EOF` presente; mesma entrada, mesmos bytes.
- **`relatorioConferencia`**: um dia nunca partido entre páginas; o filtro ignorado (montar com
  `resultado` completo e conferir a contagem de dias no documento); os quatro vereditos com a cor
  certa; dia que fecha com diferencial dentro da tolerância; dia com dois clientes; mês sem
  divergência nenhuma; a contagem de páginas e o `N/M` do rodapé.
- **O fecho**: gerar o PDF e passá-lo pelo `extractPdfText` do próprio app, afirmando que as
  linhas esperadas voltam — inclusive uma com acento.

Manual, local, no `npm run dev`: importar uma ficha real, gerar, **abrir o arquivo** (é o único
jeito de saber que abre), conferir a legibilidade sem zoom num aparelho, e provar pelo
`localStorage` que nada foi gravado.

No aparelho, forçar a atualização do Service Worker antes de concluir qualquer coisa — senão o
teste é do código velho.

## Fora de escopo

- **Exportar a conferência para Excel ou WhatsApp em texto.** O PDF é o formato pedido.
- **Anexo com os intervalos crus** (linha a linha da ficha contra o lançamento do app). Foi
  considerado e recusado nesta rodada: o dia a dia com a mini-tabela por categoria já responde
  "onde não bate". Reabrir se faltar rastreabilidade numa discussão real.
- **Escolher o que entra no relatório** (só divergências, só resumo). Uma preferência a manter
  para resolver um problema que ninguém teve ainda.
- Assinatura, campo de ciência, papel timbrado. O leitor é o WhatsApp, não o RH.
- Gerar o relatório de vários meses de uma vez.
- Consertar o almoço. Continua sendo a spec 5, e continua sendo o motivo de alguns dias
  divergirem com razão.

## Alternativas rejeitadas (não reabrir)

- **`jsPDF`.** ~100 KB gzip para resolver fonte, quebra de linha e paginação — num PWA que o
  técnico abre no celular em campo, com precache do Service Worker por cima. É a mesma conta que
  reprovou o `pdfjs-dist` na spec 4, e a mesma resposta.
- **`window.print()` com folha `@media print`.** Custo zero de código, e não entrega o objetivo:
  não produz arquivo para anexar. Passa pelo diálogo do sistema, salva em Downloads, e só então
  você anexa à mão. Instável em PWA no iPhone. Para "mandar no WhatsApp", é o caminho errado.
- **Renderizar a tela em `canvas` e embutir como imagem.** Dispensaria todo o trabalho de fonte, e
  entregaria um PDF sem texto selecionável, pesado e borrado no zoom. Um documento cujo conteúdo é
  número não pode ser uma foto de números.
- **Fundo escuro, como o app.** Lê como erro numa conversa de WhatsApp e queima tinta ao imprimir.
- **A4.** Encolhe para 60% no celular e obriga zoom em cada parágrafo. A5 tem a mesma proporção e
  imprime igual.
- **Streams comprimidas com `CompressionStream`.** Economizaria ~15 KB num anexo de WhatsApp e
  custaria a verificação pelo `extractPdfText` e a legibilidade do arquivo a olho.
- **Copiar os formatadores para dentro do relatório em vez de extrair `format.js`.** Duas cópias
  divergem na primeira vez que alguém mexe numa delas — e aí a tela e o PDF discordam sobre o
  mesmo número.
