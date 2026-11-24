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
| ajustar config | `- id: tui` + `config: {...}` | **substitui** a config da linha (merge raso: repita as chaves que devem permanecer) |
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

## O que o bundle cuida sozinho

| Linha | Função |
| --- | --- |
| `system-prompt.personaPrefix` | identidade do agente igual à do produto Web/Desktop |
| `session-query-sqlite` | índice em memória (`:memory:`, aberto na primeira busca) para `/resume`, títulos e busca de sessões |
| `hmr` | desligado: o terminal não recarrega módulos em uso |
| `tool-ask-user` | ferramenta `ask_user_question` para o diálogo de perguntas |
| `session-reference` | referências `@sessão` no prompt |
| `tmux-context` | contexto de multiplexador para o modelo (no-op fora de tmux/screen) |
| `time-context` | data/hora atual (com fuso) no contexto do modelo — o Web monta no preset |
| `schedule` + `tool-schedule` | tarefas agendadas (`schedule_*`); entregam enquanto a TUI estiver rodando |
| `tool-subagent.modelSelection`/`modelDiscovery` | escolha de modelo e `list_subagent_models` por subagente |
| `subagent-model-selection-settings` | preferência de modelo dos subagentes lida na criação do agente |
| `skill-filesystem.customSkillDirs` | diretório de skills do `dsh-agent-preset` (habilita `/skill:dsh-doc`) |

Essas linhas existem porque o `dsh-base` é compartilhado com o Web/Desktop; elas são as únicas adições
funcionais que o terminal precisa.

## Providers de modelo

O DSH já monta o adaptador multi-provider `@deepseek-ai/dsh-llm-pi-ai` em modo dormente: nenhuma rota
existe até você declarar `providers` na sua camada. É assim que se adiciona OpenRouter, OpenAI, Anthropic,
LiteLLM, um gateway OpenAI-compatible, Ollama ou vLLM ao terminal — a credencial continua em
`apiKeyEnv` (resolvida pelo `.credentials.yaml`/ambiente) e os modelos aparecem em `/model`.

```yaml
- id: llm-pi-ai
  config:
    providers:
      litellm:
        displayName: LiteLLM
        apiKeyEnv: LITELLM_API_KEY
        api: openai-completions
        baseURL: http://127.0.0.1:4000/v1
        models:
          - id: deepseek-v41-flash
            contextWindow: 400000
```

Receitas completas (catálogo pi-ai, endpoints próprios, cópia do provider configurado no Web e solução de
problemas): [providers.md](providers.md).

## Servidores MCP

O `dsh-base` traz a descoberta/leitura de recursos MCP (`mcp-resources`), mas **nenhum servidor MCP vem
ligado por padrão**. Para usar as ferramentas de um servidor no terminal, insira a linha do cliente na sua
camada — é exatamente o mesmo plugin (`@deepseek-ai/dsh-mcp-client`) que o ACP usa:

```yaml
# $DSH_HOME/profiles/tui/cordis.patch.yml
- insert:
    # Servidor local via stdio (npx baixa o pacote na primeira execução).
    - id: mcp-github
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: github
        transport: stdio
        command: npx
        args: ['-y', '@modelcontextprotocol/server-github']
        env:
          GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN

    # Servidor remoto (Streamable HTTP).
    - id: mcp-web
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: web
        transport: streamable-http
        url: http://localhost:3000/mcp
        headers:
          Authorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'
```

As ferramentas aparecem para o modelo como `mcp__<serverName>__<tool>` e em `/status`. O entry é opcional no
boot: se o servidor não conectar, a TUI sobe e o servidor fica sem ferramentas (os erros vão para o log).
Como o `hmr` está desligado, reinicie a TUI depois de editar a camada.

## Não faça

- **Não adicione `@deepseek-ai/*` em `dependencies` do bundle.** O `pnpm compat` falha e o profile teria
  duas cópias do core (cordis duplicado = eventos não chegam).
- **Não copie `packages/bundle/src` para dentro do dsh.** O caminho de evolução é o patch/bundle, não um
  fork.
- **Não edite `profiles/tui/node_modules/@gblelis/dsh-tui-bundle`** — o launcher re-hasheia a cópia a cada
  boot e recopia quando diverge (ou rode `dsh-tui sync` para forçar). Use a camada do usuário.

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
