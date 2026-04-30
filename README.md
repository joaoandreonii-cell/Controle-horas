# horas+ · Controle de Horas Extras

App mobile (PWA) para controle de horas extras — Catanduvas/SC.

## Funcionalidades

- Lançamento diário de entrada e saída
- Cálculo automático de horas extras por categoria:
  - 50% diurno
  - 50% noturno (23:00–05:00)
  - 100% diurno (domingos e feriados)
  - 100% noturno
- Feriados nacionais + municipais de Catanduvas/SC pré-cadastrados
- Período de apuração: dia 26 do mês anterior até dia 25 do mês de referência
- Desconto automático de 1h de almoço (12:00–13:00)
- Exportação do resumo mensal em texto
- Funciona offline (PWA)
- Dados salvos localmente no dispositivo

## Stack

- React 18 + Vite
- Tailwind CSS
- Lucide Icons
- vite-plugin-pwa (Service Worker + Manifest)

## Deploy

```bash
npm install
npm run build
vercel --prod
```
