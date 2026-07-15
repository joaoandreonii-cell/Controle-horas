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

// Monta o que vai ser gravado a partir do formulário.
// Retorna null quando não há nada válido a gravar — a regra é que saída
// sozinha não vale. Saída inválida ou igual à entrada não impede o registro
// da entrada: o dia fica em aberto.
export function buildEntryPayload({ start, end, breaks, note }) {
  const sm = parseHM(start);
  if (sm == null) return null;

  const payload = { start };

  const em = parseHM(end);
  if (em != null && em !== sm) payload.end = end;

  const validBreaks = (breaks || []).filter(
    (b) => parseHM(b.start) != null && parseHM(b.end) != null
  );
  if (validBreaks.length > 0) payload.breaks = validBreaks;

  if (note && note.trim()) payload.note = note.trim();

  return payload;
}

// Compara o que está gravado com o que seria gravado, tratando campo ausente
// e campo vazio como equivalentes. Sem isso, um lançamento parcial regrava a
// cada render e pisca o toast de "Salvo" à toa.
export function sameEntry(entry, payload) {
  if (!entry || !payload) return false;
  if (entry.start !== payload.start) return false;
  if ((entry.end || '') !== (payload.end || '')) return false;
  if ((entry.note || '') !== (payload.note || '')) return false;

  const a = entry.breaks || [];
  const b = payload.breaks || [];
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.start === b[i].start && x.end === b[i].end);
}
