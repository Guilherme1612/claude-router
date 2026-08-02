# Relatório de Migração Local — `.claude/` → `.cline/` + `.clinerules`

**Data:** 2026-07-31
**Alcance:** Migração local do projeto (`/Users/guilherme/Desktop/ClaudeCode/Router-build`).
**Decisão do utilizador:** A migração **global** (`~/.claude/` → `~/.cline/`) foi **explicitamente descartada** — os hooks/scripts globais do framework gsd/router têm caminhos hardcoded para `~/.claude` e não há garantia de compatibilidade com o Cline. Apenas o `.claude/` do projeto foi migrado.

---

## 1. Regras Estáticas

| Origem | Destino | Estado |
|--------|---------|--------|
| `.claude/CLAUDE.md` | `.clinerules` (raiz do projeto) | ✅ Copiado (idêntico, `diff` vazio) |
| `.claude/CLAUDE.md` | `.cline/CLAUDE.md` | ✅ Copiado (cópia de segurança) |

> Nota: Não existia `CLAUDE.md` na raiz do projeto. O `CLAUDE.md` estava dentro de `.claude/`, e foi mapeado para a convenção de memória/regras do Cline (`.clinerules` na raiz do projeto).

## 2. Migração Estrutural (Local)

| Diretório esperado | Existia em `.claude/`? | Ação |
|--------------------|------------------------|------|
| `skills/` | ✅ Sim | ✅ Copiado → `.cline/skills/` |
| `commands/` | ❌ Não | Registado como ausente — nada a migrar |
| `hooks/` | ❌ Não | Registado como ausente — nada a migrar |
| `agents/` | ❌ Não | Registado como ausente — nada a migrar |
| `route-build/` / `scripts/` | ❌ Não | Registado como ausente — nada a migrar |

**Conteúdo copiado em `.cline/skills/excalidraw-diagram/` (11 ficheiros):**
- `SKILL.md`, `README.md`, `.gitignore`
- `references/color-palette.md`, `references/element-templates.md`, `references/json-schema.md`
- `references/pyproject.toml`, `references/render_excalidraw.py`, `references/render_template.html`

> **Nota sobre segurança:** O `.git` embutido dentro da skill `excalidraw-diagram` foi **excluído da cópia** (metadata interna do repositório da skill). A origem `.claude/` **não foi tocada** — o `.git` original permanece intacto em `.claude/skills/excalidraw-diagram/.git`.

## 3. Varredura de Ficheiros Adicionais

Todos os ficheiros de `.claude/` (11 ficheiros, excluindo `.git` das skills) foram copiados para `.cline/`. Nenhum ficheiro `.env`, `.yml` ou config adicional extra foi encontrado para além de `settings.local.json`.

| Ficheiro | Copiado? |
|----------|----------|
| `.claude/settings.local.json` | ✅ → `.cline/settings.local.json` |
| `.claude/CLAUDE.md` | ✅ → `.clinerules` + `.cline/CLAUDE.md` |
| `.claude/skills/**` | ✅ → `.cline/skills/**` |

**Ficheiros ocultos/ignorados detetados:** apenas `.claude/skills/excalidraw-diagram/.gitignore` (já incluído na cópia, faz parte da skill).

## 4. Relatório de Compatibilidade (`.cline/settings.local.json` e caminhos internos)

Como **não existem `commands/` nem `hooks/` locais**, não há scripts para validar caminhos de execução. A análise centra-se nos ficheiros copiados:

### 4.1 `.cline/settings.local.json` — ⚠️ Referências a skills/MCP da framework global (NÃO migrada)
- As permissões `allow` referem `Skill(gsd-execute-phase)`, `Skill(gsd-verify-work)`, `Skill(gsd-plan-phase)`, `Skill(gsd-autonomous)` e `mcp__plugin_context-mode_context-mode__*`.
- Estas capacidades pertencem à **instalação global `~/.claude`** (gsd + plugin context-mode), que **não foi migrada** por decisão do utilizador.
- **Impacto no Cline CLI:** o Cline não interpreta o formato `permissions` do Claude Code da mesma forma. Recomenda-se **não ativar** este `settings.local.json` no Cline ou ajustar as permissões para itens que existam no ambiente Cline. O ficheiro foi copiado por fidelidade/referência, **não** como configuração funcional ativa.

