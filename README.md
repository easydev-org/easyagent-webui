# agent-webui

Agent chat SPA over `agent.v1.AgentService` (Connect). **Svelte 5 (runes) +
shadcn-svelte style components (bits-ui primitives) + lucide icons + Tailwind
v4**, with a **sqlite-wasm (OPFS)** store for per-connection metadata (session
list, drafts, read watermarks — **no message mirror**) and a **PWA**
(installable, offline shell).

Full parity with the former Flutter client: setup gate + user manager, session
list (search / multi-select / unread / live watchSessions), chat (server-backed
sync, streaming bubbles with reasoning + tool cards, drafts, attachments,
voice), mailbox, config (appearance / users / providers + gateway + models /
presets / tools) and zh-en i18n.

## Two modes: tenant or admin

The token you connect with decides the UI. `GetIdentity` reports the role:

- **tenant token** → the chat/settings shell (sessions, chat, config, …).
- **admin token** (`AGENT_ADMIN_TOKEN`) → an **admin console only** (no chat /
  settings). It manages tenants and their tokens over `agent.v1.AdminService`
  (list / create / enable-disable a tenant; issue / rotate / revoke its
  tokens). One-time token plaintexts are shown once, with a copy button.

The message chain is **never** mirrored to sqlite: switching sessions always
needs the network anyway (the controller rebuilds per session), so the window
lives purely in memory. See `DEVELOP.md`.

## Connection model (same-origin)

The webui is served **same-origin with the agent**: an aggregating proxy (Caddy)
in front forwards `/agent.v1.*` to the agent over h2c, and `/` serves this SPA.
So the API base is always the page's own origin and the user enters **only a
tenant token** — no backend/gateway URL. (Local dev can still override with
`?base=`.)

## Run

```bash
npm install
npm run dev        # vite dev server
npm run build      # PWA production build -> dist/
npm run check      # svelte-check + tsc
```

`local `src/gen/agent/v1/agent_pb.ts`` resolves from the in-cluster **artifact** npm registry (see
`.npmrc` and `DEVELOP.md`) — not from GitHub/npmjs. Other dev commands, the
agent-contract sync rules, and the stream resume-anchor design are in
`DEVELOP.md`.

## Deploy

Built as a static image (nginx) and fronted by the aggregating Caddy that also
reverse-proxies the agent. OPFS needs a secure context (https).

## Layout

```
src/
├── App.svelte            # setup gate + backends manager + root
├── lib/
│   ├── components/ui/    # shadcn-style primitives (button/dialog/select/…)
│   ├── components/       # MessageBubble, ToolPartView, MediaAttachment, SessionRow
│   ├── pages/            # Chat, SessionList, Config, Mailbox, providers/*
│   ├── api.ts            # AgentApi facade over local generated agent_pb
│   ├── store.svelte.ts   # sessions / drafts / nav stacks
│   ├── messages.svelte.ts# streaming controller
│   ├── db.ts             # sqlite-wasm (OPFS) store (sessions/drafts/read-seqs)
│   ├── i18n.svelte.ts    # zh/en (generated from the Flutter arb)
│   └── voice.ts          # MediaRecorder
└── main.ts               # mount + PWA service worker
```
