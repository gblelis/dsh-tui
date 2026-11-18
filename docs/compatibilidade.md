# Compatibilidade com o DeepSeek Harness

O objetivo do projeto é simples: **acompanhar o DSH sem fork**. O CLI não copia o core; ele compõe uma
camada de terminal sobre o `dsh-base` publicado. Este documento descreve o contrato, o que é verificado
automaticamente e o passo a passo para subir a versão suportada.

## Versão suportada

| Item | Valor |
| --- | --- |
| Release do DSH | `0.2.2-rc.5` (dist-tag `next` na época do pin) |
| Tag no repositório upstream | `dsh-v0.2.2-rc.5` |
| Commit | `9c2670d3bce5275e0d1610272958121af87787bb` |
| Faixa aceita pelo bundle (`engines.dsh`) | `^0.2.2-rc.5` |
| Faixa aceita pelo launcher | `^0.2.2-rc.5` |
| Node.js | `>= 24.9.0` |
| Formato de sessão | V4 |

A faixa `^0.2.2-rc.5` aceita `0.2.2-rc.5` até `<0.3.0` (pré-releases acima do piso incluídas). Ou seja:
correções e patches da linha `0.2.2` entram sem mudança de código; `0.3` exige revisão.

## Como o DSH decide se aceita o bundle

O loader do DSH lê `engines.dsh` do pacote do bundle e avalia com semver `includePrerelease`. Se a
instalação não estiver na faixa, o bundle é **ignorado com exit 0** — ele não carrega o arquivo de patch e
segue o boot sem a linha da TUI. É um comportamento correto do DSH, mas péssimo como UX: o processo subiria
sem interface e sem erro.

O `dsh-tui` cobre os dois lados:

1. **O launcher recusa antes de executar** quando o runtime resolvido está fora da faixa, com instrução de
   correção (`--dsh-bin`, `npm i -g @deepseek-ai/dsh@next`).
2. **A guarda de ativação** (`src/startup.ts`) verifica, quando o app fica pronto, se o serviço `tui`
   existe. Se não existir — bundle pulado, import quebrado, linha desativada na camada do usuário — escreve
   a causa no stderr e sai com código 1, em vez de deixar um processo mudo.

## O que é verificado automaticamente

`pnpm compat` (script `scripts/verify-compat.ts`) falha o build quando:

| Verificação | Motivo |
| --- | --- |
| Submódulo upstream no commit pinado | referência de leitura e de testes |
| `dependencies['@deepseek-ai/dsh']` igual ao pin | launcher instala o runtime certo |
| `engines.dsh` aceita a versão pinada | o loader não vai pular o bundle |
| bundle sem pacotes `@deepseek-ai/*` em `dependencies` | uma cópia dupla de cordis quebraria o core |
| artefato embutido sem `node_modules` | o tarball não deve carregar árvore de dependências |
| todo import `@deepseek-ai/*` declarado em devDeps + peers | typecheck local e resolução no profile |
| patch YAML é um array e todo `name:` de plugin resolve na instalação | plugin renomeado/removido é detectado na hora |
| exports do bundle apontam para arquivos existentes | o profile reescreve para `lib/`, o dev para `src/` |
| `bin.dsh-tui` existe depois do build | pacote publicável |

`pnpm test` cobre as partes puras (faixa semver do launcher, merge de bundles, hash do artefato, tokens,
timing, templates de prompt, defaults de config). `pnpm verify:package` confere o conteúdo exato do tarball
e revalida o hash do bundle embutido.

## Dependências da API pública que o porte usa

Estas são as superfícies que precisam de atenção ao subir de versão. Todas são públicas e estáveis na
linha `0.2.x`; a coluna "risco" indica o que costuma mudar.

| Superfície | Uso | Risco |
| --- | --- | --- |
| `ctx.agents.create/resume` + `AgentHandle` | dono do agente da invocação | médio |
| `agent.followup/steer/inject/cancel/status/model/inbox` | envio e controle de turno | baixo |
| eventos `agent/*` (`inbox/claimed`, `inbox/inserted`, `inbox/discarded`, `status`, `error`, `disposed`, `created`, `assistant-stream`) | toda a reatividade da UI | **alto** (payloads mudam) |
| eventos de sessão (`user/message`, `step/*`, `assistant/message`, `tool/call`, `tool/result`, `turn/*`, `session/title`, `todo/write`, `llm/retry`, `compaction/*`) | reconstrução do transcript | alto |
| `ctx.sessionQuery.readSession/listSessions/readTitleSnapshots/observeSession` | reabrir sessão, títulos, `/resume` | médio |
| `ctx.sessionPersistence.stat` | caminho/mtime para atividade | baixo |
| `ctx.commands.register/execute/list` | comandos e `/skill:` | baixo |
| `ctx.permissionPresets.resolve/set` | `--permission-mode` | baixo |
| `ctx.agentDefaultModel.currentSelection/saveSelection` | `/model` | baixo |
| `ctx.sessionReferenceResolver.prepare/listCandidates` | referências `@sessão` | médio |
| seam `user-questions/request` (waterfall) | `ask_user_question` | médio |
| `ctx.skills.{list,snapshot,get}` | `/skill:<nome>` | baixo |
| `ctx.systemPrompt.section/assemble`, `renderPrompt` | `/status`, prompt de arquivo | baixo |
| `@deepseek-ai/dsh-cmdline` `parseCmdline` | flags da TUI integradas ao `--help` do dsh | baixo |
| `expandedAssistantStream` + `StreamChunk` | streaming durável | médio |

