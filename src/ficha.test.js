import { describe, it, expect } from 'vitest';
import { parseFicha } from './ficha';

/* O parser recebe as strings que o pdfText extraiu e devolve a ficha estruturada.
   As fixtures são SINTÉTICAS (clientes fictícios) e reproduzem o formato real de
   194 colunas — inclusive o \r no fim de linha que os arquivos reais trazem e que
   já quebrou o reconhecimento de cliente uma vez.

   A prova de que o formato real funciona está na verificação manual contra os 7
   PDFs (185/185 linhas fecham a invariante); aqui provamos as DECISÕES do parser:
   invariante, subtotais, rastreio de cliente, e a recusa alta. */

// Escreve textos em posições fixas de uma linha de 194 colunas.
function line(pairs, { cr = false } = {}) {
  const arr = new Array(194).fill(' ');
  for (const [off, text] of pairs) {
    for (let i = 0; i < text.length; i++) arr[off + i] = text[i];
  }
  let s = arr.join('');
  if (cr) s += '\r'; // como nos arquivos reais
  return s;
}

const HEADER = line([
  [0, 'Data......'], [11, 'Colaborador.........'], [32, 'SCC.......'],
  [43, 'OF.............'], [59, 'Estrutura.'], [70, 'Descrição Estrutura...........'],
  [101, 'Rotina........................'], [132, 'H.Inicial'], [142, 'H.Final'],
  [150, 'H 50%...'], [159, 'H 100%'], [166, 'H 50% Not'], [176, 'H 100% Not'], [187, 'Motivo'],
], { cr: true });

// Uma linha de dados. Os tempos default fecham a invariante (07:00→07:40 = 40 = h50).
function row(over = {}, opts) {
  const f = {
    data: '10/11/2025', colab: 'FULANO DE TAL', estrutura: '0000111111',
    descr: 'MO TESTE', rotina: '387 SERVICO DESLOCAMENTO',
    hIni: '07:00', hFim: '07:40', h50: '00:40', h100: '00:00', h50Not: '00:00', h100Not: '00:00',
    ...over,
  };
  return line([
    [0, f.data], [11, f.colab], [59, f.estrutura], [70, f.descr], [101, f.rotina],
    [132, f.hIni], [142, f.hFim], [150, f.h50], [159, f.h100], [166, f.h50Not], [176, f.h100Not],
  ], opts);
}

const cliente = (txt) => `Cliente:   ${txt}`;
const META = ['Funcionário: FULANO DE TAL', 'Data: 26/10/2025 até 25/11/2025'];

describe('parseFicha — metadados', () => {
  it('extrai técnico e período', () => {
    const r = parseFicha([...META, HEADER, cliente('100 CLIENTE UM ----'), row()]);
    expect(r.tecnico).toBe('FULANO DE TAL');
    expect(r.periodo).toEqual({ inicio: '2025-10-26', fim: '2025-11-25' });
  });
});

describe('parseFicha — uma linha', () => {
  it('lê os campos e converte a data e os tempos para minutos', () => {
    const r = parseFicha([...META, HEADER, cliente('100 CLIENTE UM ----'),
      row({ data: '10/11/2025', hIni: '17:31', hFim: '18:45', h50: '01:14' }, { cr: true })]);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({
      data: '2025-11-10',
      colaborador: 'FULANO DE TAL',
      estrutura: '0000111111',
      descricaoEstrutura: 'MO TESTE',
      cliente: { codigo: '100', nome: 'CLIENTE UM' },
      h50: 74, h100: 0, h50Not: 0, h100Not: 0,
    });
  });

  it('preserva acento na descrição (o pdfText já decodificou o octal)', () => {
    const r = parseFicha([...META, HEADER, cliente('100 X ----'),
      row({ descr: 'MO ASTEC -PARAMETRIZAÇÃO' })]);
    expect(r.linhas[0].descricaoEstrutura).toBe('MO ASTEC -PARAMETRIZAÇÃO');
  });
});

describe('parseFicha — o \\r do fim de linha não atrapalha', () => {
  it('reconhece o cliente mesmo com \\r no fim', () => {
    // Regressão: o \r no índice 193 fazia o /$/ da regex de cliente não casar.
    const r = parseFicha([...META, HEADER, cliente('8766 ESTRELA PAPEL LTDA -----\r'), row({ cr: true })]);
    expect(r.linhas[0].cliente).toEqual({ codigo: '8766', nome: 'ESTRELA PAPEL LTDA' });
  });
});

describe('parseFicha — nomes de cliente fora do padrão', () => {
  it('lê um cliente sem os traços de preenchimento no fim', () => {
    const r = parseFicha([...META, HEADER, cliente('700 METALURGICA SEM TRACOS'), row()]);
    expect(r.linhas[0].cliente).toEqual({ codigo: '700', nome: 'METALURGICA SEM TRACOS' });
  });

  it('preserva um traço no meio do nome, tirando só os do fim', () => {
    const r = parseFicha([...META, HEADER, cliente('701 POSTO BR-277 KM 50 ----'), row()]);
    expect(r.linhas[0].cliente).toEqual({ codigo: '701', nome: 'POSTO BR-277 KM 50' });
  });
});

describe('parseFicha — agrupamento por cliente', () => {
  it('cada linha carrega o cliente do grupo em que está', () => {
    const r = parseFicha([...META, HEADER,
      cliente('100 CLIENTE UM ----'), row({ data: '10/11/2025' }),
      cliente('200 CLIENTE DOIS ----'), row({ data: '11/11/2025' }),
    ]);
    expect(r.linhas.map((l) => l.cliente.nome)).toEqual(['CLIENTE UM', 'CLIENTE DOIS']);
  });
});

describe('parseFicha — o que deve ser ignorado', () => {
  it('pula a linha de subtotal /  /', () => {
    const sub = line([[0, '/  /'], [150, '00:40'], [187, '*Total : (1)']]);
    const r = parseFicha([...META, HEADER, cliente('100 X ----'), row(), sub]);
    expect(r.linhas).toHaveLength(1);
  });

  it('ignora os pseudo-clientes ZZ/ZZZ do rodapé', () => {
    const r = parseFicha([...META, HEADER,
      cliente('100 REAL ----'), row(),
      cliente('ZZ TOTAL DE HORAS ----'), cliente('ZZZ TOTAL GERAL ----'),
    ]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].cliente.codigo).toBe('100');
  });
});

describe('parseFicha — recusa alta', () => {
  it('uma linha que fere a invariante vira erro, não lançamento', () => {
    // 07:00→08:00 = 60 min, mas as categorias somam 40. O parse derrapou (ou o
    // documento é adulterado): não pode virar um número que alguém confere.
    const r = parseFicha([...META, HEADER, cliente('100 X ----'),
      row({ hIni: '07:00', hFim: '08:00', h50: '00:40' })]);
    expect(r.linhas).toHaveLength(0);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toMatchObject({ tipo: 'linha', data: '2025-11-10' });
  });

  it('sem cabeçalho reconhecível, recusa e não inventa linhas', () => {
    const r = parseFicha([...META, 'lixo qualquer', row()]);
    expect(r.linhas).toEqual([]);
    expect(r.erros[0].tipo).toBe('cabecalho');
  });
});
