# Teclas e interação

Todos os atalhos dependem do terminal suportar os códigos correspondentes. Em terminais limitados
(`TERM=linux`, consoles sem truecolor), a interface degrada para 16 cores e os atalhos com modificador
podem não chegar — use os comandos equivalentes.

## Globais

| Tecla | Ação |
| --- | --- |
| `Ctrl+C` | turno ativo: cancela · editor com texto: limpa · ocioso e vazio: pede confirmação para sair |
| `Ctrl+D` | sai quando ocioso (com turno ativo, avisa) |
| `Esc` | fecha diálogo/overlay; sem diálogo, cancela o turno ativo |
| `Ctrl+O` | alterna a visibilidade dos cards de ferramenta (`hidden`/`collapsed`/`expanded`) |
| `Ctrl+R` | alterna a exibição do raciocínio do modelo |
| `Ctrl+L` | invalida o cache de renderização e redesenha a tela |

## Editor

| Tecla | Ação |
| --- | --- |
| `Enter` | envia o prompt |
| `Shift+Enter` / `Alt+Enter` | nova linha sem enviar (quando o terminal entrega o modificador) |
| `↑` / `↓` | percorre o histórico de prompts |
| `Tab` | aceita a sugestão de autocomplete |
| `↑` / `↓` (com menu aberto) | navega nas sugestões |
| `Esc` (com menu aberto) | fecha as sugestões |

A edição de linha em si (cursor, seleção, apagar palavra, home/end) vem do editor do `pi-tui`: os atalhos
usuais de terminal do seu shell funcionam (`Ctrl+A`, `Ctrl+E`, `Ctrl+W`, `Ctrl+U`, `Alt+←`/`Alt+→` quando o
terminal envia esses códigos) — eles não passam pelo `dsh-tui`, então não há atalho próprio para isso.

Autocomplete reconhece:

- **comandos** (`/` no começo da linha) — do CLI e do core;
- **arquivos e diretórios** — `@caminho`, `./`, `../`, `~/`, ou caminho absoluto; diretórios são marcados
  com `/`;
- **referências de sessão** — `@` seguido de título/id de sessões do mesmo workspace;
- **skills** — `/skill:`.

## Turno em andamento

| Tecla / ação | Comportamento |
| --- | --- |
| `Enter` com turno ativo | injeta a mensagem no passo seguinte (steering), sem cancelar |
| `Esc` | cancela com motivo `user` |
| `Ctrl+C` | cancela o turno |
| fila | mensagens aguardando aparecem como `N queued` no rodapé |

O cancelamento é cooperativo: ferramentas em execução são interrompidas pelo core; o transcript mostra o
motivo (`aborted`, `interrupted`, `error`, `max-tokens`).

## Diálogos

| Diálogo | Teclas |
| --- | --- |
| Pergunta (`ask_user_question`) com opções | `↑`/`↓`, `Enter` seleciona, `Esc` recusa (a recusa vira erro `UserQuestionError` para o modelo) |
| Pergunta de texto livre | digite, `Enter` envia |
| Seletor de modelo (`/model`) | `↑`/`↓`, `Enter` confirma, `Esc` volta, digite para filtrar |
| Lista de sessões (`/resume`) | `↑`/`↓`, `Enter` reabre (reexecuta com `--resume <id>`), `Esc` fecha |
| Presets de permissão (`/permissions`) | `↑`/`↓`, `Enter` aplica na hora, `Esc` fecha; `/permissions <preset>` troca direto |
| Ajuda (`/help`) | `Esc` fecha |
| Paleta (`/palette`) | `Esc` fecha |

## Rodapé

O rodapé mostra:

```
~/projeto (main) · deepseek-official/deepseek-v4-pro · high · 32% · 1.2k tok
```

- caminho relativo ao home e branch git (quando dentro de um repositório);
- modelo e esforço de raciocínio da sessão;
- uso do contexto (`%`) e tokens acumulados, com cache hit rate quando houver;
- durante o turno: fase atual e tempo (`model wait 0.8s · response 2.1s`), e `N queued` quando há
  mensagens injetadas aguardando o próximo passo.

## Cores

- Truecolor é detectado por `COLORTERM` (`truecolor`/`24bit`). Sem ele, 256 cores; com `NO_COLOR` ou
  `TERM=dumb`, texto puro.
- O tema claro/escuro acompanha o terminal quando ele reporta (OSC 11); pode ser forçado no
  `cordis.patch.yml`:

```yaml
- id: tui
  config:
    theme:
      color: true
      truecolor: true
      # leftPrompt: '${model} · '
```

- `/palette` mostra o papel de cada cor/atributo que a interface usa, para conferir contraste no seu
  terminal.

## Acessibilidade

- Toda informação transmitida por cor também aparece como texto (ícones, rótulos, nomes de fase).
- A largura é respeitada; linhas longas quebram em vez de cortar (exceto caminhos em tabelas, truncados
  com reticências).
- O transcript não usa animações quando `TERM` indica terminal burro ou quando a saída não é TTY.
