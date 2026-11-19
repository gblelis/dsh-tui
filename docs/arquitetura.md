# Arquitetura

Este documento explica como o `dsh-tui` se encaixa no DeepSeek Harness, por que ele é dividido em
**launcher publicado** + **bundle privado** e quais invariantes garantem que o projeto continue
compatível com as próximas versões do DSH.

## Visão geral

```
                    ┌──────────────────────────────────────────────┐
                    │ @gblelis/dsh-tui  (pacote publicado no npm)  │
                    │                                              │
                    │  lib/bin.js        launcher (Node puro)      │
                    │  bundle/           artefato do bundle        │
                    │    manifest.json   versão + hash + arquivos  │
                    │    package.json    dsh.bundle.patch          │
                    │    cordis.patch.yml                          │
                    │    lib/{index,startup,prompt-service}.js     │
                    └───────────────┬──────────────────────────────┘
                                    │ 1. resolve DSH_HOME
                                    │ 2. valida Node + runtime (^0.2.2-rc.5)
                                    │ 3. repara o profile "tui"
                                    │ 4. exec
                                    ▼
        node <dsh>/lib/bin.js --profile tui [flags da TUI]
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────────────┐
        │ $DSH_HOME/profiles/tui                                        │
        │  package.json        dsh.profile.bundles                      │
        │  cordis.patch.yml    camada do usuário (nunca sobrescrita)    │
        │  node_modules/@gblelis/dsh-tui-bundle/  cópia do artefato     │
        └───────────────────────────────┬───────────────────────────────┘
                                        │ loader do DSH: aplica cada bundle
                                        ▼
   @deepseek-ai/dsh-base       (mesmo core do Desktop/Web: agentes, ferramentas,
                                permissões, LLM, sessão, compactação, telemetria)
   @gblelis/dsh-tui-bundle     (esta camada)
     ├─ tui-startup  flags → valores tipados + guarda de ativação
     ├─ tui-prompt   serviço de interpolação de ${...} no prompt
     └─ tui          a TUI: transcript, streaming, editor, diálogos, comandos
```

O launcher **não** importa nada de `@deepseek-ai/*`. Ele é Node puro (fs, path, crypto, child_process) e
termina em `spawnSync(process.execPath, [dshBin, '--profile', 'tui', ...args], { stdio: 'inherit' })`.
Quem carrega o DSH é o próprio DSH — com um único `Context`, uma única instância de core.

## Duas partes, dois ciclos de vida

| | `packages/cli` (`@gblelis/dsh-tui`) | `packages/bundle` (`@gblelis/dsh-tui-bundle`) |
| --- | --- | --- |
| Publicado? | sim, npm público | **nunca** (privado, embutido no CLI) |
| Roda como | processo Node separado (`dsh-tui`) | plugin Cordis dentro do dsh |
| Depende de `@deepseek-ai/*` | apenas `@deepseek-ai/dsh` como dependência | só peers opcionais (`*`), resolvidos pela instalação |
| Pode evoluir sem republicar | sim (é o mesmo arquivo) | embutido no tarball do CLI |
| Papel | instalar/reparar profile, validar ambiente, dar `exec` | toda a interface e o comportamento de terminal |

Por que embutir o bundle em vez de publicá-lo e instalar com `pnpm` no profile?

1. O primeiro boot fica **offline e determinístico**: não há resolução de dependências dentro do
   `$DSH_HOME`.
2. O bundle não pode puxar uma segunda cópia de `@deepseek-ai/cordis` (o profile sombrearia o core).
3. O hash do artefato permite auto-reparo: o launcher compara `bundle/manifest.json` com
   `.dsh-tui/stamp.json` e recopia quando o pacote muda.
4. Um pacote publicado só, uma versão pública só — o tarball contém tudo.

## Fluxo do launcher

`dsh-tui [args]` (comando padrão):

