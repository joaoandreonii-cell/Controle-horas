/* ═════════════════════════════════════════════════════════════════════════
   FICHA — as strings do PDF viram a relação estruturada da empresa
   Sem React, sem DOM. Recebe o que o pdfText extraiu e devolve técnico,
   período, e uma linha por intervalo de hora extra, já com cliente e minutos.

   O formato é de largura fixa: cada linha é um registro de 194 colunas, e o
   cabeçalho é a régua. A autovalidação é a invariante de cada linha —
   H.Final − H.Inicial tem que ser igual à soma das quatro categorias. Linha
   que não fecha é recusada, não corrigida: um relatório de conferência errado
   é pior que nenhum, porque faz o técnico assinar embaixo do que não conferiu.
   ═════════════════════════════════════════════════════════════════════════ */

// Âncoras ASCII do cabeçalho, na ordem. 'Descrição' fica de fora de propósito:
// o acento a torna frágil entre codificações, e a coluna dela sai por subtração
// (é o que sobra entre a Estrutura e a Rotina).
const ANCHORS = [
  'Data', 'Colaborador', 'SCC', 'OF', 'Estrutura', 'Rotina',
  'H.Inicial', 'H.Final', 'H 50%', 'H 100%', 'H 50% Not', 'H 100% Not', 'Motivo',
];

// 'HH:MM' → minutos. Serve para horário de relógio e para duração.
function toMinutes(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 'DD/MM/AAAA' → 'AAAA-MM-DD', a forma que o app usa nas chaves de dia.
function toISODate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// 'Cliente:  8766 ESTRELA PAPEL LTDA -----' → { codigo, nome }. Devolve null
// para os pseudo-clientes ZZ/ZZZ do rodapé (código não numérico) e para o que
// não for linha de cliente. Pega o nome inteiro e tira os traços de
// preenchimento do fim — em vez de exigir que eles existam — para não perder um
// cliente cujo nome encha a linha, nem cortar um traço no meio do nome (BR-277).
// Funciona porque o parseFicha já limpou o \r do fim, então o $ ancora de novo.
function parseCliente(s) {
  const m = /Cliente:\s*(\d+)\s+(.+)$/.exec(s);
  if (!m) return null;
  const nome = m[2].replace(/[\s-]+$/, '').trim();
  return { codigo: m[1], nome };
}

// Offsets de cada coluna a partir das âncoras do cabeçalho. null se faltar
// qualquer âncora — aí o documento não é a ficha que conhecemos.
function deriveColumns(header) {
  const off = {};
  let pos = 0;
  for (const a of ANCHORS) {
    const i = header.indexOf(a, pos);
    if (i < 0) return null;
    off[a] = i;
    pos = i + 1;
  }
  return off;
}

export function parseFicha(strings) {
  const erros = [];

  // Limpa só o CR/LF do fim: não mexe nas colunas (o \r mora depois de todas),
  // e destrava as regexes ancoradas em fim de linha.
  const lines = strings.map((s) => s.replace(/[\r\n]+$/, ''));

  let tecnico = null;
  let periodo = null;
  for (const s of lines) {
    if (!tecnico) {
      const m = /Funcion[áa]rio:\s*(.+)/.exec(s);
      if (m) tecnico = m[1].trim();
    }
    if (!periodo) {
      const m = /Data:\s*(\d{2})\/(\d{2})\/(\d{4})\s+at[ée]\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
      if (m) periodo = { inicio: `${m[3]}-${m[2]}-${m[1]}`, fim: `${m[6]}-${m[5]}-${m[4]}` };
    }
  }

  const header = lines.find(
    (s) => s.includes('Colaborador') && s.includes('Rotina') && s.includes('H.Inicial'),
  );
  const col = header ? deriveColumns(header) : null;
  if (!col) {
    erros.push({ tipo: 'cabecalho', msg: 'Cabeçalho da ficha não reconhecido.' });
    return { tecnico, periodo, linhas: [], erros };
  }

  const cell = (s, from, to) => s.slice(col[from], to === undefined ? undefined : col[to]).trim();

  const linhas = [];
  let clienteAtual = null;
  for (const s of lines) {
    const cli = parseCliente(s);
    if (cli) { clienteAtual = cli; continue; }
    if (!/^\d{2}\/\d{2}\/\d{4}/.test(s)) continue; // não é linha de dado

    const data = toISODate(cell(s, 'Data', 'Colaborador'));
    const hIni = cell(s, 'H.Inicial', 'H.Final');
    const hFim = cell(s, 'H.Final', 'H 50%');
    const h50 = toMinutes(cell(s, 'H 50%', 'H 100%'));
    const h100 = toMinutes(cell(s, 'H 100%', 'H 50% Not'));
    const h50Not = toMinutes(cell(s, 'H 50% Not', 'H 100% Not'));
    const h100Not = toMinutes(cell(s, 'H 100% Not', 'Motivo'));
    const ini = toMinutes(hIni);
    const fim = toMinutes(hFim);

    if (data == null || [ini, fim, h50, h100, h50Not, h100Not].some((v) => v == null)) {
      erros.push({ tipo: 'linha', data, msg: `Não foi possível ler a linha: ${s.trim()}` });
      continue;
    }

    // A invariante: a duração do intervalo é a soma das quatro categorias.
    const duracao = (fim - ini + 1440) % 1440;
    const soma = h50 + h100 + h50Not + h100Not;
    if (duracao !== soma) {
      erros.push({
        tipo: 'linha',
        data,
        msg: `Invariante falhou em ${cell(s, 'Data', 'Colaborador')}: ${hIni}→${hFim} = ${duracao}min, mas as categorias somam ${soma}min.`,
      });
      continue;
    }

    // A Estrutura (código de 10 dígitos) e a Descrição dividem uma faixa só;
    // a Estrutura é o primeiro token, a Descrição é o resto.
    const faixa = cell(s, 'Estrutura', 'Rotina');
    const sp = faixa.indexOf(' ');
    const estrutura = sp < 0 ? faixa : faixa.slice(0, sp);
    const descricaoEstrutura = sp < 0 ? '' : faixa.slice(sp).trim();

    linhas.push({
      data,
      colaborador: cell(s, 'Colaborador', 'SCC'),
      cliente: clienteAtual,
      estrutura,
      descricaoEstrutura,
      rotina: cell(s, 'Rotina', 'H.Inicial'),
      hIni,
      hFim,
      h50,
      h100,
      h50Not,
      h100Not,
    });
  }

  return { tecnico, periodo, linhas, erros };
}
