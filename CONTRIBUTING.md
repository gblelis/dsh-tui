# Contribuindo

Obrigado pelo interesse. Este repositório é o **front end de terminal** do DeepSeek Harness: um bundle
Cordis (privado) e um pacote npm (publicado) que o instala num profile do DSH.

## Requisitos

- Node.js **>= 24.9** (mesmo piso do `@deepseek-ai/dsh`)
- pnpm **10.24.0** (`corepack enable` ou instale exatamente essa versão)
- Um terminal de verdade para rodar a TUI; os smokes funcionam sem PTY
- O submodule do upstream, porque o portão de compatibilidade lê a árvore pinada:

```bash
git clone --recurse-submodules <repo>
# ou, num clone já existente:
git submodule update --init --recursive
```

## Setup

```bash
pnpm install
pnpm check          # typecheck + lint + testes
pnpm build          # bundle → lib/, CLI → lib/ + bundle/ embutido
pnpm smoke:screen   # boot real e renderização no xterm headless
```

Para rodar a TUI a partir do checkout, sem instalar nada globalmente:

```bash
node packages/cli/lib/bin.js
```

O launcher resolve o runtime do workspace (`@deepseek-ai/dsh` pinado) e instala o profile em `$DSH_HOME`
(padrão `~/.dsh`). Use `--home <dir>` para isolar um profile de teste.

## Regras de arquitetura

Estas não são preferências de estilo — quebrá-las quebra a compatibilidade com atualizações do DSH:

1. **O bundle é privado.** Nunca publique `@gblelis/dsh-tui-bundle`; ele viaja embutido no pacote da CLI.
2. **Zero `@deepseek-ai/*` em runtime no bundle.** O artefato embutido não carrega `node_modules`; toda
   dependência do core é `peerDependencies` + `devDependencies` e é resolvida do lado do DSH. Importe
   **tipos** (`import type`) livremente; imports de valor do core, não.
3. **Não faça fork do dsh.** A evolução é via camada de patch (`cordis.patch.yml`) e plugins do bundle.
4. **Não edite saídas de build** (`packages/*/lib/`, `packages/cli/bundle/`).
5. **Toda capacidade nova do terminal deve funcionar contra a API pública** documentada pelo dsh pinado;
   se depender de detalhe interno, documente e adicione uma checagem em `scripts/verify-compat.ts`.

## Tarefas comuns

### Adicionar um comando de barra

1. Registre em `packages/bundle/src/index.ts` com `commandCtx.commands.register({ name, description, input?, handler })`.
2. Se o comando precisar de UI, use `overlayManager.open(...)` e um componente de
   `packages/bundle/src/components/dialogs.ts` (o padrão está em `DetailsDialog`/`PermissionsDialog`).
3. Escreva o texto na conversa com `appendNotice(...)`; nunca `console.log` (quebraria a tela).
4. Cubra a lógica pura com teste unitário e, se mudar o caminho do host, estenda `scripts/chat-smoke.ts`.

### Adicionar uma linha de plugin ao profile

Só adicione o que o **terminal** precisa e que o `dsh-base` não expõe (como `tool-ask-user`). Prefira a
camada do usuário para preferências pessoais. Depois de mexer no patch:

```bash
pnpm build
pnpm smoke:screen
node "$(node packages/cli/lib/bin.js runtime)" --profile tui --dump-config | grep <id>
```

### Mudar um diálogo ou o transcript

Os goldens versionados são o contrato visual:

```bash
pnpm vitest run -u    # regrava os snapshots depois de aceitar a mudança
git diff packages/bundle/tests/__snapshots__
```

Inclua o diff do snapshot no PR — ele é a revisão visual.

### Atualizar o DSH alvo

Atualize, nos três lugares que precisam concordar: `packages/cli/package.json` (`dependencies`),
`packages/bundle/package.json` (`peerDependencies` + `devDependencies`) e o pin em
`scripts/verify-compat.ts`. Depois:

```bash
pnpm install
pnpm compat
pnpm check
pnpm smoke:screen && pnpm smoke:chat && pnpm smoke:install
```

Registre a decisão no `CHANGELOG.md` e atualize `docs/compatibilidade.md`.

## Antes de abrir o PR

```bash
pnpm check
pnpm compat
pnpm verify:package
pnpm build
pnpm smoke:screen
pnpm smoke:chat
pnpm smoke:install
```

- Use mensagens de commit no padrão `tipo(escopo): resumo` (`feat(tui):`, `fix(cli):`, `test:`, `docs:`).
- Descreva o comportamento visível na TUI e cole a tela renderizada quando a mudança for visual.
- Um PR que muda dependência do core precisa explicar o que acontece se o usuário rodar um dsh diferente
  (o `dsh-tui doctor` reporta skew; a resposta esperada é degradar com mensagem clara, não quebrar).

## Licença e atribuição

O projeto é MIT. O pacote de TUI portado do upstream é BSD-3-Clause e está atribuído em `NOTICE.md` e
`docs/porting/PROVENANCE.md` — não remova esses arquivos nem os headers de proveniência.