### 4.2 `SKILL.md` / `references/render_excalidraw.py` — ⚠️ Caminhos relativos `.claude/skills/...`
- O `SKILL.md` (linhas ~454, 506) e `render_excalidraw.py` (linhas 4, 8, 84, 131) instruem comandos como `cd .claude/skills/excalidraw-diagram/references`.
- **Estes caminhos apontam para o layout Claude Code.** No Cline, a pasta é `.cline/skills/excalidraw-diagram/references`.
- **Impacto:** instruções da skill funcionarão em `.claude/` (config original) mas **não** em `.cline/` sem ajuste do caminho `.claude` → `.cline` (ou uso de caminho relativo à skill). Como a skill `excalidraw-diagram` só é executada via `.claude/skills/` na origem, o comportamento original não é afetado.

### 4.3 `.cline/CLAUDE.md` — Documento informativo sobre a framework `~/.claude`
- O conteúdo descreve a framework global `~/.claude` (router, hooks, gsd). É documentação de contexto, não configuração executável. No Cline, o `.clinerules` é injetado como contexto mas as referências a `~/.claude`, `settings.json` e hooks **não têm efeito automático** no Cline.

---

## 5. Verificação de Integridade

| Verificação | Resultado |
|-------------|-----------|
| `diff .claude/CLAUDE.md .clinerules` | ✅ Vazio (idênticos) |
| `diff .claude/CLAUDE.md .cline/CLAUDE.md` | ✅ Vazio (idênticos) |
| `diff .claude/settings.local.json .cline/settings.local.json` | ✅ Vazio (idênticos) |
| `diff -r --exclude=.git .claude/skills .cline/skills` | ✅ Vazio (idênticos) |
| Contagem de ficheiros (`.claude` sem `.git` = 11, `.cline` = 11) | ✅ Correspondência total |
| `.claude/` original | ✅ **Intacto** — nenhuma operação apagou ou modificou ficheiros na origem (todas as operações foram cópias `cp`, a única remoção de `.git` foi na **cópia** `.cline/`) |

## 6. Verificação de Funcionalidade (skills / commands / agents) no Cline CLI

**Método:** Análise de compatibilidade baseada na estrutura real do build instalado (`/Users/guilherme/.hermes/node/lib/node_modules/cline`) + documentação oficial do Cline (Rules / CLI Reference / Skills). Não foi possível iniciar uma sessão CLI viva porque a porta do hub (`127.0.0.1:25463`) está ocupada por uma sessão Cline ativa noutro projeto (`HedgeFund`, PID 80011) — matar esse processo seria destrutivo e não foi feito.

### Layout de configuração do Cline CLI (fonte de verdade: `cline cli-reference` + bundle instalado)

```
CLAUDE Code (.claude/)  →  Cline CLI (.cline/)
skills/<name>/SKILL.md  →  .cline/skills/<name>/SKILL.md   ✅ (confirmado no bundle: type:"skill", discoverFiles)
.clinerules (raiz)      →  .clinerules                       ✅ (confirmado no bundle: includeFile => J===".clinerules")
commands/*.md           →  SEM equivalente em pasta local (comandos pt. via plugin/registados; sem dir commands/)
agents/*.md             →  agentes: subagents internos OU agents.yaml (não é pasta .md)
hooks/*                 →  .cline/hooks/ (não existia para migrar)
```

### Resultados por categoria

| Categoria | Estado da migração | Verificação funcional |
|-----------|--------------------|------------------------|
| **Skills** | ✅ `.cline/skills/excalidraw-diagram/` | ✅ **Estruturalmente válida.** `SKILL.md` com frontmatter `name: excalidraw-diagram` = **exatamente o nome do diretório** (requisito "name must match directory name") e `description` presente. O bundle Cline descobre skills via `SKILL.md` em `.cline/skills/<name>/`. |
| **Commands** | ⚠️ Nada a verificar — não existia `commands/` em `.claude/` | O Cline CLI **não usa uma pasta local `commands/`** da mesma forma que o Claude Code (sem diretório de commands na config do CLI; comandos customizados são plugins/registados). Como não havia commands para migrar, não há risco de ficheiros não detetados. |
| **Agents** | ⚠️ Nada a verificar — não existia `agents/` em `.claude/` | O Cline **não descobre agentes de uma pasta `.md`** local. Agentes são sub-agentes internos ou `agents.yaml` (ver layout acima). Não havendo agentes migrados, não há ficheiros presumivelmente ativos não detetados. |
| **Hooks** | ⚠️ Nada a verificar — não existia `hooks/` em `.claude/` | O Cline suporta hooks em `.cline/hooks/`, mas nenhum foi migrado (não existiam). |
| **Rules (`CLAUDE.md`)** | ✅ `.clinerules` na raiz | ✅ O bundle reconhece `.clinerules` como ficheiro de regra (`includeFile => J===".clinerules"`), complementar a `.cline/rules/`. |

