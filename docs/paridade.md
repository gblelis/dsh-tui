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
| MCP servers | 🚧 | ✅ | ✅ |

## Camada de terminal (o que o CLI adiciona)

| Recurso | Estado |
| --- | --- |
| Transcript com markdown, syntax highlight e diffs | ✅ |
| Cards de ferramenta colapsáveis (`Ctrl+O`) | ✅ |
| Raciocínio do modelo (`Ctrl+R`) | ✅ |
| Timing por fase (espera do modelo, thinking, resposta, tools) | ✅ |
| Tokens e cache hit rate no rodapé | ✅ |
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
| `/permissions` interativo | 🚧 (por flag `--permission-mode`) |
| `/login` / OAuth no terminal | 🚧 (use env/`.env`/Desktop) |

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

- **`/export` será local**: o comando `session-log-export` do core depende do `Connection` do Web; o CLI
  grava markdown/JSON da sessão direto no disco (roadmap).
- **`/permissions`**: o preset é aplicado no início via `--permission-mode`; a troca no meio da sessão
  usará `ctx.permissionPresets.set` com um seletor (roadmap). Hoje dá para sair e reabrir com a flag, ou
  deixar o modelo pedir confirmação (fluxo normal de permissões do core).
- **Credenciais**: o fluxo OAuth do Desktop não é reproduzido; o CLI lê a mesma credencial salva pelo
  Desktop (`$DSH_HOME/.credentials.yaml`) e aceita `DEEPSEEK_API_KEY`/`.env`. Quem nunca configurou o
  Desktop usa a variável de ambiente — é o mesmo contrato do modo headless do DSH.
- **MCP**: o core já tem cliente/gerenciador; falta apenas ligar a linha no profile. Enquanto isso, MCP
  configurado nas outras superfícies não aparece no terminal (roadmap; ver `docs/plugins.md`).

## O que nunca vai divergir

1. **Ferramentas e permissões**: o CLI não reimplementa nem relaxa política de ferramenta.
2. **Formato de sessão**: tudo é V4 gravado pelo core.
3. **Prompt de sistema base**: vem do `dsh-base`; a TUI acrescenta apenas a seção de referência de arquivos
   quando a ferramenta `read` existe.
4. **Modelo de compactação e limite de contexto**: do core.
