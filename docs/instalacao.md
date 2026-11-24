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

## Instalação pelo npm (recomendada)

```bash
npm install -g @gblelis/dsh-tui     # global
npx @gblelis/dsh-tui@latest         # sem instalar
```

O tarball publicado carrega **provenance** assinada (SLSA v1): a página do pacote no npm mostra de qual
commit e de qual workflow ele saiu. O binário já declara `@deepseek-ai/dsh@0.2.2-rc.5`, então o runtime
vem junto.

Confira:

```bash
dsh-tui version
dsh-tui doctor
```

Atualização: `npm install -g @gblelis/dsh-tui@latest` — o profile é reparado no próximo boot; o hash do
artefato muda e o launcher recopia o bundle automaticamente.

## Instalação a partir do repositório

Para testar uma alteração local, ou usar um commit que ainda não virou release:

```bash
git clone https://github.com/gblelis/dsh-tui.git
cd dsh-tui
corepack enable
pnpm install
pnpm build
pnpm verify:package            # opcional: confere o conteúdo do tarball
cd packages/cli
npm pack                       # gblelis-dsh-tui-0.2.2.tgz
npm install -g ./gblelis-dsh-tui-0.2.2.tgz
```

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
✓ Embedded bundle: @gblelis/dsh-tui-bundle@0.2.2 (7 files)
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

## Num servidor remoto (SSH)

O caso de uso que motivou o projeto: o servidor tem o código, o Desktop não está lá e o Web exigiria um
HTTP aberto. Com SSH você tem exatamente o terminal de que a TUI precisa.

```bash
ssh usuario@servidor
node -v                                  # precisa ser >= 24.9.0
npm install -g @gblelis/dsh-tui
dsh-tui                                  # o SSH normal já aloca um TTY
```

Sem permissão de root, use um prefixo no seu home:

```bash
npm config set prefix ~/.local
npm install -g @gblelis/dsh-tui          # binário em ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
```

Ou instale o Node com nvm (sem sudo) e o `npm install -g` cai dentro dele.

### Se o servidor não tem Node 24 ou não alcança o npm

- **Node antigo**: a versão 24 exige `glibc >= 2.28` — CentOS 7 e derivados não rodam. Use nvm
  (`nvm install 24`) ou, se nem isso for possível, o TUI não roda nessa máquina; não há build para Node 18/20.
- **Sem registry**: empacote na sua máquina (`npm pack` em `packages/cli`), copie o `.tgz` com `scp` e
  instale com `npm install -g ./gblelis-dsh-tui-0.2.2.tgz`. Ainda assim o npm precisa baixar
  `@deepseek-ai/dsh@0.2.2-rc.5` — sem rede, copie também o `node_modules` da instalação global de uma
  máquina com acesso (mesma arquitetura/glibc).

### Credenciais no servidor

```bash
export DEEPSEEK_API_KEY=sk-...          # no ~/.bashrc ou num arquivo que você carregue
dsh-tui                                 # ou use /login dentro da TUI
```

Também vale copiar `~/.dsh/.credentials.yaml` da sua máquina (`scp`), mas lembre que a chave passa a
existir em mais um lugar — prefira variável de ambiente no servidor.

### Terminal, locale e tmux

- `LANG` precisa ser UTF-8 (`C.UTF-8` ou `en_US.UTF-8`); sem isso as bordas do painel saem tortas.
- `COLORTERM=truecolor` habilita a paleta de 24 bits; sem ela o palette cai para 256 cores, ainda legível.
- Funciona dentro de `tmux`/`screen`; para cores corretas no tmux use
  `set -g default-terminal "tmux-256color"` e `set -ga terminal-features ",*:RGB"`.
- **Sessões são locais**: `$DSH_HOME/sessions` fica no servidor. Para retomar no Desktop, copie os arquivos
  ou aponte `DSH_HOME` para um diretório sincronizado (sem dois processos escrevendo ao mesmo tempo).

## Ambientes sem terminal

A TUI exige TTY nos dois sentidos e **falha com mensagem clara** (não trava) quando não há terminal —
por exemplo em CI, `docker run` sem `-t`, ou `ssh host dsh-tui` sem `-t`:

```
dsh-tui: the interactive terminal front end needs a TTY on both stdin and stdout
dsh-tui: Run dsh-tui directly in a terminal. For scripted use, boot the headless profile with dsh itself.
```

Para uso scriptado, use o próprio DSH em modo headless (o `dsh-tui` não substitui esse fluxo de
propósito: um front end de terminal não deve fingir ser uma API).
