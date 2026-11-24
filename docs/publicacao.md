# Publicação

Este é o roteiro de release do `@gblelis/dsh-tui`. O pacote publicado é **um só**: launcher + bundle
embutido. O bundle (`packages/bundle`) é privado do workspace e viaja como artefato dentro de
`packages/cli/bundle/`.

## Estado da publicação

| Versão | Status |
| --- | --- |
| `0.2.1` | publicada no npm em 24/11/2026, com provenance SLSA v1; release do GitHub com o `.tgz` anexado |

Dois detalhes observados no primeiro publish, que valem para os próximos:

1. **Placeholder `0.0.0-stage`.** O npm criou `@gblelis/dsh-tui@0.0.0-stage` ("Temporary package
   placeholder for staged publishing") no primeiro contato com o escopo. Ele não é `latest` e não afeta
   `npm install`; é resquício do fluxo de staged publishing do npm e não precisa ser removido.
2. **Staged publishing.** Se a conta/pacote exigir *staged publishing*, o `npm publish` do workflow sai
   com sucesso mas **não publica**: ele deixa a versão aguardando aprovação humana com 2FA. Nesse caso:

   ```bash
   npm stage list @gblelis/dsh-tui    # mostra o id (UUID) da versão em staging
   npm stage approve <id>             # pede o OTP do autenticador
   ```

   `npm stage list` não pede 2FA; `approve` pede. Para desligar o requisito, use *Settings → Publishing
   access* no pacote — e aí o release volta a ser automático.

## Trusted Publishing (próximo passo recomendado)

Com o pacote já existente, dá para publicar sem token nenhum:

Configurado em 24/11/2026: npm → `@gblelis/dsh-tui` → *Settings* → *Trusted Publishing* → GitHub
Actions, repositório `gblelis/dsh-tui`, workflow `release.yml`, *environment* vazio, com apenas
`npm publish` liberado (`npm dist-tag` fica desmarcado, porque o publish já define `latest`).

O secret `NPM_TOKEN` e o token granular foram apagados. O workflow não passa mais `NODE_AUTH_TOKEN` nem
usa `registry-url` no `setup-node` — aquele `.npmrc` interpolava `${NODE_AUTH_TOKEN}` e quebra quando a
variável não existe. A autenticação agora é só o token OIDC do job (`id-token: write`), que o npm troca
por uma credencial de vida curta.

Isso também resolve a depreciação anunciada pelo npm: tokens com bypass de 2FA deixam de publicar
diretamente a partir de janeiro de 2027 (mudanças de conta já foram restringidas em agosto de 2026).

## Descrição do repositório (About)

O campo *About* do GitHub aceita uma linha (~350 caracteres) e até 20 tópicos. Sugestão pronta para colar
(em inglês, porque é o que aparece para quem chega de fora):

```
TUI front end for DeepSeek Harness: the same core, tools and session format, straight in your terminal. No server, no browser.
```

Tópicos sugeridos (minúsculos, separados por espaço no campo *Topics*):

```
deepseek deepseek-harness dsh tui terminal cli cordis ai-agents typescript nodejs
```

Alternativa em português, se o público principal for pt-BR:

```
Interface TUI para o DeepSeek Harness: mesmo core, ferramentas e sessões, direto no terminal. Sem servidor e sem navegador.
```

O `description` do `package.json` publicado continua em inglês (`Terminal front end for DeepSeek Harness (embedded by ...)`),
que é o texto exibido no npm.

## Antes de cada versão

1. Suba a versão em `packages/cli/package.json` (é a versão publicada; o `version` da raiz é do workspace).
2. Atualize `CHANGELOG.md` com a data e o que mudou.
3. Rode os portões (todos precisam passar):

```bash
pnpm install
pnpm check          # typecheck + lint + testes unitários
pnpm compat         # 11 checagens contra o dsh pinado (submodule upstream)
pnpm verify:package # arquivos, hash do bundle e coerência de versões do tarball
pnpm build
pnpm smoke:screen   # boot real + renderização
pnpm smoke:chat     # prompt, stream, tool card, /export, /permissions, /login, retomada
pnpm smoke:install  # npm pack → npm install -g → boot do binário instalado
```

4. Confira que `packages/cli/bundle/manifest.json` tem o hash novo e que `git status` está limpo.

## Publicar

### Pelo GitHub Actions (recomendado)

O workflow `.github/workflows/release.yml` publica em tag `v*`:

```bash
git tag v0.2.2
git push origin v0.2.2
```

Ele roda os portões, exige que a tag case com `packages/cli/package.json`, empacota **uma vez** e roda
`pnpm smoke:install` sobre esse `.tgz`; só então publica exatamente esse arquivo com
`npm publish … --access public --provenance --ignore-scripts` e cria a release com `gh`. Nada recompila
depois dos portões, então o tarball publicado é o mesmo que passou nos smokes. Para o `--provenance` funcionar, a permissão
`id-token: write` já está no workflow e a publicação usa
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers): nenhum secret, nenhum token para
rotacionar. Se um dia for preciso voltar ao token, o caminho é criar um secret `NPM_TOKEN` e repor o
`env: NODE_AUTH_TOKEN` no passo de publish.

Também dá para disparar em "dry run" (Actions → release → Run workflow), que valida tudo sem publicar.

### Manualmente

```bash
cd packages/cli
npm login --scope @gblelis   # só uma vez
npm publish --access public
```

O `prepublishOnly` **não** recompila: ele roda `pnpm verify:package` e falha se o bundle embutido não
bater com a versão do CLI, se o hash do conteúdo não fechar ou se houver arquivo em `bundle/` fora do
manifesto. Rode `pnpm build` antes de publicar à mão — o que se publica é o que foi verificado, não um
rebuild silencioso do momento do publish.

## Depois de publicar

```bash
npm view @gblelis/dsh-tui version dist.tarball
npm install -g @gblelis/dsh-tui@latest
dsh-tui doctor
```

- Crie a release no GitHub (o workflow `release` já anexa o `.tgz` e as notas).
- Confirme que a instalação limpa funciona: `DSH_HOME=$(mktemp -d) dsh-tui install && dsh-tui doctor`.
- Se algo falhar no npm, corrija a versão (não reuse a mesma) — `npm unpublish` só é aceitável nas
  primeiras 72 h e quebra quem já instalou.

## Compatibilidade

A versão do dsh alvo fica em três lugares que precisam concordar:

| Lugar | O que declara |
| --- | --- |
| `packages/cli/package.json` → `dependencies["@deepseek-ai/dsh"]` | runtime instalado pelo npm |
| `packages/bundle/package.json` → `peerDependencies` + `devDependencies` | API contra a qual o bundle compila |
| `scripts/verify-compat.ts` | pin verificado (`PIN`) |

Ao subir o dsh: atualize os três, rode `pnpm install`, `pnpm compat` e os smokes, e registre a decisão em
`CHANGELOG.md`.
