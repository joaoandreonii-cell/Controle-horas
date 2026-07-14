/* ═════════════════════════════════════════════════════════════════════════
   ENTRADAS — regras puras de lançamento
   Sem React, sem DOM. Fonte única de verdade sobre o que é um lançamento
   válido, quando gravar, e quando um dia conta para o somatório.
   ═════════════════════════════════════════════════════════════════════════ */

export const parseHM = (s) => {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

// Estado do que está gravado num dia:
//   'empty'    — nada registrado
//   'partial'  — entrada registrada, saída ainda não ("em aberto")
//   'complete' — entrada e saída presentes; só este entra no somatório
//
// Checa presença, não validade: quem soma ainda precisa validar os horários,
// porque um backup importado pode trazer texto inválido.
export function entryState(entry) {
  if (!entry || !entry.start) return 'empty';
  if (!entry.end) return 'partial';
  return 'complete';
}