### Notas de execução
1. **Não foi possível uma sessão CLI viva** (porta hub ocupada pela sessão HeapFund). A verificação é **estrutural**, baseada na fonte de verdade do build + docs — suficiente para confirmar que a skill migrada está no local e formato corretos e que o `.clinerules` é reconhecido.
2. Para validação runtime completa, o utilizador pode fechar a sessão Cline ativa (ou usar `CLINE_DATA_DIR` separado) e correr `cline` no diretório deste projeto.

## 7. Migração Global `~/.claude/` → `~/.cline/` (skills / hooks / agents)

> **Decisão do utilizador (turno seguinte):** expandiu o escopo — além da migração local, copiar **do global `~/.claude/` para o global `~/.cline/`** os componentes compatíveis. A migração local (secção 1–6) mantém-se.

### O quê foi copiado (global)

| Origem `~/.claude/…` | Destino `~/.cline/…` | Itens | Verificação |
|----------------------|----------------------|-------|-------------|
| `skills/` | `skills/` | **88** skills (118 ficheiros) | ✅ `diff -r` IDÊNTICOS |
| `hooks/` | `hooks/` | **30** ficheiros | ✅ `diff -r` IDÊNTICOS |
| `agents/` | `agents/` | **34** `.md` | ✅ `diff -r` IDÊNTICOS |
| `commands/` | — | **0** (não existe em `~/.claude/`) | ⚠️ nada a copiar |

- Cópia **não destrutiva** (`cp -Rn`), origem `~/.claude/` **intacta**.
- `~/.cline/` preexistia apenas com `cron/` + `data/`; as três pastas foram criadas novas (sem sobrescrever nenhuma config global existente).

### Validação do layout global (fonte de verdade: `@cline/shared`, ficheiro oficial `storage/paths.d.ts`)

O bundle Cline exporta explicitamente estas constantes oficiais, que **confirmam exatamente os destinos escolhidos**:

- `SKILLS_CONFIG_DIRECTORY_NAME = "skills"` → global `~/.cline/skills/` ✅
- `HOOKS_CONFIG_DIRECTORY_NAME = "hooks"` → global `~/.cline/hooks/` ✅
- `AGENT_CONFIG_DIRECTORY_NAME = "agents"` → global `~/.cline/agents/` ✅
- `AGENTS_RULES_FILE_NAME = "AGENTS.md"` → o ficheiro de regras de agentes é `AGENTS.md` (ver nota)
- `resolveGlobalCronSpecsDir() = ~/.cline/cron/` → **prova** que o data dir global é `~/.cline` (o `cron/` já existia lá)

### Nota de compatibilidade (agents)

Os 34 `agents/*.md` são agentes no formato de sub-agent do Claude Code. O Cline lê regras de agentes de **`AGENTS.md`** (constante oficial) e os agentes reutilizáveis via registo/`agents.yaml` — **não** re-descobre automaticamente uma pasta de `.md` soltos. Por isso:
- A **cópia física** para `~/.cline/agents/` está no local constante-correto (`AGENT_CONFIG_DIRECTORY_NAME`) e é **preservada fielmente**.
- Para os tornar ativos no Cline, o conteúdo dos `.md` precisa de ser **referenciado/estruturado como `AGENTS.md`** ou convertido para o formato de agentes do Cline. Sem isso, são ficheiros inerentes (não causam erro, mas não são invocados sozinhos).

### Nota de compatibilidade (hooks)

Os `~/.claude/hooks/*.js/.mjs` são hooks no formato Claude Code (UserPromptSubmit/Stop, etc.). O Cline tem `HOOKS_CONFIG_DIRECTORY_NAME = "hooks"` → `~/.cline/hooks/` é o local certo para os registar via `settings.json`. Ficam copiados; a ativação depende do mecanismo de binding do Cline (distinto do harness Claude Code).

## Resumo Final

- **Migrado para `.cline/`:** `CLAUDE.md`, `settings.local.json`, `skills/excalidraw-diagram/**`
- **Criado na raiz:** `.clinerules` (regras de memória do Cline, a partir de `.claude/CLAUDE.md`)
- **Não migrado (decisão do utilizador):** configuração global `~/.claude/` (agents, hooks, plugins, router, gsd-core, skills globais, settings.json)
- **Atenções de compatibilidade:** (a) `settings.local.json` refere capacidades globais não migradas — não usar como config ativa no Cline; (b) caminhos `.claude/skills/...` na skill precisariam de renomeação para `.cline/skills/...` se a skill for usada via `.cline/`.
