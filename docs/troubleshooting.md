# Troubleshooting

Comece sempre por:

```bash
dsh-tui doctor
dsh-tui version
```

`doctor` cobre Node, `DSH_HOME`, manifest do profile, hash do bundle, runtime dsh, TTY e credenciais — com a
ação recomendada em cada linha.

---

## "dsh-tui: both stdin and stdout must be TTYs"

A TUI exige terminal nos dois sentidos. Causas comuns:

- rodando via CI, `cron`, `subprocess` de outra app, `docker exec`/`run` sem `-t`;
- `ssh host dsh-tui` sem `ssh -t`;
- redirecionamento: `dsh-tui > log`, `echo ... | dsh-tui`, `dsh-tui &`.

Soluções: `ssh -t host dsh-tui`, `docker run -it`, ou — para fluxo scriptado — use o DSH headless
(`dsh headless "prompt"`), que não é o objetivo deste front end.

## "Node.js vX is too old"

`dsh-tui` exige **≥ 24.9.0**, o mesmo piso do DSH. Instale uma versão nova (nvm/fnm/volta) e confira:

```bash
node -v
which -a node | head -3      # várias instalações: a primeira do PATH vence
npm ls -g --depth=0 | grep dsh
```

## "dsh X is outside the supported range ^0.2.2-rc.5"

O runtime do DSH encontrado é mais novo/velho que o suportado. Opções:

1. `npm install -g @deepseek-ai/dsh@0.2.2-rc.5`
2. `dsh-tui --dsh-bin /caminho/para/@deepseek-ai/dsh/lib/bin.js`
3. `npm install -g @gblelis/dsh-tui@latest` (uma release nova pode suportar a versão que você tem)

Não há flag para "forçar": a interface depende de eventos e serviços que mudam entre minors, e forçar
produziria uma UI quebrada no meio da sessão.

## "the terminal front door did not activate"

O profile montou, mas a linha `tui` não subiu. O stderr mostra o erro original da linha (logo acima da
mensagem). Causas típicas:

| Mensagem anterior | Causa | Correção |
| --- | --- | --- |
| `Cannot find package '@deepseek-ai/...'` | instalação do dsh incompleta | reinstale `@deepseek-ai/dsh` (`npm i -g @deepseek-ai/dsh@0.2.2-rc.5`) |
| `Cannot find package '@gblelis/dsh-tui-bundle'` | cópia do bundle ausente no profile | `dsh-tui sync` (ou apague `$DSH_HOME/profiles/tui/node_modules`) |
| `SyntaxError`/`Unexpected token` | artefato corrompido/versão antiga | `npm i -g @gblelis/dsh-tui@latest && dsh-tui sync` |
| `both stdin and stdout must be TTYs` | sem terminal | ver primeira seção |
| erro de um plugin seu | a camada do usuário inseriu algo inválido | revise `profiles/tui/cordis.patch.yml`; `--dump-config` mostra a árvore |

Diagnóstico fino:

```bash
node "$(dsh-tui runtime | head -1)" --profile tui --dump-config
```

## "1 entry did not activate" / tela vazia e processo vivo

Antes da guarda de ativação, um bundle incompatível era pulado com exit 0 e a TUI nunca montava: o processo
ficava vivo sem interface. Hoje a guarda escreve o erro e sai com 1. Se você vir um processo mudo:

- confirme que está rodando o `dsh-tui` (e não `dsh --profile tui` direto, que não tem a guarda);
- `dsh-tui doctor` para checar o runtime.

## Credenciais

`doctor` mostra a fonte encontrada. Ordem: `DEEPSEEK_API_KEY` → `.env` do projeto → `.env` do home →
`$DSH_HOME/.credentials.yaml`.

- Nunca configure? Exporte a variável ou crie `.env` com `DEEPSEEK_API_KEY=sk-...`.
- Configurou no Desktop/Web? O `.credentials.yaml` é o mesmo arquivo; se o `doctor` não achar, verifique
  `DSH_HOME` (o Desktop pode usar um home diferente).
- Erro `NO_ADAPTER` ao enviar prompt: o modelo escolhido não tem provider configurado. Rode `/model` e
  escolha um modelo cujo provider tenha credencial.

## Cores erradas / sem cor

- Truecolor depende de `COLORTERM=truecolor` (ou `24bit`). `TERM=xterm-256color` já dá 256 cores.
- `/palette` mostra os papéis de cor para conferir contraste.
- Para forçar no profile:

```yaml
- id: tui
  config:
    theme:
      color: true
      truecolor: false
```

## Acentos/emoji largos desalinhados

O renderizador mede largura de célula (east-asian-width, emoji). Se o seu terminal usa fonte com largura
diferente para emoji, alguns glifos podem deslocar uma coluna. Ajuste os textos do tema, que são
configuráveis:

```yaml
- id: tui
  config:
    theme:
      leftPrompt: '${cwd}${git/worktree} ${model}'
      rightPrompt: '${queued}'
      inputPlaceholder: 'Ask, steer, or /help'
```

## Sessão não aparece em `/resume`

- `/resume` lista sessões do **mesmo cwd** (o diretório onde você rodou `dsh-tui`).
- Títulos vêm do índice em memória (`session-query-sqlite`): a primeira busca pode demorar um pouco em
  homes com muitas sessões.
- Para abrir uma sessão de outro diretório: `dsh-tui --resume <id>` (o cwd é restaurado da sessão).

## "session ... belongs to another directory" / "is a subagent session"

A adoção de sessão recusa subagentes e sessões de outro `cwd`, para não misturar contexto. Use o `cwd`
original (`cd` para ele) ou abra a sessão pelo Desktop/Web.

## Não consigo trocar permissões no meio da sessão

Hoje o preset é aplicado no início (`--permission-mode read-only|workspace-write|danger-full-access`). A
troca em tempo real via `/permissions` está no roadmap; até lá, saia e reabra com a flag.

## `pnpm install` do repositório falha com peers do DSH

O workspace usa `autoInstallPeers: true` + `nodeLinker: hoisted` justamente para reproduzir uma instalação
npm plana do dsh. Se o lockfile estiver velho:

```bash
pnpm install --force
```

## O bundle não atualiza depois de `pnpm build`

O launcher recopia quando o hash muda. Se algo ficou preso:

```bash
dsh-tui sync
# ou, para forçar:
rm -rf "$DSH_HOME/profiles/tui/node_modules/@gblelis/dsh-tui-bundle" "$DSH_HOME/profiles/tui/.dsh-tui"
dsh-tui install
```

## Windows

O caminho suportado é WSL2 (terminal real, Node Linux). Em Windows nativo o launcher funciona (paths e
`spawnSync`), mas não há teste de PTY no CI para `cmd.exe`/PowerShell; use Windows Terminal e relate
problemas. Caminhos com espaços são suportados.

## Logs e depuração

- `dsh-tui doctor --json` — diagnóstico legível por máquina.
- `dsh-tui runtime --json` — runtime e compatibilidade.
- `DSH_TUI_DEBUG=1 dsh-tui ...` — stack trace do launcher em falhas inesperadas.
- `node <dsh>/lib/bin.js --profile tui --dump-config` — árvore final de plugins.
- Logs do próprio dsh: `stderr` (o profile não esconde nada).

## Reportando um problema

Inclua:

1. `dsh-tui version` e `dsh-tui doctor --json`;
2. sistema/terminal (`uname -a`, `echo $TERM`, `$COLORTERM`);
3. o comando exato e a mensagem completa (sem a chave de API);
4. se possível, o trecho do transcript antes da falha.
