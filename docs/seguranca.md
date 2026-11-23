# Segurança

Este documento registra o modelo de ameaça do `dsh-tui`, o que foi endurecido, o que continua aceito
conscientemente e como verificar tudo de novo. Ele é escrito para quem audita e para quem mantém: cada
afirmação aqui pode ser reproduzida com os comandos da última seção.

## Modelo de ameaça

O `dsh-tui` é um front end de terminal: não guarda segredos próprios, não abre portas e não baixa código em
tempo de execução. O que ele **faz**:

| Superfície | Confiança | Observação |
| --- | --- | --- |
| Core do DSH (`@deepseek-ai/dsh` pinado) | confiável (é o próprio produto) | plugins carregados do perfil, sem cópia duplicada de Cordis |
| Modelo e ferramentas | **não confiável** | texto e metadados alimentam o transcript |
| Logs de sessão em `$DSH_HOME` | **não confiável** | um arquivo forjado é reexecutado no `/resume` |
| Terminal (capacidades/ambiente) | semi-confiável | escape sequences são o vetor clássico |
| Registry npm | confiável via TLS | usado só para ler dist-tags (release awareness) |
| `$DSH_HOME` | do usuário | mesma conta que já roda o agente |

O terminal é o limite de privilégio mais interessante: um caractere ESC vindo do modelo pode limpar a tela,
mover o cursor ou reescrever o frame inteiro. Todo texto externo passa por `displayText`
(`packages/bundle/src/components/text.ts`), que transforma C0/C1 (incluindo `\x1b`) em `\xNN` antes de o
palette adicionar o ANSI do aplicativo.

## Endurecimentos desta revisão

