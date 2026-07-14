# horas+ · Controle de Extras

PWA em React + Vite para controle de horas extras. Sem backend.

## ⚠️ Dados: perda é irreversível

**Preocupação declarada do dono do projeto, de importância vital.** Qualquer mudança que
toque dados carrega esse peso. Na dúvida, verifique — não presuma.

- Todos os dados vivem **só no `localStorage` do aparelho de cada usuário**, na chave
  `controle_horas_v3` (`src/App.jsx:210`). Não há servidor, não há sincronização,
  **não existe cópia de nada**. Dado perdido não se recupera: nem o dono do projeto tem
  backup do que está nos aparelhos dos usuários.
- **A migração é destrutiva:** `src/App.jsx:230-231` e `248` apagam a chave antiga com
  `removeItem` logo após migrar. Um bug numa migração é irreversível. Nunca escreva uma
  migração que apague a origem antes de a nova estar verificada.
- **Antes de mudar a forma do que é gravado, verifique cada consumidor de entrada:**
  somatório (`1675`), `DayRow` (`565`), WhatsApp (`1767`), Excel (`1817`), `todayOT`
  (`1243`). Todos hoje guardam contra `end` ausente — não quebre isso.
- **Vários usuários rodam versões diferentes ao mesmo tempo** (ver o PWA abaixo). Mudou a
  forma do dado? A versão antiga em cache precisa continuar lendo sem corromper.
- A única válvula de escape é o export/import JSON (`src/App.jsx:1721` e `1733`).

## Gotchas

- **PWA `autoUpdate`** (`vite.config.js:9`): o service worker serve código antigo por um
  tempo após o deploy. Correção "que não funcionou" quase sempre é o SW. Ao testar, force
  a atualização (DevTools → Application → Service Workers → Update, ou hard reload).
- **Rolagem:** `html`/`body`/`#root` usam `overflow-x: clip`, **nunca `hidden`**
  (`src/index.css:11-29`). `hidden` força `overflow-y` a computar como `auto` e mata a
  rolagem vertical por toque. Três commits consertaram isso (`9a4247b`, `d3037d4`,
  `4a38b80`) — não reintroduza.
- **O mês de referência não é o mês civil:** o período vai do dia 26 do mês anterior até o
  dia 25 do mês de referência (`src/App.jsx:179`, `getDefaultRefMonth` em `194-204`).

## Estrutura

- `src/App.jsx` — o app inteiro, ~1900 linhas. Só o `App` é exportado (`1611`).
- Specs e planos ficam em `docs/superpowers/specs/` e `docs/superpowers/plans/`.
