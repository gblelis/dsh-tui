# Plugins e extensão do profile

O `dsh-tui` é uma **camada de patch** sobre o `@deepseek-ai/dsh-base`, como qualquer app do DSH. Isso
significa que a configuração do terminal é editável no mesmo lugar em que você configuraria qualquer outro
profile do DSH: `$DSH_HOME/profiles/tui/cordis.patch.yml`.

## Como a camada funciona

Os patches são aplicados nesta ordem:

```
1. @deepseek-ai/dsh-base          (o core: agentes, ferramentas, LLM, sessão…)
2. @gblelis/dsh-tui-bundle        (esta camada: startup, prompt, tui + 3 linhas)
3. $DSH_HOME/profiles/tui/cordis.patch.yml   (a SUA camada — última palavra)
```

Cada arquivo é um **array YAML de operações**:

| Operação | Forma | Efeito |
| --- | --- | --- |
| ajustar config | `- id: tui` + `config: {...}` | mescla sobre a config atual da linha |
| desligar | `- id: hmr` + `disabled: true` | remove a linha da árvore |
| inserir | `- id: include-x` + `insert: [...]` | insere plugins novos depois daquela linha |

Expressões `!!js` são avaliadas pelo loader (é assim que as flags viram config da TUI).

## Exemplos úteis

### Trocar o título e o prefixo do prompt

```yaml
- id: tui
  config:
    title: 'dsh'
    theme:
      leftPrompt: '${model} ▸ '
      color: true
```

### Desligar a TUI (e ainda assim ter um CLI utilizável)

```yaml
- id: tui
  disabled: true
```

Sem a linha `tui`, a guarda do `tui-startup` detecta a ausência do serviço `ctx.tui` e sai com erro claro.
Para rodar o profile sem interface, use `dsh --profile tui`… o que também cai na guarda. Este profile é,
por definição, o profile da TUI.

### Adicionar uma ferramenta que o core já empacota

```yaml
- id: tool-agent-loop
  insert:
    - id: my-tool
      name: '@deepseek-ai/dsh-tool-todo'   # exemplo: plugin já presente na instalação
```

Regra: o `name` precisa resolver a partir da **instalação do dsh** (é o que o loader injeta na resolução do
profile), não de uma cópia em `$DSH_HOME`. O `pnpm compat` verifica exatamente isso para as linhas
embutidas.

### Instalar um plugin de terceiros no profile

Plugins fora da instalação precisam existir em `profiles/tui/node_modules`:

```bash
cd "$DSH_HOME/profiles/tui"
pnpm add @acme/dsh-plugin-foo        # o pnpm-workspace.yaml já está preparado
```

Depois adicione a linha no seu `cordis.patch.yml`. O bundle da TUI nunca é copiado por cima dos seus
plugins; o launcher só substitui `node_modules/@gblelis/dsh-tui-bundle`.

### Ajustar a persona do modelo

```yaml
- id: system-prompt
  config:
    personaPrefix: >-
      You are a coding agent powered by the {{model}} model. Respond in Portuguese.
```

### Habilitar MCP (quando a linha existir)

O gerenciador de MCP ainda não é ligado por padrão neste release (ver `docs/paridade.md`). Quando estiver,
será uma linha única apontando para `@deepseek-ai/dsh-mcp-manager`, e os servidores continuarão vindo das
configurações do DSH — nada específico do terminal.

## O que o bundle cuida sozinho

| Linha | Função |
| --- | --- |
| `system-prompt.personaPrefix` | identidade do agente igual à do produto Web/Desktop |
| `session-query-sqlite` | índice em memória (`:memory:`, aberto na primeira busca) para `/resume`, títulos e busca de sessões |
| `hmr` | desligado: o terminal não recarrega módulos em uso |
| `tool-ask-user` | ferramenta `ask_user_question` para o diálogo de perguntas |
| `session-reference` | referências `@sessão` no prompt |
| `tmux-context` | contexto de multiplexador para o modelo (no-op fora de tmux/screen) |

Essas linhas existem porque o `dsh-base` é compartilhado com o Web/Desktop; elas são as únicas adições
funcionais que o terminal precisa.

## Não faça

- **Não adicione `@deepseek-ai/*` em `dependencies` do bundle.** O `pnpm compat` falha e o profile teria
  duas cópias do core (cordis duplicado = eventos não chegam).
- **Não copie `packages/bundle/src` para dentro do dsh.** O caminho de evolução é o patch/bundle, não um
  fork.
- **Não edite `profiles/tui/node_modules/@gblelis/dsh-tui-bundle`** — o hash em `.dsh-tui/stamp.json` faz o
  launcher recopiar no próximo boot. Use a camada do usuário.

## Depurando a composição

```bash
# árvore final de plugins, exatamente como o dsh vai montar
node <dsh>/lib/bin.js --profile tui --dump-config

# o que o profile tem e se o runtime combina
dsh-tui doctor
dsh-tui runtime --json
```

Se uma linha falhar ao carregar, o dsh lista o erro e mantém o resto do app; a guarda da TUI garante que
você veja uma mensagem e um exit code em vez de uma tela vazia.