Regras de ouro que o porte já segue e que novos recursos devem manter:

- Não usar `eventAt`, `snapshotEvents`, `ownEvents` (depreciados e proibidos para código novo).
- Não depender de `agent/prompt-submit`, `agent-loop/config-start-failed`, `acceptsNextStep` nem
  `installAgentLlmTarget` (não existem mais).
- Compactação é evento de sessão (`compaction/start|summary|end|prune`), não `compact/*`.
- `ToolResultMessage` não aninha bloco `tool-result`: usar `message.content` + `message.isError`.

## Subindo a versão suportada

Checklist para um bump (ex.: `0.2.2` final ou `0.2.3`):

1. **Atualizar a referência**: `git -C upstream/deepseek-harness fetch --tags && git -C upstream/deepseek-harness checkout dsh-vX.Y.Z`; anotar o commit.
2. **Alterar o pin em três lugares**:
   - `scripts/verify-compat.ts` (`PIN.dshVersion`, `PIN.tag`, `PIN.commit`);
   - `packages/cli/package.json` → `dependencies['@deepseek-ai/dsh']`;
   - `packages/bundle/package.json` → `engines.dsh` (e `packages/cli/scripts/embed-bundle.ts` + `packages/cli/src/launcher/profile.ts` geram o mesmo `engines` no artefato — mantenha os três iguais).
3. **Atualizar os devDeps do bundle** para a mesma versão:
   `pnpm --filter @gblelis/dsh-tui-bundle add -D @deepseek-ai/dsh-agent@X.Y.Z @deepseek-ai/dsh-llm@X.Y.Z …`
   (a lista está no `packages/bundle/package.json`; rode `pnpm install` e confira o lockfile).
4. **`pnpm compat`** — os plugins do patch e os imports são revalidados contra a nova instalação.
5. **`pnpm typecheck`** — cada erro aponta uma mudança de API. Corrija o porte (não use `any`, não
   suprima com `@ts-expect-error` sem comentário de rastreio).
6. **`pnpm test`** — os testes de apresentação pegam mudanças de forma de evento.
7. **`pnpm build && pnpm verify:package`** — re-embute o bundle e valida hash/tarball.
8. **Teste manual**: `DSH_HOME=$(mktemp -d) dsh-tui --dsh-bin <nova instalação>/lib/bin.js doctor` e um
   chat real (streaming, tool call, `/model`, `/resume`, `Ctrl+C`).
9. **Registrar no changelog** a nova faixa e o que mudou no porte.

Se a mudança for grande (ex.: `0.3`), o caminho é criar a faixa nova no launcher e no bundle
(`^0.3.0`) e manter uma tag antiga do `dsh-tui` para quem estiver no `0.2.x`. O launcher recusar a faixa
antiga é intencional: melhor um erro claro do que uma UI sem metade dos eventos.

## Divergência de runtime

Se o `doctor` apontar um runtime como `outside ^0.2.2-rc.5`, você tem três opções:

1. Instalar o runtime suportado: `npm i -g @deepseek-ai/dsh@0.2.2-rc.5` (ou `@next`, se já for essa).
2. Apontar para uma cópia correta: `dsh-tui --dsh-bin /caminho/lib/bin.js`.
3. Esperar uma release do `dsh-tui` para a versão nova.

O `dsh-tui` **não** força o boot num runtime desconhecido: os eventos e serviços da interface mudam entre
minor versions e a falha apareceria no meio de uma sessão, não no começo.

## Sessões entre versões

O formato V4 é compartilhado por toda a linha `0.2.x`. Uma sessão criada pelo Desktop/Web/CLI abre em
qualquer superfície da mesma linha. Um bump de `dsh-tui` não migra nem reescreve sessões: isso é
responsabilidade do core.