| Correção | Onde | Por quê |
| --- | --- | --- |
| Escapar controles no painel inicial (título, id, cwd) | `components/welcome.ts` | o título vem de `session/title`; um log forjado injetava ESC/OSC no frame |
| Sanitizar `data` do hook de captura e tolerar JSON inválido | `testing/capture-terminal.ts` | `DSH_TUI_CAPTURE_INPUT` malformado derrubava o mount |
| `/export` grava com modo `0600` e recusa symlink | `index.ts` | transcript contém o que foi colado no chat; symlink plantado redirecionava a escrita |
| Cache de release com escrita atômica (`wx` + `0600` + rename) | `update-check.ts` | leitor concorrente podia ver JSON pela metade; arquivo previsível era sequestrável |
| Limite de 64 KiB e checagem de `content-type` na resposta do registry | `update-check.ts` | resposta hostil não deve virar OOM nem HTML interpretado |
| Recusa de URL não-https e de redirect no release check | `update-check.ts` | o hook de teste podia apontar para um host interno |
| `todo/write` só aceita itens com `content` string | `components/transcript.ts` | payload forjado gerava `TypeError` durante o render |
| Profundidade máxima na árvore de XML de ferramenta | `components/xml-tool-output.ts` | XML profundamente aninhado estourava a pilha |
| Manifesto do bundle valida caminhos (`..`, absoluto, `\`) | `launcher/profile.ts` | a lista do manifesto é usada como destino de escrita |
| Cópia do bundle em diretório de staging + `rename` | `launcher/profile.ts` | crash no meio da cópia deixava pacote parcial |
| Boot re-hasheia a cópia instalada (~3 ms) | `launcher/profile.ts` | o stamp registra o que foi escrito, não o que está lá |
| `dsh-tui sync` força reescrita | `launcher/main.ts` | verbo de reparo não pode confiar no stamp |
| Gate de versões do tarball realmente comparativo | `scripts/check-package.ts` | o código anterior comparava o manifesto consigo mesmo |
| Scripts de `scripts/` entram no typecheck | `tsconfig.scripts.json` | foi o que escondeu o bug do gate |
| Publicação do tarball empacotado uma única vez | `.github/workflows/release.yml` | `prepublishOnly` recompilava depois dos gates |
| Actions pinadas por commit SHA, release via `gh` | `.github/workflows/*.yml` | tag móvel + `contents: write` + `id-token: write` é combinação perigosa |

## Dependências: 10 advisories, nenhum alcançável hoje

`pnpm audit` em 23/11/2026 aponta 10 advisories (4 *high*, 6 *moderate*), **todos transitivos dentro do
runtime `@deepseek-ai/dsh`** — nenhum vem de uma dependência declarada por este projeto:

| Pacote | Advisories | Caminho | Alcançável no perfil `tui`? |
| --- | --- | --- | --- |
| `undici` 8.11.2 | 8 (4 high) | `dsh-subprocess > dsh-http-proxy > undici` | **não** — `dsh-http-proxy` não importa `undici` (declara isso no cabeçalho do módulo); nenhum dos 105 plugins do perfil importa |
| `@modelcontextprotocol/client` 2.2.0 | 1 (moderate: redirects cross-origin) | `dsh > dsh-mcp-client > @modelcontextprotocol/client` | **não** — `dsh-mcp-client` não é montado; `dsh-mcp-resources` não importa o SDK |
| `fflate` 0.8.2 | 1 (moderate: loop em ZIP malformado) | `dsh > dsh-sdk-app > dsh-office-kit > libreoffice-kit > fflate` | **não** — `dsh-sdk-app`/`dsh-office-kit` não entram no perfil |

Como isso foi verificado (reproduzível):

```bash
# 1. os plugins que o perfil realmente monta
node "$(node packages/cli/lib/bin.js runtime | head -1)" --profile tui --dump-config \
  | grep -oE '@deepseek-ai/[a-z0-9-]+' | sort -u > /tmp/plugins.txt

# 2. algum deles importa o módulo vulnerável?
while read -r p; do
  grep -rlE "from ['\"](undici|fflate)['\"]|@modelcontextprotocol/client" "node_modules/$p/lib" 2>/dev/null
done < /tmp/plugins.txt
# nenhuma linha: nenhum plugin montado carrega esses módulos
```

O risco muda se você **habilitar MCP** no perfil `tui` (o SDK passa a ser carregado) ou usar ferramentas de
Office/Web que não existem neste front end. Até o upstream publicar uma correção, as opções são:

1. Não habilitar `dsh-mcp-client` neste perfil (o padrão já é esse: nenhum MCP configurado).
2. Se precisar, manter os servidores MCP em um perfil separado e atualizado.
3. Acompanhar `pnpm audit` a cada bump de pin — a correção tem de vir do upstream, porque as versões são
   fixadas exatamente por ele (`undici: 8.11.2`, `@modelcontextprotocol/client: 2.2.0`).

## Riscos aceitos

| Risco | Por que fica assim |
| --- | --- |
| `stamp.json` e `manifest.json` viajam juntos, então quem reescreve os dois passa | não há assinatura; o tarball e o `bin.js` já seriam código executável do mesmo usuário. A checagem protege contra corrupção acidental, não contra o dono da máquina |
| Texto com controles bidirecionais (U+202A–202E) não é escapado | escapar quebraria árabe/hebraico legítimos; o efeito é spoofing visual, não execução |
| O agente herda o ambiente do processo (incluindo `*_TOKEN`) | é o contrato do DSH: ferramentas rodam como o usuário. `dsh` direto tem o mesmo comportamento; filtrar aqui surpreenderia quem usa `NPM_TOKEN` de propósito |
| `DSH_TUI_CAPTURE_OUTPUT` contorna a checagem de TTY | hook de teste documentado; quem controla o ambiente do processo já pode executar código. O arquivo agora nasce `0600` |
| `DSH_TUI_UPDATE_URL` existe para testes | só troca a URL consultada; https e loopback são exigidos |

## Como verificar

```bash
pnpm check              # typecheck (inclui scripts/) + lint + 90+ testes
pnpm compat             # 11 checagens contra o pin do dsh
pnpm verify:package     # conteúdo do tarball, hash do bundle, versões coerentes
pnpm audit --audit-level moderate   # advisories transitivos (ver análise acima)
```

Para testar o auto-reparo (o cenário que antes passava silencioso):

```bash
home=$(mktemp -d)
node packages/cli/lib/bin.js install --home "$home"
printf 'tamper\n' >> "$home/profiles/tui/node_modules/@gblelis/dsh-tui-bundle/lib/index.js"
node packages/cli/lib/bin.js doctor --home "$home"    # ! needs a refresh
DSH_TUI_CAPTURE_OUTPUT=/tmp/x.raw DSH_TUI_CAPTURE_COLUMNS=80 DSH_TUI_CAPTURE_ROWS=20 \
  node packages/cli/lib/bin.js --home "$home" --new </dev/null   # repara no boot
node packages/cli/lib/bin.js doctor --home "$home"    # ✓ content hash verified
```

## Relatando

Achou algo? Abra uma issue privada no repositório (Security → Report a vulnerability) descrevendo versão do
`dsh-tui`, do dsh, sistema e passos. Não abra issue pública com detalhes exploráveis.
