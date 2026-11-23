# Security policy

## Reporting a vulnerability

Do **not** open a public issue with exploitable details. Use GitHub's private reporting:

**Security → Report a vulnerability** in <https://github.com/gblelis/dsh-tui/security/advisories/new>.

Include the `dsh-tui` version (`dsh-tui version`), the `dsh` version (`dsh-tui doctor`), your OS and Node
version, and the steps to reproduce. I aim to answer within seven days; a fix ships as a patch release and
the advisory is published once users can upgrade.

## Scope

In scope: the launcher (`packages/cli`), the terminal bundle (`packages/bundle`), the release/packaging
chain and anything that lets untrusted content (model output, session logs, tool results) break out of the
transcript into the terminal, the filesystem or the profile.

Out of scope: vulnerabilities inside `@deepseek-ai/dsh` and its dependencies (report them upstream —
`docs/seguranca.md` tracks the ones this project inherits and why they are not reachable from the `tui`
profile), and anything that requires the attacker to already run code as your user.

The threat model, the hardening done in each release and the reachability analysis of the transitive
advisories are in [docs/seguranca.md](docs/seguranca.md).

---

# Política de segurança (pt-BR)

Não abra issue pública com detalhes exploráveis: use **Security → Report a vulnerability** no GitHub.
Inclua a versão do `dsh-tui`, a do `dsh` (`dsh-tui doctor`), sistema, Node e passos de reprodução.

O escopo é o launcher, o bundle de terminal, a cadeia de release e qualquer coisa que permita a conteúdo
não confiável (saída do modelo, logs de sessão, resultados de ferramentas) escapar do transcript para o
terminal, o sistema de arquivos ou o profile. Vulnerabilidades dentro do `@deepseek-ai/dsh` e de suas
dependências são do upstream; o modelo de ameaça e a análise de alcance estão em
[docs/seguranca.md](docs/seguranca.md).
