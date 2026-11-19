# Providers de modelo

O `dsh-tui` não fixa a DeepSeek como único provider: quem decide quais rotas existem é a **camada de
patch do profile `tui`**. O DSH já monta o adaptador multi-provider
[`@deepseek-ai/dsh-llm-pi-ai`](https://www.npmjs.com/package/@deepseek-ai/dsh-llm-pi-ai) em modo dormente;
basta declarar rotas no arquivo:

```
$DSH_HOME/profiles/tui/cordis.patch.yml
```

As rotas aparecem em `/model` e podem ser escolhidas por sessão, ou passadas na linha de comando:

```bash
dsh-tui --model '<provider>/<model>'
dsh-tui --new --model 'litellm/deepseek-v41-flash(max)'
```

O arquivo é **seu**: o `dsh-tui install`/`sync` nunca sobrescreve `cordis.patch.yml`, só o bundle em
`node_modules`. Reinicie a TUI depois de editá-lo (ou use `/reload`, que recarrega a configuração do
profile sem perder a sessão).

---

## Receita rápida: copiar o provider do profile Web

Se você já configurou o provider no Desktop/Web (página **Models**), o DSH gravou a configuração no
profile `web`. O mesmo bloco funciona no `tui`, porque credenciais em `$DSH_HOME/.credentials.yaml` são
compartilhadas.

1. Abra os dois arquivos:

   ```bash
   ${EDITOR:-nano} ~/.dsh/profiles/web/cordis.patch.yml
   ${EDITOR:-nano} ~/.dsh/profiles/tui/cordis.patch.yml
   ```

2. Copie a entrada `- id: llm-pi-ai` inteira (com `name` e `config.providers`) para o patch do `tui`.
3. Opcional: copie também `- id: agent-default-model` se quiser que o CLI já abra nesse provider.
4. Rode `dsh-tui --new` e confira em `/model`.

Exemplo (LiteLLM, o mesmo formato que a página Models grava):

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      litellm:
        displayName: LiteLLM SIA
        apiKeyEnv: LITELLM_API_KEY
        api: openai-completions
        baseURL: http://172.16.31.229:4000/v1
        models:
          - id: deepseek-v41-flash(max)
            name: Deepseek v4.1 Flash
            maxTokens: 100000
            contextWindow: 400000
            input: [text, image]
            reasoningEfforts:
              off: null
              low: low
              medium: medium
              high: high
              xhigh: xhigh
              max: max
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: litellm
    model: deepseek-v41-flash(max)
    reasoningEffort: max
```

> As alterações que a página Models faz valem só para o profile `web`. Para manter os dois iguais, copie
> o bloco de novo depois de mudar providers no Web (ou mantenha um script próprio de sincronização).

---

## Providers do catálogo pi-ai (OpenRouter, OpenAI, Anthropic, Groq, Google…)

Para um provider que o pi-ai já conhece, **não** é preciso declarar `api`, `baseURL` nem `models`: o
catálogo instalado fornece endpoint e modelos. Basta nomear a rota e a variável de credencial.

```yaml
- id: llm-pi-ai
  config:
    providers:
      openrouter:
        apiKeyEnv: OPENROUTER_API_KEY
      anthropic:
        apiKeyEnv: ANTHROPIC_API_KEY
```

O catálogo instalado no `dsh 0.2.2-rc.5` inclui, entre outros: `anthropic`, `openai`, `openrouter`,
`google`, `google-vertex`, `groq`, `mistral`, `cerebras`, `deepseek`, `xai`, `zai`, `moonshotai`,
`fireworks`, `together`, `huggingface`, `nvidia`, `vercel-ai-gateway`, `amazon-bedrock`, `azure`,
`cloudflare-ai-gateway`, `cloudflare-workers-ai`, `opencode`, `kimi-coding`, `minimax`, `xiaomi` e as
variantes regionais/assinatura (`openai-codex`, `github-copilot`, `qwen-token-plan*`, `moonshotai-cn`,
`minimax-cn`, `zai-coding-cn`). O modo mais confiável de ver o catálogo atual é abrir `/model` depois de
declarar a rota.

```bash
export OPENROUTER_API_KEY=sk-or-...
dsh-tui --model 'openrouter/anthropic/claude-sonnet-4.5'
# ou escolha pelo picker:
dsh-tui --new        # dentro da TUI: /model
```

O primeiro segmento de `--model` é a **rota** (`openrouter`), o restante é o id do modelo no catálogo.

---

## Endpoints próprios (Ollama, vLLM, LM Studio, gateway OpenAI-compatible)

Para um endpoint que o catálogo não descreve, declare `api`, `baseURL` e a lista de modelos:

```yaml
- id: llm-pi-ai
  config:
    providers:
      local:
        displayName: vLLM local
        api: openai-completions
        baseURL: http://127.0.0.1:8000/v1
        apiKeyEnv: LOCAL_API_KEY
        models:
          - id: Qwen3-32B
            name: Qwen3 32B
            contextWindow: 131072
            maxTokens: 16384
```

- `api`: um de `openai-completions`, `openai-responses`, `anthropic-messages`,
  `google-generative-ai`. (Azure entra como rota de catálogo `azure`, não como `api` custom.)
- `models`: substitui o catálogo da rota. Cada item aceita `id`, `name`, `contextWindow`, `maxTokens`,
  `input` (`[text, image]`) e `reasoningEfforts` (`false` para modelo sem raciocínio; mapa
  `nível: valor-no-wire` para renomear esforços).
- `compat`: ajustes de protocolo para endpoints não reconhecidos — por exemplo
  `thinkingFormat: deepseek` ao falar com gateways DeepSeek-like.
- `defaultContextWindow`/`defaultMaxTokens`: fallback para modelos sem capacidade declarada.

Exemplos comuns:

```yaml
# Ollama (API OpenAI-compatible em /v1) — a chave pode ser qualquer valor
      ollama:
        api: openai-completions
        baseURL: http://127.0.0.1:11434/v1
        apiKeyEnv: OLLAMA_API_KEY
        models:
          - id: qwen3:32b
            contextWindow: 131072
```

```yaml
# LM Studio
      lmstudio:
        api: openai-completions
        baseURL: http://127.0.0.1:1234/v1
        apiKeyEnv: LMSTUDIO_API_KEY
        models:
          - id: qwen/qwen3-32b
```

```yaml
# Gateway que emula a API Anthropic
      anthropic-gateway:
        api: anthropic-messages
        baseURL: https://gateway.example.com
        apiKeyEnv: GATEWAY_API_KEY
        models:
          - id: claude-sonnet-4-5
            contextWindow: 200000
```

Depois:

```bash
LOCAL_API_KEY=dummy dsh-tui --model 'local/Qwen3-32B'
```

---

## Credenciais

`apiKeyEnv` é uma **referência**, resolvida a cada request pela camada de credenciais do DSH — o valor
nunca entra no YAML. A precedência é:

1. `$DSH_HOME/.credentials.yaml` (arquivo gerenciado, mesmo do Desktop/Web);
2. variável de ambiente do processo;
3. `.env` do projeto atual;
4. `.env` do home.

Então qualquer uma destas formas funciona:

```bash
export OPENROUTER_API_KEY=sk-or-...         # sessão atual
echo 'OPENROUTER_API_KEY=sk-or-...' >> ~/.env
```

ou grave no arquivo gerenciado (formato `refs:`), como o `/login` faz para `DEEPSEEK_API_KEY`. Em caso de
dúvida, `dsh-tui doctor` mostra de onde a credencial da DeepSeek veio; para as rotas pi-ai, um erro
`MISSING_CREDENTIAL` no transcript indica referência não resolvida.

---

## Rota DeepSeek alternativa (`llm-deepseek`)

Se o seu endpoint fala o **protocolo DeepSeek Messages** (a API oficial por trás de um proxy, por
exemplo), nem é preciso o pi-ai: o adapter `llm-deepseek` já está montado e aceita `baseURL`:

```yaml
- id: llm-deepseek
  config:
    baseURL: https://meu-proxy.example.com/v1
```

Isso troca o endpoint da rota `deepseek-official`; modelos e credencial (`DEEPSEEK_API_KEY`) continuam os
mesmos. Para gateways OpenAI-compatible, prefira o `llm-pi-ai` das seções anteriores.

---

## Como saber se funcionou

- `/model` lista a rota com o `displayName` e os modelos declarados;
- o rodapé passa a mostrar o modelo escolhido;
- `/status` mostra o provider/modelo ativo da sessão;
- uma mensagem de teste deve responder sem `UNKNOWN_MODEL`, `MISSING_CREDENTIAL` ou `NO_ADAPTER`.

Se a rota não aparecer:

1. confira a indentação do YAML (o patch é um array no topo do arquivo);
2. confirme que o bloco tem `- id: llm-pi-ai` (uma única vez) e que `providers` está abaixo de `config:`;
3. reinicie a TUI (`/reload` recarrega plugins, mas um erro de schema precisa de correção no arquivo);
4. rode com `DSH_TELEMETRY_DISABLED=1` e olhe o stderr: erros de validação do plugin aparecem ali.

> **Merge de configuração:** um patch por `id` **substitui** o `config` daquela linha, não faz merge
> profundo. Por isso o bloco `llm-pi-ai` deve conter **todas** as rotas que você quer manter; ao adicionar
> uma rota, copie as demais junto.
