# Paridade: CLI x Desktop x Web

O `dsh-tui` usa o **mesmo core** (`@deepseek-ai/dsh-base`) que as superfícies oficiais. A diferença está
na camada de apresentação e em alguns recursos que só fazem sentido com navegador/servidor.

Legenda: ✅ completo · 🟡 parcial (explicado abaixo) · ⛔ não se aplica ao terminal · 🚧 roadmap do CLI.

## Núcleo (vem do DSH, idêntico nas três)

| Recurso | CLI | Desktop | Web |
| --- | --- | --- | --- |
| Agentes, turnos, streaming | ✅ | ✅ | ✅ |
| Ferramentas (read/write/edit/bash/grep/glob/todo/task/skill/web) | ✅ | ✅ | ✅ |
| Permissões e presets | ✅ | ✅ | ✅ |
| Compactação automática | ✅ | ✅ | ✅ |
| Providers/modelos/credenciais | ✅ | ✅ | ✅ |
| Sessões V4, títulos, histórico | ✅ | ✅ | ✅ |
| Skills e `/skill:` | ✅ | ✅ | ✅ |
| Subagentes (`task`) | ✅ | ✅ | ✅ |
| `ask_user_question` | ✅ | ✅ | ✅ |
| Referências `@sessão` | ✅ | ✅ | ✅ |
| MCP servers (`dsh-mcp-client` na camada do usuário) | ✅ | ✅ | ✅ |
| Contexto de data/hora (`time-context`) | ✅ | ✅ | ✅ |
| Tarefas agendadas (`schedule_*`) | ✅ | ✅ | ✅ |
| Escolha de modelo por subagente (`list_subagent_models`) | ✅ | ✅ | ✅ |
| Skill embutida `dsh-doc` | ✅ | ✅ | ✅ |

## Camada de terminal (o que o CLI adiciona)

| Recurso | Estado |
| --- | --- |
| Transcript com markdown, syntax highlight e diffs | ✅ |
| Cards de ferramenta colapsáveis (`Ctrl+O`) | ✅ |
| Raciocínio do modelo (`Ctrl+R`) | ✅ |
| Timing por fase (espera do modelo, thinking, resposta, tools) | ✅ |
| Tokens e cache hit rate no rodapé | ✅ |
| Tela inicial: painel de boas-vindas com modelo, diretório, preset e atalhos | ✅ (reskin; overlay original não portado) |
| Providers adicionais via `llm-pi-ai` (OpenRouter, OpenAI, LiteLLM, Ollama/vLLM…) | ✅ (adapter do core; config na camada do usuário) |
| Editor multilinha com histórico, `Tab` e autocomplete de arquivos | ✅ |
| Autocomplete de comandos e de referências de sessão | ✅ |
| Diálogos de pergunta (`ask_user_question`) | ✅ |
| `/model` interativo (lista de providers/modelos) | ✅ |
| `/resume` com lista do workspace | ✅ (lista + `--resume <id>`) |
| `/status` (prompt de sistema, ferramentas, sessão) | ✅ |
| `/palette` (auditoria de cores) | ✅ |
| `/reload` (hot reload experimental) | ✅ |
| Tema claro/escuro, truecolor por `COLORTERM` | ✅ |
| Painel de todos, overlay de diffs | ✅ |
| Exportar conversa (`/export [caminho]`, Markdown) | ✅ |
| `/permissions` interativo (seletor + argumento) | ✅ (também na flag `--permission-mode`) |
| `/login` (chave via credentials service) | ✅ (OAuth segue no Desktop) |
| Servidores MCP (`dsh-mcp-client` na camada do usuário) | ✅ documentado em `plugins.md` |

## Itens só de Desktop/Web (por design)