1. **Preflight**: `Node >= 24.9` (mesmo piso do DSH); TTY em stdin/stdout (a TUI não faz sentido em pipe).
2. **Caminhos**: `--home` > `$DSH_HOME` > `~/.dsh`; o profile é sempre `profiles/tui`.
3. **Runtime**: `--dsh-bin` > `$DSH_TUI_DSH_BIN` > `@deepseek-ai/dsh` resolvido do próprio pacote >
   `dsh` no `PATH`. A versão é lida do `package.json` da instalação e checada contra `^0.2.2-rc.5`.
4. **Profile** (`ensureProfile`, idempotente):
   - cria `package.json` com `dsh.profile.bundles = [@deepseek-ai/dsh-base, @gblelis/dsh-tui-bundle]`
     (bundles extras do usuário são preservados, na ordem, depois dos obrigatórios);
   - cria `cordis.patch.yml` (`[]`) **só se não existir** — a camada do usuário nunca é reescrita;
   - cria `pnpm-workspace.yaml` (hoisted, sem auto-install de peers) para plugins que o usuário instalar
     com `pnpm` no futuro;
   - valida o hash do artefato e recopia `node_modules/@gblelis/dsh-tui-bundle/` quando necessário.
5. **Exec**: `node <dsh>/lib/bin.js --profile tui <args>`, com stdio herdado. O launcher sai com o código
   do filho e repassa sinais (`128 + n`). Nada fica em volta: o terminal pertence ao dsh.

Subcomandos: `install` (cria/repara e imprime o resumo), `sync` (silencioso), `doctor` (11 verificações com
dica de correção), `profile [--json]`, `runtime [--json]`, `version`, `print` (mostra o comando em vez de
executá-lo) e `help`.

## Fluxo dentro do DSH

O loader compõe as camadas de patch (base → bundles → camada do usuário) e ativa cada plugin. A camada
`@gblelis/dsh-tui-bundle` contém:

- **`tui-startup`** (`src/startup.ts`): parseia as flags com `@deepseek-ai/dsh-cmdline` (mesmo parser do
  dsh, incluindo `--help`), publica o serviço `tuiStartup` com valores tipados e agenda uma **guarda**:
  quando o app fica pronto, se o serviço `tui` não existir, escreve um erro claro e sai com código 1.
  Isso cobre o caso em que o loader descarta a linha da TUI sem derrubar o processo.
- **`tui-prompt`** (`src/prompt-service.ts`): serviço `tuiPrompt` que resolve as variáveis interpoladas
  nos templates do tema — `${cwd}`, `${git/worktree}`, `${model}`, `${permission}`,
  `${token_meter/cache_hit_rate}`, `${context}`, `${queued}`, `${symbol}`, `${indicator}` — na linha de
  status e no rodapé, com
  notificações coalescidas por frame.
- **`tui`** (`src/index.ts`): a interface. Não é um "front door" do agente: ele **possui** o agente da
  invocação:
  1. espera o loader terminar (`ctx.get('loader')?.await()`), porque criar o agente antes deixaria a árvore
     mal composta;
  2. `openSession(ctx, startup)` (`src/session-open.ts`) resolve a identidade da sessão:
     `--resume <id>`, `--continue`, `--session-id` ou uma nova `session-<uuid>`; sessão existente é
     adotada via `ctx.agents.resume`, sessão nova via `ctx.agents.create`; sessão de subagente ou com
     `cwd` diferente é recusada com mensagem;
  3. aplica `--permission-mode` via `permissionPresets`;
  4. monta a TUI (`createTuiChat`) com o histórico carregado (`sessionQuery.readSession`);
  5. expõe `ctx.tui` (serviço com `exit`/`subscribe`), que é o que a guarda do startup verifica;
  6. no dispose, descarta a TUI, o agente e o handle na ordem certa.

## Invariantes (não negociáveis)

