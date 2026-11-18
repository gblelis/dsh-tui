# Instalação

## Requisitos

| Requisito | Versão | Como verificar |
| --- | --- | --- |
| Node.js | ≥ 24.9.0 (mesmo piso do DSH) | `node -v` |
| Terminal | TTY em stdin **e** stdout | `test -t 0 && test -t 1 && echo ok` |
| dsh runtime | `^0.2.2-rc.5` | `dsh-tui runtime` |
| Credencial DeepSeek | uma das fontes abaixo | `dsh-tui doctor` |

O runtime não é obrigatório na mão: `@gblelis/dsh-tui` declara `@deepseek-ai/dsh@0.2.2-rc.5` como
dependência, então `npm install -g` traz o runtime junto. Se você já tem o DSH instalado em outro lugar,
pode apontar para ele com `--dsh-bin` / `DSH_TUI_DSH_BIN` (desde que esteja na faixa suportada).

## Instalação a partir do repositório (enquanto não há publish)

```bash
git clone git@github.com:<você>/deepseek-harness-tui.git
cd deepseek-harness-tui
corepack enable
pnpm install
pnpm build
pnpm verify:package            # opcional: confere o conteúdo do tarball
cd packages/cli
npm pack                       # gblelis-dsh-tui-0.1.0.tgz
npm install -g ./gblelis-dsh-tui-0.1.0.tgz
```

Confira:

```bash
dsh-tui version
dsh-tui doctor
```

## Instalação pelo npm (depois do publish)

```bash
npm install -g @gblelis/dsh-tui     # global
npx @gblelis/dsh-tui@latest         # sem instalar
```

Atualização: `npm install -g @gblelis/dsh-tui@latest` (o profile é reparado no próximo boot; o hash do
artefato muda e o launcher recopia o bundle automaticamente).

## Primeiro boot

```bash
cd ~/meu-projeto
dsh-tui
```

Saída esperada do `dsh-tui doctor` num ambiente pronto:

```
✓ Node.js: v24.9.0 (requires >= 24.9.0)
✓ DSH home: /home/você/.dsh (default ~/.dsh)
✓ Profile "tui": /home/você/.dsh/profiles/tui · bundles: @deepseek-ai/dsh-base, @gblelis/dsh-tui-bundle
✓ Embedded bundle: @gblelis/dsh-tui-bundle@0.1.0 (6 files)
✓ dsh runtime: 0.2.2-rc.5 at …/@deepseek-ai/dsh (found via package); dsh-tui targets ^0.2.2-rc.5
✓ Terminal: xterm-256color · stdin and stdout are TTYs
✓ Credentials: DEEPSEEK_API_KEY from the environment
Everything looks ready.
```

## Opções de instalação

### Outro `DSH_HOME`

```bash
dsh-tui --home /mnt/disco/dsh
# ou
export DSH_HOME=/mnt/disco/dsh
```

Sessões e credenciais seguem esse home. Nada é escrito fora dele.

### Runtime específico

```bash
dsh-tui --dsh-bin /opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js
# ou
export DSH_TUI_DSH_BIN=/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js
```

O caminho aceita tanto o `lib/bin.js` quanto um diretório dentro da instalação do `@deepseek-ai/dsh`.

### Profile isolado para testes

```bash
DSH_HOME=$(mktemp -d) dsh-tui doctor     # não toca no seu ~/.dsh
```

## O que é criado no disco

```
$DSH_HOME/
├── profiles/tui/
│   ├── package.json            # dsh.profile.bundles
│   ├── cordis.patch.yml        # sua camada (nunca sobrescrita)
│   ├── pnpm-workspace.yaml     # para plugins que você instalar com pnpm
│   ├── node_modules/@gblelis/dsh-tui-bundle/
│   │   ├── package.json        # dsh.bundle.patch + engines
│   │   ├── cordis.patch.yml
│   │   ├── manifest.json       # versão + hash + arquivos
│   │   └── lib/{index,startup,prompt-service,rolldown-runtime-*}.js
│   └── .dsh-tui/stamp.json     # hash instalado (auto-reparo)
├── sessions/                   # sessões V4 do DSH (compartilhadas com Desktop/Web)
├── .credentials.yaml           # se você configurou credenciais no Desktop/Web
└── .env                        # opcional
```

Nada é instalado por `pnpm`/`npm` dentro de `$DSH_HOME`: o bundle é copiado do próprio pacote. Só o
`pnpm-workspace.yaml` fica preparado para o dia em que você adicionar plugins de terceiros.

## Desinstalação

```bash
npm uninstall -g @gblelis/dsh-tui
rm -rf "$DSH_HOME/profiles/tui"      # opcional: remove o profile e a cópia do bundle
```

As sessões em `$DSH_HOME/sessions` continuam intactas e podem ser retomadas pelo Desktop/Web.

## Ambientes sem terminal

A TUI exige TTY nos dois sentidos e **falha com mensagem clara** (não trava) quando não há terminal —
por exemplo em CI, `docker run` sem `-t`, ou `ssh host dsh-tui` sem `-t`:

```
dsh-tui: the interactive terminal front end needs a TTY on both stdin and stdout
dsh-tui: Run dsh-tui directly in a terminal. For scripted use, boot the headless profile with dsh itself.
```

Para uso scriptado, use o próprio DSH em modo headless (o `dsh-tui` não substitui esse fluxo de
propósito: um front end de terminal não deve fingir ser uma API).
