# Publicação

Este é o roteiro de release do `@gblelis/dsh-tui`. O pacote publicado é **um só**: launcher + bundle
embutido. O bundle (`packages/bundle`) é privado do workspace e viaja como artefato dentro de
`packages/cli/bundle/`.

## Antes de cada versão

1. Suba a versão em `packages/cli/package.json` (é a versão publicada; o `version` da raiz é do workspace).
2. Atualize `CHANGELOG.md` com a data e o que mudou.
3. Rode os portões (todos precisam passar):

```bash
pnpm install
pnpm check          # typecheck + lint + testes unitários
pnpm compat         # 11 checagens contra o dsh pinado (submodule upstream)
pnpm verify:package # lista de arquivos do tarball
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
git tag v0.1.0
git push origin v0.1.0
```

Ele roda os portões, exige que a tag case com `packages/cli/package.json`, roda `pnpm smoke:install` e só
então executa `npm publish --access public --provenance`. Para o `--provenance` funcionar, a permissão
`id-token: write` já está no workflow e o repositório precisa do secret **`NPM_TOKEN`** (token de
automação com permissão de publish no escopo `@gblelis`). Alternativa mais forte: configurar
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers) no npm e remover o token.

Também dá para disparar em "dry run" (Actions → release → Run workflow), que valida tudo sem publicar.

### Manualmente

```bash
cd packages/cli
npm login --scope @gblelis   # só uma vez
npm publish --access public
```

O `prepublishOnly` roda o build do workspace, então o `lib/` e o `bundle/` do tarball são sempre os
recem-compilados.

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