1. **Zero pacotes `@deepseek-ai/*` em `dependencies` do bundle.** Uma cópia física no profile sombrearia a
   instalação (duas instâncias de cordis). Verificado em `pnpm compat`.
2. **O launcher não importa o DSH.** Se importasse, a resolução do runtime ficaria presa ao layout do
   pacote (pnpm x npm x npx).
3. **Nada de API depreciada.** O porte não usa `eventAt`/`snapshotEvents`/`ownEvents`; usa
   `sessionQuery.readSession`, `commands.execute`, `agents.create/resume`, o seam `user-questions/request`
   e os eventos de compactação `compaction/*`.
4. **A camada do usuário é sagrada.** `cordis.patch.yml` nunca é sobrescrito; manifests inválidos falham
   com mensagem e caminho, em vez de "consertar" silenciosamente.
5. **Aceitação fail-closed.** Runtime fora da faixa ou bundle incompatível: erro explícito antes de montar
   meia interface.

## Sessões e interoperabilidade

Sessões são arquivos do DSH (formato V4) gravados por `@deepseek-ai/dsh-session-persistence` no
`$DSH_HOME`. A TUI não tem formato próprio: o que você começa no terminal pode ser retomado no
Desktop/Web, e vice-versa. `cwd`, `parentSession`, `isSeeded` e `origin` são respeitados na adoção.

## Extensões

- `ctx.get('tuiResumeHost')` — um host (Desktop/outro app) pode fornecer `handoff(sessionId, cwd)` para
  reexecutar o processo ao trocar de sessão.
- `ctx.get('tuiGoodbyeMessage')` — mensagem final no `exit`.
- `ctx.get('tuiInitialSkill')` — semeia a primeira skill de uma sessão nova.
- A camada do usuário (`cordis.patch.yml`) pode desligar/ajustar qualquer linha, inclusive a `tui`.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `packages/cli/src/bin.ts` | entry do executável; traduz erro em mensagem sem stack |
| `packages/cli/src/launcher/{main,env,profile,runtime,doctor,semver,constants}.ts` | launcher |
| `packages/cli/scripts/embed-bundle.ts` | build: copia `packages/bundle/lib` e o patch para `bundle/` + hash |
| `packages/bundle/src/index.ts` | a TUI: eventos, transcript, editor, comandos, diálogos |
| `packages/bundle/src/{startup,session-open,config,prompt-service,runtime}.ts` | composição |
| `packages/bundle/src/chat/*` | helpers, tokens, timing, comandos de modelo, perguntas, resume, autocomplete |
| `packages/bundle/src/components/*` | tema, transcript, cartões, diálogos, texto |
| `packages/bundle/src/extension/*` | overlays e tipos de extensão |
| `packages/bundle/cordis.patch.yml` | a camada: persona, sessão, tui, tool-ask-user, session-reference, tmux-context |
| `patches/*.patch` | patch de build do pi-tui |
| `packages/bundle/tests/*.spec.ts` | unitários das partes puras; `__snapshots__` guarda as golden screens |
| `scripts/{verify-compat,check-package}.ts` | gates de compatibilidade e de pacote |
| `scripts/{screen,chat,install}-smoke.ts` | smokes de tela, conversa (mock do modelo) e instalação via npm |
| `tests/pty.spec.ts` | boot real sob PTY (`script(1)`); auto-skip onde não há PTY |

### Portões

| Comando | O que prova |
| --- | --- |
| `pnpm test` | comportamento puro + golden screens (layout versionado) |
| `pnpm compat` | 11 checagens de API/versão contra o dsh pinado |
| `pnpm verify:package` | conteúdo e metadados do tarball que iria ao npm |
| `pnpm smoke:screen` | o profile compõe e a TUI renderiza num terminal de verdade (headless) |
| `pnpm smoke:chat` | prompt → stream → tool card real → `/export` → `/permissions` → `/login` → retomada |
| `pnpm smoke:install` | `npm pack` → `npm install -g` → boot do binário instalado |