| Recurso | Por que não no CLI |
| --- | --- |
| Janela, abas, atalhos do SO | não há janela |
| Preview/render de HTML, imagens embutidas | terminal não renderiza HTML; anexos de imagem são suportados pelo core, mas visualização é textual |
| Servidor/host remoto, WebSocket | o CLI é local por definição |
| Composer com drag&drop, seleção multi-arquivo visual | o editor aceita caminhos e `@arquivo`, não arrasto |
| Painel de configurações/preferências | flags + `cordis.patch.yml` + `$DSH_HOME` |
| Histórico sincronizado por dispositivo | depende do serviço de conta |

## Decisões de paridade já tomadas

- **`/export` é local**: o comando `session-log-export` do core depende do `Connection` do Web; o CLI grava
  Markdown da sessão direto no disco (`/export [caminho]`), sem passar por servidor.
- **`/permissions`**: o preset é aplicado no início via `--permission-mode` e trocado a qualquer momento com
  `/permissions` (seletor ou `/permissions <preset>`), usando `ctx.permissionPresets.set` — o mesmo caminho
  durável do Web/Desktop.
- **Credenciais**: o fluxo OAuth do Desktop não é reproduzido; o CLI lê a mesma credencial salva pelo
  Desktop (`$DSH_HOME/.credentials.yaml`) e aceita `DEEPSEEK_API_KEY`/`.env`. Quem nunca configurou o
  Desktop usa a variável de ambiente — é o mesmo contrato do modo headless do DSH. `/login` grava a chave
  nesse mesmo store, num prompt mascarado.
- **MCP**: o terminal usa o `@deepseek-ai/dsh-mcp-client`, o mesmo cliente do ACP, configurado na camada do
  usuário (stdio ou Streamable HTTP). Nenhum servidor vem ligado por padrão e um servidor fora do ar não
  impede o boot; as ferramentas aparecem como `mcp__<server>__<tool>` (ver `docs/plugins.md`).

## Lacunas conhecidas (recursos do Web/Desktop ainda fora do CLI)

Auditado em 2026-11 contra `dsh 0.2.2-rc.5` comparando a composição do profile Web com a do CLI.

| Recurso | Por que falta | Situação |
| --- | --- | --- |
| Presets de agente (`standard`/`minimal`/`ptc`/`cordis`) | o Web/Desktop escolhe o preset por sessão; o CLI monta uma composição fixa (equivalente ao `standard`) | 🚧 |
| Ferramenta `present` (entregáveis) + instruções de entrega | o Web renderiza os arquivos apresentados na conversa; o terminal precisaria de uma superfície própria | 🚧 |
| Office kit (`tool-office`, `office-kit`, skill `office`) | depende do kit de renderização/documentos do host Web | ⛔ no terminal por enquanto |
| Plugin market (`tool-plugin-market`) | o próprio preset `standard` do Web o deixa desligado; só o preset `cordis` o habilita | ⛔ |
| Workspace registry (`workspace`, `workspace-files`, `load_workspace_dependencies`) | o Web gerencia workspaces e payloads Python/Node/pnpm; o CLI usa cwd + `working_directory` | ⛔ no terminal |
| UI de configurações, MCP manager e plugin manager | no CLI são flags, `/comandos` e `cordis.patch.yml` (os mesmos serviços por baixo) | ⛔ UI |
| Telemetria/produto, feedback de mensagem, quotes, stats/outline, export ZIP, open-in-app, upload, locale/tema/atalhos | específicos de navegador/app | ⛔ |

Todas as demais linhas do profile Web (servidores HTTP/API, plugins `client-ui-*`, transporte) não têm
equivalente no terminal por definição — o CLI conduz os mesmos serviços em processo.

## O que nunca vai divergir

1. **Ferramentas e permissões**: o CLI não reimplementa nem relaxa política de ferramenta.
2. **Formato de sessão**: tudo é V4 gravado pelo core.
3. **Prompt de sistema base**: vem do `dsh-base`; a TUI acrescenta apenas a seção de referência de arquivos
   quando a ferramenta `read` existe.
4. **Modelo de compactação e limite de contexto**: do core.
