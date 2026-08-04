/* ═════════════════════════════════════════════════════════════════════════
   CONFERÊNCIA — o veredito de cada dia
   Sem React, sem DOM. De um lado a ficha (o que a empresa reconhece), do outro
   o byDate do app (o que você registrou, repartido por data civil). Consolida
   cada dia e diz se fecha, e onde não fecha.

   A comparação é por data civil porque é a convenção da ficha, que nunca cruza
   a meia-noite; o byDate já traduziu os turnos do app para essa convenção. Não
   se reimplementa cálculo nenhum aqui — o byDate é a fonte.
   ═════════════════════════════════════════════════════════════════════════ */

import { formatDurationLong } from './format';

const CATS = ['d50', 'd100', 'n50', 'n100'];
const zero = () => ({ d50: 0, d100: 0, n50: 0, n100: 0, total: 0 });

// As quatro categorias da ficha somadas para uma data. O MAPA mora aqui, e é o
// ponto sensível: a ficha separa 50%/100% e diurno/noturno em quatro colunas, e
// cada uma corresponde a exatamente uma categoria do app.
//   H 50%     → d50   (diurno 50%)
//   H 100%    → d100  (diurno 100%)
//   H 50% Not → n50   (noturno 50%)
//   H 100% Not→ n100  (noturno 100%)
function somaFicha(linhas) {
  const s = zero();
  for (const l of linhas) {
    s.d50 += l.h50;
    s.d100 += l.h100;
    s.n50 += l.h50Not;
    s.n100 += l.h100Not;
  }
  s.total = s.d50 + s.d100 + s.n50 + s.n100;
  return s;
}

// Devolve o veredito por dia, em ordem de data. tolerancia em minutos por número.
export function conferir({ ficha, appByDate, tolerancia = 2 }) {
  // Consolida as linhas da ficha por data civil.
  const fichaPorDia = new Map();
  for (const l of ficha.linhas) {
    if (!fichaPorDia.has(l.data)) fichaPorDia.set(l.data, []);
    fichaPorDia.get(l.data).push(l);
  }

  const datas = new Set([...fichaPorDia.keys(), ...Object.keys(appByDate)]);

  const dias = [];
  for (const data of datas) {
    const linhasDia = fichaPorDia.get(data) || [];
    const fichaPresente = linhasDia.length > 0;
    const appPresente = appByDate[data] != null;

    const somaApp = appByDate[data] ? { ...appByDate[data] } : zero();
    const somaFic = fichaPresente ? somaFicha(linhasDia) : zero();

    const diff = {};
    let dentro = true;
    for (const c of CATS) {
      diff[c] = somaApp[c] - somaFic[c];
      if (Math.abs(diff[c]) > tolerancia) dentro = false;
    }
    diff.total = somaApp.total - somaFic.total;
    if (Math.abs(diff.total) > tolerancia) dentro = false;

    let status;
    if (fichaPresente && !appPresente) status = 'só na ficha';
    else if (!fichaPresente && appPresente) status = 'só no app';
    else status = dentro ? 'fecha' : 'divergencia';

    // Clientes do dia, únicos, na ordem em que aparecem.
    const clientes = [];
    const vistos = new Set();
    for (const l of linhasDia) {
      if (!l.cliente) continue;
      const chave = l.cliente.codigo;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      clientes.push(l.cliente);
    }

    const colaboradores = [...new Set(linhasDia.map((l) => l.colaborador).filter(Boolean))];

    dias.push({
      data,
      status,
      app: somaApp,
      ficha: somaFic,
      diff,
      clientes,
      colaborador: colaboradores.join(', '),
      linhasFicha: linhasDia,
    });
  }

  dias.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  return dias;
}

// O veredito do período em palavras. Mora aqui, e não na tela, porque o
// relatório em PDF diz exatamente a mesma coisa — e duas cópias discordariam
// na primeira vez que alguém mexesse numa delas.
//
// O tom vem dos DIAS, não da diferença total: dois desvios opostos podem se
// anular no total sem que nada esteja certo. Daí o 'quase'.
export function vereditoDoPeriodo({ resultado, totais, tolerancia = 2 }) {
  const problemas = resultado.length - resultado.filter((d) => d.status === 'fecha').length;
  const dTot = totais.diff.total;

  if (problemas === 0) {
    return { tom: 'confere', glifo: '=', frase: 'Tudo confere — o total e cada dia fecham com a ficha.' };
  }
  if (Math.abs(dTot) <= tolerancia) {
    const quantos = problemas === 1 ? '1 dia não bate' : `${problemas} dias não batem`;
    return { tom: 'quase', glifo: '=', frase: `O total fecha, mas ${quantos} — veja na lista.` };
  }
  if (dTot > 0) {
    return { tom: 'menos', glifo: '≠', frase: `A ficha reconhece ${formatDurationLong(dTot)} a menos do que você lançou no app.` };
  }
  return { tom: 'mais', glifo: '≠', frase: `A ficha reconhece ${formatDurationLong(-dTot)} a mais do que você lançou no app.` };
}
