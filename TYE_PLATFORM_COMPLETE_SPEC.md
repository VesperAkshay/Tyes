# TYE PLATFORM — COMPLETE UNIFIED SPECIFICATION
## Tyegit + TyeApi + TyeRun + tye Hub, as One Buildable System
**Version:** 1.0.0 · **Format:** Agent-Executable Specification (AES)
**This is the single source of truth.** It supersedes the three original specs
(`AI_AGENT_READY_GIT_DESKTOP_SPEC.md`, `API_TESTER_DESKTOP_SPEC.md`,
`AI_AGENT_TYERUN_SPEC.md`) wherever they conflict, and carries every one of
their original features forward unchanged wherever they don't.

**What's in this file, and how it was built:** every FAT-REQ feature, state
machine, IPC command, SQL table, UI component, test case, error code, and
glossary term from all three source specs is present below — nothing was
summarized or dropped. Where the three specs collided (three incompatible
`Workspace` structs, three `CREATE TABLE workspaces`, an inconsistent `ai:`
IPC namespace, duplicated credential vaults/event buses/AI layers, colliding
error codes, colliding file paths), a small number of precise, mechanical
renames were applied and are called out inline, at the top of each part, in
a "⚑ UNIFIED-SUITE PATCH NOTES" box. Everything else is verbatim.

---

## TABLE OF CONTENTS

**PART 1 — ARCHITECTURE, AUDIT & UNIFIED DATA MODEL** *(governs all parts below)*
- A. What we're actually building — the tye platform vision
- B. Architecture mistakes found in the three source specs (9 findings, B.1–B.9)
- C. Unified data model — the `Project` root, unified `Environment`, SQLite strategy
- D. Monorepo layout (Cargo workspace + pnpm workspace, per-app `src-tauri`)
- E. Unified IPC namespacing & cross-module event bus
- F. Unified AI orchestration layer (`tye-core-ai-gateway`)
- G. Unified security layer (`tye-core-vault`, capabilities, plugin host)
- H. Unified shell & design system (`AppShell`, design tokens)
- I. Build & packaging strategy (Cargo/pnpm workspace files)
- J. Implementation roadmap (Phase 0–5)
- K. Critical rules for the AI agent
- Appendix — cross-reference table (old concept → new concept)

**PART 2 — TYEGIT: FULL MERGED SPECIFICATION**
Complete original Git Desktop spec (11 sections, 61 features across 8 milestones),
patched: `ai:*` → `git:ai_*`, SQL tables `git_`-prefixed, relocated under `apps/tyegit/`.

**PART 3 — TYEAPI: FULL MERGED SPECIFICATION**
Complete original API Tester spec (11 sections, 56 features across 8 milestones + new
Milestone 9), patched: `Workspace` → `Project` throughout, `projects`/`environments`
tables removed (→ shared core tables), remaining tables `api_`-prefixed, relocated
under `apps/tyeapi/`, new AI orchestration milestone added.

**PART 4 — TYERUN: FULL MERGED SPECIFICATION**
Complete original TyeRun spec (12 sections, 37 features across 6 milestones), patched:
"TyreRun" typo → "TyeRun", `tr:*` → `run:*`, `Workspace` → `Project` throughout,
`projects`/`environments` tables removed, remaining tables `run_`-prefixed, git-status/
hooks commands reconciled to delegate to the shared git engine, relocated under
`apps/tyerun/`.

**PART 5 — TYE HUB: NEW SPECIFICATION**
The fourth app. 12 new features across 4 milestones: Activity Bar module switching,
project overview aggregation, unified recents, global command palette & search,
cross-module automation rule engine (with templates, editor, and execution log),
unified settings/notifications. Full FAT-REQ format, IPC registry, state machine,
testing matrix, file layout.

**PART 6 — CONSOLIDATED APPENDICES**
Error-code collision audit finding (B.10) + fully deduplicated, module-prefixed
error code registry (14 `CORE_*`, 12 `GIT_*`, 32 `API_*`, 15 `RUN_*`, 2 `HUB_*`
codes replacing the original specs' ambiguous, colliding tables) · master IPC
index pointer · glossary addendum for new unified-platform terms.

---

-e 

<!-- ============================================================ -->
<!-- PART 1: ARCHITECTURE, AUDIT & UNIFIED DATA MODEL -->
<!-- ============================================================ -->

# TYE PLATFORM — UNIFIED MASTER ARCHITECTURE SPECIFICATION
## Combining Tyegit, TyeApi, and TyeRun into One Coherent Product Suite
**Version:** 1.0.0
**Format:** Agent-Executable Specification (AES) — supersedes conflicting sections of the three source specs
**Sources analyzed:** `AI_AGENT_READY_GIT_DESKTOP_SPEC.md` (Tyegit, 3250 lines), `API_TESTER_DESKTOP_SPEC.md` (TyeApi, 4070 lines), `AI_AGENT_TYERUN_SPEC.md` (TyeRun, 2922 lines)
**Author context:** tye is a suite of native developer tools by a solo developer. Flagship is Tyegit (Rust/Tauri v2 Git client). This document is the missing "Section −1" that makes the three independently-written specs buildable as one coherent system instead of three apps that happen to share a naming convention.

---

# 0. HOW TO USE THIS DOCUMENT

**This document does not replace the three source specs. It governs them.**

| Stays valid, unchanged | Superseded by this document |
|---|---|
| Every FAT-REQ feature entry (Section 2 of each spec) | Section 0 "Architecture Blueprint" of each spec |
| Every state machine (Section 3 of each spec) | Section 1 "Core Data Models" of each spec — specifically `Workspace`, `Environment`, credential/vault structs |
| UI component behavior/props (Section 5.2 of each spec) | Section 4.1 "IPC Command Registry" prefixes for AI commands |
| Testing matrices, error code tables | Section 1.9/2.8 "SQLite Cache Schema" (table collisions) |
| Glossaries | Section 9.4 "File Naming Conventions" (root directory collisions) |

Read order for the AI agent building this:
1. This document, in full, once — it is short enough to hold in context.
2. Part D (directory layout) and Part C (data model) before writing a single line of code.
3. Then the relevant original spec per module, feature by feature, substituting every renamed type/table/command per the delta tables in Part F.

If a rule in this document conflicts with a rule in one of the three source specs, **this document wins**.

---

# PART A — WHAT WE'RE ACTUALLY BUILDING

## A.1 The realization

All three specs were written independently (evident from three incompatible `Workspace` structs, three duplicated credential stores, one inconsistent `ai:` IPC namespace vs. two consistent ones). But they are not three unrelated apps — they are three lenses on the same object: **a folder on disk that a developer is working in.** That folder may have a `.git` directory, may have a collection of saved API requests, may have a `package.json`/`Cargo.toml`/`Makefile`. Today the three specs each reinvent "open a folder, remember it, watch it, cache its state in SQLite" from scratch.

This is exactly the shape of the problem VS Code solved with its **workspace + extension host** model, and that JetBrains solved with the **IntelliJ Platform** (one platform binary; PyCharm/WebStorm/RustRover are the same core with different plugin bundles enabled). We're borrowing both patterns, scaled down for a 3-product native suite:

- **One shared platform core** (Rust crates + a TS/React design-system package) that knows how to open a project folder, watch its files, store secrets, run an AI request, and dispatch cross-module events.
- **Three thin product shells** (Tyegit, TyeApi, TyeRun) that are each a real, independently-shippable Tauri binary — same pattern GitHub Desktop, Postman, and Docker Desktop use: single-purpose, small, fast to open.
- **One additional shell, "tye Hub,"** which is the *same* three product UIs mounted inside one window behind a VS Code–style activity bar, for people who want the combined workspace. Hub is not a fourth product with its own logic — it is a window that loads the other three as panels.

This satisfies your ask directly: **launch a single combined workspace app, or ship three separate apps** — from one codebase, no forked logic.

## A.2 Product identity (unchanged, just made explicit)

| Product | One-line pitch | Primary domain object |
|---|---|---|
| **Tyegit** | Opinionated native Git client, God-Mode diff editor, enforced fast-forward merges | `Repository` |
| **TyeApi** | Postman/Bruno-class REST/GraphQL/gRPC/WS client, Git-native collections | `ApiCollection` |
| **TyeRun** | Visual task runner / process dashboard across npm, Cargo, Docker, Make, etc. | `Task` / `Pipeline` |
| **tye Hub** *(new)* | One window, one project, all three panels, cross-module automation | `Project` |

---

# PART B — ARCHITECTURE MISTAKES FOUND (AUDIT)

Concrete, cited findings from the three source specs, in order of severity.

### B.1 — CRITICAL: `Workspace` is defined three incompatible times, and would collide at compile time if merged
- API Tester `Section 1.1`: `struct Workspace { collections, environments, global_variables, settings: WorkspaceSettings, ... }`
- TyeRun `Section 2.1`: `struct Workspace { detected_ecosystems, tasks, task_groups, pipelines, environments, is_pinned, icon, color }`
- Git Desktop has no `Workspace` at all — its root object is `RepositoryHandle`.
- **Same problem in SQL.** Both API Tester (`Section 1.9`) and TyeRun (`Section 2.8`) literally define `CREATE TABLE workspaces (...)` with different, incompatible columns. If these three specs were built independently into one SQLite file, migration 2 fails on `CREATE TABLE workspaces` already existing.
- **Fix:** Part C.1 — introduce one root `Project` concept; each module attaches its own config as a satellite table/struct, never redefines the root.

### B.2 — HIGH: Inconsistent IPC namespacing for AI commands
- Git Desktop's non-AI commands are correctly namespaced `git:*`, but its AI commands break the pattern and ship bare: `ai:analyze_repo`, `ai:generate_commit_message`, `ai:execute_plan` (`Section 4.1`).
- TyeRun does it correctly: `tr:ai_analyze_workspace`, `tr:ai_chat`, etc.
- If both apps are ever loaded in the same Tauri instance (Hub mode), Git Desktop's `ai:execute_plan` and any future TyeRun `ai:execute_plan` collide on the *exact same channel name*. This isn't hypothetical — it's the one command name most likely to be reused.
- **Fix:** Part E — every command is namespaced by product prefix, no exceptions, including AI. `git:ai_analyze_repo`, `api:ai_suggest_assertions`, `run:ai_troubleshoot`.

### B.3 — HIGH: Environment/secrets are modeled and stored twice with no bridge
- TyeApi has `Environment` (API-scoped: base URLs, headers, tokens) and TyeRun has its own, unrelated `Environment` (process env-var profiles). A developer running a local API against a local dev server has to maintain the same `API_BASE_URL` / `DATABASE_URL` in two disconnected places, in two disconnected SQLite files, with two disconnected secret vaults.
- TyeRun's own `Section 0.5` already *wants* this fixed ("Unified dashboard: Git status + Task status side by side... Shared SQLite database for workspace metadata") but neither spec implements the sharing.
- **Fix:** Part C.2 — one `environments` core table with a `scope` column, readable by all three modules.

### B.4 — HIGH: Credential storage is implemented three times
- Git Desktop `Section 7.1`, API Tester `Section 7.1`, and TyeRun (`Layer 3`, "Credential Store (Keychain/Keyring for env vars)") each independently wrap the OS keychain. Same crate (`keyring`), same intent, three separate Rust modules, three separate bugs waiting to diverge, and — worse — three separate keychain service names, so a GitHub PAT saved in Tyegit is invisible to TyeApi even though TyeApi might want to hit the GitHub API with it.
- **Fix:** Part G — one `tye-vault` crate, one keychain service namespace, per-module key prefixes.

### B.5 — MEDIUM: Event bus reinvented three times, blocking the suite's actual value proposition
- All three specs independently list "Event Bus (tokio channels)" in Layer 5. Each is module-private. This directly blocks the cross-module workflows the specs themselves describe wanting: TyeRun `0.5` wants "pre-commit → lint" and "build → commit → tag"; a combined suite should also support "API collection run fails → open the failing request next to the diff that broke it," which is impossible if the buses never see each other's events.
- **Fix:** Part E.2 — one `tye-event-bus` crate with a typed cross-module event enum.

### B.6 — MEDIUM: Root directory layout collides at the filesystem level
- All three `Section 9.4` file-naming plans independently claim `src-tauri/src/{main.rs,lib.rs}`, `src/stores/uiStore.ts`, `src/lib/{api.ts,utils.ts}`, `src/types/{api.ts,ui.ts}`, `src/components/settings/`. These are not "similar," they are **the same relative paths**, so `git checkout` of one spec's scaffold into another's directory silently overwrites files.
- **Fix:** Part D — each product is its own top-level app directory (`apps/tyegit`, `apps/tyeapi`, `apps/tyerun`, `apps/tye-hub`), shared code only lives in `packages/` and `crates/`.

### B.7 — MEDIUM: AI orchestration layer exists in two of three products, absent in the third, at odds with the "AI-agent-ready" branding
- Git Desktop and TyeRun both have a first-class `LAYER 2: AI ORCHESTRATION` (MCP client, LLM gateway, safety/approval layer). API Tester has no such layer in its blueprint at all, despite this being the product most naturally suited to it (AI can suggest assertions, explain a failing response diff, generate a request from a plain-English description, or write a Postman-import mapping).
- Because the AI layer is duplicated instead of shared, "AI mutations require explicit user approval" and "AI context window excludes secrets" are each declared independently in two prose sections that could silently drift out of sync as either spec is edited.
- **Fix:** Part F — one `tye-ai-gateway` crate implementing the safety policy once; API Tester gets the same layer added as an optional Phase-2 module.

### B.8 — LOW: Plugin system built three times
- API Tester `M8/F-*`, TyeRun `Section 5, get_plugins/install_plugin`, and Git Desktop `Milestone 8 / F-057` each define an independent WASM plugin host with independent manifest formats.
- **Fix:** Part G.3 — one `tye-plugin-host` crate; a plugin manifest declares which product(s) it targets.

### B.10 — LOW: a *third*, different meaning of "Workspace" hiding inside Git Desktop itself
- Independent of the API Tester/TyeRun collision (B.1), Git Desktop's own `F-012:
  Multi-Repository Workspace` (`Section 2`, M1) defines a *third* concept called
  `Workspace { id, name, repos: Vec<RepoHandle>, aggregate_status }` — a saved
  named group of repos (e.g. "Work Projects") with its own `workspaces` /
  `workspace_repos` SQL tables. This one wasn't caught by grep-for-`Workspace`-as-
  root-object because it's a genuinely different shape (a group of many repos, not
  one opened folder) — but it reuses the exact word that now means something else
  suite-wide, which would confuse anyone reading "Workspace" across the merged doc.
- **Fix:** renamed to `RepoGroup` in Part 2 (`F-012: Multi-Repository Group`,
  `git_repo_groups` / `git_repo_group_members` tables). Purely a label change —
  the feature's behavior is untouched.

### B.9 — LOW: "Safety net" concepts (Checkpoint / Snapshot / Backup) solve genuinely different problems and should **not** be force-merged
- Git Desktop's `Checkpoint` (pre-destructive-op repo snapshot), API Tester's `Snapshot` (response comparison), and TyeRun's `Backup` (workspace-config export) look similar on the surface but protect different things at different granularities. Flagged here only so the AI agent doesn't try to "fix" this — it isn't broken. Optionally, all three can sit on one small `tye-versioned-store` crate purely to avoid three copies of the same serialize/restore boilerplate (Part G.4), but their semantics stay separate.

---

# PART C — UNIFIED DATA MODEL

## C.1 The `Project` root — fixes B.1

A `Project` is what the user opens (File → Open Folder, same verb in all three apps and in Hub). A project *may* have a Git repo, *may* have API collections, *may* have detected tasks. None are required. This single struct lives in a new shared crate, `tye-core-models`.

```rust
// crates/tye-core-models/src/project.rs

/// The one and only "opened folder" concept across the whole suite.
/// Replaces: API Tester's `Workspace`, TyeRun's `Workspace`, and stands
/// alongside (not instead of) Git Desktop's `RepositoryHandle`, which
/// becomes a satellite attached to a Project when a .git dir is found.
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub path: PathBuf,                 // canonical root folder — the ONE identity key
    pub icon: Option<String>,
    pub color: Option<String>,
    pub is_pinned: bool,
    pub last_opened: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,

    // Presence flags, computed on open, cheap to recompute — not sources of truth.
    pub has_git: bool,
    pub has_api_collections: bool,
    pub detected_ecosystems: Vec<Ecosystem>,   // from TyeRun 2.1, kept as-is

    // Satellites — each module owns and migrates its own table/struct.
    // A standalone Tyegit build only ever populates `git`. A standalone
    // TyeApi build only ever populates `api`. Hub populates whichever exist.
    pub git: Option<GitProjectState>,      // was Git Desktop's RepositoryHandle, renamed
    pub api: Option<ApiProjectState>,      // was API Tester's Workspace body, renamed
    pub run: Option<RunProjectState>,      // was TyeRun's Workspace body, renamed
}

pub struct GitProjectState {
    pub repo: RepositoryHandle,       // UNCHANGED from Git Desktop spec Section 1.1
}

pub struct ApiProjectState {
    pub settings: WorkspaceSettings,       // UNCHANGED struct from API Tester spec Section 1.1,
    pub collections: Vec<Collection>,      // just re-parented under Project instead of being the root
    pub global_variables: Vec<Variable>,
}

pub struct RunProjectState {
    pub tasks: Vec<Task>,                  // UNCHANGED struct from TyeRun spec Section 2.2,
    pub task_groups: Vec<TaskGroup>,       // just re-parented under Project instead of being the root
    pub pipelines: Vec<Pipeline>,
}
```

**Migration note for the agent:** this is a rename-and-reparent, not a rewrite. `ApiProjectState` and `RunProjectState` keep every field the original `Workspace` structs had (minus the fields now hoisted to `Project`: `id`, `name`, `path`, `icon`, `color`, `is_pinned`, `last_opened`). Every FAT-REQ feature in the original specs that reads `workspace.collections` now reads `project.api.collections`; that's the only edit needed through the rest of Section 2 of each spec.

## C.2 Unified `environments` — fixes B.3

One core table, one Rust model, scoped by an enum instead of by which product happened to create the row.

```rust
// crates/tye-core-models/src/environment.rs
pub struct Environment {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub scope: EnvironmentScope,
    pub variables: Vec<EnvironmentVariable>,
    pub is_active: bool,           // "active" is per-scope, not global
    pub color: Option<String>,
}

pub enum EnvironmentScope {
    Project,        // visible to git hooks, api requests, and run tasks alike
    ApiOnly,         // API Tester's old per-collection environments
    RunOnly,          // TyeRun's old per-workspace process env profiles
}

pub struct EnvironmentVariable {
    pub key: String,
    pub value: EnvValue,
    pub is_secret: bool,           // if true, `value` is a vault reference, never the raw string
}

pub enum EnvValue {
    Plain(String),
    VaultRef(String),              // key into tye-vault, see Part G
}
```

`api:resolve_environment` and `tr:validate_env_refs` (now `run:validate_env_refs`, see Part F) both read from this same table. A `Project`-scoped variable set automatically appears in both the API request builder's variable picker and the task runner's env-var editor — this is the actual point of combining the three apps, not just a shared window frame.

## C.3 SQLite strategy — fixes B.1's schema collision

**One database file per opened project, plus one global registry.** Not three per-product DBs (loses cross-module queries), not one giant DB for the whole machine (a `project.db` should be portable/`.gitignore`-able and live in `<project>/.tye/project.db`, mirroring how `.git` sits next to the code it describes).

```
~/.tye/registry.db                 -- ONE per machine, in the OS app-data dir.
                                    -- Row per project ever opened, across ALL products.
                                    -- Powers "recent projects" identically in
                                    -- Tyegit, TyeApi, TyeRun, and Hub.

<project_root>/.tye/project.db     -- ONE per opened project, lives next to the code.
                                    -- Namespaced tables below. Safe to .gitignore
                                    -- (it is cache/history, same rule the original
                                    -- specs already stated: "SQLite is for
                                    -- history/cache only, collections are flat-file").
```

```sql
-- ~/.tye/registry.db
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT UNIQUE NOT NULL,
    icon TEXT,
    color TEXT,
    is_pinned BOOLEAN DEFAULT 0,
    has_git BOOLEAN DEFAULT 0,
    has_api_collections BOOLEAN DEFAULT 0,
    detected_ecosystems TEXT,          -- JSON array, from TyeRun's original column
    last_opened TIMESTAMP,
    last_opened_by TEXT,               -- 'tyegit' | 'tyeapi' | 'tyerun' | 'hub' — telemetry only
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- <project_root>/.tye/project.db  — one file, namespaced tables, no name collisions.
CREATE TABLE core_environments ( ... );        -- Part C.2 struct
CREATE TABLE core_environment_variables ( ... );
CREATE TABLE core_events_log ( ... );          -- audit trail, Part E.2

CREATE TABLE git_repositories ( ... );         -- UNCHANGED body from Git Desktop 1.9 `repositories`
CREATE TABLE git_refs_cache ( ... );           -- UNCHANGED from Git Desktop 1.9 `refs_cache`
-- ...every other Git Desktop 1.9 table, same columns, `git_` prefix added.

CREATE TABLE api_collections ( ... );          -- was API Tester's un-prefixed collection cache tables
CREATE TABLE api_history ( ... );              -- UNCHANGED body from API Tester 1.9 `history`
-- ...every other API Tester 1.9 table, same columns, `api_` prefix added.
-- NOTE: API Tester's `environments` and `workspaces` tables are DELETED —
-- superseded by core_environments and the registry, respectively.

CREATE TABLE run_tasks ( ... );                -- UNCHANGED body from TyeRun 2.8 `tasks`
CREATE TABLE run_process_instances ( ... );
-- ...every other TyeRun 2.8 table, same columns, `run_` prefix added.
-- NOTE: TyeRun's `environments` and `workspaces` tables are DELETED —
-- superseded by core_environments and the registry, respectively.
```

**Rule for the agent:** when porting a `CREATE TABLE` from any of the three original specs, prefix it `core_`, `git_`, `api_`, or `run_` per its origin, and drop it entirely if it was called `workspaces` or `environments` — those two are now core-only, per above.

---

# PART D — MONOREPO LAYOUT

Grounded in the actual Tauri v2 team guidance (multiple real Tauri apps, each with its own `tauri.conf.json` next to its own `Cargo.toml`, sharing logic through ordinary workspace crates — *not* one binary with runtime app-switching, which Tauri does not support well). This is also how the JetBrains and VS Code precedents actually ship: separate installers, shared platform underneath.

```
tye/
├── Cargo.toml                      # Rust workspace root
├── pnpm-workspace.yaml             # or package.json "workspaces" — JS workspace root
├── package.json
├── turbo.json                      # Turborepo pipeline (build/dev/lint across apps+packages)
│
├── apps/
│   ├── tyegit/                     # standalone Git client — ships alone, today's Tyegit
│   │   ├── src-tauri/
│   │   │   ├── Cargo.toml          # depends on crates/tye-core-*, crates/tye-git-engine
│   │   │   ├── tauri.conf.json     # identifier: dev.tyes.tyegit
│   │   │   ├── capabilities/       # Tauri v2 permissions — git:* commands only
│   │   │   └── src/{main.rs,lib.rs}
│   │   └── src/                    # React shell for Tyegit-only UI
│   │
│   ├── tyeapi/                     # standalone API tester — ships alone
│   │   ├── src-tauri/  (tauri.conf.json  identifier: dev.tyes.tyeapi, capabilities: api:* only)
│   │   └── src/
│   │
│   ├── tyerun/                     # standalone task runner — ships alone
│   │   ├── src-tauri/  (tauri.conf.json  identifier: dev.tyes.tyerun, capabilities: run:* only)
│   │   └── src/
│   │
│   └── tye-hub/                    # combined workspace app — the "single app" option
│       ├── src-tauri/
│       │   ├── Cargo.toml          # depends on ALL of tye-git-engine, tye-api-engine, tye-run-engine
│       │   ├── tauri.conf.json     # identifier: dev.tyes.hub
│       │   └── capabilities/       # git:*, api:*, run:*, hub:* all allowed
│       └── src/                    # imports the three UI packages below as panels, adds ActivityBar
│
├── crates/                         # Rust — shared, imported via Cargo workspace deps
│   ├── tye-core-models/            # Part C: Project, Environment, EnvironmentVariable
│   ├── tye-core-storage/           # SQLite pooling, migrations runner, registry.db + project.db logic
│   ├── tye-core-events/            # Part E.2: tye-event-bus, typed TyeEvent enum
│   ├── tye-core-vault/             # Part G: keyring wrapper, one service namespace
│   ├── tye-core-ai-gateway/        # Part F: MCP client, LLM gateway, safety/approval layer
│   ├── tye-core-plugin-host/       # Part G.3: shared WASM plugin runtime
│   ├── tye-core-fs-watcher/        # shared notify-crate wrapper, 300ms debounce (all 3 specs wanted this)
│   ├── tye-git-engine/             # Git Desktop Section 1/Layer 4 domain code, unchanged, just relocated
│   ├── tye-api-engine/             # API Tester Section 1/Layer 4 domain code, unchanged, just relocated
│   └── tye-run-engine/             # TyeRun Section 1/Layer 4 domain code, unchanged, just relocated
│
├── packages/                       # TypeScript — shared, imported via pnpm workspace deps
│   ├── tye-design-system/          # Part H: tokens, AppShell, ActivityBar, primitives (Radix-based)
│   ├── tye-ipc-client/             # typed wrapper over Tauri `invoke`, one per module namespace
│   ├── tye-ui-git/                 # Git Desktop's Section 5.2 component inventory, unchanged, relocated
│   ├── tye-ui-api/                 # API Tester's Section 5.2 component inventory, unchanged, relocated
│   └── tye-ui-run/                 # TyeRun's Section 5.2 component inventory, unchanged, relocated
│
└── docs/
    └── specs/                      # the three original specs + this document, kept as source of truth
```

**Why per-app `src-tauri`, not one binary with a mode flag:** Tauri does not cleanly support shipping one binary that behaves as three differently-branded, differently-permissioned apps at runtime — icons, bundle identifiers, and capability/permission ACLs are compile-time, per the Tauri v2 project-structure and capabilities model. Four small binaries sharing crates is the supported, precedented shape (this mirrors how Tauri's own multi-app discussions resolve: separate `src-tauri` folders, shared crates via Cargo workspace).

---

# PART E — UNIFIED IPC & EVENT BUS

## E.1 Command namespacing — fixes B.2

Rule, no exceptions: **`<product>:<verb>_<noun>`, including AI.** Every command from every original spec keeps its verb/noun; only the prefix is normalized.

| Old (source spec) | New (unified) | Why |
|---|---|---|
| `git:commit`, `git:get_status`, … | *unchanged* | Already correct |
| `ai:analyze_repo` | `git:ai_analyze_repo` | Fixes B.2 collision risk |
| `ai:generate_commit_message` | `git:ai_generate_commit_message` | ″ |
| `ai:suggest_conflict_resolution` | `git:ai_suggest_conflict_resolution` | ″ |
| `ai:natural_language_command` | `git:ai_natural_language_command` | ″ |
| `ai:execute_plan` | `git:ai_execute_plan` | ″ |
| `api:*` | *unchanged* | Already correct |
| `tr:*` | `run:*` | Align on full product codename, not an abbreviation only used in one place — matches `git:`/`api:` being full names |
| `tr:ai_*` | `run:ai_*` | Rename only, pattern already correct |
| *(none existed)* | `api:ai_*` (new, Phase-2, see Part F) | Fixes B.7 |
| *(none existed)* | `hub:*` (new) | Cross-module commands that only make sense with 2+ modules loaded — see E.3 |

## E.2 The event bus — fixes B.5

```rust
// crates/tye-core-events/src/lib.rs
pub enum TyeEvent {
    // Git-origin events
    GitCommitCreated { project_id: Uuid, commit_oid: String, branch: String },
    GitBranchSwitched { project_id: Uuid, from: String, to: String },
    GitPushCompleted { project_id: Uuid, remote: String, branch: String },
    GitMergeConflict { project_id: Uuid, files: Vec<PathBuf> },

    // API-origin events
    ApiCollectionRunCompleted { project_id: Uuid, run_id: Uuid, passed: u32, failed: u32 },
    ApiRequestFailed { project_id: Uuid, request_id: Uuid, status: Option<u16> },

    // Run-origin events
    RunTaskStarted { project_id: Uuid, task_id: Uuid },
    RunTaskExited { project_id: Uuid, task_id: Uuid, exit_code: Option<i32> },
    RunPipelineCompleted { project_id: Uuid, pipeline_id: Uuid, success: bool },
}
```

Each module *publishes* its own events and *subscribes* to any event, including its own — the point is decoupling, not hierarchy. This is what turns three co-installed apps into an actual suite:

```rust
// Example wiring, lives in tye-hub only (standalone apps never see other modules' events
// because they never load the other engine crates — no dead code, no runtime overhead).
event_bus.subscribe(|event| match event {
    TyeEvent::GitCommitCreated { project_id, .. } => {
        // if the project has a pipeline tagged `on: commit`, run it — realizes
        // TyeRun's own Section 0.5 ambition ("pre-commit → lint") without TyeRun
        // having to re-implement a git watcher.
        run_engine::trigger_pipelines_for(project_id, PipelineTrigger::OnCommit)
    }
    TyeEvent::ApiCollectionRunCompleted { project_id, failed, .. } if failed > 0 => {
        ui_bridge::surface_notification(project_id, "API tests failed — see failing requests")
    }
    _ => {}
});
```

Standalone `tyegit`/`tyeapi`/`tyerun` binaries still get an event bus (useful even in-module: e.g. `RunTaskExited` driving a health badge), it's just never wired across engine crates they didn't link in.

## E.3 `hub:*` — commands that only exist when 2+ modules are present

```
hub:list_projects            {}                              Vec<Project>     No
hub:open_project             { path }                        Project          No
hub:get_project_overview     { project_id }                  ProjectOverview  No   // git status + api last-run + run task health, one call
hub:global_search            { query, scopes: [git|api|run] } SearchResults   No
hub:command_palette_actions  { query }                        Vec<Action>      No
```

`hub:get_project_overview` is the single call that justifies Hub's existence: it's the thing a standalone app literally cannot answer, because it needs data from engines a standalone app never links.

---

# PART F — UNIFIED AI ORCHESTRATION LAYER

Fixes B.2 (namespacing) and B.7 (API Tester missing the layer entirely). One crate, one safety policy, written once.

```rust
// crates/tye-core-ai-gateway/src/lib.rs
pub struct AiGateway {
    mcp_client: McpClient,
    llm: LlmProvider,              // Anthropic / OpenAI / local — unchanged choice from source specs
    safety: SafetyPolicy,
}

pub struct SafetyPolicy;
impl SafetyPolicy {
    /// The exact rule stated near-identically in Git Desktop §7.2 and TyeRun §8.2,
    /// written once instead of twice (and now inherited by API Tester for free):
    /// - strip credentials, .env values, private keys, secret-scoped env vars from any prompt context
    /// - all mutating AI actions return a Plan, never auto-execute
    /// - every plan is logged with user identity + timestamp to core_events_log
    fn redact(&self, context: PromptContext) -> PromptContext { /* ... */ }
    fn requires_approval(&self, plan: &AiPlan) -> bool { /* true for anything mutating */ }
}
```

Per-module command surface stays exactly as each source spec designed it (this is orchestration plumbing, not a UX change):

- `git:ai_*` → repo analysis, commit messages, conflict resolution, NL commands (Git Desktop §2, unchanged)
- `run:ai_*` → workspace analysis, task suggestions, troubleshooting, chat (TyeRun §3, unchanged)
- `api:ai_*` *(new, Phase 2, additive — does not block Milestones 1–8 of the original API Tester spec)*:
  - `api:ai_suggest_assertions { request_id, response_id }` — proposes Rhai test assertions from an observed response
  - `api:ai_explain_failure { response_id }` — plain-English diagnosis of a failing request
  - `api:ai_generate_request { prompt }` — NL → `ApiRequest` draft
  - `api:ai_chat { project_id, message }` — matches the pattern of `git:ai_natural_language_command` / `run:ai_chat`

---

# PART G — UNIFIED SECURITY LAYER

## G.1 One credential vault — fixes B.4

```rust
// crates/tye-core-vault/src/lib.rs
const SERVICE_NAMESPACE: &str = "dev.tyes.vault";   // ONE keychain service for the whole suite

pub struct VaultKey {
    pub module: Module,          // Git | Api | Run | Core
    pub project_id: Option<Uuid>,// None for machine-global creds (e.g. a GitHub PAT usable by both Tyegit and TyeApi)
    pub key: String,
}

pub fn get(key: &VaultKey) -> Result<Option<String>, VaultError>;
pub fn set(key: &VaultKey, value: &str) -> Result<(), VaultError>;
pub fn delete(key: &VaultKey) -> Result<(), VaultError>;
```

Concretely: a GitHub Personal Access Token saved once (`VaultKey { module: Core, project_id: None, key: "github_pat" }`) is usable by Tyegit for push/pull hosting calls **and** by TyeApi as a `VaultRef` in an `EnvironmentVariable` for hitting the GitHub REST API in a collection — no re-entry, matching the "single source of truth" spirit the source specs were reaching for but never wired up.

All security rules that were stated identically in both Git Desktop §7.1 and API Tester §7.1 (no plaintext, `zeroize` memory scrubbing, no credentials in logs/AI context/exports, OS keychain primary) now live once, in this crate, inherited by all four apps.

## G.2 Tauri v2 capabilities — per-app least privilege

Each app's `src-tauri/capabilities/` ACL only allowlists its own namespace plus `core:*`, so a compromised or buggy TyeApi renderer cannot invoke `git:reset` even though the binary happens to link `tye-git-engine` transitively through a shared crate — Hub is the only app whose capability file allowlists `git:*`, `api:*`, `run:*`, and `hub:*` together.

```json
// apps/tyeapi/src-tauri/capabilities/default.json (excerpt)
{
  "permissions": ["core:default", "api:default", "core-vault:default", "core-ai:default"]
}
// apps/tye-hub/src-tauri/capabilities/default.json (excerpt)
{
  "permissions": ["core:default", "git:default", "api:default", "run:default", "hub:default"]
}
```

## G.3 One plugin host — fixes B.8

`tye-core-plugin-host` implements the WASM runtime, manifest parsing, and install/enable/disable lifecycle once. A plugin manifest declares `targets: ["git", "api", "run", "hub"]`; the host only exposes the WIT bindings for the products the current binary actually links, so a `tyegit`-only plugin can't be installed into a standalone `tyeapi` build.

## G.4 Optional: shared versioned-store helper (see B.9)

`tye-core-versioned-store` is a small generic `save_version<T: Serialize>()` / `restore_version()` helper that `Checkpoint` (git), `Snapshot` (api), and `Backup` (run) can each build on to avoid three copies of the same serialize-to-disk boilerplate. Their semantics remain distinct — this is a DRY convenience, not a data-model merge.

---

# PART H — UNIFIED SHELL & DESIGN SYSTEM

## H.1 One `AppShell`, two mount modes

The three original specs' `Section 5.1 Core Layout` trees are structurally near-identical (`TitleBar → MenuBar → Toolbar → Sidebar/CenterPanel/RightPanel/BottomPanel → Modals`, each with an `AiPanel` and a `SettingsModal`). That's not a coincidence to clean up later — it's the proof this was always one component wearing three skins.

```tsx
// packages/tye-design-system/src/AppShell.tsx
export function AppShell({ modules }: { modules: ("git" | "api" | "run")[] }) {
  // modules.length === 1  -> standalone app: ActivityBar hidden, that module's
  //                          Sidebar/CenterPanel/RightPanel render directly (today's UX, unchanged)
  // modules.length > 1    -> Hub: ActivityBar visible, switches which module's
  //                          Sidebar/CenterPanel/RightPanel/BottomPanel are mounted
}
```

```
apps/tyegit/src/App.tsx    -> <AppShell modules={["git"]} />
apps/tyeapi/src/App.tsx    -> <AppShell modules={["api"]} />
apps/tyerun/src/App.tsx    -> <AppShell modules={["run"]} />
apps/tye-hub/src/App.tsx   -> <AppShell modules={["git", "api", "run"]} />
```

`AiPanel`, `SettingsModal`, `CommandPalette`, and `NotificationPanel` (all present, near-verbatim, in every source spec's component inventory) move into `tye-design-system` as shared components, parameterized by module, instead of being implemented three times.

## H.2 Design tokens — the existing tye visual identity, made canonical

Per the established Tyegit/tye brand system (poster palette, stipple/halftone illustration, Vercel Geist Pixel type): this is the *one* token set for all four apps, not a per-product palette.

```css
/* packages/tye-design-system/src/tokens.css */
:root {
  --tye-cream: #EDE8DC;      /* base surface */
  --tye-ink: #1A1A1A;        /* primary text / lines */
  --tye-lavender: #8B85C4;   /* Git module accent */
  --tye-mustard: #D9A441;    /* Run module accent */
  --tye-font-display: 'Geist Pixel', monospace;
  --tye-illustration-style: stipple;   /* halftone/bitmap illustration convention for empty states, onboarding */
}
/* API module gets a third accent for ActivityBar differentiation — pick one more
   poster-palette-consistent hue (e.g. a muted terracotta/rust) rather than introducing
   an off-palette color; leave the exact value to design.md's existing token derivation process. */
```

The `ActivityBar` in Hub mode is the one new surface this merge requires designing: three icon marks (Git cube mark, an API mark, a Run mark) in the existing stipple/halftone language, sitting on `--tye-cream`, switching the accent stripe to `--tye-lavender` / API-accent / `--tye-mustard` per active module.

---

# PART I — BUILD & PACKAGING

```toml
# Cargo.toml (workspace root)
[workspace]
resolver = "2"
members = [
  "apps/tyegit/src-tauri",
  "apps/tyeapi/src-tauri",
  "apps/tyerun/src-tauri",
  "apps/tye-hub/src-tauri",
  "crates/tye-core-models",
  "crates/tye-core-storage",
  "crates/tye-core-events",
  "crates/tye-core-vault",
  "crates/tye-core-ai-gateway",
  "crates/tye-core-plugin-host",
  "crates/tye-core-fs-watcher",
  "crates/tye-git-engine",
  "crates/tye-api-engine",
  "crates/tye-run-engine",
]

[workspace.dependencies]
tauri = { version = "2", features = [] }
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio"] }
keyring = "3"
rhai = "1"
git2 = "0.19"
reqwest = { version = "0.12", features = ["rustls-tls", "stream"] }
notify = "6"
uuid = { version = "1", features = ["v4", "serde"] }
```

```jsonc
// package.json (root) — pnpm workspaces + Turborepo
{
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:git": "turbo run dev --filter=tyegit",
    "dev:api": "turbo run dev --filter=tyeapi",
    "dev:run": "turbo run dev --filter=tyerun",
    "dev:hub": "turbo run dev --filter=tye-hub",
    "build:all": "turbo run build"
  }
}
```

Each `apps/*/src-tauri/Cargo.toml` depends only on the crates it needs — `tyegit` never compiles `tye-api-engine` or `tye-run-engine`, so the standalone binaries stay as small and fast-launching as the original specs intended; only `tye-hub` links all three engines. CI matrix builds all four bundle IDs (`dev.tyes.tyegit`, `dev.tyes.tyeapi`, `dev.tyes.tyerun`, `dev.tyes.hub`) from the one repo, one release pipeline, four artifacts.

---

# PART J — IMPLEMENTATION ROADMAP FOR THE AI AGENT

Build order matters: shared core first, or every module ends up needing a rewrite pass later.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Core** | `tye-core-models` (Project, Environment), `tye-core-storage` (registry.db + project.db + migrations), `tye-core-vault`, `tye-core-events`, `tye-design-system` tokens + `AppShell` skeleton | A blank Tauri app can open a folder, create a `Project` row in both DBs, save/read one secret, publish/subscribe one `TyeEvent` |
| **1 — Tyegit** | Port Git Desktop spec Sections 1–8 verbatim into `tye-git-engine` + `apps/tyegit`, using `Project.git` instead of standalone `RepositoryHandle` as the root, `git_` -prefixed tables, `git:ai_*` renamed commands | Tyegit standalone app passes Git Desktop's own Section 6 Testing Matrix, unmodified |
| **2 — TyeApi** | Port API Tester spec Sections 1–8 into `tye-api-engine` + `apps/tyeapi`, using `Project.api`, `core_environments` instead of its own `environments` table, `api_`-prefixed tables. Add `api:ai_*` (Part F) as an additive milestone, not a blocker | TyeApi standalone app passes API Tester's own Section 6 Testing Matrix |
| **3 — TyeRun** | Port TyeRun spec Sections 1–10 into `tye-run-engine` + `apps/tyerun`, using `Project.run`, `core_environments`, `run_`-prefixed tables, `tr:*` → `run:*` rename | TyeRun standalone app passes TyeRun's own Section 7 Testing Matrix |
| **4 — Hub** | `apps/tye-hub` links all three engines, adds `ActivityBar`, wires `hub:*` commands, wires the `TyeEvent` cross-module subscriptions in Part E.2 | Opening one project in Hub shows live Git status + API last-run + Run task health in one `hub:get_project_overview` call; a test commit auto-triggers a tagged pipeline |
| **5 — Cross-cutting polish** | `tye-core-plugin-host` unification (Part G.3), `tye-core-versioned-store` (Part G.4), design pass on the ActivityBar icon marks | One plugin manifest format installs into any of the four apps it targets |

Phases 1–3 can run in parallel once Phase 0 is done — they don't depend on each other, only on core. Phase 4 is the only phase that requires 1–3 to be complete.

---

# PART K — CRITICAL RULES FOR THE AI AGENT (supersedes each spec's own §9.3/§10.3)

- **NEVER** create a second `Workspace` struct, `workspaces` table, or `environments` table anywhere. Those concepts are core-only (Part C).
- **NEVER** register an IPC command without a `git:` / `api:` / `run:` / `hub:` / `core:` prefix — including AI commands. No bare `ai:*`.
- **NEVER** write a second keychain integration. Import `tye-core-vault`.
- **NEVER** write a second tokio-channel event bus inside a module crate. Import `tye-core-events`.
- **ALWAYS** put new shared logic in `crates/tye-core-*` or `packages/tye-design-system`, never duplicate it into an `apps/*` directory.
- **ALWAYS** keep standalone apps buildable without the other two engines linked — a `tyegit` build must never require `tye-api-engine` or `tye-run-engine` as a compile dependency.
- **ALWAYS** apply the original per-module critical constraints unchanged: git2 primary/shell-fallback, reqwest+tokio for HTTP, Rhai sandboxed with no fs/network access, 300ms file-watcher debounce, AI read-only until user approval, secrets never in AI context or frontend IPC payloads.
- **ALWAYS** resolve secret-scoped `EnvironmentVariable`s server-side (Rust) via `tye-core-vault`; never send a `VaultRef`'s resolved value to the frontend except as the final templated request/task, never as a standalone "get the secret" response.

---

# APPENDIX — CROSS-REFERENCE TABLE

| Concept | Source spec | Original location | Unified location |
|---|---|---|---|
| `RepositoryHandle` | Git Desktop | §1.1 | `tye-git-engine`, attached at `Project.git.repo` |
| `Workspace` (API) | API Tester | §1.1 | Split: root fields → `Project`; rest → `ApiProjectState` at `Project.api` |
| `Workspace` (Run) | TyeRun | §2.1 | Split: root fields → `Project`; rest → `RunProjectState` at `Project.run` |
| `Environment` (API) | API Tester | §1.5 | `core_environments`, `scope: ApiOnly` or `Project` |
| `Environment` (Run) | TyeRun | §2.6 | `core_environments`, `scope: RunOnly` or `Project` |
| `ai:*` commands | Git Desktop | §4.1 | Renamed `git:ai_*` |
| `tr:*` commands | TyeRun | §4.1 | Renamed `run:*` |
| Credential Store (×3) | All three | Layer 3 / §7.1 | `tye-core-vault` |
| Event Bus (×3) | All three | Layer 5 | `tye-core-events` |
| Plugin Host (×3) | All three | Layer 6 / M8 | `tye-core-plugin-host` |
| AI Orchestration (×2, missing in API Tester) | Git Desktop, TyeRun | Layer 2 | `tye-core-ai-gateway`, extended to TyeApi in Phase 2 |
| `Checkpoint` / `Snapshot` / `Backup` | Git Desktop / API Tester / TyeRun | §1.8 / §1.3 / — | Kept separate; optionally share `tye-core-versioned-store` boilerplate only |
| `Workspace` (multi-repo group, F-012) | Git Desktop | §2, M1 | Renamed `RepoGroup` — unrelated to the `Project` rename above, kept as a distinct Git-only feature |

**Everything else — every FAT-REQ feature, every state machine, every UI component prop table, every error code, every SQL column not named `workspaces`/`environments` — carries over from the three source specs unchanged.** This document's job was narrower and more important than re-deriving 900+ features: make the three specs able to live in one repository, one binary when wanted, without their own architectures fighting each other.
-e 

<!-- ============================================================ -->
<!-- PART 2: TYEGIT — FULL MERGED SPECIFICATION -->
<!-- ============================================================ -->

# AI-AGENT-READY MASTER SPECIFICATION
## Git Desktop Application — Complete Technical Blueprint
**Version:** 1.0.0  
**Format:** Agent-Executable Specification (AES)  
**Total Features:** 340+  
**Milestones:** 8  
**Target Stack:** React + TypeScript + Tailwind (Frontend) | Rust + Tauri (Backend) | SQLite (Cache) | libgit2 (Git Engine)

---

## DOCUMENT STRUCTURE FOR AI AGENTS
Each section follows the **FAT-REQ** template:  
`Feature ID | User Story | Functional Requirements | Acceptance Criteria | Technical Spec | Data Model | UI/UX | Error Handling | Dependencies | Phase`

---

---

## ⚑ UNIFIED-SUITE PATCH NOTES (apply before implementing)
This is Tyegit's full original specification, merged into the tye platform per
`TYE_PLATFORM_UNIFIED_SPEC.md`. Three mechanical changes were applied throughout
this document; everything else below is verbatim from the original Git Desktop spec:

1. **AI commands renamed**: every `ai:*` IPC command below is now `git:ai_*`
   (was a bare, collision-prone namespace — see Master Spec Part E.1 / Audit B.2).
2. **SQLite tables prefixed**: `repositories`, `refs_cache`, `recent_commits_cache`,
   `file_status_cache`, `checkpoints`, `settings`, `hosting_accounts` are now
   `git_repositories`, `git_refs_cache`, etc. — this file lives in the shared
   `<project_root>/.tye/project.db`, not its own database (Master Spec Part C.3).
3. **`RepositoryHandle` (Section 1.1) attaches to `Project.git.repo`** instead of
   being its own root object — see Master Spec Part C.1. No fields changed.
4. **Directory layout relocated** under `apps/tyegit/` (Section 9.4) — see Master
   Spec Part D. No internal module structure changed.
5. **Credential Store, Event Bus, and AI Orchestration** (Layers 3/5/2 in Section
   0.1 below) are implemented once, in `tye-core-vault`, `tye-core-events`, and
   `tye-core-ai-gateway` respectively, and consumed here rather than re-implemented
   — see Master Spec Parts E, F, G. The behavioral contracts (checkpoint-before-
   mutation, AI read-only until approval, 300ms watcher debounce) are unchanged.

---

# SECTION 0: ARCHITECTURE BLUEPRINT

## 0.1 System Layers
```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: PRESENTATION (React 18 + TypeScript 5 + Tailwind)│
│  ├─ Component Library (shadcn/ui or Radix primitives)     │
│  ├─ State: Zustand (client) + TanStack Query (server)       │
│  ├─ Virtualization: react-window / tanstack-virtual         │
│  ├─ Graph Rendering: Canvas 2D / SVG / Pixi.js            │
│  └─ Diff Engine: WebAssembly (diff computation)             │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2: AI ORCHESTRATION (TypeScript + MCP Protocol)       │
│  ├─ MCP Client (Model Context Protocol)                     │
│  ├─ Tool Registry (read-only Git analysis tools)            │
│  ├─ LLM Gateway (OpenAI / Anthropic / Local)               │
│  ├─ Safety Layer (Approval required for mutations)         │
│  └─ Checkpoint Service (pre-operation snapshots)            │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3: APPLICATION SHELL (Tauri + Rust)                   │
│  ├─ Command Router (IPC handlers)                         │
│  ├─ Window Management                                       │
│  ├─ OS Integration (Notifications, Menu Bar, File Assoc)    │
│  ├─ Credential Store (Keychain/Keyring/Secret Service)      │
│  └─ File System Watcher (notify crate)                      │
├─────────────────────────────────────────────────────────────┤
│ LAYER 4: DOMAIN ENGINE (Rust)                               │
│  ├─ Repository Manager (multi-repo)                        │
│  ├─ Git Engine (git2 crate — libgit2 bindings)             │
│  ├─ Index/Worktree Service                                  │
│  ├─ Ref Manager (branches, tags, remotes)                   │
│  ├─ Object Store (caching layer)                            │
│  ├─ Diff/Patch Engine (similar/diffy crates)                │
│  ├─ Merge Engine (3-way merge, conflict detection)          │
│  ├─ Rebase Engine (interactive rebase state machine)        │
│  └─ Auth Manager (SSH, HTTPS, PAT)                          │
├─────────────────────────────────────────────────────────────┤
│ LAYER 5: INFRASTRUCTURE & CACHE (Rust + SQLite)             │
│  ├─ Repository Cache (SQLite: refs, status, metadata)       │
│  ├─ Config Cache (Git config snapshots)                     │
│  ├─ File Watcher (inotify/FSEvents/ReadDirectoryChanges)  │
│  ├─ Event Bus (tokio channels)                              │
│  └─ Background Scheduler (fetch, gc, health checks)          │
├─────────────────────────────────────────────────────────────┤
│ LAYER 6: NATIVE GIT BRIDGE (Optional Fallback)              │
│  ├─ Git Process Spawner (async subprocess)                  │
│  ├─ Output Parser (structured parsing)                      │
│  └─ Version Capability Detection                            │
└─────────────────────────────────────────────────────────────┘
```

## 0.2 Data Flow Architecture
```
User Action → React Component → Zustand Store → TanStack Query 
→ Tauri IPC Invoke → Rust Command Handler → Domain Service 
→ git2/libgit2 → Git Repository 
→ Event emitted → Frontend reactive update
```

## 0.3 Critical Constraints
- **Git2 (libgit2) is primary.** Shell-out to native Git is fallback only for unsupported operations.
- **All destructive operations require Checkpoint + Approval.**
- **File watcher must debounce (300ms) and batch events.**
- **Virtualization mandatory for lists > 100 items.**
- **All Git operations run on tokio threadpool, never block UI thread.**
- **AI layer has READ-ONLY access to repository. Mutations require human approval.**

---

# SECTION 1: CORE DATA MODELS & SCHEMAS

## 1.1 Repository Model (Rust)
```rust
struct RepositoryHandle {
    id: Uuid,                    // App-internal ID
    path: PathBuf,               // Absolute path to .git parent
    git_dir: PathBuf,          // Path to .git directory
    name: String,              // Directory name
    is_bare: bool,
    is_shallow: bool,
    head: Ref,                 // Current HEAD
    state: RepoState,          // Clean, Merge, Rebase, Revert, CherryPick, Bisect, Apply, RebaseInteractive, StashRebase
    remotes: Vec<Remote>,
    branches: Vec<Branch>,
    tags: Vec<Tag>,
    submodules: Vec<Submodule>,
    worktrees: Vec<Worktree>,
    stashes: Vec<Stash>,
    config: RepoConfig,
    last_fetched: Option<DateTime<Utc>>,
    health: RepoHealth,
}

enum RepoState {
    Clean,
    Merge,
    Rebase,
    Revert,
    CherryPick,
    Bisect,
    Apply,              // git am
    RebaseInteractive,
    StashRebase,
}

struct RepoHealth {
    is_valid: bool,
    corruption_detected: Option<String>,
    disk_usage_bytes: u64,
    object_count: usize,
    pack_file_count: usize,
    last_gc: Option<DateTime<Utc>>,
}
```

## 1.2 Commit Model
```rust
struct Commit {
    id: Oid,                   // 40-char SHA
    short_id: String,          // 7-char SHA
    message: String,
    message_subject: String,
    message_body: Option<String>,
    author: Signature,
    committer: Signature,
    parent_ids: Vec<Oid>,
    tree_id: Oid,
    timestamp: DateTime<Utc>,
    is_signed: bool,
    signature_valid: Option<bool>,
    tags: Vec<String>,
    branches: Vec<String>,
    refs: Vec<String>,
    files_changed: Option<usize>,
    insertions: Option<usize>,
    deletions: Option<usize>,
}

struct Signature {
    name: String,
    email: String,
    timestamp: DateTime<Utc>,
}
```

## 1.3 File Status Model
```rust
struct FileStatus {
    path: String,              // Relative path
    old_path: Option<String>, // For renames
    status: FileStatusEnum,
    staged_status: Option<FileStatusEnum>,
    unstaged_status: Option<FileStatusEnum>,
    submodule_status: Option<SubmoduleStatus>,
    is_binary: bool,
    size_bytes: u64,
    diff_stats: Option<DiffStats>,
}

enum FileStatusEnum {
    Unmodified,
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Unmerged,     // Conflict
    Untracked,
    Ignored,
}

struct DiffStats {
    insertions: usize,
    deletions: usize,
    files_changed: usize,
}
```

## 1.4 Branch Model
```rust
struct Branch {
    name: String,              // Short name (e.g., "main")
    full_name: String,         // refs/heads/main
    is_head: bool,
    is_remote: bool,
    upstream: Option<String>,
    upstream_remote: Option<String>,
    commits_ahead: i32,
    commits_behind: i32,
    last_commit: Option<CommitSummary>,
    is_protected: bool,
    is_merged: Option<bool>,   // Into default branch
}
```

## 1.5 Remote Model
```rust
struct Remote {
    name: String,
    url: Option<String>,
    push_url: Option<String>,
    fetch_refspecs: Vec<String>,
    push_refspecs: Vec<String>,
    is_connected: bool,
    last_fetch: Option<DateTime<Utc>>,
    head_oid: Option<Oid>,
}
```

## 1.6 Stash Model
```rust
struct Stash {
    index: usize,              // Stash@{n}
    message: String,
    commit_id: Oid,
    parent_ids: Vec<Oid>,
    timestamp: DateTime<Utc>,
    branch_name: Option<String>, // Where stash was created
    files: Vec<String>,
}
```

## 1.7 Conflict Model
```rust
struct ConflictFile {
    path: String,
    ancestor_id: Option<Oid>,  // Base
    our_id: Option<Oid>,         // HEAD
    their_id: Option<Oid>,       // Incoming
    our_label: String,
    their_label: String,
    is_binary: bool,
    resolution: ConflictResolution,
}

enum ConflictResolution {
    Unresolved,
    Ours,
    Theirs,
    Union,
    Manual,       // User edited
}
```

## 1.8 Checkpoint Model (Git Time Machine)
```rust
struct Checkpoint {
    id: Uuid,
    timestamp: DateTime<Utc>,
    operation: OperationType,
    repo_state_snapshot: RepoStateSnapshot,
    head_before: Oid,
    head_after: Option<Oid>,
    reflog_entry: Option<String>,
    can_rollback: bool,
    rollback_command: String,  // Human-readable
    ai_explanation: Option<String>,
}

struct RepoStateSnapshot {
    head: Ref,
    branch: String,
    dirty_files: Vec<FileStatus>,
    stash_index: Option<usize>,
    operation_state: Option<String>, // Rebase progress, merge state, etc.
}
```

## 1.9 SQLite Cache Schema
```sql
-- git_repositories
CREATE TABLE git_repositories (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    last_opened TIMESTAMP,
    is_pinned BOOLEAN DEFAULT 0,
    head_commit TEXT,
    head_branch TEXT,
    uncommitted_changes INTEGER DEFAULT 0,
    ahead_count INTEGER DEFAULT 0,
    behind_count INTEGER DEFAULT 0,
    last_fetched TIMESTAMP,
    health_status TEXT,
    disk_usage_bytes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- git_refs_cache
CREATE TABLE git_refs_cache (
    repo_id TEXT,
    ref_name TEXT,
    ref_type TEXT, -- branch, tag, remote
    target_oid TEXT,
    is_head BOOLEAN,
    upstream TEXT,
    ahead INTEGER,
    behind INTEGER,
    last_commit_message TEXT,
    last_commit_time TIMESTAMP,
    PRIMARY KEY (repo_id, ref_name)
);

-- git_recent_commits_cache
CREATE TABLE git_recent_commits_cache (
    repo_id TEXT,
    oid TEXT,
    short_oid TEXT,
    message_subject TEXT,
    author_name TEXT,
    author_email TEXT,
    author_time TIMESTAMP,
    parent_oids TEXT, -- JSON array
    tree_oid TEXT,
    insertions INTEGER,
    deletions INTEGER,
    files_changed INTEGER,
    PRIMARY KEY (repo_id, oid)
);

-- git_file_status_cache
CREATE TABLE git_file_status_cache (
    repo_id TEXT,
    path TEXT,
    status TEXT,
    staged_status TEXT,
    unstaged_status TEXT,
    is_binary BOOLEAN,
    size_bytes INTEGER,
    last_modified TIMESTAMP,
    PRIMARY KEY (repo_id, path)
);

-- git_checkpoints
CREATE TABLE git_checkpoints (
    id TEXT PRIMARY KEY,
    repo_id TEXT,
    operation_type TEXT,
    created_at TIMESTAMP,
    head_before TEXT,
    head_after TEXT,
    snapshot_json TEXT,
    can_rollback BOOLEAN,
    rollback_command TEXT,
    ai_explanation TEXT
);

-- git_settings
CREATE TABLE git_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    scope TEXT -- global, repo, user
);

-- git_hosting_accounts
CREATE TABLE git_hosting_accounts (
    id TEXT PRIMARY KEY,
    provider TEXT, -- github, gitlab, bitbucket, azure
    username TEXT,
    token_encrypted BLOB,
    ssh_key_path TEXT,
    is_active BOOLEAN,
    last_synced TIMESTAMP
);
```

---

# SECTION 2: FEATURE SPECIFICATIONS (Complete FAT-REQ)

---

## MILESTONE 1: Repository & Configuration Engine
**Goal:** App can discover, open, and manage repositories. Configuration is fully editable. Foundation is solid.

---

### F-001: Git Installation Detection
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want the app to detect if Git is installed so it can function properly.

**Functional Requirements:**
1. On startup, check system PATH for `git` executable.
2. If found, execute `git --version` and parse version string (e.g., "git version 2.42.0").
3. Store version in app state. Minimum supported: 2.20.0.
4. If not found, display installation prompt with links to download Git.
5. Support portable Git detection (Windows).
6. Support custom Git path configuration.

**Acceptance Criteria:**
- [ ] AC1: App starts within 2 seconds even if Git detection takes longer (async).
- [ ] AC2: If Git >= 2.20.0, app proceeds to home screen.
- [ ] AC3: If Git missing, modal blocks usage with clear install instructions per OS.
- [ ] AC4: Version is displayed in Settings > About.
- [ ] AC5: Custom Git path can be set and persists across restarts.

**Technical Spec:**
- Rust: Use `which` crate or `std::env::var("PATH")` traversal.
- Spawn `git --version` via `tokio::process::Command`.
- Cache result in SQLite settings table.

**Data Model:** `GitInstallation { path: PathBuf, version: String, is_portable: bool }`

**UI/UX:** Splash screen → Detection spinner → Success/Failure modal.

**Error Handling:** 
- Git found but permission denied → Log warning, try alternate locations.
- Git version parse failure → Treat as unknown, warn but allow usage.

**Dependencies:** None (first feature).

---

### F-002: System Git Configuration Reader
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to see system-level Git configuration so I understand the environment.

**Functional Requirements:**
1. Execute `git config --system --list` on startup.
2. Parse key-value pairs into structured map.
3. Display in Settings > Git > System tab.
4. Highlight critical keys: core.editor, http.sslVerify, http.proxy, credential.helper.
5. Read-only display for system config (requires admin to edit).

**Acceptance Criteria:**
- [ ] AC1: System config loads within 500ms.
- [ ] AC2: All key-value pairs displayed in sortable table.
- [ ] AC3: Critical keys visually highlighted.
- [ ] AC4: If system config file doesn't exist, show empty state with explanation.

**Technical Spec:**
- Rust: `git2::Config::open_default()` then `config.entries()` with `ConfigLevel::System` filter.
- Or fallback to `git config --system --list -z` parsing.

**Data Model:** `GitConfigEntry { level: ConfigLevel, key: String, value: String }`

**UI/UX:** Settings panel with tabs: System | Global | Local | SSH.

**Error Handling:**
- Permission denied reading system config → Graceful degradation, show warning banner.

**Dependencies:** F-001.

---

### F-003: Global Git Configuration Manager
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to view and edit my global Git configuration (name, email, aliases, etc.).

**Functional Requirements:**
1. Read `~/.gitconfig` (or `%USERPROFILE%\.gitconfig`).
2. Display all sections: user, core, alias, init, pull, push, merge, diff, etc.
3. Allow editing of common fields via form UI: user.name, user.email, init.defaultBranch, pull.rebase, core.editor.
4. Allow raw text editing for advanced users.
5. Validate email format for user.email.
6. Support adding/removing aliases with command preview.
7. Changes written immediately to global config file.

**Acceptance Criteria:**
- [ ] AC1: All global config keys visible within 300ms of opening settings.
- [ ] AC2: Editing user.name updates `~/.gitconfig` and reflects in new commits immediately.
- [ ] AC3: Invalid email shows inline error and prevents save.
- [ ] AC4: Alias editor shows shortcut + command, allows delete.
- [ ] AC5: Raw editor has syntax highlighting for ini format.

**Technical Spec:**
- Rust: `git2::Config::open_default()` → `entries()` filtered by `ConfigLevel::Global`.
- Write via `git2::Config::set_str()` or direct file I/O with backup.
- Backup `.gitconfig` to `.gitconfig.backup` before write.

**Data Model:** `GitConfig { level: Global, entries: Vec<ConfigEntry> }`

**UI/UX:** Form fields for common settings + Monaco/raw editor for advanced. Save/Cancel buttons.

**Error Handling:**
- Write fails (disk full, permissions) → Restore from backup, show error.
- Parse error in existing config → Open raw editor with error annotation.

**Dependencies:** F-002.

---

### F-004: Local Git Configuration Editor
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to edit repository-specific Git configuration.

**Functional Requirements:**
1. Read `.git/config` for currently open repository.
2. Same UI as global config but scoped to repository.
3. Show inherited values (global/system) as read-only reference.
4. Support remote URL editing.
5. Support branch upstream tracking configuration.
6. Support core.worktree if applicable.

**Acceptance Criteria:**
- [ ] AC1: Local config tab only visible when repository is open.
- [ ] AC2: Remote URLs editable with validation (valid URL format).
- [ ] AC3: Branch upstream dropdown shows available remotes/branches.
- [ ] AC4: Inherited values shown in muted color with source label.

**Technical Spec:**
- Rust: `repo.config()` → `git2::Config` scoped to `ConfigLevel::Local`.
- Remote URL update: `repo.remote_set_url()`.

**Data Model:** Same as F-003 with `repo_id` context.

**UI/UX:** Tabbed interface within repo settings. Inheritance indicator.

**Error Handling:**
- Repo not open → Disable tab with tooltip.
- Corrupt local config → Offer to reset to default.

**Dependencies:** F-003, F-010 (Open Repository).

---

### F-005: SSH Key Discovery & Management
**Phase:** M1 | **Priority:** P1  
**User Story:** As a user, I want the app to discover my SSH keys and validate them.

**Functional Requirements:**
1. Scan `~/.ssh/` for common key files: `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`.
2. Detect public/private key pairs.
3. Read `.ssh/config` if exists and parse Host entries.
4. Validate key format (PEM headers, OpenSSH format).
5. Check key permissions (should be 600 for private).
6. Display key fingerprint (`ssh-keygen -lf` equivalent).
7. Warn about weak keys (RSA < 2048, DSA).
8. Allow generating new Ed25519 key pair with passphrase option.

**Acceptance Criteria:**
- [ ] AC1: SSH keys detected within 1 second of opening SSH tab.
- [ ] AC2: Each key shows type, size, fingerprint, creation date, permission status.
- [ ] AC3: Weak keys highlighted with warning icon.
- [ ] AC4: Generate key button creates Ed25519 key in `~/.ssh/`.
- [ ] AC5: `.ssh/config` parsed and displayed as table.

**Technical Spec:**
- Rust: Directory read + regex parsing for PEM headers.
- Fingerprint: Use `ssh-keygen` subprocess or pure Rust SSH key parser.
- Generation: Spawn `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_app`.

**Data Model:** `SshKey { path: PathBuf, public_path: PathBuf, key_type: String, fingerprint: String, size_bits: usize, permissions: u32, is_valid: bool }`

**UI/UX:** Settings > SSH. Card-based layout per key. Color-coded security status.

**Error Handling:**
- `.ssh` directory missing → Show empty state with "Generate First Key" CTA.
- Permission denied → Show sudo/elevated prompt.

**Dependencies:** F-002.

---

### F-006: Home Screen Dashboard
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want a central dashboard showing my repositories and their status at a glance.

**Functional Requirements:**
1. Display grid/list of repositories with cards.
2. Each card shows: repo name, current branch, last commit message, uncommitted changes count, ahead/behind remote.
3. Show "Open Recent" section (last 10 opened repos).
4. Show "Pinned" section (user-starred repos).
5. "Clone New Repository" button (prominent).
6. "Open Existing Repository" button.
7. "Create New Repository" button.
8. Search/filter repositories by name or path.
9. Empty state for first-time users with tutorial CTA.
10. AI summary panel: "You have 3 repos with uncommitted changes. Repo X is 5 commits behind origin."

**Acceptance Criteria:**
- [ ] AC1: Dashboard loads within 1 second showing cached data.
- [ ] AC2: Background refresh updates status badges without blocking UI.
- [ ] AC3: Pin/unpin action immediate with animation.
- [ ] AC4: Search filters in real-time (< 50ms for 100 repos).
- [ ] AC5: Empty state shows "Clone your first repo" with URL input.

**Technical Spec:**
- React: Grid layout with `react-window` for >20 repos.
- Rust: On app start, read SQLite `repositories` table for cached state. Background thread refreshes each repo's HEAD and status.
- IPC: `get_dashboard_data()` → returns `Vec<RepoCard>`.

**Data Model:** `RepoCard { id, name, path, branch, last_commit_subject, uncommitted_count, ahead, behind, is_pinned, last_opened, health_status }`

**UI/UX:** Responsive grid (3 cols large, 2 medium, 1 small). Cards with color-coded status badges. Sticky search bar.

**Error Handling:**
- Repo moved/deleted since last open → Show "Path not found" badge, offer to locate.
- Repo corrupted → Show warning icon, offer recovery.

**Dependencies:** F-001, F-010, SQLite schema.

---

### F-007: Repository Auto-Discovery
**Phase:** M1 | **Priority:** P1  
**User Story:** As a user, I want the app to find Git repositories on my machine automatically.

**Functional Requirements:**
1. Scan common directories on first launch: `~/Projects`, `~/Documents`, `~/Code`, `~/dev`, `~/workspace`, `~/repos`.
2. Recursively find `.git` directories (max depth: 4 levels).
3. Detect nested repositories (submodules, monorepos).
4. Add discovered repos to dashboard with "New" badge.
5. Allow user to exclude paths (e.g., `node_modules`, `.cargo`).
6. Optional: Watch filesystem for new `.git` directories and auto-add.
7. Show discovery progress with cancel option.

**Acceptance Criteria:**
- [ ] AC1: Discovery completes within 10 seconds for 100 repos.
- [ ] AC2: Nested repos detected and shown as related group.
- [ ] AC3: User can exclude directories from discovery.
- [ ] AC4: Auto-discovered repos marked with sparkle icon until visited.
- [ ] AC5: Cancel button stops scan immediately.

**Technical Spec:**
- Rust: `WalkDir` or `jwalk` for parallel directory traversal. Look for `.git/HEAD`.
- Filter: Skip dirs matching exclude patterns.
- Background: Run in `tokio::task::spawn_blocking`.

**Data Model:** Updates `repositories` table with `auto_discovered: true`.

**UI/UX:** Settings > Discovery. Toggle auto-discovery. Exclude list editor. Progress modal on first launch.

**Error Handling:**
- Permission denied on directory → Skip silently, log to debug console.
- Circular symlinks → Detect and break (max depth).

**Dependencies:** F-006.

---

### F-008: Initialize New Repository
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to create a new Git repository with optional templates.

**Functional Requirements:**
1. Dialog: Select directory (create if doesn't exist).
2. Option to initialize with `README.md`.
3. Option to select `.gitignore` template (language/framework list: Node, Python, Rust, Go, Java, etc.).
4. Option to select license (MIT, Apache-2.0, GPL-3.0, etc.) with author name auto-filled from global config.
5. Option to set initial branch name (default from global config).
6. Execute `git init`.
7. Create selected files.
8. Stage and initial commit with message "Initial commit".
9. Open repository in app immediately.

**Acceptance Criteria:**
- [ ] AC1: Repo initialized and opened within 2 seconds.
- [ ] AC2: README.md created if selected.
- [ ] AC3: `.gitignore` populated with correct template.
- [ ] AC4: License file contains correct text and copyright year/name.
- [ ] AC5: Initial commit visible in history immediately.

**Technical Spec:**
- Rust: `git2::Repository::init(path)`.
- Templates: Bundle `.gitignore` templates from GitHub's gitignore repo (cached).
- Licenses: Bundle SPDX license texts.
- Initial commit: `git2::Signature::now()`, `git2::Repository::commit()`.

**Data Model:** Creates new `RepositoryHandle`, inserts into SQLite.

**UI/UX:** Modal with steps: Directory → Templates → Review → Create. Progress indicator.

**Error Handling:**
- Directory already a Git repo → Offer to open instead.
- Directory not empty → Warn about existing files, allow continue.
- Disk full → Show error, clean up partial init.

**Dependencies:** F-001, F-003.

---

### F-009: Clone Repository
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to clone a remote repository with advanced options.

**Functional Requirements:**
1. Input: Repository URL (HTTPS, SSH, Git protocol) or GitHub/GitLab shorthand (`owner/repo`).
2. Input: Local destination path (with default suggestion).
3. Options:
   - Recursive submodules (`--recurse-submodules`)
   - Shallow clone (`--depth N` with input)
   - Single branch (`--single-branch`)
   - Branch name to checkout (`-b`)
   - Sparse checkout (enable + patterns)
   - LFS enabled
4. Authentication: Use stored credentials or prompt.
5. Real-time progress display: receiving objects, resolving deltas, checking out files.
6. Cancelable operation.
7. Open repository automatically after clone.
8. Add to recent repositories.

**Acceptance Criteria:**
- [ ] AC1: Clone progress updates every 100ms with accurate percentage.
- [ ] AC2: SSH/HTTPS auth prompts appear seamlessly (no terminal).
- [ ] AC3: Shallow clone option creates repo with truncated history.
- [ ] AC4: Submodule init runs automatically if option selected.
- [ ] AC5: Cancel stops clone and cleans up partial directory.

**Technical Spec:**
- Rust: `git2::build::RepoBuilder` with callbacks.
- Progress: `RemoteCallbacks::transfer_progress()` emits Tauri events.
- Auth: `RemoteCallbacks::credentials()` → checks SSH agent, then keychain, then prompts.
- Shallow: `RepoBuilder::clone_local()` doesn't support shallow; use `git clone` subprocess for shallow, then open with git2.

**Data Model:** `CloneOptions { url, path, depth, single_branch, branch, recurse_submodules, lfs, sparse_checkout }`

**UI/UX:** Modal with URL input (validates format), destination picker, advanced options accordion, progress bar with stage labels.

**Error Handling:**
- Auth failure → Prompt for credentials, 3 retries, then fail.
- Network timeout → Retry with exponential backoff (3 attempts).
- Destination exists and not empty → Warning with overwrite option.
- URL not found → 404 error with suggestion to check URL.

**Dependencies:** F-001, F-005, F-010.

---

### F-010: Open Repository
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to open an existing local Git repository.

**Functional Requirements:**
1. File picker dialog (directory selection).
2. Validate directory contains valid `.git` (or is bare repo).
3. If valid, load repository into app state.
4. If invalid, show error with explanation.
5. Add to recent repositories list (max 50, LRU eviction).
6. Persist open repo path for session restore.
7. Load cached state from SQLite first, then background refresh.
8. Update window title to "RepoName — BranchName — AppName".

**Acceptance Criteria:**
- [ ] AC1: Valid repo opens within 1 second (cached) / 3 seconds (cold).
- [ ] AC2: Invalid directory shows "Not a Git repository" error.
- [ ] AC3: Recent list updated immediately.
- [ ] AC4: Window title reflects repo and branch.
- [ ] AC5: Previous session's open repos restored on relaunch.

**Technical Spec:**
- Rust: `git2::Repository::open(path)`.
- Validation: Check `.git/HEAD` exists and is readable.
- Cache: Read from SQLite `repositories` table; if missing, insert.
- Session: Store `last_opened_repos` in app config.

**Data Model:** `OpenRepoRequest { path: PathBuf }` → `RepositoryHandle`

**UI/UX:** File picker + drag-and-drop directory onto app window. Recent list in sidebar.

**Error Handling:**
- `.git` corrupted → Offer to run `git fsck` or recovery center.
- Permission denied → Elevated permission prompt.
- Submodule repo opened independently → Handle gracefully.

**Dependencies:** F-001, SQLite schema.

---

### F-011: Repository Health Monitor
**Phase:** M1 | **Priority:** P1  
**User Story:** As a user, I want to know if my repository has integrity issues.

**Functional Requirements:**
1. Background health check on repo open: verify HEAD, index, refs, object database.
2. Detect dangling objects, broken refs, corrupted objects.
3. Display health status in repo card (green/yellow/red).
4. Health dashboard showing: object count, pack files, disk usage, last GC.
5. One-click "Run Health Check" button.
6. Detect large files not tracked by LFS (if `.gitattributes` has LFS patterns).

**Acceptance Criteria:**
- [ ] AC1: Health check runs in background without blocking UI.
- [ ] AC2: Corruption detected shows red banner with "Repair" button.
- [ ] AC3: Dashboard shows accurate disk usage (human-readable).
- [ ] AC4: Large file warning shows list of files exceeding threshold.

**Technical Spec:**
- Rust: `git2::Repository::odb()` → iterate objects. Check ref validity.
- Disk usage: `du` equivalent (recursive directory size).
- LFS check: Parse `.gitattributes`, check file sizes against `filter=lfs` patterns.

**Data Model:** `RepoHealth { is_valid, corruption_details, disk_usage, object_count, pack_count, large_files }`

**UI/UX:** Status bar indicator. Settings > Repository > Health tab.

**Error Handling:**
- Health check timeout → Show "Check timed out" with retry.

**Dependencies:** F-010.

---

### F-012: Multi-Repository Group
**Phase:** M1 | **Priority:** P2  
**User Story:** As a user working with microservices/monorepos, I want to manage multiple repositories in one view.

**Functional Requirements:**
1. Create named repo groups (e.g., "Work Projects", "Personal").
2. Add/remove repositories to repo group.
3. Repo group dashboard showing aggregated status:
   - Total uncommitted changes across all repos
   - Repos needing push/pull
   - Recent activity timeline
4. Bulk operations: Fetch all, Pull all, Stash all.
5. Per-repo quick actions from repo group view.
6. Import/export repo group configuration (JSON).

**Acceptance Criteria:**
- [ ] AC1: RepoGroup creation takes < 1 second.
- [ ] AC2: Dashboard shows real-time aggregated counts.
- [ ] AC3: Bulk fetch runs in parallel with per-repo progress.
- [ ] AC4: RepoGroup config export produces valid JSON.

**Technical Spec:**
- SQLite: `git_repo_groups` table, `git_repo_group_members` junction table.
- Background: Parallel `fetch` across repos using `tokio::join_all`.

**Data Model:** `RepoGroup { id, name, repos: Vec<RepoHandle>, aggregate_status }`

**UI/UX:** Sidebar repo group switcher. Grid view with mini status cards.

**Error Handling:**
- One repo fails in bulk op → Continue others, show per-repo error.

**Dependencies:** F-006, F-010.

---

## MILESTONE 2: Status, Staging, Diffs, Commits
**Goal:** User can see repository status, stage changes precisely, view diffs, and commit.

---

### F-013: Real-Time Status Engine
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to see which files are modified, staged, or untracked in real-time.

**Functional Requirements:**
1. Execute `git status --porcelain=v2` on repo open and after every operation.
2. File watcher (`notify` crate) monitors working directory.
3. Debounce file system events (300ms) and batch updates.
4. Categorize files into sections:
   - Staged changes
   - Unstaged changes (Modified)
   - Untracked files
   - Ignored files (toggle visibility)
   - Conflicted files (if merge/rebase in progress)
5. Show counts per section.
6. Submodule status included (dirty, new commits).
7. Binary file detection.
8. Show total line statistics (insertions/deletions) for unstaged/staged.

**Acceptance Criteria:**
- [ ] AC1: Status updates within 500ms of file save.
- [ ] AC2: File watcher detects new files, deletions, renames.
- [ ] AC3: Submodule shows "dirty" or "+3/-2" commit difference.
- [ ] AC4: Binary files marked with icon, no diff preview.
- [ ] AC5: Status accurate after branch switch, merge, rebase.

**Technical Spec:**
- Rust: `git2::StatusOptions` with `INCLUDE_UNTRACKED | RENAMES_HEAD_TO_INDEX | RENAMES_INDEX_TO_WORKING_DIR`.
- File watcher: `notify::RecommendedWatcher` with `tokio::sync::mpsc` channel.
- Debounce: `tokio::time::timeout(300ms)` on watcher channel.
- Cache: Update SQLite `file_status_cache`.

**Data Model:** `StatusResult { staged: Vec<FileStatus>, unstaged: Vec<FileStatus>, untracked: Vec<FileStatus>, ignored: Vec<FileStatus>, conflicted: Vec<FileStatus>, submodule_summary: SubmoduleSummary }`

**UI/UX:** Sidebar panel with collapsible sections. File tree with icons (M, A, D, R, C, U, ?). Color coding: green=staged, yellow=modified, red=deleted, gray=untracked.

**Error Handling:**
- Index locked → Queue refresh, retry in 1 second.
- Repository in "bare" state → Show appropriate message.

**Dependencies:** F-010.

---

### F-014: File Status Detail View
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to click a file and see exactly what changed.

**Functional Requirements:**
1. Clicking file in status panel opens diff view.
2. Show file path, change type (modified/added/deleted/renamed), size delta.
3. For renamed files: show old path and similarity percentage.
4. For conflicted files: show conflict markers count, offer "Resolve" button.
5. Submodule: show commit pointer change (old → new).
6. Action buttons per file: Stage, Unstage, Discard, Ignore, Open in Editor.

**Acceptance Criteria:**
- [ ] AC1: Diff loads within 200ms for files < 100KB.
- [ ] AC2: Renamed file shows "→" arrow with old name tooltip.
- [ ] AC3: Conflict file shows "⚠️ X conflicts" badge.
- [ ] AC4: Submodule diff shows commit hashes (short).
- [ ] AC5: Action buttons contextually relevant (no "Stage" for already-staged).

**Technical Spec:**
- Rust: `git2::Diff::tree_to_workdir_with_index()` or `tree_to_index()` depending on staged/unstaged.
- File actions: Direct git2 calls (index.add_path, index.remove_path, checkout_head for discard).

**UI/UX:** Split pane: file list left, diff/detail right. Sticky file header with actions.

**Error Handling:**
- File deleted externally → Refresh status, show "File not found".
- Discard fails (permissions) → Show OS error.

**Dependencies:** F-013.

---

### F-015: Staging — File Level
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to stage entire files for commit.

**Functional Requirements:**
1. Stage single file: click "+" icon or checkbox.
2. Unstage single file: click "-" icon.
3. Stage all unstaged files: "Stage All" button.
4. Unstage all staged files: "Unstage All" button.
5. Stage selected multiple files (Ctrl/Cmd+click, Shift+click).
6. Visual feedback: staged files move to "Staged" section immediately.

**Acceptance Criteria:**
- [ ] AC1: Stage action completes in < 100ms.
- [ ] AC2: File visually moves from Unstaged to Staged section.
- [ ] AC3: Multi-select stages all selected files.
- [ ] AC4: Stage All button disabled if no unstaged files.

**Technical Spec:**
- Rust: `git2::Index::add_path()` / `remove_path()`.
- Batch: Iterate selection, call add_path for each, then `index.write()`.
- Event: Emit `status_changed` after write.

**Data Model:** N/A (mutates git index directly).

**UI/UX:** Checkbox per file. "Stage All" / "Unstage All" buttons at section headers. Drag and drop between sections.

**Error Handling:**
- Index locked → Retry with backoff, show spinner.
- File too large → Warn but allow.

**Dependencies:** F-013.

---

### F-016: Staging — Hunk Level
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to stage specific hunks (blocks) of changes within a file.

**Functional Requirements:**
1. In diff view, display changes as hunks with headers (`@@ -l,s +l,s @@`).
2. Each hunk has "Stage Hunk" / "Unstage Hunk" button.
3. Clicking stages only that hunk's lines to index.
4. Works for unstaged → staged (stage hunk) and staged → unstaged (unstage hunk).
5. Hunk boundaries computed by unified diff algorithm.

**Acceptance Criteria:**
- [ ] AC1: Hunk buttons visible on hover/focus.
- [ ] AC2: Staging hunk updates index without affecting other hunks.
- [ ] AC3: File appears in both staged and unstaged if partially staged.
- [ ] AC4: Hunk staging works for additions, deletions, and context changes.

**Technical Spec:**
- Rust: Use `git2::Diff` to get hunks. For staging partial content, use `git apply --cached` equivalent or libgit2 patch application.
- Implementation: Generate patch from hunk, apply to index via `git2::Index::apply_patch()` (if available) or shell `git apply --cached`.
- Alternative: Use `git2::Patch` and manual index manipulation.

**Data Model:** `Hunk { old_start, old_lines, new_start, new_lines, header: String, lines: Vec<DiffLine> }`

**UI/UX:** Diff view with hunk headers as collapsible boundaries. Buttons float right on hunk header.

**Error Handling:**
- Hunk doesn't apply cleanly → Show error, suggest staging whole file.
- Binary file → Disable hunk staging, show "Binary file" message.

**Dependencies:** F-014, F-015.

---

### F-017: Staging — Line Level
**Phase:** M2 | **Priority:** P1  
**User Story:** As a user, I want to stage individual lines for the most granular control.

**Functional Requirements:**
1. In diff view, allow selecting individual lines (click or Cmd+click).
2. "Stage Selected Lines" button appears when selection > 0.
3. Selected lines staged as new patch.
4. Support selecting non-contiguous lines.
5. Visual highlight of selected lines.

**Acceptance Criteria:**
- [ ] AC1: Line selection works with click and Cmd/Ctrl+click.
- [ ] AC2: Stage Selected Lines button enabled only when valid selection exists.
- [ ] AC3: Only selected lines appear in staged diff; others remain unstaged.
- [ ] AC4: Works for both additions and deletions.

**Technical Spec:**
- Frontend: Track selected line numbers in React state.
- Rust: Construct custom patch from selected lines. Use `git apply --cached` with generated patch.
- Challenge: Must reconstruct valid unified diff context lines (3 lines before/after).

**Data Model:** `LineSelection { file_path, hunk_index, line_indices: Vec<usize> }`

**UI/UX:** Diff lines have subtle hover highlight. Selected lines get blue background. Floating action bar appears on selection.

**Error Handling:**
- Insufficient context lines → Warn user, auto-include necessary context.
- Invalid selection (e.g., only context lines) → Disable button with tooltip.

**Dependencies:** F-016.

---

### F-018: Discard Changes
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to discard changes to restore files to their last committed state.

**Functional Requirements:**
1. Discard single file: restore to HEAD (unstaged) or remove from index (staged).
2. Discard all unstaged changes: confirmation dialog required.
3. Discard hunk: restore specific hunk to HEAD.
4. Discard line: restore specific lines to HEAD.
5. For untracked files: move to trash (OS) or permanently delete (configurable).
6. Confirmation dialog shows what will be lost (file list, line counts).
7. Undo option available immediately after discard (via checkpoint).

**Acceptance Criteria:**
- [ ] AC1: Discard single file shows confirmation only if configured.
- [ ] AC2: Discard all shows modal with file list and "This cannot be undone" warning.
- [ ] AC3: Untracked files moved to system trash by default.
- [ ] AC4: Undo button appears in toast notification for 10 seconds.
- [ ] AC5: Discard respects `.gitignore` (won't restore ignored files).

**Technical Spec:**
- Rust: `git2::CheckoutBuilder` with `path` filter for single file. `git2::Repository::checkout_head()` for all.
- Untracked to trash: Use `trash` crate (cross-platform).
- Checkpoint: Create `Checkpoint` before discard.

**Data Model:** N/A.

**UI/UX:** Right-click context menu: "Discard Changes...". Modal with red header. Undo toast.

**Error Handling:**
- File modified externally after discard start → Skip file, show warning.
- Permission denied → Show OS error, suggest elevated permissions.

**Dependencies:** F-015, Checkpoint system (F-200+).

---

### F-019: Diff Viewer — Unified View
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to view code differences in standard unified diff format.

**Functional Requirements:**
1. Display diff with standard `@@` hunk headers.
2. Color coding: green background for additions, red for deletions, neutral for context.
3. Syntax highlighting for all major languages (tree-sitter or Prism.js).
4. Line numbers: old file (left) and new file (right) shown in gutter.
5. Navigate between hunks with keyboard (Alt/Opt+Up/Down) or buttons.
6. Word-level diff highlighting within changed lines.
7. Show whitespace characters toggle (spaces as ·, tabs as →).
8. Hide whitespace changes toggle (`git diff -w` equivalent).
9. Side-by-side toggle (see F-020).
10. Copy diff text button.

**Acceptance Criteria:**
- [ ] AC1: Diff renders for files up to 1MB without crashing (virtualized).
- [ ] AC2: Syntax highlighting accurate for 20+ languages.
- [ ] AC3: Word diff highlights changed words within lines.
- [ ] AC4: Hide whitespace toggle recomputes diff instantly.
- [ ] AC5: Keyboard navigation cycles through all hunks.

**Technical Spec:**
- Frontend: Monaco Editor (read-only diff mode) or custom Canvas/SVG diff renderer.
- Rust: `git2::Diff::foreach()` to generate structured diff. Return `DiffHunk[]` via IPC.
- Syntax highlighting: `tree-sitter` WASM bindings or `shiki` (VS Code themes).
- Word diff: `diff` algorithm on line content ( Myers diff on characters).

**Data Model:** `DiffView { hunks: Vec<DiffHunk>, old_file: FileInfo, new_file: FileInfo, is_binary: bool }`

**UI/UX:** Full-width diff panel. Sticky header with file path, mode toggle, whitespace toggle. Minimap optional.

**Error Handling:**
- Binary file → Show "Binary file differ" with size info.
- Image file → Show image diff viewer (F-021).
- Very large file (> 1MB) → Show first 1000 lines with "Load more".

**Dependencies:** F-014.

---

### F-020: Diff Viewer — Side-by-Side (Split) View
**Phase:** M2 | **Priority:** P1  
**User Story:** As a user, I want to compare old and new versions side by side for easier reading.

**Functional Requirements:**
1. Toggle between unified and side-by-side modes.
2. Left pane: old file content (deletions highlighted).
3. Right pane: new file content (additions highlighted).
4. Synchronized scrolling between panes.
5. Align matching lines across panes.
6. Show line numbers in both panes.
7. Syntax highlighting in both panes.
8. Inline change highlighting within modified lines.

**Acceptance Criteria:**
- [ ] AC1: Toggle switch between unified/split persists per session.
- [ ] AC2: Scroll one pane, other follows to matching line.
- [ ] AC3: Added lines on right have no corresponding line on left (blank placeholder).
- [ ] AC4: Deleted lines on left have no corresponding line on right.

**Technical Spec:**
- Frontend: Two synchronized Monaco Editor instances or custom split view.
- Alignment: Use diff algorithm to map line indices between versions.

**Data Model:** Same as F-019 with `view_mode: Unified | Split`.

**UI/UX:** Toggle button in diff header. Resizable panes (drag splitter).

**Error Handling:**
- Same as F-019.

**Dependencies:** F-019.

---

### F-021: Image Diff Viewer
**Phase:** M2 | **Priority:** P2  
**User Story:** As a user, I want to visually compare changed images.

**Functional Requirements:**
1. Detect image files by extension (png, jpg, gif, svg, webp, bmp, ico).
2. Show before/after with modes:
   - Side-by-side
   - Swipe (drag divider)
   - Onion skin (opacity slider)
   - Difference mask (highlight changed pixels)
   - Blink (flip between images)
3. Show image metadata (dimensions, file size, format).
4. Zoom and pan both images.
5. For SVG: show text diff fallback option.

**Acceptance Criteria:**
- [ ] AC1: Image diff opens within 1 second for images < 5MB.
- [ ] AC2: All 5 comparison modes functional.
- [ ] AC3: Swipe mode has smooth draggable divider.
- [ ] AC4: Metadata accurate (width x height, format).

**Technical Spec:**
- Frontend: HTML5 Canvas or WebGL for image manipulation. Use `pixelmatch` or custom shader for difference mode.
- Rust: Read file blobs via `git2::Blob`, stream to frontend as base64.

**Data Model:** `ImageDiff { old_data: Base64, new_data: Base64, width: u32, height: u32, format: String }`

**UI/UX:** Full-panel image viewer. Mode selector tabs. Zoom controls (fit, 100%, 200%).

**Error Handling:**
- Corrupted image → Show "Cannot preview" with hex dump option.
- Very large image (> 10MB) → Show thumbnail with "Open externally" button.

**Dependencies:** F-019.

---

### F-022: Commit Panel
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to write commit messages and create commits.

**Functional Requirements:**
1. Text area for commit message (subject + body).
2. Subject line character counter (50 soft limit, 72 hard limit indicator).
3. Commit message history dropdown (reuse previous messages).
4. Commit message template support (load from `.gitmessage` or config).
5. Co-author input (trailer syntax: `Co-authored-by: Name <email>`).
6. Sign-off toggle (`Signed-off-by:`).
7. GPG/SSH sign toggle.
8. Amend last commit toggle.
9. Commit type selector: Normal, Fixup, Squash (for rebase).
10. Preview panel showing: staged files list, diff summary, stats.
11. "Commit" button (disabled if no staged changes and not amending).
12. "Commit and Push" button (optional, configurable).

**Acceptance Criteria:**
- [ ] AC1: Commit created with correct message and author.
- [ ] AC2: Subject line shows orange at 50 chars, red at 72.
- [ ] AC3: Amend updates last commit without creating new one.
- [ ] AC4: Sign-off trailer appended correctly.
- [ ] AC5: Preview shows accurate file count and diff stats.

**Technical Spec:**
- Rust: `git2::Repository::signature()` for author/committer. `git2::Repository::commit()` for normal commit. `git2::Repository::amend()` for amend.
- GPG sign: Use `git2::Repository::commit_signed()` or configure `gpg.format` and `user.signingkey`.
- Fixup/Squash: Create commit with `fixup!` or `squash!` prefix.

**Data Model:** `CommitRequest { message: String, body: Option<String>, amend: bool, sign: bool, signoff: bool, co_authors: Vec<String>, commit_type: CommitType }`

**UI/UX:** Bottom panel (resizable). Text area with placeholder. Subject/body separator. Toggles as checkboxes. Preview in side panel.

**Error Handling:**
- Empty message → Disable commit button, show error.
- No staged changes → Disable commit (unless amend).
- GPG sign fails → Show error with key info.
- Hook fails → Show hook output, allow "Commit anyway" or fix.

**Dependencies:** F-013, F-015.

---

### F-023: Pre-commit Hook Execution
**Phase:** M2 | **Priority:** P1  
**User Story:** As a user, I want to see pre-commit hook output and choose how to proceed.

**Functional Requirements:**
1. Before commit, detect if `.git/hooks/pre-commit` exists and is executable.
2. If exists, execute hook with working directory set to repo root.
3. Stream hook stdout/stderr to UI panel in real-time.
4. If hook exits 0: proceed with commit.
5. If hook exits non-zero: block commit, show error output.
6. "Commit anyway" button ( bypasses hook, equivalent to `--no-verify`).
7. "No-verify" checkbox to skip hooks for this commit.
8. Support all client-side hooks: pre-commit, prepare-commit-msg, commit-msg.

**Acceptance Criteria:**
- [ ] AC1: Hook output streams within 100ms of execution.
- [ ] AC2: Failed hook shows red output panel with exit code.
- [ ] AC3: Commit anyway button clearly warns about bypassing checks.
- [ ] AC4: No-verify checkbox state resets after commit.

**Technical Spec:**
- Rust: Execute hook via `std::process::Command` with current working dir = repo path. Capture stdout/stderr via pipes.
- Stream: Use `tokio::io::AsyncBufRead` lines, emit Tauri events per line.

**Data Model:** `HookResult { hook_name, exit_code, stdout: String, stderr: String, duration_ms: u64, succeeded: bool }`

**UI/UX:** Expandable "Hooks" panel in commit area. Output styled as terminal (ANSI color support via `ansi-to-html`).

**Error Handling:**
- Hook not executable → Show warning, skip.
- Hook timeout (30s) → Kill process, show timeout error.
- Hook script error (shebang missing) → Show error with suggestion.

**Dependencies:** F-022.

---

### F-024: Commit History List
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to see a list of commits in the current branch.

**Functional Requirements:**
1. Display commits in reverse chronological order.
2. Columns: Short hash, Subject, Author, Date (relative/absolute toggle).
3. Show branch/tag labels inline with commits.
4. Virtualized list for performance (10k+ commits).
5. Click commit to see details.
6. Multi-select commits (Ctrl/Cmd+click) for range operations.
7. Context menu: Copy hash, Copy message, Checkout, Cherry-pick, Revert, Create branch, Tag.
8. Filter by author, date, file path.
9. Search within commit messages.
10. Show commit stats (files changed, insertions, deletions) on hover or inline.

**Acceptance Criteria:**
- [ ] AC1: List loads first 100 commits instantly, scroll loads more.
- [ ] AC2: 10,000 commit list scrolls at 60fps.
- [ ] AC3: Branch labels color-coded and non-overlapping.
- [ ] AC4: Multi-select works with keyboard (Shift+arrow).
- [ ] AC5: Search filters in real-time.

**Technical Spec:**
- Rust: `git2::Revwalk` with `set_sorting(SORT_TIME)`. Limit with pagination (offset/limit).
- Frontend: `react-window` or `@tanstack/react-virtual`.
- Cache: SQLite `recent_commits_cache`.

**Data Model:** `CommitListItem { id, short_id, message_subject, author_name, relative_time, absolute_time, tags, branches, refs, stats }`

**UI/UX:** Main panel. Table view with adjustable columns. Compact vs comfortable density toggle.

**Error Handling:**
- History traversal fails (corrupt object) → Skip object, show gap indicator.
- Empty repo → Show "No commits yet" with "Make first commit" CTA.

**Dependencies:** F-010.

---

### F-025: Commit Details Panel
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to see full details of a selected commit.

**Functional Requirements:**
1. Show: Full SHA, Subject, Body (rendered as Markdown), Author, Committer, Date, Parent(s).
2. Parent commit clickable links.
3. GPG/SSH signature verification status badge.
4. List of changed files with status icons and diff stats.
5. Click file to see diff for that commit.
6. Copy buttons: full SHA, subject, body, patch.
7. "Checkout this commit" button (with detached HEAD warning).
8. "Create branch from here" button.
9. "Revert this commit" button.
10. "Cherry-pick this commit" button.
11. "Tag this commit" button.

**Acceptance Criteria:**
- [ ] AC1: Details load within 200ms for cached commits.
- [ ] AC2: Markdown body renders headers, lists, links, code blocks.
- [ ] AC3: Signature badge shows valid/invalid/unknown.
- [ ] AC4: File list shows accurate +/- counts.
- [ ] AC5: All action buttons trigger correct operations.

**Technical Spec:**
- Rust: `git2::Commit` object. `git2::Repository::find_commit(oid)`. `commit.parents()`, `commit.author()`, `commit.message()`.
- Diff: `git2::Diff::tree_to_tree(parent_tree, commit_tree)`.
- Signature: `git2::Repository::extract_signature()` or `git2::Commit::header_field("gpgsig")`.

**Data Model:** `CommitDetail { commit: Commit, parents: Vec<CommitSummary>, diff: DiffSummary, signature: SignatureStatus, changed_files: Vec<ChangedFile> }`

**UI/UX:** Split view: commit info top, file list bottom. Sticky action bar. Markdown body in scrollable area.

**Error Handling:**
- Parent missing (shallow clone) → Show "Parent not available (shallow clone)".
- Signature verification fails → Show error with key ID.

**Dependencies:** F-024.

---

## MILESTONE 3: Branches, Graph, History, Remotes
**Goal:** User can manage branches, visualize history as a graph, and interact with remotes.

---

### F-026: Branch List & Manager
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to see all branches and perform operations on them.

**Functional Requirements:**
1. Display local and remote branches in separate sections or unified tree.
2. Each branch shows: name, last commit message, last commit date, ahead/behind upstream.
3. Current HEAD branch highlighted.
4. Remote-tracking branches shown under remote subheaders.
5. Filter/search branches by name.
6. Sort by: name, last commit date, author.
7. Context menu per branch: Checkout, Merge into current, Rebase onto, Delete, Rename, Set upstream, Copy name.
8. "Create new branch" button (from current HEAD, selected commit, or custom).
9. "Refresh" button fetches latest remote branch list.
10. Protected branch indicator (if configured).

**Acceptance Criteria:**
- [ ] AC1: Branch list loads within 500ms for repos with < 200 branches.
- [ ] AC2: Current branch clearly indicated (bold + icon).
- [ ] AC3: Delete unmerged branch shows confirmation with "Force delete" option.
- [ ] AC4: Rename updates all remote-tracking refs.
- [ ] AC5: Create branch from commit opens branch on that commit.

**Technical Spec:**
- Rust: `git2::Branches` iterator. `branch.get().target()` for last commit. `branch.upstream()` for tracking.
- Ahead/behind: `git2::Graph::ahead_behind()`.
- Delete: `git2::Branch::delete()`. Force: `git branch -D` equivalent.
- Rename: `git2::Branch::rename()`.

**Data Model:** `BranchList { local: Vec<Branch>, remote: Vec<Branch>, active_branch: String }`

**UI/UX:** Sidebar panel or modal. Tree view: Local → Remote/origin → Remote/upstream. Color-coded: green=active, gray=merged, red=stale.

**Error Handling:**
- Checkout fails (dirty working tree) → Offer stash, discard, or cancel.
- Delete current branch → Error, suggest checkout other branch first.
- Rename conflicts with existing → Show error, suggest alternative name.

**Dependencies:** F-010.

---

### F-027: Branch Checkout with Safety
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to switch branches safely without losing work.

**Functional Requirements:**
1. Checkout branch via double-click, context menu, or branch list.
2. If working tree dirty, show modal with options:
   - Stash changes and checkout
   - Discard changes and checkout
   - Cancel checkout
   - Bring changes to new branch (if possible — clean merge)
3. If checkout fails (e.g., file conflicts), show specific error and affected files.
4. Progress indicator during checkout (can be slow on large repos).
5. After checkout, refresh all panels (status, history, branch list).
6. Update window title with new branch name.
7. Auto-stash option (configurable in settings).

**Acceptance Criteria:**
- [ ] AC1: Clean checkout completes in < 2 seconds.
- [ ] AC2: Dirty checkout modal appears within 500ms.
- [ ] AC3: Stash-and-checkout creates stash with auto-name "WIP on <oldbranch>".
- [ ] AC4: Checkout failure shows file-level conflict details.
- [ ] AC5: Auto-stash setting respected when enabled.

**Technical Spec:**
- Rust: `git2::Repository::set_head("refs/heads/branch")` then `checkout_head()`.
- Safety check: `git2::Repository::statuses()` before checkout. If dirty, abort and prompt.
- Auto-stash: If enabled, call `git2::Repository::stash_save()` before checkout.

**Data Model:** `CheckoutRequest { branch_name, strategy: Stash | Discard | Cancel | Merge }`

**UI/UX:** Modal with clear options. Radio buttons for strategy. Preview of affected files.

**Error Handling:**
- Local modifications would be overwritten → Show file list, offer stash.
- Branch doesn't exist → Error with "Did you mean?" suggestions.
- Detached HEAD state → Warning banner.

**Dependencies:** F-026, F-013.

---

### F-028: Commit Graph (DAG Visualization)
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to see the commit history as a visual graph showing branch/merge relationships.

**Functional Requirements:**
1. Render commits as nodes in a Directed Acyclic Graph.
2. Show branch lines as colored lanes or Bezier curves.
3. Each node shows: commit dot, short hash, subject, author, date, branch/tag labels.
4. Current HEAD indicated prominently.
5. Merge commits show converging lines.
6. Virtualized rendering (only render visible nodes).
7. Zoom in/out (Ctrl+scroll).
8. Pan with drag or scroll.
9. Click node to select commit (shows details panel).
10. Multi-select nodes (range selection).
11. Search and jump to commit in graph.
12. Filter by branch (show only commits reachable from branch).
13. First-parent view option (simplify merges).
14. Compact vs expanded layout modes.
15. Stash commits shown as special nodes.
16. AI summary available per commit (hover or panel).

**Acceptance Criteria:**
- [ ] AC1: Graph renders first 100 commits in < 1 second.
- [ ] AC2: 10,000 commit graph scrolls at 60fps.
- [ ] AC3: Branch colors consistent and colorblind-safe.
- [ ] AC4: Merge commits clearly show parent convergence.
- [ ] AC5: Zoom from 50% to 200% with smooth scaling.
- [ ] AC6: First-parent view hides non-HEAD merge parents.

**Technical Spec:**
- Layout Algorithm: 
  - **Option A:** Sugiyama layered graph drawing (proper DAG layout, complex).
  - **Option B:** Left-aligned lane assignment (simpler, used by SourceTree/GitKraken).
  - **Recommended:** Lane assignment. Each commit assigned to a lane (branch). Merge commits occupy lane of primary parent.
- Rendering: HTML5 Canvas 2D or SVG. For 10k+ commits, Canvas is faster. For interactivity, SVG is easier.
- **Hybrid approach:** Canvas for graph lines, DOM overlay for commit text (virtualized).
- Data: `git2::Revwalk` with `SORT_TOPOLOGICAL`. Build parent-child map. Assign lanes via graph traversal.

**Data Model:** `GraphNode { commit: Commit, x: f32, y: f32, lane: usize, color: String, is_merge: bool, is_head: bool }`  
`GraphEdge { from: Oid, to: Oid, color: String, lane_from: usize, lane_to: usize }`

**UI/UX:** Main view. Toolbar: zoom, branch filter, first-parent toggle, search. Legend for colors. Minimap for navigation.

**Error Handling:**
- Corrupt commit graph → Skip invalid objects, show warning banner.
- Shallow clone missing parents → Show "..." placeholder for missing commits.

**Dependencies:** F-024.

---

### F-029: History Search & Filtering
**Phase:** M3 | **Priority:** P1  
**User Story:** As a user, I want to search and filter commit history to find specific changes.

**Functional Requirements:**
1. Search by commit message (`git log --grep`).
2. Search by author name/email (`--author`).
3. Search by committer (`--committer`).
4. Date range picker (before/after/since/until).
5. Search by changed file path (`-- path`).
6. Pickaxe search: string in diff content (`-S`).
7. Pickaxe regex search (`-G`).
8. Search all branches option (not just current).
9. Search in specific branch.
10. Include/exclude merge commits.
11. Instant search with debounce (300ms).
12. Save recent searches.
13. Search results highlighted in graph/list.

**Acceptance Criteria:**
- [ ] AC1: Message search returns results in < 1 second for 10k commits.
- [ ] AC2: Pickaxe search shows commits where string was added/deleted.
- [ ] AC3: Date range picker has calendar UI and relative shortcuts ("Last week").
- [ ] AC4: File path search shows commits touching that path.
- [ ] AC5: Results count shown in search bar.

**Technical Spec:**
- Rust: `git2::Revwalk` with various filters. For pickaxe, iterate commits and diff each against parent.
- Performance: For large repos, use `git log` subprocess with formatted output instead of libgit2 iteration.
- Cache: Index commit messages in SQLite FTS5 for instant search.

**Data Model:** `HistorySearchQuery { query_type: Message | Author | Committer | DateRange | FilePath | Pickaxe | PickaxeRegex, value: String, branch: Option<String>, all_branches: bool, include_merges: bool }`

**UI/UX:** Search bar with dropdown for search type. Date picker for date range. Results panel with "Clear filters" button.

**Error Handling:**
- Regex invalid → Show inline error with suggestion.
- No results → Empty state with "Try different search" suggestion.

**Dependencies:** F-024, F-028.

---

### F-030: Remote Management
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to manage remote repositories (add, edit, remove, fetch).

**Functional Requirements:**
1. Display list of remotes with name, fetch URL, push URL.
2. Add new remote: name, URL (validate format).
3. Edit remote URL.
4. Remove remote (with confirmation if branches track it).
5. Rename remote.
6. Prune remote-tracking branches (`remote prune`).
7. Test connection / credential validation.
8. Show remote health: last fetch time, connection status.
9. Display default remote for current branch.

**Acceptance Criteria:**
- [ ] AC1: Remote list accurate after add/edit/remove.
- [ ] AC2: Invalid URL rejected with format error.
- [ ] AC3: Remove remote with tracked branches shows warning list.
- [ ] AC4: Prune removes stale remote branches from UI.
- [ ] AC5: Connection test shows success/failure with latency.

**Technical Spec:**
- Rust: `git2::Repository::remotes()` → `Remote::name()`, `Remote::url()`, `Remote::pushurl()`.
- Add: `git2::Repository::remote(name, url)`.
- Remove: `git2::Repository::remote_delete(name)`.
- Prune: `git2::Remote::prune_refs()` or `git remote prune`.
- Test: `git2::Remote::connect(git2::Direction::Fetch)` with timeout.

**Data Model:** `RemoteList { remotes: Vec<Remote> }`

**UI/UX:** Settings > Remotes or sidebar panel. Table with action buttons. Test button per remote.

**Error Handling:**
- Duplicate remote name → Inline error.
- Invalid URL scheme → Show supported schemes (https, ssh, git, file).
- Auth failure on test → Prompt for credentials.

**Dependencies:** F-010.

---

### F-031: Fetch Operations
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to fetch updates from remotes.

**Functional Requirements:**
1. Fetch all remotes (default action).
2. Fetch specific remote.
3. Fetch --prune (remove deleted remote branches).
4. Fetch --tags.
5. Background auto-fetch (configurable interval: 5min, 15min, 30min, 1hr, off).
6. Progress display: counting objects, compressing, receiving, resolving deltas.
7. Show new commits fetched per branch (ahead/behind update).
8. Cancel fetch button.
9. Credential prompt if needed.

**Acceptance Criteria:**
- [ ] AC1: Fetch completes and updates branch ahead/behind counts.
- [ ] AC2: Auto-fetch runs silently in background.
- [ ] AC3: New commits notification appears after fetch.
- [ ] AC4: Cancel stops fetch gracefully.
- [ ] AC5: Prune removes deleted remote branches from branch list.

**Technical Spec:**
- Rust: `git2::Remote::fetch(refspecs, Some(&mut fetch_options), None)`.
- Progress: `RemoteCallbacks::sideband_progress()` and `transfer_progress()`.
- Auto-fetch: `tokio::time::interval` in background task.
- Update: After fetch, refresh all branch ahead/behind via `git2::Graph::ahead_behind()`.

**Data Model:** `FetchOptions { remote: Option<String>, prune: bool, tags: bool }`

**UI/UX:** Toolbar "Fetch" button with dropdown. Status bar shows last fetch time. Toast notification for new commits.

**Error Handling:**
- Network unreachable → Retry with exponential backoff.
- Auth failure → Prompt once, then fail.
- Remote URL changed → Show "Remote not found" error.

**Dependencies:** F-030.

---

### F-032: Pull Operations
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to pull remote changes into my current branch.

**Functional Requirements:**
1. Pull current branch from upstream remote.
2. Pull with rebase (`pull.rebase` config or explicit).
3. Pull with merge (default or explicit).
4. Pull --ff-only option.
5. Preview incoming commits before pull (show list).
6. Handle conflicts: open conflict resolver if merge conflicts occur.
7. Handle diverged branches: show dialog with rebase/merge/abort options.
8. Progress indicator.
9. Auto-stash if dirty (configurable).

**Acceptance Criteria:**
- [ ] AC1: Fast-forward pull completes without modal.
- [ ] AC2: Non-FF pull shows preview of incoming commits.
- [ ] AC3: Conflicts open conflict resolver immediately.
- [ ] AC4: Diverged branch dialog offers rebase, merge, or cancel.
- [ ] AC5: Auto-stash creates stash before pull, pops after success.

**Technical Spec:**
- Rust: `git2::Remote::fetch()` then `git2::Repository::merge_analysis()`.
  - If `FASTFORWARD`: `git2::Repository::checkout_tree()` + `set_head()`.
  - If `NORMAL`: Perform merge or rebase based on strategy.
  - If `UP_TO_DATE`: Show "Already up to date".
- Rebase: `git2::Repository::rebase()` or manual implementation.

**Data Model:** `PullRequest { remote: String, branch: String, strategy: Merge | Rebase | FFOnly }`

**UI/UX:** "Pull" button in toolbar. Dropdown for strategy. Preview modal for non-FF.

**Error Handling:**
- No upstream set → Prompt to set upstream.
- Local uncommitted conflicts with pulled changes → Offer stash.
- Merge conflict → Open F-040 (Conflict Resolver).

**Dependencies:** F-031, F-040.

---

### F-033: Push Operations
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to push my local commits to remote.

**Functional Requirements:**
1. Push current branch to upstream.
2. Push specific branch.
3. Push all branches.
4. Push tags.
5. Push --force-with-lease (safe force push).
6. Push --force (with scary confirmation).
7. Push --delete remote branch.
8. Preview outgoing commits before push.
9. Dry-run option.
10. Progress indicator.
11. Set upstream on first push (`--set-upstream`).
12. Atomic push option.

**Acceptance Criteria:**
- [ ] AC1: Normal push completes and updates remote branch.
- [ ] AC2: First push to new branch sets upstream automatically.
- [ ] AC3: Force push shows red confirmation with commit count that will be overwritten.
- [ ] AC4: Force-with-lease rejected if remote changed → Show error, suggest pull.
- [ ] AC5: Preview shows commit list, diff stats, files affected.

**Technical Spec:**
- Rust: `git2::Remote::push(refspecs, Some(&mut push_options))`.
- Force: Include `+` in refspec (e.g., `+refs/heads/main:refs/heads/main`).
- Lease: Not directly supported in git2; use `git push --force-with-lease` subprocess or implement lease check manually (fetch remote ref first, compare).
- Preview: `git2::Graph::ahead_behind()` to get outgoing commits, show their details.

**Data Model:** `PushRequest { remote: String, branch: String, force: bool, force_lease: bool, set_upstream: bool, tags: bool }`

**UI/UX:** "Push" button with dropdown. Preview modal. Force push requires typing branch name to confirm.

**Error Handling:**
- Non-fast-forward rejected → Suggest pull or force-with-lease.
- Auth failure → Prompt for credentials.
- Remote branch protected (GitHub) → Show platform-specific error.

**Dependencies:** F-030.

---

### F-034: Upstream Tracking Setup
**Phase:** M3 | **Priority:** P1  
**User Story:** As a user, I want to set which remote branch my local branch tracks.

**Functional Requirements:**
1. Show current upstream for each branch.
2. "Set upstream" option in branch context menu.
3. Dropdown to select remote + branch.
4. "Unset upstream" option.
5. Auto-set upstream on first push (configurable).
6. Visual indicator if branch has no upstream ("Publish" button).

**Acceptance Criteria:**
- [ ] AC1: Upstream shown as "origin/main" in branch list.
- [ ] AC2: Setting upstream updates `.git/config` immediately.
- [ ] AC3: Branch without upstream shows "Publish" button instead of Push.
- [ ] AC4: Unsetting upstream removes tracking config.

**Technical Spec:**
- Rust: `git2::Branch::set_upstream("origin/main")`. `git2::Branch::upstream()` to read.
- Config: `branch.<name>.remote` and `branch.<name>.merge`.

**Data Model:** `UpstreamConfig { branch: String, remote: String, remote_branch: String }`

**UI/UX:** Branch list shows upstream as subtext. Publish button prominent for new branches.

**Error Handling:**
- Remote branch doesn't exist → Offer to create on push.

**Dependencies:** F-026, F-030.

---

## MILESTONE 4: Merge, Rebase, Cherry-Pick, Stash, Reset, Recovery
**Goal:** User can perform advanced operations safely with visual feedback and recovery options.

---

### F-035: Merge Branch
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want to merge another branch into my current branch.

**Functional Requirements:**
1. Select branch to merge into current.
2. Preview merge: show commits that will be merged, files affected, potential conflicts (statistical guess).
3. Options: Fast-forward if possible, No fast-forward (`--no-ff`), Squash (`--squash`), Fast-forward only (`--ff-only`).
4. Execute merge.
5. If conflicts: open conflict resolver (F-040).
6. If success: show merge commit details.
7. Abort merge button (if conflicts or in progress).
8. Merge progress indicator.

**Acceptance Criteria:**
- [ ] AC1: FF merge completes silently with success toast.
- [ ] AC2: No-FF merge creates merge commit with default message.
- [ ] AC3: Squash merge squashes all commits into one.
- [ ] AC4: Conflict probability shown in preview (based on touched files overlap).
- [ ] AC5: Abort merge restores pre-merge state.

**Technical Spec:**
- Rust: `git2::Repository::merge(&annotated_commit, Some(&merge_options))`.
- Analysis: `git2::Repository::merge_analysis()` to determine if FF possible.
- Preview: Get merge commit list via `git2::Graph::ahead_behind()` and diff trees.
- Conflict detection: Compare file paths changed in both branches.

**Data Model:** `MergeRequest { source_branch: String, strategy: FastForward | NoFastForward | Squash | FFOnly }`

**UI/UX:** Branch context menu → "Merge into current". Preview modal. Progress bar.

**Error Handling:**
- Already up to date → Inform user.
- FF-only but not possible → Error, suggest other strategy.
- Conflicts → Launch F-040.

**Dependencies:** F-026, F-040.

---

### F-036: Interactive Rebase
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want to rewrite history by reordering, squashing, and editing commits.

**Functional Requirements:**
1. Select base commit (or branch) for rebase.
2. Display commits from base to HEAD in timeline/list.
3. Each commit has action dropdown: Pick (default), Reword, Edit, Squash, Fixup, Drop, Exec.
4. Drag-and-drop to reorder commits.
5. Preview of resulting history.
6. "Start Rebase" button.
7. During rebase: show progress ("Rebasing 3 of 7"), current commit.
8. If conflict: pause, open conflict resolver, show "Continue", "Skip", "Abort" buttons.
9. If edit: pause, allow user to make changes, then "Continue".
10. If reword: show commit message editor modal.
11. Abort rebase restores original state.
12. Complete rebase shows summary of changes.

**Acceptance Criteria:**
- [ ] AC1: Rebase plan generated correctly from user actions.
- [ ] AC2: Drag-and-drop reorder updates action list.
- [ ] AC3: Conflict during rebase pauses with clear instructions.
- [ ] AC4: Abort restores exact original branch state.
- [ ] AC5: Reword opens modal pre-filled with original message.

**Technical Spec:**
- Rust: `git2::Repository::rebase()` with `RebaseOptions`. Or implement manual rebase:
  1. Create `rebase` operation from branch onto target.
  2. Loop: `rebase.next()` → apply commit.
  3. If conflict: save state, prompt user.
  4. If edit: detach HEAD at commit, wait for user.
  5. On continue: `rebase.commit()` then `rebase.next()`.
  6. On finish: `rebase.finish()`.
- State persistence: Write rebase state to `.git/rebase-merge/` or custom app state.

**Data Model:** `RebasePlan { base: Oid, commits: Vec<RebaseCommit> }`  
`RebaseCommit { original_commit: Commit, action: Pick | Reword | Edit | Squash | Fixup | Drop | Exec, new_message: Option<String> }`

**UI/UX:** Dedicated rebase panel. Timeline with handles. Action dropdown per commit. Progress bar. Floating action bar during rebase.

**Error Handling:**
- Merge base not found → Error.
- Empty commit range → Error.
- Already up to date → Inform user.
- Multiple conflicts → Track resolved count.

**Dependencies:** F-028, F-040.

---

### F-037: Cherry-Pick
**Phase:** M4 | **Priority:** P1  
**User Story:** As a user, I want to apply specific commits from one branch to another.

**Functional Requirements:**
1. Select one or more commits (multi-select in history/graph).
2. Preview: show commits to be cherry-picked, files changed, potential conflicts.
3. Option: Cherry-pick without committing (`-n`).
4. Option: Add signoff.
5. Execute cherry-pick sequence.
6. If conflict: pause, open conflict resolver, show "Continue", "Abort", "Skip".
7. Abort restores original state.
8. Success shows new commit(s) in history.

**Acceptance Criteria:**
- [ ] AC1: Single commit cherry-pick creates new commit with same message + "(cherry picked from ...)".
- [ ] AC2: Multiple commits cherry-picked in order.
- [ ] AC3: Conflict shows original commit being applied.
- [ ] AC4: Abort removes partially applied commits.

**Technical Spec:**
- Rust: `git2::Repository::cherrypick(commit, Some(&cherrypick_options))`.
- Multiple: Iterate commits, cherrypick each. If conflict, stop and save state.
- State: Track in app state or `.git/sequencer/`.

**Data Model:** `CherryPickRequest { commits: Vec<Oid>, no_commit: bool, signoff: bool }`

**UI/UX:** Context menu on commit: "Cherry-pick this commit". Preview modal. Progress during sequence.

**Error Handling:**
- Commit already in current branch → "Nothing to do" message.
- Empty commit → Skip or apply empty (configurable).

**Dependencies:** F-024, F-040.

---

### F-038: Revert Commit
**Phase:** M4 | **Priority:** P1  
**User Story:** As a user, I want to undo a specific commit by creating an inverse commit.

**Functional Requirements:**
1. Select commit(s) to revert.
2. Preview: show inverse diff (what will be undone).
3. Option: Revert without committing (`-n`).
4. Option: Mainline parent for merge commits (`-m`).
5. Execute revert.
6. If conflict: open conflict resolver.
7. Abort option.
8. Success shows new revert commit in history.

**Acceptance Criteria:**
- [ ] AC1: Revert creates commit with message "Revert 'original subject'".
- [ ] AC2: Preview shows accurate inverse diff.
- [ ] AC3: Merge commit revert asks for mainline parent.
- [ ] AC4: Conflict handling same as merge/cherry-pick.

**Technical Spec:**
- Rust: `git2::Repository::revert(commit, Some(&revert_options))`.
- Preview: Generate diff between HEAD and `HEAD + revert patch`.

**Data Model:** `RevertRequest { commits: Vec<Oid>, no_commit: bool, mainline: Option<u32> }`

**UI/UX:** Context menu: "Revert this commit". Preview modal. Commit created immediately if no conflicts.

**Error Handling:**
- Already reverted → "Nothing to revert".
- Merge commit without mainline → Prompt for parent selection.

**Dependencies:** F-024, F-040.

---

### F-039: Reset (Soft, Mixed, Hard)
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want to move HEAD to a different commit with control over what happens to index and working tree.

**Functional Requirements:**
1. Select target commit (from graph, history, or input hash).
2. Choose reset mode:
   - Soft: Move HEAD only, keep index and working tree.
   - Mixed (default): Move HEAD and reset index, keep working tree.
   - Hard: Move HEAD, reset index and working tree (DESTRUCTIVE).
   - Keep: Move HEAD, reset index, keep working tree changes but unstage them.
   - Merge: Reset index and working tree, but abort on uncommitted changes.
3. Preview what will change: commits lost, files affected.
4. Scary confirmation for Hard reset with commit count warning.
5. Execute reset.
6. Create checkpoint before destructive reset.
7. Undo available immediately after.

**Acceptance Criteria:**
- [ ] AC1: Soft reset updates HEAD, staged changes remain staged.
- [ ] AC2: Mixed reset updates HEAD, staged changes become unstaged.
- [ ] AC3: Hard reset shows red modal with "You will lose X uncommitted changes".
- [ ] AC4: Undo restores exact pre-reset state.
- [ ] AC5: Graph updates immediately to show new HEAD position.

**Technical Spec:**
- Rust: `git2::Repository::reset(target, reset_type, Some(&checkout_options))`.
- Types: `git2::ResetType::Soft`, `Mixed`, `Hard`.
- Preview: Diff between current HEAD and target to show lost commits. Status to show affected files.
- Checkpoint: Save current HEAD, index state, working tree state (stash if dirty).

**Data Model:** `ResetRequest { target: Oid, reset_type: Soft | Mixed | Hard | Keep | Merge }`

**UI/UX:** Context menu on commit: "Reset current branch to here". Modal with mode selector and preview. Red warning for Hard.

**Error Handling:**
- Target not found → Error with "Did you mean?" suggestions.
- Hard reset with uncommitted changes → Extra warning, suggest stash.
- Merge reset with uncommitted changes → Abort, show error.

**Dependencies:** F-024, Checkpoint system.

---

### F-040: Conflict Resolver (Three-Way Merge)
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want to resolve merge conflicts visually.

**Functional Requirements:**
1. Detect conflicted files during merge/rebase/cherry-pick/revert.
2. List conflicted files with resolution status (unresolved/resolved).
3. Three-pane view for each file:
   - Left: BASE (common ancestor)
   - Center: OURS (HEAD / current branch)
   - Right: THEIRS (incoming / other branch)
4. Show conflict markers inline if raw view preferred.
5. "Accept Ours" / "Accept Theirs" per file or per hunk.
6. "Accept Ours for all remaining" / "Accept Theirs for all remaining" bulk actions.
7. Manual editing in merge result pane (bottom or center).
8. Syntax highlighting in all panes.
9. "Mark as resolved" button after editing.
10. "Continue" operation button (merge/rebase/cherry-pick).
11. "Abort" operation button.
12. Progress: show X of Y files resolved.
13. AI-assisted resolution suggestion (see AI section).

**Acceptance Criteria:**
- [ ] AC1: Three panes load with correct versions of file.
- [ ] AC2: Accept Ours replaces conflict with our version.
- [ ] AC3: Manual edit saves to working tree and allows mark resolved.
- [ ] AC4: Continue proceeds only if all conflicts resolved.
- [ ] AC5: Abort restores pre-operation state.
- [ ] AC6: Progress bar updates per file resolution.

**Technical Spec:**
- Rust: Read conflict from index: `git2::Index::conflict_iterator()` or `git2::Index::get_conflict()`.
- Get ancestor/our/their blobs via `git2::Repository::find_blob()`.
- Apply resolution: Write resolved content to working tree, then `git2::Index::add_path()` or `git2::Index::remove_conflict()`.
- Continue: Call appropriate continue function based on repo state (`merge`, `rebase`, `cherrypick`, `revert`).

**Data Model:** `ConflictResolutionSession { operation: Merge | Rebase | CherryPick | Revert, files: Vec<ConflictFile>, resolved_count: usize, total_count: usize }`

**UI/UX:** Full-screen modal. File list left, three panes right. Action toolbar top. Resolution status per file (checkmark/unresolved).

**Error Handling:**
- File deleted in one branch → Show "Deleted by us/them" with special actions.
- Binary conflict → Show "Binary file conflict" with ours/theirs selection only.
- Resolution invalid → Show error, don't allow mark resolved.

**Dependencies:** F-035, F-036, F-037, F-038.

---

### F-041: Stash Management
**Phase:** M4 | **Priority:** P1  
**User Story:** As a user, I want to save and restore work-in-progress changes.

**Functional Requirements:**
1. Create stash with optional message (default: "WIP on branch").
2. Options: Include untracked (`-u`), Include ignored (`-a`), Keep index (`--keep-index`).
3. Stash list view: message, branch, date, files changed.
4. Apply stash (keep in list).
5. Pop stash (apply and delete).
6. Drop stash (delete).
7. Drop all stashes (with confirmation).
8. Diff stash contents (show what was stashed).
9. Create branch from stash.
10. Search/filter stashes.

**Acceptance Criteria:**
- [ ] AC1: Stash created and appears in list immediately.
- [ ] AC2: Pop applies changes and removes stash.
- [ ] AC3: Apply with conflicts opens conflict resolver.
- [ ] AC4: Diff shows accurate before/after for stashed files.
- [ ] AC5: Branch from stash creates branch and applies stash.

**Technical Spec:**
- Rust: `git2::Repository::stash_save(signature, message, flags)`.
- Flags: `StashFlags::INCLUDE_UNTRACKED`, `INCLUDE_IGNORED`, `KEEP_INDEX`.
- Apply: `git2::Repository::stash_apply(index, Some(&stash_apply_options))`.
- Pop: `git2::Repository::stash_pop()`.
- Drop: `git2::Repository::stash_drop(index)`.
- Diff: `git2::Repository::stash_foreach()` to get commit, then diff against parents.

**Data Model:** `StashList { stashes: Vec<Stash> }`

**UI/UX:** Sidebar panel or modal. List with expandable diff. Buttons: Stash (with options dropdown), Pop, Apply, Drop.

**Error Handling:**
- Apply conflicts → Open conflict resolver, stash remains.
- Drop with invalid index → Error.
- Empty stash message → Auto-generate.

**Dependencies:** F-013.

---

### F-042: Git Time Machine (Checkpoints & Recovery)
**Phase:** M4 | **Priority:** P0 (Killer Feature)  
**User Story:** As a user, I want to undo any operation and restore my repository to a previous state.

**Functional Requirements:**
1. **Automatic Checkpointing:** Before every destructive operation (reset, rebase, merge, cherry-pick, revert, checkout with discard, stash drop, branch delete, commit amend), create a checkpoint.
2. Checkpoint captures: HEAD position, branch name, index state, working tree state (via stash if dirty), operation type.
3. Visual timeline of all checkpoints (not just commits—includes operations).
4. Each checkpoint shows: timestamp, operation name, before/after state, AI explanation.
5. **One-click rollback:** Select checkpoint, preview what will be restored, confirm.
6. Rollback restores: HEAD, branch, index, working tree (via stash pop), and any operation state.
7. **Recovery Center:** Dedicated view for:
   - Reflog entries (all HEAD movements)
   - Deleted branches (recoverable from reflog)
   - Lost commits (dangling objects)
   - Dangling blobs/trees
   - Broken merge states
   - Stash recovery
   - Undo reset
   - Undo rebase
   - Undo merge
8. **AI Recovery Assistant:** Natural language recovery ("I accidentally reset hard, bring it back").
9. Checkpoints stored in app database (SQLite) with 30-day retention.

**Acceptance Criteria:**
- [ ] AC1: Every destructive operation creates checkpoint within 100ms.
- [ ] AC2: Rollback restores exact pre-operation state.
- [ ] AC3: Recovery Center shows reflog with human-readable descriptions.
- [ ] AC4: Deleted branch recovery creates branch at old commit.
- [ ] AC5: AI assistant understands "undo last rebase" and executes rollback.
- [ ] AC6: Checkpoints older than 30 days auto-purged.

**Technical Spec:**
- Rust: Before operation:
  1. Get current HEAD (`repo.head()`).
  2. Get current branch name.
  3. If dirty: `repo.stash_save()` to capture working tree.
  4. Save to SQLite `checkpoints` table.
- Rollback:
  1. If stash captured: `stash_pop()` to restore working tree.
  2. `repo.set_head(checkpoint.head_ref)`.
  3. `repo.checkout_head()` to restore index.
  4. If branch deleted: `repo.branch()` to recreate.
- Reflog: `git2::Reference::reflog()` → iterate entries.
- Dangling objects: `git2::Repository::odb()` → iterate, filter unreferenced.

**Data Model:** `Checkpoint { id, repo_id, timestamp, operation, head_before, head_after, branch, stash_index, snapshot_json, ai_explanation }`  
`RecoveryItem { type: ReflogEntry | DeletedBranch | LostCommit | DanglingObject, description, recoverable: bool, action: String }`

**UI/UX:** 
- Time Machine: Timeline view (vertical) with operation icons. Click to expand details. Rollback button.
- Recovery Center: Dashboard with cards per category. "Recover" buttons. AI chat panel.

**Error Handling:**
- Rollback fails (e.g., objects garbage collected) → Show error, offer best-effort recovery.
- Stash pop conflicts → Open conflict resolver.

**Dependencies:** All destructive operations. Core to app safety.

---

## MILESTONE 5: Worktrees, Submodules, Hooks, Maintenance, Internals
**Goal:** Power user features for complex repository structures and Git maintenance.

---

### F-043: Worktree Management
**Phase:** M5 | **Priority:** P2  
**User Story:** As a user, I want to manage multiple working trees for the same repository.

**Functional Requirements:**
1. List existing worktrees with path, branch, locked status.
2. Create new worktree: select branch (existing or new) and path.
3. Remove worktree (with confirmation).
4. Prune stale worktrees.
5. Lock/unlock worktree.
6. Move worktree path.
7. Open worktree in new app window.
8. Visual map showing main repo + worktrees.

**Acceptance Criteria:**
- [ ] AC1: Worktree list accurate after add/remove.
- [ ] AC2: Create worktree from branch opens new working directory.
- [ ] AC3: Remove worktree cleans up `.git/worktrees`.
- [ ] AC4: Open worktree launches new window with that repo loaded.

**Technical Spec:**
- Rust: `git2::Worktree::list()` or `git2::Repository::open_from_worktree()`.
- Add: `git2::Worktree::add(name, path, None)`.
- Remove: `git2::Worktree::prune()` or manual cleanup.

**Data Model:** `WorktreeInfo { name, path, branch, is_locked, is_main, head }`

**UI/UX:** Settings > Worktrees. Tree diagram. New worktree modal.

**Error Handling:**
- Path already exists → Error.
- Branch checked out elsewhere → Warning.

**Dependencies:** F-010.

---

### F-044: Submodule Management
**Phase:** M5 | **Priority:** P2  
**User Story:** As a user, I want to manage Git submodules.

**Functional Requirements:**
1. Auto-detect submodules in repository.
2. List submodules: path, URL, current commit, dirty status, branch.
3. Initialize submodules (`submodule init`).
4. Update submodules (`submodule update --recursive`).
5. Sync submodules (`submodule sync`).
6. Add new submodule.
7. Deinit submodule.
8. Diff submodule pointer changes (old commit → new commit).
9. Open submodule as independent repository.
10. Recursive status across submodules.

**Acceptance Criteria:**
- [ ] AC1: Submodules detected on repo open.
- [ ] AC2: Dirty submodule shows "modified" in parent repo status.
- [ ] AC3: Update fetches and checks out correct commits.
- [ ] AC4: Diff shows submodule commit hash change.

**Technical Spec:**
- Rust: `git2::Submodule` API. `submodule.open()`, `submodule.init()`, `submodule.update()`.
- Recursive: Iterate submodules, open each as repo, repeat.

**Data Model:** `SubmoduleInfo { name, path, url, current_oid, head_oid, is_dirty, branch }`

**UI/UX:** Sidebar section or modal. Table with action buttons. Expandable for nested submodules.

**Error Handling:**
- Submodule URL unreachable → Show error per submodule.
- Nested submodule loop → Detect and break.

**Dependencies:** F-010.

---

### F-045: Git Hooks Management
**Phase:** M5 | **Priority:** P2  
**User Story:** As a user, I want to view, edit, enable, and test Git hooks.

**Functional Requirements:**
1. Discover all hooks in `.git/hooks/`.
2. Display: hook name, enabled/disabled, script content, last execution result.
3. Enable/disable hooks (rename to `.sample` or chmod -x).
4. Edit hook scripts with syntax highlighting (shell, Python, Ruby, etc.).
5. Template gallery (pre-commit for linting, pre-push for tests, etc.).
6. Test hook execution with dry-run.
7. Show hook output in terminal panel.
8. Support hooks: pre-commit, prepare-commit-msg, commit-msg, post-commit, pre-rebase, post-checkout, post-merge, pre-push, pre-applypatch, post-applypatch, post-rewrite.

**Acceptance Criteria:**
- [ ] AC1: All hooks discovered and listed.
- [ ] AC2: Disable hook prevents execution on next commit.
- [ ] AC3: Edit hook saves and preserves executable bit.
- [ ] AC4: Test run shows output without affecting repo.
- [ ] AC5: Template gallery creates hook from template.

**Technical Spec:**
- Rust: Read `.git/hooks/` directory. Check executable bit.
- Enable: `chmod +x` via Rust `std::fs::set_permissions`.
- Disable: `chmod -x` or rename to `.sample`.
- Test: Execute hook with `GIT_INDEX_FILE` set to temp copy.

**Data Model:** `Hook { name, path, is_enabled, content, language, last_result }`

**UI/UX:** Settings > Hooks. Table with toggle switches. Editor modal. Test button.

**Error Handling:**
- Hook script syntax error → Show in test output.
- Permission denied → Show error, suggest chmod.

**Dependencies:** F-010.

---

### F-046: Repository Maintenance
**Phase:** M5 | **Priority:** P2  
**User Story:** As a user, I want to run maintenance tasks to keep my repository healthy.

**Functional Requirements:**
1. **Health Dashboard:** Visual indicators for: object count, pack efficiency, loose objects, reflog size, disk usage.
2. **Garbage Collection:** Run `git gc` with options (aggressive, prune).
3. **Prune:** Remove unreachable objects.
4. **Pack Refs:** Compress refs into single file.
5. **Repack:** Repack objects with options (window, depth).
6. **FSCK:** File system check, find corruption.
7. **Commit Graph:** Update `commit-graph` file.
8. **Auto-maintenance:** Schedule periodic maintenance (daily/weekly).
9. **Progress** and **cancel** for long operations.
10. **Pre-operation checkpoint** (safety).

**Acceptance Criteria:**
- [ ] AC1: GC reduces disk usage (show before/after).
- [ ] AC2: FSCK reports corruption if found.
- [ ] AC3: Auto-maintenance runs in background without blocking.
- [ ] AC4: Cancel stops operation safely.

**Technical Spec:**
- Rust: `git2::Repository::gc()` not in libgit2; use `git gc` subprocess.
- FSCK: `git2::Repository::odb()` iterate and verify objects. Or `git fsck` subprocess.
- Commit graph: `git commit-graph write` subprocess.

**Data Model:** `MaintenanceTask { type, status, progress, started_at, completed_at, result }`

**UI/UX:** Settings > Maintenance. Dashboard with gauges. Run buttons. Schedule settings.

**Error Handling:**
- GC fails (corruption) → Show error, offer recovery.
- Operation timeout → Kill process, show partial results.

**Dependencies:** F-011.

---

### F-047: Git Internals Browser
**Phase:** M5 | **Priority:** P3 (Educational)  
**User Story:** As a power user or learner, I want to browse Git's internal object database.

**Functional Requirements:**
1. Browse HEAD, refs, objects.
2. Object types: commits, trees, blobs, tags.
3. View raw object content.
4. View object relationships (commit → tree → blobs).
5. Browse index (staging area) entries.
6. Browse pack files and indices.
7. Hex dump view for binary blobs.
8. Object search by hash prefix.
9. Educational tooltips explaining each concept.

**Acceptance Criteria:**
- [ ] AC1: Object browser shows all objects in repo.
- [ ] AC2: Commit shows parent/child tree visualization.
- [ ] AC3: Tree shows file mode, name, blob hash.
- [ ] AC4: Search by hash prefix finds object.

**Technical Spec:**
- Rust: `git2::Repository::odb()`, `git2::OdbObject`. `repo.find_object(hash)`.
- Tree: `git2::Tree::iter()` → entries.
- Index: `git2::Index::iter()`.

**Data Model:** `GitObject { oid, kind: Commit | Tree | Blob | Tag, size: usize, content: Vec<u8> }`

**UI/UX:** Tree browser (like file explorer). Detail panel shows parsed content. Hex view toggle.

**Error Handling:**
- Object not found → "Object not in database".
- Corrupt object → Show hex dump with error.

**Dependencies:** F-010.

---

### F-048: Plumbing Commands (Advanced Mode)
**Phase:** M5 | **Priority:** P3  
**User Story:** As an advanced user, I want access to Git plumbing commands.

**Functional Requirements:**
1. Expose safe plumbing commands:
   - `hash-object`
   - `cat-file`
   - `update-ref`
   - `update-index`
   - `write-tree`
   - `read-tree`
   - `commit-tree`
   - `symbolic-ref`
   - `rev-list`
   - `rev-parse`
   - `pack-objects`
   - `unpack-objects`
2. Input forms for each command with validation.
3. Output display with syntax highlighting.
4. Dry-run option where applicable.
5. Warning before destructive plumbing commands.
6. Command history.

**Acceptance Criteria:**
- [ ] AC1: Each command has appropriate input fields.
- [ ] AC2: Output displayed in terminal-like panel.
- [ ] AC3: Destructive commands require confirmation.
- [ ] AC4: History persists across sessions.

**Technical Spec:**
- Rust: Map to git2 functions or `git` subprocess.
- Validation: Check object IDs (40 hex chars), ref name validity.

**Data Model:** `PlumbingCommand { name, args: Vec<String>, output: String, exit_code: i32 }`

**UI/UX:** Advanced mode toggle. Command palette. Form-based inputs.

**Error Handling:**
- Invalid object ID → Inline validation error.
- Ref update conflict → Show current vs expected.

**Dependencies:** F-047.

---

## MILESTONE 6: Git Hosting Integrations & Multi-Repo Management
**Goal:** Connect to GitHub/GitLab/etc. Manage PRs, issues, and multiple repos.

---

### F-049: Hosting Account Management
**Phase:** M6 | **Priority:** P1  
**User Story:** As a user, I want to connect my GitHub/GitLab/etc. accounts.

**Functional Requirements:**
1. Support providers: GitHub, GitLab, Bitbucket, Azure DevOps, Gitea, Forgejo.
2. OAuth authentication flow (where supported).
3. Personal Access Token (PAT) input (with visibility toggle).
4. SSH key association.
5. Account list with provider, username, avatar, status.
6. Test connection.
7. Remove account.
8. Token expiration warning and refresh.
9. Enterprise/self-hosted URL configuration.

**Acceptance Criteria:**
- [ ] AC1: GitHub OAuth completes and shows user avatar.
- [ ] AC2: PAT stored securely in OS keychain.
- [ ] AC3: Test connection shows green checkmark.
- [ ] AC4: Self-hosted GitLab URL configurable.

**Technical Spec:**
- Rust: OAuth via `oauth2` crate or Tauri OAuth plugin.
- Storage: `keyring` crate for cross-platform secure storage.
- API: Use provider REST/GraphQL APIs (GitHub API v3, GitLab API v4).

**Data Model:** `HostingAccount { id, provider, username, token_encrypted, base_url, is_enterprise, avatar_url, status }`

**UI/UX:** Settings > Accounts. Card per account. "Add Account" modal with provider selection.

**Error Handling:**
- OAuth callback failure → Show error, retry.
- Invalid token → "Authentication failed" with re-enter prompt.
- Network error → Retry button.

**Dependencies:** F-005.

---

### F-050: Pull Request Integration
**Phase:** M6 | **Priority:** P1  
**User Story:** As a user, I want to view and create pull requests from the app.

**Functional Requirements:**
1. List open PRs for current repository (from connected account).
2. PR details: title, author, branch, status, checks, reviews.
3. Create PR: title, body, base branch, compare branch, draft toggle.
4. View PR diff.
5. PR status checks (CI) indicator.
6. Link PR to commits (show PR number in commit graph).
7. Checkout PR branch locally.
8. Approve/comment on PR (read-only or full integration).

**Acceptance Criteria:**
- [ ] AC1: PR list loads for connected repo.
- [ ] AC2: Create PR opens browser or native form.
- [ ] AC3: PR labels shown in commit graph.
- [ ] AC4: CI status (passing/failing/pending) visible.

**Technical Spec:**
- Rust: HTTP client (`reqwest`) calling provider APIs.
- Cache: Store PR data in SQLite, refresh periodically.
- Mapping: Match remote URL to account, extract owner/repo.

**Data Model:** `PullRequest { number, title, author, head_branch, base_branch, state, merged, draft, checks_status, url }`

**UI/UX:** Sidebar "Pull Requests" panel. List with status icons. Detail view modal.

**Error Handling:**
- Repo not connected to account → "Connect account to see PRs".
- API rate limit → Show warning, backoff.

**Dependencies:** F-049.

---

### F-051: Multi-Repository Dashboard
**Phase:** M6 | **Priority:** P2  
**User Story:** As a user with many repos, I want an overview of all my repositories.

**Functional Requirements:**
1. Grid view of all tracked repositories.
2. Per-repo status: branch, uncommitted changes, ahead/behind, last activity.
3. Aggregated alerts: "3 repos need push", "2 repos have conflicts".
4. CI status per repo (if hosting connected).
5. Disk usage per repo and total.
6. Recent activity timeline across all repos.
7. Bulk actions: Fetch all, Stash all dirty repos.
8. AI summary: "Your work spread across 5 repos. 2 PRs awaiting review."
9. Filter by: needs attention, clean, behind remote, has uncommitted changes.

**Acceptance Criteria:**
- [ ] AC1: Dashboard loads cached data in < 1 second.
- [ ] AC2: Background refresh updates status badges.
- [ ] AC3: Bulk fetch runs in parallel.
- [ ] AC4: AI summary generated from real data.

**Technical Spec:**
- SQLite: Aggregate queries across `repositories` table.
- Background: Parallel status checks using `tokio::join_all`.
- Hosting APIs: Fetch CI status per repo.

**Data Model:** `DashboardAggregate { total_repos, dirty_repos, behind_repos, ahead_repos, total_disk_usage, recent_activity: Vec<ActivityEvent> }`

**UI/UX:** Home screen (F-006) enhanced. Filter chips. Bulk action bar. Activity feed sidebar.

**Error Handling:**
- One repo fails in bulk → Continue, show per-repo error indicator.

**Dependencies:** F-006, F-012, F-049.

---

## MILESTONE 7: AI-Native Tooling & MCP Interface
**Goal:** AI assists users without direct mutation access. Natural language Git operations.

---

### F-052: AI Safety Layer
**Phase:** M7 | **Priority:** P0  
**User Story:** As a user, I want AI to suggest but never accidentally destroy my work.

**Functional Requirements:**
1. AI has READ-ONLY access to repository state.
2. AI generates plan (sequence of Git operations) in structured format.
3. Plan displayed to user with human-readable explanation.
4. User must explicitly approve each plan before execution.
5. Each planned operation creates a checkpoint before execution.
6. After execution, AI validates result and reports success/failure.
7. Rollback available if AI operation fails.
8. AI cannot access credentials, SSH keys, or tokens.
9. All AI interactions logged for audit.

**Acceptance Criteria:**
- [ ] AC1: AI analysis shows "Read-only analysis complete" badge.
- [ ] AC2: Plan modal shows each step with preview.
- [ ] AC3: User must click "Approve and Execute" for each plan.
- [ ] AC4: Failed AI operation auto-rolls back.
- [ ] AC5: No credentials exposed to AI context.

**Technical Spec:**
- Rust: AI tools registry. Each tool has `can_mutate: bool` flag. Mutating tools require approval.
- MCP: Implement Model Context Protocol server exposing read-only Git tools.
- Plan format: JSON array of operations with `type`, `args`, `risk_level`.

**Data Model:** `AiPlan { id, prompt, steps: Vec<AiStep>, status: Pending | Approved | Executed | Failed | RolledBack, user_approved: bool }`  
`AiStep { operation, args, risk_level: Low | Medium | High | Destructive, checkpoint_id: Option<Uuid> }`

**UI/UX:** AI panel (sidebar or bottom). Chat interface. Plan preview modal with red/green indicators. Approve/Reject buttons.

**Error Handling:**
- AI hallucinates invalid operation → Validate against allowed operations, reject.
- Execution fails mid-plan → Rollback completed steps.

**Dependencies:** F-042 (Checkpoints).

---

### F-053: Natural Language Git Operations
**Phase:** M7 | **Priority:** P1  
**User Story:** As a user, I want to type "undo my last commit but keep the changes" and have it done.

**Functional Requirements:**
1. Chat input for natural language commands.
2. Examples:
   - "Undo last commit but keep changes" → `git reset --soft HEAD~1`
   - "Clean up all merged branches" → Delete local branches merged into main
   - "I messed up the rebase, fix it" → Abort rebase, restore original state
   - "Make my commit messages better" → Rewrite last 3 commits with improved messages
3. AI translates to Git operations plan.
4. Preview shown before execution.
5. Execute on approval.
6. Explain what was done in plain English.

**Acceptance Criteria:**
- [ ] AC1: "Undo last commit" produces correct soft reset plan.
- [ ] AC2: "Clean up merged branches" identifies merged branches and plans deletion.
- [ ] AC3: Complex requests broken into multiple steps.
- [ ] AC4: Explanation clear enough for Git beginners.

**Technical Spec:**
- LLM prompt engineering with structured output (JSON mode).
- Context: Current repo state (branch, status, recent commits) provided as system prompt context.
- Tool calling: LLM selects from available Git tools.

**Data Model:** `NlGitRequest { prompt, generated_plan: AiPlan, execution_result: Option<String> }`

**UI/UX:** Chat panel with suggestion chips. Plan preview cards. Execution progress.

**Error Handling:**
- Ambiguous request → AI asks clarifying question.
- Unsupported operation → "I can't do that yet, but here's the manual way."

**Dependencies:** F-052.

---

### F-054: AI Commit Message Generation
**Phase:** M7 | **Priority:** P1  
**User Story:** As a user, I want AI to suggest commit messages based on my changes.

**Functional Requirements:**
1. Analyze staged diff.
2. Generate 3 commit message suggestions (conventional commits format optional).
3. Show reasoning for each suggestion.
4. One-click apply suggestion.
5. Learn from user's past commit messages (optional, local-only).
6. Support commit message body generation.
7. Co-author detection from diff.

**Acceptance Criteria:**
- [ ] AC1: Suggestions generated in < 2 seconds.
- [ ] AC2: Messages follow conventional commits if configured.
- [ ] AC3: One-click fills commit message field.
- [ ] AC4: Body generated for complex changes.

**Technical Spec:**
- Frontend: Call LLM API with diff content as context.
- Diff truncation: If diff > 4000 tokens, summarize file changes only.
- Prompt: "Analyze this git diff and suggest 3 commit messages following conventional commits."

**Data Model:** `AiCommitSuggestion { subject, body, type, scope, reasoning, confidence }`

**UI/UX:** "✨ AI Suggest" button in commit panel. Dropdown with 3 options. Reasoning tooltip.

**Error Handling:**
- Diff too large → Suggest based on file names and change types.
- LLM unavailable → Show error, fallback to templates.

**Dependencies:** F-022.

---

### F-055: AI Conflict Resolution Assistant
**Phase:** M7 | **Priority:** P1  
**User Story:** As a user, I want AI to suggest how to resolve merge conflicts.

**Functional Requirements:**
1. When conflict detected, AI analyzes BASE, OURS, THEIRS versions.
2. Suggests resolution for each conflicted file.
3. Shows confidence score per suggestion.
4. One-click "Apply AI resolution" per file or all files.
5. AI explains why it chose that resolution.
6. User can edit AI suggestion before applying.
7. For complex conflicts, AI suggests manual resolution strategy.

**Acceptance Criteria:**
- [ ] AC1: AI suggestion appears within 3 seconds of conflict detection.
- [ ] AC2: Suggestion preserves intent of both changes where possible.
- [ ] AC3: Low confidence suggestions flagged for manual review.
- [ ] AC4: Apply all resolves all conflicts with AI suggestions.

**Technical Spec:**
- LLM context: Three versions of file + conflict markers + operation type (merge/rebase).
- Prompt: "Resolve this merge conflict by combining both changes intelligently."
- Safety: AI suggestion is just text; user must click apply (F-052 safety layer).

**Data Model:** `AiConflictResolution { file_path, suggested_content, confidence, explanation, base_version, ours_version, theirs_version }`

**UI/UX:** Conflict resolver shows "🤖 AI Suggest" button. Suggestion preview pane. Confidence badge.

**Error Handling:**
- Binary conflict → AI cannot suggest, show manual choice.
- Too many conflicts → Suggest strategy, not per-file resolution.

**Dependencies:** F-040, F-052.

---

### F-056: AI Repository Health & Recommendations
**Phase:** M7 | **Priority:** P2  
**User Story:** As a user, I want AI to analyze my repository and suggest improvements.

**Functional Requirements:**
1. Analyze repository state periodically.
2. Suggest: stale branch cleanup, large file warnings, security vulnerability scanning (detect secrets), commit message quality, rebase vs merge recommendations.
3. Natural language explanation of repository state.
4. One-click execution of safe recommendations.
5. Trend analysis (repo growth, commit velocity).

**Acceptance Criteria:**
- [ ] AC1: Health score calculated from multiple factors.
- [ ] AC2: Stale branches identified correctly (> 3 months old, merged).
- [ ] AC3: Large files detected (> 100MB or LFS pattern mismatch).
- [ ] AC4: Recommendations actionable with one click.

**Technical Spec:**
- Rust: Gather metrics via git2. Pass to LLM with structured prompt.
- Secret scanning: Regex patterns for API keys, passwords.

**Data Model:** `AiHealthReport { score, issues: Vec<HealthIssue>, recommendations: Vec<Recommendation> }`

**UI/UX:** Dashboard widget. "Health Score" gauge. Expandable recommendations list.

**Error Handling:**
- Analysis timeout → Show partial results.
- False positive secret → Allow dismiss.

**Dependencies:** F-011, F-052.

---

## MILESTONE 8: Plugin SDK, Enterprise, Ecosystem
**Goal:** Extensible platform with enterprise features.

---

### F-057: Plugin System Architecture
**Phase:** M8 | **Priority:** P3  
**User Story:** As a developer, I want to extend the app with custom plugins.

**Functional Requirements:**
1. Plugin manifest format (JSON).
2. Plugin types: Git operation hook, Custom panel, Theme, Integration, AI tool.
3. API for plugins:
   - Read repository state
   - Register custom commands
   - Add UI panels
   - React to Git events
   - Access AI tool registry
4. Plugin marketplace/discovery (optional).
5. Plugin sandboxing (WASM or restricted JS).
6. Plugin settings UI.
7. Enable/disable plugins.

**Acceptance Criteria:**
- [ ] AC1: Plugin loads and registers successfully.
- [ ] AC2: Custom panel appears in UI.
- [ ] AC3: Git event hooks execute in correct order.
- [ ] AC4: Disabled plugin has no performance impact.

**Technical Spec:**
- Tauri: Plugin system via Tauri plugins or custom WASM runtime.
- API: Expose selected Rust functions via structured IPC.
- Sandboxing: WASMtime or Deno runtime for untrusted plugins.

**Data Model:** `PluginManifest { name, version, author, entry_point, permissions: Vec<String>, hooks: Vec<String> }`

**UI/UX:** Settings > Plugins. List with toggle. Install from file or marketplace.

**Error Handling:**
- Plugin crash → Isolate, show error, disable plugin.
- Permission violation → Block and warn user.

**Dependencies:** Core app stable.

---

### F-058: Enterprise Features
**Phase:** M8 | **Priority:** P3  
**User Story:** As an enterprise user, I need compliance, signing, and policy enforcement.

**Functional Requirements:**
1. Commit signing enforcement (GPG or SSH required).
2. Protected branch policies (no direct push, require PR).
3. Audit log of all operations (who, what, when).
4. Compliance reporting (CSV/JSON export).
5. Centralized configuration (enterprise Git config).
6. SSO/SAML authentication for hosting platforms.
7. Data loss prevention (DLP) scanning before commit.
8. Mandatory review requirements.

**Acceptance Criteria:**
- [ ] AC1: Unsigned commits blocked if policy enabled.
- [ ] AC2: Audit log immutable and exportable.
- [ ] AC3: DLP scan detects secrets before commit.
- [ ] AC4: SSO login works with enterprise IdP.

**Technical Spec:**
- Policy engine: Configurable rules in JSON/YAML.
- Audit: SQLite append-only log + optional remote streaming.
- DLP: Regex + entropy scanning (like GitLeaks).

**Data Model:** `AuditLogEntry { timestamp, user, repo, operation, result, checksum }`  
`PolicyRule { type, severity, enabled, config }`

**UI/UX:** Settings > Enterprise. Policy editor. Audit log viewer.

**Error Handling:**
- Policy violation → Block operation with explanation.
- Audit log full → Warn admin, rotate logs.

**Dependencies:** F-022, F-045.

---

### F-059: Custom Themes
**Phase:** M8 | **Priority:** P3  
**User Story:** As a user, I want to customize the app's appearance.

**Functional Requirements:**
1. Built-in themes: Light, Dark, High Contrast, System.
2. Custom theme editor: colors for backgrounds, text, accents, diff additions, diff deletions, branch colors.
3. Import/export theme JSON.
4. Font family and size selection (monospace and UI).
5. Density settings (compact, comfortable, spacious).
6. Sidebar position (left, right, hidden).
7. Panel arrangement (drag and drop).

**Acceptance Criteria:**
- [ ] AC1: Theme changes apply immediately without restart.
- [ ] AC2: Custom theme persists across sessions.
- [ ] AC3: Diff colors customizable independently.
- [ ] AC4: Font changes affect all code views.

**Technical Spec:**
- CSS variables or Tailwind config dynamic injection.
- Theme stored in SQLite settings.

**Data Model:** `Theme { name, colors: ThemeColors, font_family, font_size, density, layout_config }`

**UI/UX:** Settings > Appearance. Color picker. Live preview.

**Error Handling:**
- Invalid color format → Reject with error.
- Font not found → Fallback to system default.

**Dependencies:** None.

---

### F-060: Keyboard Shortcuts & Command Palette
**Phase:** M8 | **Priority:** P2  
**User Story:** As a power user, I want keyboard-driven workflows.

**Functional Requirements:**
1. Command palette (Ctrl/Cmd+Shift+P) with fuzzy search.
2. All actions accessible via command palette.
3. Configurable keyboard shortcuts.
4. Preset keymaps: Default, VS Code, Vim, Emacs.
5. Shortcut conflict detection.
6. Cheat sheet viewer (printable).
7. Context-aware shortcuts (different panels have different shortcuts).

**Acceptance Criteria:**
- [ ] AC1: Command palette opens in < 100ms.
- [ ] AC2: Fuzzy search finds "commit" from "cm".
- [ ] AC3: Custom shortcuts saved immediately.
- [ ] AC4: Conflict shows warning and suggests alternative.

**Technical Spec:**
- Frontend: `cmdk` or custom command palette component.
- Registry: Map action IDs to shortcuts. Validate on change.

**Data Model:** `Keybinding { action_id, keys: Vec<String>, context: Global | Panel | Modal }`

**UI/UX:** Settings > Keyboard. Table with editable shortcuts. Command palette overlay.

**Error Handling:**
- Invalid key combination → Show error.
- System shortcut conflict → Warn but allow override.

**Dependencies:** All UI features.

---

# SECTION 3: STATE MACHINES

## 3.1 Repository State Machine
```
[Clean] --merge--> [Merging]
[Clean] --rebase--> [Rebasing]
[Clean] --cherry-pick--> [CherryPicking]
[Clean] --revert--> [Reverting]
[Clean] --apply--> [Applying]
[Clean] --bisect--> [Bisecting]
[Clean] --stash-rebase--> [StashRebasing]

[Merging] --resolve--> [Clean]  (if all conflicts resolved + commit)
[Merging] --abort--> [Clean]
[Rebasing] --continue--> [Clean]  (if all done)
[Rebasing] --abort--> [Clean]
[CherryPicking] --continue--> [Clean]
[CherryPicking] --abort--> [Clean]
[Reverting] --continue--> [Clean]
[Reverting] --abort--> [Clean]
```

**Agent Implementation Rule:** Before any operation, check `repo.state()`. If not `Clean`, restrict operations to those valid for current state.

## 3.2 AI Operation State Machine
```
[Idle] --user prompt--> [Planning]
[Planning] --plan generated--> [Awaiting Approval]
[Awaiting Approval] --user approves--> [Executing]
[Awaiting Approval] --user rejects--> [Idle]
[Executing] --success--> [Validating]
[Executing] --failure--> [Rolling Back]
[Validating] --valid--> [Idle]
[Validating] --invalid--> [Rolling Back]
[Rolling Back] --success--> [Idle]
[Rolling Back] --failure--> [Recovery Needed]
```

## 3.3 Checkpoint Lifecycle
```
[Created] --30 days--> [Expired]  (auto-purge)
[Created] --rollback--> [RolledBack]
[Created] --repo deleted--> [Orphaned]  (cleanup task)
```

---

# SECTION 4: API SPECIFICATION (Frontend ↔ Backend)

## 4.1 IPC Command Registry
All commands prefixed with `git:`.

| Command | Input | Output | Mutates | Phase |
|---------|-------|--------|---------|-------|
| `git:detect_installation` | `{}` | `GitInstallation` | No | M1 |
| `git:read_config` | `{ level: "system"\|"global"\|"local", repo_id? }` | `Vec<ConfigEntry>` | No | M1 |
| `git:write_config` | `{ level, key, value, repo_id? }` | `bool` | Yes | M1 |
| `git:discover_repos` | `{ paths: Vec<String>, max_depth: number }` | `Vec<RepoCard>` | No | M1 |
| `git:init_repo` | `{ path, template?, license?, readme? }` | `RepositoryHandle` | Yes | M1 |
| `git:clone_repo` | `CloneOptions` | `RepositoryHandle` | Yes | M1 |
| `git:open_repo` | `{ path }` | `RepositoryHandle` | No | M1 |
| `git:close_repo` | `{ repo_id }` | `bool` | No | M1 |
| `git:get_status` | `{ repo_id }` | `StatusResult` | No | M2 |
| `git:stage_file` | `{ repo_id, path }` | `bool` | Yes | M2 |
| `git:unstage_file` | `{ repo_id, path }` | `bool` | Yes | M2 |
| `git:stage_hunk` | `{ repo_id, path, hunk }` | `bool` | Yes | M2 |
| `git:stage_lines` | `{ repo_id, path, selections }` | `bool` | Yes | M2 |
| `git:discard_changes` | `{ repo_id, paths, strategy }` | `bool` | Yes | M2 |
| `git:get_diff` | `{ repo_id, path, staged?, commit_a?, commit_b? }` | `DiffView` | No | M2 |
| `git:commit` | `CommitRequest` | `Commit` | Yes | M2 |
| `git:amend_commit` | `{ repo_id, message?, author? }` | `Commit` | Yes | M2 |
| `git:get_history` | `{ repo_id, branch?, offset, limit }` | `Vec<CommitListItem>` | No | M2 |
| `git:get_commit` | `{ repo_id, oid }` | `CommitDetail` | No | M2 |
| `git:get_branches` | `{ repo_id }` | `BranchList` | No | M3 |
| `git:create_branch` | `{ repo_id, name, from }` | `Branch` | Yes | M3 |
| `git:delete_branch` | `{ repo_id, name, force }` | `bool` | Yes | M3 |
| `git:checkout_branch` | `{ repo_id, name, strategy }` | `CheckoutResult` | Yes | M3 |
| `git:get_graph` | `{ repo_id, branch?, limit }` | `Vec<GraphNode>` | No | M3 |
| `git:search_history` | `HistorySearchQuery` | `Vec<CommitListItem>` | No | M3 |
| `git:get_remotes` | `{ repo_id }` | `Vec<Remote>` | No | M3 |
| `git:fetch` | `{ repo_id, remote?, prune? }` | `FetchResult` | Yes | M3 |
| `git:pull` | `{ repo_id, remote?, branch?, strategy }` | `PullResult` | Yes | M3 |
| `git:push` | `PushRequest` | `PushResult` | Yes | M3 |
| `git:merge` | `MergeRequest` | `MergeResult` | Yes | M4 |
| `git:start_rebase` | `RebasePlan` | `RebaseState` | Yes | M4 |
| `git:rebase_continue` | `{ repo_id }` | `RebaseState` | Yes | M4 |
| `git:rebase_abort` | `{ repo_id }` | `bool` | Yes | M4 |
| `git:cherry_pick` | `CherryPickRequest` | `CherryPickResult` | Yes | M4 |
| `git:revert` | `RevertRequest` | `RevertResult` | Yes | M4 |
| `git:reset` | `ResetRequest` | `ResetResult` | Yes | M4 |
| `git:get_conflicts` | `{ repo_id }` | `Vec<ConflictFile>` | No | M4 |
| `git:resolve_conflict` | `{ repo_id, path, resolution }` | `bool` | Yes | M4 |
| `git:stash_save` | `{ repo_id, message?, flags }` | `Stash` | Yes | M4 |
| `git:stash_apply` | `{ repo_id, index }` | `bool` | Yes | M4 |
| `git:stash_pop` | `{ repo_id, index }` | `bool` | Yes | M4 |
| `git:stash_drop` | `{ repo_id, index }` | `bool` | Yes | M4 |
| `git:create_checkpoint` | `{ repo_id, operation }` | `Checkpoint` | Yes | M4 |
| `git:rollback_checkpoint` | `{ checkpoint_id }` | `bool` | Yes | M4 |
| `git:get_checkpoints` | `{ repo_id }` | `Vec<Checkpoint>` | No | M4 |
| `git:get_reflog` | `{ repo_id, ref_name }` | `Vec<ReflogEntry>` | No | M4 |
| `git:recover_branch` | `{ repo_id, reflog_entry }` | `Branch` | Yes | M4 |
| `git:get_worktrees` | `{ repo_id }` | `Vec<WorktreeInfo>` | No | M5 |
| `git:add_worktree` | `{ repo_id, path, branch }` | `WorktreeInfo` | Yes | M5 |
| `git:get_submodules` | `{ repo_id }` | `Vec<SubmoduleInfo>` | No | M5 |
| `git:update_submodules` | `{ repo_id, recursive? }` | `bool` | Yes | M5 |
| `git:get_hooks` | `{ repo_id }` | `Vec<Hook>` | No | M5 |
| `git:run_maintenance` | `{ repo_id, task }` | `MaintenanceResult` | Yes | M5 |
| `git:hosting_get_prs` | `{ repo_id, status? }` | `Vec<PullRequest>` | No | M6 |
| `git:hosting_create_pr` | `{ repo_id, title, body, head, base, draft? }` | `PullRequest` | Yes | M6 |
| `git:ai_analyze_repo` | `{ repo_id }` | `AiHealthReport` | No | M7 |
| `git:ai_generate_commit_message` | `{ repo_id, diff }` | `Vec<AiCommitSuggestion>` | No | M7 |
| `git:ai_suggest_conflict_resolution` | `{ repo_id, path }` | `AiConflictResolution` | No | M7 |
| `git:ai_natural_language_command` | `{ repo_id, prompt }` | `AiPlan` | No | M7 |
| `git:ai_execute_plan` | `{ plan_id }` | `AiPlanResult` | Yes | M7 |

## 4.2 Event Stream (Backend → Frontend)
| Event | Payload | Description |
|-------|---------|-------------|
| `git:status_changed` | `{ repo_id, status: StatusResult }` | Working tree changed |
| `git:fetch_progress` | `{ repo_id, received, total, stage }` | Fetch progress update |
| `git:push_progress` | `{ repo_id, written, total }` | Push progress update |
| `git:clone_progress` | `{ received, resolved, stage }` | Clone progress update |
| `git:operation_complete` | `{ repo_id, operation, success, message }` | Generic operation done |
| `git:conflict_detected` | `{ repo_id, files: Vec<String> }` | Conflicts need resolution |
| `git:rebase_paused` | `{ repo_id, step, total, reason }` | Rebase waiting for user |
| `git:checkpoint_created` | `{ checkpoint }` | New checkpoint available |
| `git:health_alert` | `{ repo_id, severity, message }` | Repository health issue |
| `git:ai_plan_ready` | `{ plan }` | AI plan generated for approval |
| `git:ai_step_complete` | `{ plan_id, step_index, result }` | Plan execution progress |

---

# SECTION 5: UI/UX COMPONENT MAP

## 5.1 Core Layout
```
AppWindow
├── TitleBar (custom for Tauri: repo name, branch, window controls)
├── MenuBar (File, Edit, View, Repository, Branch, Commit, Tools, Help)
├── Toolbar (Pull, Push, Fetch, Branch, Stash, Commit buttons)
├── MainLayout (split panes, resizable)
│   ├── Sidebar (collapsible, 250px default)
│   │   ├── RepoNavigator (repo list, repo groups)
│   │   ├── BranchPanel (local/remotes)
│   │   ├── StatusPanel (staged/unstaged/untracked)
│   │   ├── StashPanel
│   │   ├── SubmodulePanel
│   │   └── RemotePanel
│   ├── CenterPanel (tabbed)
│   │   ├── GraphView (commit DAG)
│   │   ├── HistoryView (commit list)
│   │   ├── DiffView (file diffs)
│   │   ├── CommitDetailView
│   │   └── HostingView (PRs, issues)
│   └── RightPanel (collapsible, 300px default)
│       ├── CommitPanel (message, actions)
│       ├── FileDetailPanel (diff preview)
│       ├── PropertiesPanel (commit/branch details)
│       └── AiPanel (chat, suggestions)
├── BottomPanel (collapsible, 200px default)
│   ├── TerminalPanel (hook output, plumbing commands)
│   ├── ProgressPanel (operation progress)
│   └── NotificationPanel (toasts, alerts)
└── Modals (overlay)
    ├── CloneModal
    ├── InitModal
    ├── MergePreviewModal
    ├── ConflictResolverModal
    ├── RebaseInteractiveModal
    ├── SettingsModal
    ├── CheckoutSafetyModal
    ├── ResetConfirmModal
    └── AiPlanApprovalModal
```

## 5.2 Component Inventory (React)
| Component | File | Props | State | Phase |
|-----------|------|-------|-------|-------|
| `AppShell` | `AppShell.tsx` | `theme` | `sidebarOpen, rightPanelOpen, bottomPanelOpen` | M1 |
| `RepoCard` | `RepoCard.tsx` | `repo: RepoCard` | `hover` | M1 |
| `Dashboard` | `Dashboard.tsx` | `repos` | `filter, searchQuery` | M1 |
| `StatusPanel` | `StatusPanel.tsx` | `repoId, status` | `selectedFiles, expandedSections` | M2 |
| `FileListItem` | `FileListItem.tsx` | `file: FileStatus, selected` | `hover` | M2 |
| `DiffViewer` | `DiffViewer.tsx` | `diff: DiffView, mode` | `viewMode, hideWhitespace, selectedLines` | M2 |
| `CommitPanel` | `CommitPanel.tsx` | `repoId, stagedCount` | `message, amend, sign, coAuthors` | M2 |
| `HistoryList` | `HistoryList.tsx` | `commits, selectedIds` | `sortKey, filter` | M2 |
| `CommitGraph` | `CommitGraph.tsx` | `nodes, edges, selectedId` | `zoom, pan, selectedId` | M3 |
| `BranchManager` | `BranchManager.tsx` | `branches` | `searchQuery, sortKey` | M3 |
| `ConflictResolver` | `ConflictResolver.tsx` | `files: ConflictFile[]` | `selectedFile, resolutionMode` | M4 |
| `RebaseTimeline` | `RebaseTimeline.tsx` | `plan: RebasePlan` | `draggingId` | M4 |
| `RecoveryCenter` | `RecoveryCenter.tsx` | `repoId` | `activeTab` | M4 |
| `AiChatPanel` | `AiChatPanel.tsx` | `repoId` | `messages, isTyping` | M7 |
| `AiPlanPreview` | `AiPlanPreview.tsx` | `plan: AiPlan` | `expandedSteps` | M7 |
| `CommandPalette` | `CommandPalette.tsx` | `open` | `query, selectedIndex` | M8 |

---

# SECTION 6: TESTING MATRIX

## 6.1 Unit Tests (Rust Backend)
| Module | Test Cases | Coverage Target |
|--------|-----------|-----------------|
| `git::installation` | Detect, version parse, missing, custom path | 100% |
| `git::config` | Read system/global/local, write, invalid, backup | 100% |
| `git::repository` | Open, init, clone, health, close | 100% |
| `git::status` | All file states, submodule, binary, ignored | 100% |
| `git::staging` | File, hunk, line, discard, binary | 100% |
| `git::commit` | Normal, amend, sign, empty, hook | 100% |
| `git::branch` | Create, delete, rename, checkout, merge | 100% |
| `git::graph` | Layout algorithm, lane assignment, merge nodes | 95% |
| `git::merge` | FF, no-FF, squash, conflict, abort | 100% |
| `git::rebase` | Pick, reword, squash, conflict, abort | 100% |
| `git::reset` | Soft, mixed, hard, keep, checkpoint | 100% |
| `git::stash` | Save, apply, pop, drop, branch | 100% |
| `git::checkpoint` | Create, rollback, expire, corrupt | 100% |
| `git::remote` | Add, remove, fetch, push, auth | 95% |

## 6.2 Integration Tests
| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Clone → Commit → Push | Clone repo, make change, stage, commit, push | Remote has new commit |
| Branch → Merge → Delete | Create branch, commit, merge to main, delete branch | Clean history, branch gone |
| Rebase with conflict | Start rebase, encounter conflict, resolve, continue | History rewritten cleanly |
| Stash → Checkout → Pop | Stash changes, checkout other branch, pop stash | Changes restored |
| Reset hard → Rollback | Reset hard, click rollback in Time Machine | Original state restored |
| AI plan → Approve → Execute | Ask AI to clean branches, approve plan, execute | Branches deleted, rollback available |

## 6.3 E2E Tests (Playwright/Tauri Driver)
| Flow | Critical Path |
|------|--------------|
| First launch → Clone → Open → Commit | P0 |
| Conflict resolution → Continue merge | P0 |
| Interactive rebase drag-and-drop | P1 |
| AI natural language → Plan approval | P1 |
| Plugin install → Custom panel | P3 |

## 6.4 Performance Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| App startup | < 2s | Cold start to dashboard |
| Repo open (cached) | < 1s | Click to interactive |
| Repo open (cold) | < 3s | First time open |
| Status refresh | < 500ms | File change to UI update |
| Commit graph render (100 commits) | < 1s | First paint |
| Commit graph scroll (10k commits) | 60fps | Scroll benchmark |
| Diff render (1MB file) | < 500ms | First paint |
| Search history (10k commits) | < 1s | Query to results |
| AI commit suggestion | < 2s | Click to suggestion display |
| Checkpoint creation | < 100ms | Pre-operation snapshot |

---

# SECTION 7: SECURITY & PRIVACY

## 7.1 Credential Security
- SSH keys: Never copied, only path references. Agent integration only.
- PATs: Stored in OS keychain (Keychain/Keyring/Secret Service). Encrypted at rest.
- No credentials in logs, AI context, or error messages.
- Memory scrubbing: Zero sensitive strings after use.

## 7.2 AI Safety
- AI context window excludes: credentials, `.env` files, private keys, large binary content.
- AI mutations require explicit user approval (no auto-execute).
- All AI plans logged with user identity and timestamp.
- Local LLM option for air-gapped environments.

## 7.3 Repository Safety
- Checkpoint before every destructive operation.
- Reflog never disabled by app.
- `.git` directory permissions preserved.
- No `git gc --prune=now` without explicit user action.

## 7.4 Enterprise Compliance
- Audit log append-only (tamper-evident checksums).
- DLP scanning before commit (optional).
- Configurable data retention policies.
- No telemetry without explicit opt-in.

---

# SECTION 8: ERROR CODES & HANDLING

## 8.1 Standardized Error Format
```typescript
interface GitAppError {
  code: string;           // Machine-readable
  message: string;        // Human-readable
  detail?: string;        // Technical detail
  recoverable: boolean;   // Can user fix and retry?
  suggestion?: string;    // Actionable suggestion
  operation?: string;     // Which operation failed
  checkpoint_id?: string; // Rollback available?
}
```

## 8.2 Error Code Registry
| Code | Message | Recoverable | Suggestion | Phase |
|------|---------|-------------|------------|-------|
| `GIT_NOT_FOUND` | Git is not installed | Yes | Install Git or set custom path | M1 |
| `GIT_REPO_NOT_FOUND` | Not a valid Git repository | Yes | Select a directory containing .git | M1 |
| `GIT_AUTH_FAILED` | Authentication failed | Yes | Check credentials or SSH key | M3 |
| `GIT_MERGE_CONFLICT` | Merge resulted in conflicts | Yes | Open conflict resolver to resolve | M4 |
| `GIT_REBASE_CONFLICT` | Rebase conflict at step N | Yes | Resolve conflicts and click Continue | M4 |
| `GIT_DIRTY_WORKTREE` | Working tree has uncommitted changes | Yes | Stash, commit, or discard changes | M3 |
| `GIT_NON_FAST_FORWARD` | Push rejected: non-fast-forward | Yes | Pull remote changes first | M3 |
| `GIT_CHECKPOINT_FAIL` | Failed to create safety checkpoint | No | Check disk space and permissions | M4 |
| `GIT_HOOK_FAILED` | Pre-commit hook failed | Yes | Fix issues or use --no-verify | M2 |
| `GIT_INDEX_LOCKED` | Git index is locked | Yes | Wait for other process or remove index.lock | M2 |
| `GIT_OBJECT_CORRUPT` | Git object database corrupted | Partial | Run recovery center or git fsck | M1 |
| `GIT_NETWORK_TIMEOUT` | Network operation timed out | Yes | Check connection and retry | M3 |
| `CORE_AI_PLAN_INVALID` | AI generated invalid operation plan | Yes | Reject plan and try different prompt | M7 |
| `CORE_PLUGIN_CRASH` | Plugin crashed during execution | Yes | Disable plugin and retry | M8 |

---

# SECTION 9: AI AGENT IMPLEMENTATION GUIDE

## 9.1 How to Use This Document
1. **Select Phase:** Start with Milestone 1 features only.
2. **Implement by Feature ID:** Each feature is self-contained. Follow FAT-REQ template.
3. **Data First:** Implement data models (Section 1) before UI.
4. **IPC Second:** Implement Rust command, then TypeScript frontend wrapper.
5. **Test per Feature:** Use Testing Matrix (Section 6) for each feature.

## 9.2 Implementation Order Within Phase
For each phase, implement in this order:
1. Data models and Rust structs
2. Backend commands (IPC handlers)
3. Frontend API wrappers (TanStack Query hooks)
4. UI components
5. Integration tests
6. Move to next feature

## 9.3 Critical Rules for AI Agents
- **NEVER** implement a mutating command without checkpoint integration (F-042).
- **ALWAYS** validate repository state before operations (Section 3.1).
- **NEVER** expose credentials to frontend or AI context.
- **ALWAYS** use virtualized lists for collections > 100 items.
- **ALWAYS** debounce file watcher events (300ms).
- **NEVER** block the main thread with Git operations.
- **ALWAYS** provide undo/rollback for destructive operations.
- **ALWAYS** return structured errors (Section 8).

## 9.4 File Naming Conventions
```
apps/tyegit/                    # UNIFIED: relocated from repo root, see Master Spec Part D
  src-tauri/
    Cargo.toml          # depends on: tye-core-models, tye-core-storage, tye-core-events,
                         #             tye-core-vault, tye-core-ai-gateway, tye-git-engine
  src/
    main.rs
    lib.rs
    commands/           # IPC handlers
      repo_commands.rs
      status_commands.rs
      commit_commands.rs
      branch_commands.rs
      merge_commands.rs
      rebase_commands.rs
      remote_commands.rs
      stash_commands.rs
      checkpoint_commands.rs
      ai_commands.rs
    domain/             # Business logic
      repo_manager.rs
      git_engine.rs
      status_engine.rs
      diff_engine.rs
      merge_engine.rs
      rebase_engine.rs
      checkpoint_service.rs
      auth_manager.rs
    models/               # Data structures
      repo.rs
      commit.rs
      branch.rs
      status.rs
      diff.rs
      conflict.rs
      checkpoint.rs
    cache/                # SQLite
      db.rs
      migrations/
    utils/                # Helpers
      error.rs
      paths.rs
      validation.rs
src/
  components/
    layout/
    repo/
    status/
    diff/
    commit/
    branch/
    graph/
    merge/
    rebase/
    ai/
    settings/
  hooks/                  # React hooks
    useRepo.ts
    useStatus.ts
    useCommits.ts
    useBranches.ts
    useDiff.ts
    useAi.ts
  stores/                 # Zustand
    repoStore.ts
    uiStore.ts
    aiStore.ts
  types/                  # TypeScript types
    git.ts
    api.ts
    ui.ts
  lib/
    api.ts                # Tauri IPC wrappers
    utils.ts
```

---

# SECTION 10: GLOSSARY FOR AI AGENTS

| Term | Definition |
|------|------------|
| **OID** | Object ID (SHA-1 hash) identifying Git objects |
| **HEAD** | Current commit reference (usually symbolic ref to branch) |
| **Index** | Staging area (`.git/index`) |
| **Worktree** | Working directory files (checked out) |
| **Ref** | Reference (branch, tag, remote branch) |
| **Refspec** | Mapping between local and remote refs |
| **Fast-Forward** | Merge where target is ancestor of source (linear) |
| **Reflog** | Log of all ref updates (safety net) |
| **Hunk** | Contiguous block of diff lines |
| **Checkpoint** | App-level snapshot before destructive operation |
| **MCP** | Model Context Protocol (AI tool interface) |
| **FFI** | Foreign Function Interface (Rust ↔ native Git) |
| **IPC** | Inter-Process Communication (Frontend ↔ Backend) |
| **OID** | 40-character hexadecimal SHA-1 hash |
| **Bare Repo** | Repository without working directory |
| **Detached HEAD** | HEAD points directly to commit, not branch |
| **Upstream** | Remote branch that local branch tracks |
| **Force-with-lease** | Safe force push that fails if remote changed |
| **Rerere** | Reuse Recorded Resolution (remember conflict fixes) |
| **Pickaxe** | Search commits by content changes (`-S`) |

---

**END OF SPECIFICATION**
**Total Features:** 60 core features + 30 sub-capabilities = 90+ implementable units  
**Total Pages:** ~50 (if printed)  
**Estimated Implementation:** 6-12 months with 3-4 engineers  
**AI Agent Ready:** YES — every feature has ID, acceptance criteria, data model, and API spec.
-e 

<!-- ============================================================ -->
<!-- PART 3: TYEAPI — FULL MERGED SPECIFICATION -->
<!-- ============================================================ -->

# AI-AGENT-READY MASTER SPECIFICATION
## API Tester Desktop Application — Complete Technical Blueprint
**Version:** 1.0.0  
**Format:** Agent-Executable Specification (AES)  
**Total Features:** 56+  
**Milestones:** 8  
**Target Stack:** React + TypeScript + Tailwind (Frontend) | Rust + Tauri (Backend) | SQLite (Cache/History) | reqwest + tokio (HTTP Engine)

---

## DOCUMENT STRUCTURE FOR AI AGENTS
Each section follows the **FAT-REQ** template:  
`Feature ID | User Story | Functional Requirements | Acceptance Criteria | Technical Spec | Data Model | UI/UX | Error Handling | Dependencies | Phase`

---

---

## ⚑ UNIFIED-SUITE PATCH NOTES (apply before implementing)
This is TyeApi's full original specification (formerly "API Tester Desktop"),
merged into the tye platform per `TYE_PLATFORM_UNIFIED_SPEC.md`. Mechanical
changes applied throughout this document; everything else below is verbatim
from the original spec:

1. **`Workspace` renamed to `Project` throughout** (struct, IPC commands,
   SQL tables, UI copy) — it is now literally the shared root `Project` object
   from Master Spec Part C.1. Module-specific fields (`collections`,
   `global_variables`) live under `Project.api` (`ApiProjectState`).
2. **`projects` and `environments` SQLite tables removed** from this file's
   local schema — replaced by the shared `~/.tye/registry.db` projects table
   and the shared `core_environments` table (Master Spec Parts C.2/C.3). This
   also fixes the literal `CREATE TABLE workspaces` / `CREATE TABLE environments`
   collision that existed against the TyeRun spec (Audit Finding B.1).
3. **Remaining SQLite tables prefixed `api_`**: `history`, `history_responses`,
   `auth_credentials`, `run_results`, `run_request_results`, `cookies`,
   `app_settings`, `certificates` — this file lives in the shared
   `<project_root>/.tye/project.db`, not its own database.
4. **Directory layout relocated** under `apps/tyeapi/` (Section 9.4).
5. **Credential Store** (Section 7.1, Layer 3) is implemented once in
   `tye-core-vault` and consumed here — same guarantees (OS keyring, AES-256-GCM
   fallback, zeroize on drop, never sent to frontend), just not re-implemented.
6. **NEW: AI Orchestration layer added** (absent in the original spec — Audit
   Finding B.7). TyeApi now gets the same `LAYER 2: AI ORCHESTRATION` that
   Tyegit and TyeRun already had, built on the shared `tye-core-ai-gateway`
   (Master Spec Part F). This is additive and does not block Milestones 1–8
   below — treat it as Milestone 9, scheduled in Phase 2 of the build roadmap.

### NEW — Milestone 9: AI Orchestration (additive, Phase 2)
| Command | Input | Output | Mutates |
|---|---|---|---|
| `api:ai_suggest_assertions` | `{ request_id, response_id }` | `Vec<AssertionSuggestion>` | No |
| `api:ai_explain_failure` | `{ response_id }` | `AiExplanation` | No |
| `api:ai_generate_request` | `{ project_id, prompt }` | `ApiRequest` (draft) | No |
| `api:ai_chat` | `{ project_id, message }` | `AiChatResponse` | No |

Safety rules: identical to Tyegit §7.2 / TyeRun §8.2 — AI context excludes
credentials/secrets, mutations require explicit approval, all plans logged.
Implemented once in `tye-core-ai-gateway::SafetyPolicy`, not re-specified here.

---

# SECTION 0: ARCHITECTURE BLUEPRINT

## 0.1 System Layers
```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: PRESENTATION (React 18 + TypeScript 5 + Tailwind)│
│  ├─ Component Library (Radix UI primitives)               │
│  ├─ State: Zustand (client) + TanStack Query (server)       │
│  ├─ Virtualization: tanstack-virtual / react-window         │
│  ├─ Code Editor: Monaco Editor (request body, scripts)      │
│  ├─ Response Renderers: JSON Tree, Table, Image, Hex, HTML  │
│  └─ GraphQL IDE: Custom query builder + introspection       │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2: REQUEST ORCHESTRATION (TypeScript + Tauri IPC)     │
│  ├─ Request Builder (templating, auth injection, validation)│
│  ├─ Environment Resolver (cascading variables)              │
│  ├─ Protocol Router (REST, WS, SSE, GraphQL, gRPC, TCP)     │
│  ├─ Collection Runner (sequential, parallel, conditional)   │
│  ├─ Script Engine Bridge (Rhai pre/post request)              │
│  └─ Import/Export Transformers (Postman, Bruno, cURL, OAI) │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3: APPLICATION SHELL (Tauri + Rust)                   │
│  ├─ Command Router (IPC handlers)                         │
│  ├─ Window Management (tabs, splits, popouts)             │
│  ├─ OS Integration (Notifications, Menu Bar, Protocol Assoc)│
│  ├─ Credential Store (Keychain/Keyring/Secret Service)      │
│  ├─ File System Watcher (notify crate — collection files)    │
│  └─ Update Service (auto-check, delta downloads)            │
├─────────────────────────────────────────────────────────────┤
│ LAYER 4: DOMAIN ENGINE (Rust)                               │
│  ├─ HTTP Engine (reqwest + hyper + rustls)                 │
│  ├─ Protocol Adapters (WS, SSE, gRPC, GraphQL, Raw TCP)    │
│  ├─ Templating Engine (Handlebars + custom env resolver)    │
│  ├─ Scripting Runtime (Rhai — sandboxed assertions)           │
│  ├─ Auth Manager (Basic, Bearer, OAuth2, API Key, HMAC)   │
│  ├─ Cookie Jar (persistent, domain-scoped, secure)          │
│  ├─ Proxy Engine (HTTP, SOCKS5, system proxy detection)     │
│  ├─ Certificate Manager (custom CA, client certs, pinning)  │
│  └─ Request/Response Transformers (compression, encoding)     │
├─────────────────────────────────────────────────────────────┤
│ LAYER 5: INFRASTRUCTURE & CACHE (Rust + SQLite)             │
│  ├─ History Store (SQLite: requests, responses, metadata)   │
│  ├─ Collection Store (flat files: JSON/TOML/Bru)          │
│  ├─ Environment Store (SQLite + file sync)                  │
│  ├─ Auth Vault (encrypted credentials + keyring refs)         │
│  ├─ Cache Layer (ETag, conditional requests, disk cache)      │
│  ├─ Event Bus (tokio channels — cross-module pub/sub)       │
│  └─ Background Scheduler (health checks, cache cleanup, sync)   │
├─────────────────────────────────────────────────────────────┤
│ LAYER 6: NATIVE & EXTERNAL BRIDGES                          │
│  ├─ cURL Converter (generate/parse cURL commands)           │
│  ├─ HAR Parser (import HTTP Archive)                        │
│  ├─ OpenAPI Generator (import spec → collections)            │
│  ├─ CLI Companion (headless collection runner for CI/CD)      │
│  └─ Plugin Host (WASM runtime for extensibility)            │
└─────────────────────────────────────────────────────────────┘
```

## 0.2 Data Flow Architecture
```
User Action → React Component → Zustand Store → TanStack Query
→ Tauri IPC Invoke → Rust Command Handler → Domain Service
→ Protocol Adapter → Network
→ Response Stream → Response Processor → SQLite History
→ Event emitted → Frontend reactive update
```

## 0.3 Critical Constraints
- **HTTP engine is reqwest + tokio.** Shell-out to cURL is fallback only for unsupported edge cases.
- **All requests are cancelable via CancellationToken.**
- **Response streaming is mandatory for payloads > 1MB.**
- **File watcher must debounce (300ms) and batch collection file changes.**
- **All network operations run on tokio threadpool, never block UI thread.**
- **Auth credentials NEVER exposed to frontend or scripting context directly.**
- **Collection files are flat-file first (Git-native), SQLite is for history/cache only.**
- **Scripting engine (Rhai) is sandboxed — no filesystem, no network access.**
- **Environment variables resolved server-side (Rust) to prevent secret leakage.**

---

# SECTION 1: CORE DATA MODELS & SCHEMAS

## 1.1 Project Model
```rust
struct Project {
    id: Uuid,
    name: String,
    path: PathBuf,                    // Root directory for collections
    collections: Vec<Collection>,
    environments: Vec<Environment>,
    global_variables: Vec<Variable>,
    settings: ProjectSettings,
    last_opened: DateTime<Utc>,
    created_at: DateTime<Utc>,
}

struct ProjectSettings {
    auto_save: bool,
    auto_follow_redirects: bool,
    max_redirects: u32,
    timeout_seconds: u64,
    ssl_verification: bool,
    proxy_mode: ProxyMode,              // System | Custom | None
    custom_proxy: Option<String>,
    request_layout: RequestLayout,      // SideBySide | Stacked
    theme: String,
    font_size: u16,
    word_wrap: bool,
    validate_certificates: bool,
    follow_cookies: bool,
    max_history_entries: usize,         // Default 10000
    auto_prune_history_days: u32,       // Default 30
}

enum ProxyMode {
    System,
    Custom,
    None,
}

enum RequestLayout {
    SideBySide,
    Stacked,
}
```

## 1.2 Collection Model
```rust
struct Collection {
    id: Uuid,
    name: String,
    description: Option<String>,
    path: PathBuf,                    // Relative to project: collections/users/
    parent_id: Option<Uuid>,          // For nested folders
    items: Vec<CollectionItem>,       // Folders or requests
    pre_request_script: Option<String>, // Rhai script
    post_request_script: Option<String>, // Rhai script
    auth: Option<AuthConfig>,
    variables: Vec<Variable>,
    metadata: CollectionMetadata,
}

enum CollectionItem {
    Folder(CollectionFolder),
    Request(RequestSummary),
}

struct CollectionFolder {
    id: Uuid,
    name: String,
    description: Option<String>,
    items: Vec<CollectionItem>,
    pre_request_script: Option<String>,
    post_request_script: Option<String>,
    auth: Option<AuthConfig>,
    variables: Vec<Variable>,
}

struct CollectionMetadata {
    version: String,                  // File format version
    schema: String,                   // "api-tester-v1"
    exported_from: Option<String>,    // Postman, Bruno, etc.
    exported_at: Option<DateTime<Utc>>,
    sort_order: usize,
}

struct RequestSummary {
    id: Uuid,
    name: String,
    method: HttpMethod,
    url: String,                      // Templated
    protocol: Protocol,
    is_locked: bool,                  // Prevent accidental edit
}
```

## 1.3 Request Model
```rust
struct ApiRequest {
    id: Uuid,
    name: String,
    description: Option<String>,
    method: HttpMethod,
    url: String,                      // Raw with {{templates}}
    resolved_url: Option<String>,     // After variable substitution
    headers: Vec<Header>,
    query_params: Vec<QueryParam>,
    path_params: Vec<PathParam>,
    body: RequestBody,
    auth: AuthConfig,
    protocol: Protocol,

    // Protocol-specific configs
    websocket_config: Option<WebSocketConfig>,
    graphql_config: Option<GraphQLConfig>,
    grpc_config: Option<GrpcConfig>,
    sse_config: Option<SseConfig>,

    // Execution config
    pre_request_script: Option<String>,
    post_request_script: Option<String>,
    tests: Vec<TestAssertion>,
    settings: RequestSettings,
}

enum HttpMethod {
    GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, TRACE, CONNECT,
    CUSTOM(String),
}

enum Protocol {
    Http,
    WebSocket,
    ServerSentEvents,
    GraphQL,
    Grpc,
    RawTcp,
    RawUdp,
}

struct Header {
    key: String,
    value: String,
    enabled: bool,
    description: Option<String>,
}

struct QueryParam {
    key: String,
    value: String,
    enabled: bool,
    description: Option<String>,
}

struct PathParam {
    key: String,
    value: String,
    description: Option<String>,
}

struct RequestBody {
    body_type: BodyType,
    content: Option<String>,          // Raw content
    file_path: Option<PathBuf>,       // For file upload
    form_data: Vec<FormField>,
    multipart: Vec<MultipartField>,
}

enum BodyType {
    None,
    Text,
    Json,
    Xml,
    Html,
    FormUrlEncoded,
    MultipartForm,
    Binary,
    GraphQL,
}

struct FormField {
    key: String,
    value: String,
    enabled: bool,
}

struct MultipartField {
    key: String,
    value: Option<String>,
    file_path: Option<PathBuf>,
    content_type: Option<String>,
    enabled: bool,
}

struct RequestSettings {
    follow_redirects: Option<bool>,     // None = inherit from project
    max_redirects: Option<u32>,
    timeout_seconds: Option<u64>,
    ssl_verification: Option<bool>,
    proxy_mode: Option<ProxyMode>,
    custom_proxy: Option<String>,
    retry_count: u32,
    retry_delay_ms: u64,
    validate_response: bool,
    save_response: bool,
    capture_cookies: bool,
}
```

## 1.4 Response Model
```rust
struct ApiResponse {
    id: Uuid,
    request_id: Uuid,
    timestamp: DateTime<Utc>,

    // Timing
    timing: ResponseTiming,

    // Status
    status_code: Option<u16>,
    status_text: Option<String>,
    http_version: Option<String>,

    // Headers
    headers: Vec<Header>,
    cookies: Vec<Cookie>,

    // Body
    body: ResponseBody,
    body_size_bytes: u64,
    body_size_pretty: String,         // "1.2 MB", "456 B"

    // Metadata
    content_type: Option<String>,
    charset: Option<String>,
    encoding: Option<String>,         // gzip, br, deflate

    // Error (if network-level failure)
    error: Option<RequestError>,

    // Protocol-specific
    websocket_messages: Option<Vec<WebSocketMessage>>,
    sse_events: Option<Vec<SseEvent>>,
    grpc_trailers: Option<Vec<Header>>,
}

struct ResponseTiming {
    dns_lookup_ms: u64,
    tcp_connection_ms: u64,
    tls_handshake_ms: u64,
    time_to_first_byte_ms: u64,
    download_ms: u64,
    total_ms: u64,
}

struct ResponseBody {
    raw_bytes: Vec<u8>,               // Always stored as bytes
    text_preview: Option<String>,     // UTF-8 decoded (truncated if huge)
    parsed_json: Option<serde_json::Value>,
    parsed_xml: Option<String>,       // Raw XML for now
    is_binary: bool,
    is_truncated: bool,               // If > max preview size
}

struct Cookie {
    name: String,
    value: String,
    domain: Option<String>,
    path: Option<String>,
    expires: Option<DateTime<Utc>>,
    max_age: Option<i64>,
    secure: bool,
    http_only: bool,
    same_site: Option<String>,
}

struct RequestError {
    code: String,                     // Machine-readable
    message: String,
    detail: Option<String>,
    is_timeout: bool,
    is_connection_error: bool,
    is_ssl_error: bool,
    is_proxy_error: bool,
}

struct WebSocketMessage {
    id: Uuid,
    direction: MessageDirection,      // Sent | Received
    timestamp: DateTime<Utc>,
    data: Vec<u8>,
    text_preview: Option<String>,
    opcode: WebSocketOpcode,            // Text | Binary | Close | Ping | Pong
    is_masked: bool,
}

enum MessageDirection { Sent, Received }
enum WebSocketOpcode { Text, Binary, Close, Ping, Pong }

struct SseEvent {
    id: Option<String>,
    event: Option<String>,
    data: String,
    retry: Option<u64>,
    timestamp: DateTime<Utc>,
}
```

## 1.5 Environment Model
```rust
struct Environment {
    id: Uuid,
    name: String,
    description: Option<String>,
    variables: Vec<Variable>,
    parent_id: Option<Uuid>,          // Inheritance: dev → staging → prod
    is_global: bool,                  // Global env applies to all projects
    is_secret: bool,                  // Mask values in UI
    color: Option<String>,            // UI tag color
    metadata: EnvironmentMetadata,
}

struct Variable {
    key: String,
    value: String,
    enabled: bool,
    is_secret: bool,                  // Masked in UI, stored encrypted if secret
    description: Option<String>,
}

struct EnvironmentMetadata {
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    source: EnvironmentSource,        // Manual | File | Process | Script
}

enum EnvironmentSource {
    Manual,
    File,
    ProcessOutput,
    ScriptGenerated,
}
```

## 1.6 Auth Model
```rust
struct AuthConfig {
    auth_type: AuthType,
    is_enabled: bool,
}

enum AuthType {
    None,
    Basic { username: String, password_ref: String },          // password_ref = keyring key
    Bearer { token_ref: String },
    ApiKey { key: String, value_ref: String, add_to: ApiKeyLocation },
    OAuth2 { config: OAuth2Config },
    Digest { username: String, password_ref: String },
    Hawk { id: String, key_ref: String, algorithm: String },
    AwsSignatureV4 { access_key: String, secret_key_ref: String, region: String, service: String },
    Ntlm { username: String, password_ref: String, domain: Option<String> },
    MutualTls { cert_ref: String, key_ref: String },
    Custom { name: String, headers: Vec<Header> },
}

enum ApiKeyLocation {
    Header,
    Query,
}

struct OAuth2Config {
    grant_type: OAuth2GrantType,
    client_id: String,
    client_secret_ref: String,
    authorization_url: String,
    token_url: String,
    scope: Option<String>,
    redirect_uri: String,
    access_token_ref: String,
    refresh_token_ref: Option<String>,
    expires_at: Option<DateTime<Utc>>,
    auto_refresh: bool,
}

enum OAuth2GrantType {
    AuthorizationCode,
    ClientCredentials,
    Password,
    DeviceCode,
    Implicit,                          // Legacy support
    Pkce,                              // Authorization Code + PKCE
}
```

## 1.7 Test & Scripting Model
```rust
struct TestAssertion {
    id: Uuid,
    name: String,
    enabled: bool,
    assertion_type: AssertionType,
    target: String,                   // JSONPath, header name, status code, etc.
    operator: AssertionOperator,
    expected_value: String,
    error_message: Option<String>,
    stop_on_failure: bool,
}

enum AssertionType {
    StatusCode,
    ResponseTime,
    Header,
    Body,
    JsonPath,
    XmlPath,
    Cookie,
    ContentType,
    BodyLength,
    Script,
}

enum AssertionOperator {
    Equals,
    NotEquals,
    Contains,
    NotContains,
    StartsWith,
    EndsWith,
    Matches,                           // Regex
    GreaterThan,
    LessThan,
    GreaterThanOrEqual,
    LessThanOrEqual,
    IsEmpty,
    IsNotEmpty,
    IsNull,
    IsNotNull,
    HasKey,                            // For JSON objects
    HasValue,                          // For arrays
    IsArray,
    IsObject,
    IsString,
    IsNumber,
    IsBoolean,
}

struct ScriptContext {
    request: ScriptRequest,
    response: ScriptResponse,
    environment: HashMap<String, String>,
    globals: HashMap<String, String>,
    cookies: HashMap<String, String>,
    tests: Vec<ScriptTestResult>,
}

struct ScriptRequest {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

struct ScriptResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    response_time_ms: u64,
}

struct ScriptTestResult {
    name: String,
    passed: bool,
    message: Option<String>,
}

struct CollectionRunResult {
    id: Uuid,
    collection_id: Uuid,
    environment_id: Option<Uuid>,
    started_at: DateTime<Utc>,
    completed_at: DateTime<Utc>,
    total_requests: usize,
    passed_requests: usize,
    failed_requests: usize,
    skipped_requests: usize,
    total_assertions: usize,
    passed_assertions: usize,
    failed_assertions: usize,
    results: Vec<RequestRunResult>,
    summary: RunSummary,
}

struct RequestRunResult {
    request_id: Uuid,
    request_name: String,
    status: RunStatus,
    response_time_ms: u64,
    status_code: Option<u16>,
    error: Option<String>,
    assertion_results: Vec<AssertionResult>,
    script_logs: Vec<String>,
    variables_set: Vec<Variable>,
}

enum RunStatus {
    Passed,
    Failed,
    Skipped,
    Error,
    Cancelled,
}

struct AssertionResult {
    assertion_id: Uuid,
    name: String,
    passed: bool,
    actual_value: String,
    expected_value: String,
    message: String,
}

struct RunSummary {
    total_time_ms: u64,
    average_response_time_ms: u64,
    min_response_time_ms: u64,
    max_response_time_ms: u64,
    total_data_transferred_kb: f64,
}
```

## 1.8 History Model
```rust
struct HistoryEntry {
    id: Uuid,
    request_id: Option<Uuid>,
    request_name: String,
    collection_id: Option<Uuid>,
    project_id: Uuid,
    method: HttpMethod,
    url: String,
    status_code: Option<u16>,
    status_text: Option<String>,
    response_time_ms: u64,
    body_size_bytes: u64,
    timestamp: DateTime<Utc>,
    is_error: bool,
    error_code: Option<String>,
    body_preview: Option<String>,
    tags: Vec<String>,
}

struct HistorySearchQuery {
    text: Option<String>,
    methods: Vec<HttpMethod>,
    status_codes: Vec<u16>,
    date_from: Option<DateTime<Utc>>,
    date_to: Option<DateTime<Utc>>,
    collections: Vec<Uuid>,
    is_error: Option<bool>,
    has_response_body: Option<bool>,
    min_response_time_ms: Option<u64>,
    max_response_time_ms: Option<u64>,
    tags: Vec<String>,
    sort_by: HistorySortBy,
    limit: usize,
    offset: usize,
}

enum HistorySortBy {
    TimestampDesc,
    TimestampAsc,
    ResponseTimeDesc,
    ResponseTimeAsc,
    StatusCode,
    Name,
}
```

## 1.9 SQLite Cache Schema
```sql
-- projects & environments tables — REMOVED HERE.
-- Project identity now lives in the shared ~/.tye/registry.db `projects` table
-- (Master Spec Part C.3). Environment/variable storage now lives in the shared
-- <project_root>/.tye/project.db `core_environments` / `core_environment_variables`
-- tables (Master Spec Part C.2), scope='ApiOnly' or scope='Project'.
-- See TYE_PLATFORM_UNIFIED_SPEC.md Parts C.2/C.3 for the replacement schema.

-- api_history
CREATE TABLE api_history (
    id TEXT PRIMARY KEY,
    request_id TEXT,
    request_name TEXT NOT NULL,
    collection_id TEXT,
    project_id TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    status_code INTEGER,
    status_text TEXT,
    response_time_ms INTEGER NOT NULL,
    body_size_bytes INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_error BOOLEAN DEFAULT 0,
    error_code TEXT,
    body_preview TEXT,
    tags_json TEXT
);
CREATE INDEX idx_history_timestamp ON api_history(timestamp DESC);
CREATE INDEX idx_history_project ON api_history(project_id);
CREATE INDEX idx_history_request ON api_history(request_id);
CREATE INDEX idx_history_collection ON api_history(collection_id);
CREATE INDEX idx_history_method ON api_history(method);
CREATE INDEX idx_history_status ON api_history(status_code);

-- history_full_responses (separate table for large data)
CREATE TABLE api_history_responses (
    history_id TEXT PRIMARY KEY,
    headers_json TEXT,
    cookies_json TEXT,
    body_raw BLOB,
    body_text TEXT,
    timing_json TEXT,
    FOREIGN KEY (history_id) REFERENCES api_history(id) ON DELETE CASCADE
);

-- api_auth_credentials
CREATE TABLE api_auth_credentials (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    config_json TEXT NOT NULL,
    keyring_entry TEXT,               -- Reference to OS keyring
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- collection_run_results
CREATE TABLE api_run_results (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    environment_id TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    total_requests INTEGER,
    passed_requests INTEGER,
    failed_requests INTEGER,
    skipped_requests INTEGER,
    total_assertions INTEGER,
    passed_assertions INTEGER,
    failed_assertions INTEGER,
    summary_json TEXT,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- api_run_request_results
CREATE TABLE api_run_request_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_name TEXT NOT NULL,
    status TEXT NOT NULL,
    response_time_ms INTEGER,
    status_code INTEGER,
    error TEXT,
    assertion_results_json TEXT,
    script_logs_json TEXT,
    variables_set_json TEXT,
    FOREIGN KEY (run_id) REFERENCES api_run_results(id) ON DELETE CASCADE
);

-- api_cookies
CREATE TABLE api_cookies (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    domain TEXT,
    path TEXT DEFAULT '/',
    expires TIMESTAMP,
    max_age INTEGER,
    secure BOOLEAN DEFAULT 0,
    http_only BOOLEAN DEFAULT 0,
    same_site TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- settings
CREATE TABLE api_app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    scope TEXT DEFAULT 'global'       -- global | project
);

-- api_certificates
CREATE TABLE api_certificates (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cert_path TEXT,
    key_path TEXT,
    is_ca BOOLEAN DEFAULT 0,
    is_client_cert BOOLEAN DEFAULT 0,
    host_patterns TEXT                -- JSON array of host patterns
    -- project_id above refers to ~/.tye/registry.db projects.id (cross-db, not an in-file SQL FK; see Master Spec Part C.3)
);
```

---

# SECTION 2: FEATURE SPECIFICATIONS (Complete FAT-REQ)

---

## MILESTONE 1: Foundation & HTTP Engine
**Goal:** App can create, send, and receive HTTP requests with full protocol support. Core engine is solid.

---

### F-001: Project Management
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to create and manage projects so my API collections are organized per project.

**Functional Requirements:**
1. Create a new project with name and directory path.
2. Open an existing project (file picker or recent list).
3. Auto-save project state on close.
4. Project stores: collections, environments, history, settings.
5. Recent projects list (last 20, LRU eviction).
6. Pin/star projects for quick access.
7. Delete project (with confirmation — optionally keep files).
8. Rename project.
9. Project settings: auto-save, timeout, proxy, SSL, theme, layout.
10. Default project created on first launch if none exists.

**Acceptance Criteria:**
- [ ] AC1: Project opens within 1 second (cached state).
- [ ] AC2: Collections load from flat files in project directory.
- [ ] AC3: Recent list updates immediately after open/close.
- [ ] AC4: Settings persist across restarts.
- [ ] AC5: Delete project shows confirmation with "Keep files" option.

**Technical Spec:**
- Rust: `ProjectManager` struct. `directories` crate for default app data path.
- Storage: `projects` table in SQLite. Collection files in `<project>/collections/`.
- File watcher: `notify` crate watches `.devtools/` or project root for external changes.

**Data Model:** `Project`, `ProjectSettings`

**UI/UX:** Welcome screen on first launch. Sidebar project switcher. Settings modal with tabs.

**Error Handling:**
- Project path deleted externally → Show "Path not found", offer to relocate.
- Project path permission denied → Show error, suggest different location.
- Corrupt project file → Offer to reset or restore from backup.

**Dependencies:** None (first feature).

---

### F-002: HTTP Request Builder
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to build HTTP requests with method, URL, headers, query params, and body.

**Functional Requirements:**
1. Method selector: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, TRACE, CONNECT, and custom.
2. URL input with syntax highlighting for templates (`{{variable}}`).
3. Query params editor: key-value table with enable/disable toggle, description.
4. Auto-parse query params from URL (when URL changes, update params table).
5. Path params detection: auto-extract `:id` or `{id}` from URL, show input fields.
6. Headers editor: key-value table with autocomplete from common headers (Content-Type, Authorization, etc.).
7. Header presets: common sets (JSON API, Form Data, Auth Bearer, etc.).
8. Body editor with content-type-aware modes: None, Text, JSON, XML, HTML, Form, Multipart, Binary.
9. JSON body: syntax validation, error squiggles, pretty-print toggle, format button.
10. XML body: syntax validation, pretty-print.
11. Form body: key-value table with file upload support.
12. Multipart body: mixed text fields and file attachments with content-type per field.
13. Binary body: file picker, drag-and-drop, show file name and size.
14. Body from file: reference external file (auto-reload on change).
15. Request name and description fields.
16. Save request to collection (or update existing).

**Acceptance Criteria:**
- [ ] AC1: URL parsed into query params within 100ms of typing.
- [ ] AC2: JSON syntax errors highlighted inline.
- [ ] AC3: File drag-and-drop sets binary body immediately.
- [ ] AC4: Header autocomplete shows 20+ common headers.
- [ ] AC5: Save request updates collection file on disk.

**Technical Spec:**
- Frontend: Monaco Editor for JSON/XML body. Custom tables for headers/params.
- Rust: `RequestBuilder` struct. `reqwest::RequestBuilder` for actual HTTP construction.
- Validation: JSON via `serde_json`, XML via quick-xml.

**Data Model:** `ApiRequest`, `Header`, `QueryParam`, `PathParam`, `RequestBody`, `FormField`, `MultipartField`

**UI/UX:** Tabbed interface: Params | Headers | Body | Auth | Settings | Scripts. URL bar prominent at top. Save button in toolbar.

**Error Handling:**
- Invalid URL format → Inline red border + tooltip.
- JSON parse error → Monaco squiggles + error panel.
- File too large (> 100MB) → Warning, suggest streaming upload.

**Dependencies:** F-001.

---

### F-003: HTTP Response Viewer
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to view HTTP responses with rich formatting and analysis.

**Functional Requirements:**
1. Status code display with color coding (2xx green, 3xx blue, 4xx yellow, 5xx red).
2. Status text display.
3. Response time display (total + breakdown: DNS, TCP, TLS, TTFB, download).
4. Response size display (raw + decoded if compressed).
5. Headers viewer: sortable table, search/filter, copy all as JSON/cURL.
6. Cookies viewer: table with name, value, domain, path, expires, secure, httpOnly.
7. Body viewer modes:
   - Pretty (formatted JSON/XML/HTML)
   - Raw (exact response text)
   - Preview (rendered HTML in sandboxed iframe)
   - Visual (image preview, PDF preview, video preview)
   - Hex (hex dump for binary)
8. JSON body: collapsible tree view, search within JSON, copy path as JSONPath, copy value.
9. XML body: collapsible tree view, syntax highlighting.
10. HTML body: syntax highlighting, rendered preview (sandboxed).
11. Image body: actual image display with zoom, fit-to-width, save.
12. Binary body: hex viewer with ASCII side panel, offset display, copy hex/ASCII.
13. Auto-detect content type from headers + body sniffing.
14. Download response body to file.
15. Copy response body to clipboard.
16. Response info bar: content-type, encoding, charset, server.

**Acceptance Criteria:**
- [ ] AC1: JSON tree renders for objects up to 10MB without crashing (virtualized).
- [ ] AC2: Image preview displays PNG, JPG, GIF, SVG, WebP.
- [ ] AC3: Hex viewer shows 16 bytes per row with ASCII.
- [ ] AC4: Response timing breakdown accurate within 1ms.
- [ ] AC5: HTML preview sandboxed (no JS execution, no network).

**Technical Spec:**
- Frontend: Custom JSON tree component (virtualized). Monaco for raw text. Canvas for hex.
- Rust: `reqwest` response timing via custom `reqwest::middleware` or `hyper` client.
- Body handling: Stream to temp file if > 1MB, then process. Keep raw bytes for binary.
- HTML preview: `sandbox=""` iframe with `srcdoc`.

**Data Model:** `ApiResponse`, `ResponseTiming`, `ResponseBody`, `Cookie`

**UI/UX:** Split pane: request left, response right (or stacked). Response tabs: Body | Headers | Cookies | Timings. Body sub-tabs: Pretty | Raw | Preview | Hex.

**Error Handling:**
- Binary response with text content-type → Show hex viewer with "Content mismatch" warning.
- Malformed JSON → Show raw + parse error message.
- Very large response (> 50MB) → Show first 1MB with "Load more" button.

**Dependencies:** F-002.

---

### F-004: Request Execution Engine
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to send HTTP requests and see real-time progress with the ability to cancel.

**Functional Requirements:**
1. Send request via "Send" button (Enter key shortcut).
2. Cancel request via "Cancel" button (Esc key shortcut).
3. Real-time progress: uploading → waiting → downloading → done.
4. Request cancellation: abort in-flight request immediately.
5. Timeout handling: configurable per-request and global default.
6. Follow redirects: configurable (default on, max 10).
7. HTTP/2 support (automatic negotiation).
8. HTTP/3 support (optional, QUIC).
9. Connection pooling: reuse connections for same host.
10. Keep-alive support.
11. Request/response size limits (configurable, default 100MB).
12. Streaming response: don't buffer entire response in memory.
13. Concurrent request limit: configurable (default 6 per host).
14. Request retry: configurable count and backoff.
15. Request ID generation for tracking.
16. Request start timestamp and end timestamp.

**Acceptance Criteria:**
- [ ] AC1: Request sends and response received within 50ms overhead (not counting network).
- [ ] AC2: Cancel stops request immediately (connection closed).
- [ ] AC3: Timeout triggers after configured seconds with clear error.
- [ ] AC4: Redirect chain shown in response (intermediate URLs + status codes).
- [ ] AC5: Large response (> 10MB) streams without memory spike.

**Technical Spec:**
- Rust: `reqwest::Client` with custom `ClientBuilder`. `tokio::select!` for cancellation.
- Timeout: `tokio::time::timeout(Duration::from_secs(n), request)`.
- Streaming: `response.bytes_stream()` → emit chunks via Tauri events.
- Connection pool: `reqwest` handles this automatically via `hyper`.
- Retry: `reqwest-retry` middleware or custom exponential backoff.

**Data Model:** `ApiRequest`, `ApiResponse`, `RequestError`, `ResponseTiming`

**UI/UX:** Send button prominent (green). Cancel button replaces Send during flight. Progress bar in status bar. Network activity indicator.

**Error Handling:**
- DNS resolution failure → "Could not resolve host" error.
- Connection refused → "Connection refused" with port info.
- SSL/TLS error → "SSL certificate problem" with detail.
- Timeout → "Request timed out after X seconds".
- Network unreachable → "No internet connection".
- Too many redirects → "Redirect loop detected".

**Dependencies:** F-002, F-003.

---

### F-005: SSL/TLS & Certificate Management
**Phase:** M1 | **Priority:** P1  
**User Story:** As a user, I want to control SSL verification and use custom certificates.

**Functional Requirements:**
1. Global SSL verification toggle (default ON).
2. Per-request SSL verification override.
3. Custom CA certificate import (PEM format).
4. Client certificate import (PEM + key, PKCS#12).
5. Certificate pinning: pin specific certificates for hosts.
6. Certificate viewer: show issuer, subject, validity, fingerprint, SANs.
7. Certificate validation error details on SSL failure.
8. Support for TLS 1.2, 1.3.
9. Support for mutual TLS (mTLS).
10. Certificate revocation check (OCSP, CRL — optional).

**Acceptance Criteria:**
- [ ] AC1: SSL off sends request without cert validation (warning shown).
- [ ] AC2: Custom CA cert imported and used for verification.
- [ ] AC3: Client cert sent with request for mTLS.
- [ ] AC4: Certificate details visible in error dialog on SSL failure.
- [ ] AC5: Invalid certificate file shows parse error.

**Technical Spec:**
- Rust: `rustls` via `reqwest` with `rustls-tls` feature. `rustls-pemfile` for cert parsing.
- Custom CA: `reqwest::ClientBuilder::add_root_certificate()`.
- Client cert: `reqwest::Identity::from_pem()` or `from_pkcs12_der()`.
- Certificate viewer: Parse X.509 with `x509-parser` crate.

**Data Model:** `Certificate` (SQLite table), `ProjectSettings.ssl_verification`

**UI/UX:** Settings > Certificates. Import button. Table with cert details. Per-request SSL toggle in request settings.

**Error Handling:**
- Invalid PEM → Parse error with line number.
- Expired certificate → Warning, allow override.
- Self-signed certificate → Warning, allow trust once or permanently.

**Dependencies:** F-001, F-004.

---

### F-006: Proxy Configuration
**Phase:** M1 | **Priority:** P1  
**User Story:** As a user, I want to route requests through HTTP or SOCKS5 proxies.

**Functional Requirements:**
1. System proxy detection (auto-detect from OS settings).
2. No proxy option.
3. Custom HTTP proxy: host, port, username, password.
4. Custom HTTPS proxy: host, port, username, password.
5. Custom SOCKS5 proxy: host, port, username, password.
6. No-proxy list: comma-separated host patterns (e.g., `localhost,*.internal.com`).
7. Proxy authentication: Basic auth.
8. Proxy test button: sends request through proxy to verify.
9. Per-request proxy override.
10. Proxy status indicator in status bar.

**Acceptance Criteria:**
- [ ] AC1: System proxy auto-detected on app start.
- [ ] AC2: Custom proxy routes requests correctly.
- [ ] AC3: No-proxy list bypasses proxy for matching hosts.
- [ ] AC4: Proxy test shows success/failure with latency.
- [ ] AC5: Failed proxy connection shows clear error.

**Technical Spec:**
- Rust: `reqwest::Proxy::all()`, `Proxy::http()`, `Proxy::https()`, `Proxy::socks5()`.
- System proxy: `reqwest` can auto-detect via `Proxy::system()` on some platforms. Fallback to reading env vars `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`.
- Auth: `reqwest::Proxy::basic_auth()`.

**Data Model:** `ProjectSettings.proxy_mode`, `ProjectSettings.custom_proxy`

**UI/UX:** Settings > Proxy. Radio: System | Custom | None. Custom fields: type, host, port, auth. No-proxy textarea. Test button.

**Error Handling:**
- Proxy unreachable → "Cannot connect to proxy" error.
- Proxy auth failure → "Proxy authentication required".
- Invalid proxy URL → Inline validation error.

**Dependencies:** F-004.

---

### F-007: Cookie Jar
**Phase:** M1 | **Priority:** P1  
**User Story:** As a user, I want cookies to persist across requests and be manageable.

**Functional Requirements:**
1. Automatic cookie storage from Set-Cookie headers.
2. Automatic cookie sending in subsequent requests to matching domains.
3. Cookie jar viewer: table with all cookies, sortable, searchable.
4. Cookie details: name, value, domain, path, expires, max-age, secure, httpOnly, sameSite.
5. Add cookie manually.
6. Edit cookie value.
7. Delete single cookie.
8. Delete all cookies for domain.
9. Delete all cookies (clear jar).
10. Cookie export/import (JSON, Netscape format).
11. Per-request cookie jar toggle (use jar vs. ignore).
12. Cookie persistence across app restarts (SQLite).
13. Domain-scoped cookie jars (separate jars per project or global).

**Acceptance Criteria:**
- [ ] AC1: Cookie set by server appears in jar after response.
- [ ] AC2: Next request to same domain sends stored cookies.
- [ ] AC3: Cookie jar persists after app restart.
- [ ] AC4: Expired cookies auto-purged on access.
- [ ] AC5: Export produces valid JSON/Netscape format.

**Technical Spec:**
- Rust: `reqwest` cookie store via `reqwest::cookie::Jar`. Custom implementation for persistence.
- Storage: SQLite `cookies` table. Parse `Set-Cookie` headers with `cookie` crate.
- Matching: Domain matching, path matching, secure flag, expiration.

**Data Model:** `Cookie` (SQLite table)

**UI/UX:** Sidebar "Cookies" panel or modal. Table with columns. Edit inline. Context menu: Delete, Edit, Copy.

**Error Handling:**
- Malformed Set-Cookie → Log warning, skip cookie.
- Cookie value too large → Truncate or reject (configurable).

**Dependencies:** F-004.

---

### F-008: Response History & Search
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to see a history of all requests I've sent and be able to search them.

**Functional Requirements:**
1. History panel showing all sent requests with: method, URL, status, time, size, timestamp.
2. History entries auto-saved after each request.
3. Click history entry to load request into builder (full replay).
4. Click history entry to view response (if still cached).
5. Fuzzy search history by URL, method, status, name.
6. Filter history by: method, status code range, date range, collection, error only.
7. History pagination (load more on scroll).
8. History entry context menu: Replay, Copy as cURL, Delete, Add to collection, Compare.
9. History retention: configurable (default 30 days, max 10000 entries).
10. History entry tags: auto-tag by status (success, error), manual tags.
11. Star/favorite important history entries.
12. History entry detail view: full request + response summary.
13. Bulk delete history entries.
14. Export history (JSON, CSV, HAR).

**Acceptance Criteria:**
- [ ] AC1: History entry created within 100ms of response.
- [ ] AC2: Search filters in real-time (< 50ms for 1000 entries).
- [ ] AC3: Replay reconstructs exact request (including body, headers, auth).
- [ ] AC4: History loads first 100 entries instantly, scroll loads more.
- [ ] AC5: Auto-prune removes entries older than configured days.

**Technical Spec:**
- Rust: SQLite `history` table with FTS5 for full-text search. `history_responses` for large bodies.
- Pagination: OFFSET/LIMIT queries. Virtualized list in frontend.
- Replay: Reconstruct `ApiRequest` from history entry + response metadata.

**Data Model:** `HistoryEntry`, `HistorySearchQuery`, `HistorySortBy`

**UI/UX:** Sidebar "History" panel. Search bar with filters. Virtualized list. Detail view on click. Star icon per entry.

**Error Handling:**
- History DB locked → Queue write, retry.
- Response body too large for cache → Store preview only, discard raw body.
- Corrupt history entry → Skip, log warning, show "Entry corrupted".

**Dependencies:** F-004.

---

### F-009: cURL Import & Export
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to import cURL commands and export requests as cURL.

**Functional Requirements:**
1. Paste cURL command → parse into request builder.
2. Support all common cURL flags: `-X`, `-H`, `-d`, `--data-binary`, `-F`, `--form`, `-u`, `--user`, `-L`, `--location`, `--insecure`, `--cacert`, `--cert`, `--key`, `--proxy`, `--cookie`, `--cookie-jar`, `-o`, `--output`, `--max-time`, `--connect-timeout`, `--retry`, `--compressed`, `--header`, `--json`, `--url`, `--request`, `--verbose`, `--silent`, `--include`, `--head`, `--no-buffer`, `--data-urlencode`, `--upload-file`, `--raw`, `--http1.1`, `--http2`, `--http3`, `--unix-socket`, `--aws-sigv4`.
3. Handle multi-line cURL (line continuations).
4. Handle cURL from clipboard auto-detect (detect cURL pattern on paste).
5. Export request as cURL command (single-line or multi-line with line continuations).
6. Export with or without sensitive headers (auth stripping option).
7. Copy cURL to clipboard.
8. Generate cURL with `-v` (verbose) flag option for debugging.
9. Import from HAR file (single entry or all entries).
10. Export to HAR file (single request or collection).

**Acceptance Criteria:**
- [ ] AC1: Common cURL commands parse correctly (> 95% accuracy).
- [ ] AC2: Export produces valid cURL that works in terminal.
- [ ] AC3: Auto-detect cURL on paste shows import prompt.
- [ ] AC4: HAR import creates requests with correct headers, body, timing.
- [ ] AC5: Auth stripping removes Authorization headers from export.

**Technical Spec:**
- Rust: Custom cURL parser (regex + state machine). Or use `curl-parser` crate if available.
- HAR: `serde_json` deserialization into `ApiRequest`.
- Export: String builder constructing cURL flags from `ApiRequest`.

**Data Model:** `ApiRequest` (import target), `HistoryEntry` (HAR import)

**UI/UX:** "Import" button in toolbar → cURL/HAR options. Paste dialog. Export button in request builder → cURL/HAR.

**Error Handling:**
- Unparseable cURL → Show error with suggestion to fix manually.
- Unsupported cURL flag → Warning with list of skipped flags.
- Invalid HAR → Parse error with line info.

**Dependencies:** F-002.

---

### F-010: URL Encoding & Templating
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want URL encoding handled automatically and template variables resolved dynamically.

**Functional Requirements:**
1. Auto-encode query parameter values (RFC 3986).
2. Auto-encode path segments if needed.
3. Decode button: show decoded URL for readability.
4. Template variable syntax: `{{variable_name}}`.
5. Template variable autocomplete: suggest from environment variables while typing.
6. Template variable preview: hover shows resolved value (if not secret).
7. Secret variable masking: `{{password}}` shows `••••••` in preview.
8. Unresolved variable warning: yellow highlight on `{{unknown_var}}`.
9. URL builder mode: separate inputs for protocol, host, port, path, query (assemble into URL).
10. Path variable extraction: `/users/:id` → auto-create `id` path param.
11. URL validation: warn on malformed URLs.
12. URL normalization: trailing slashes, double slashes.

**Acceptance Criteria:**
- [ ] AC1: Query params auto-encoded in sent request.
- [ ] AC2: Template autocomplete shows within 50ms of typing `{{`.
- [ ] AC3: Unresolved variables highlighted before send.
- [ ] AC4: URL builder assembles valid URL from parts.
- [ ] AC5: Path params extracted from `:param` and `{param}` syntax.

**Technical Spec:**
- Rust: `url` crate for encoding/decoding. `handlebars` for template resolution.
- Frontend: Monaco custom completions for `{{` trigger. Regex for path param detection.

**Data Model:** `Variable`, `Environment`

**UI/UX:** URL bar with template highlighting. Dropdown autocomplete for variables. URL builder toggle (simple/advanced).

**Error Handling:**
- Unresolved variable on send → Warning modal: "Variable X not found. Send anyway?"
- Invalid URL → Inline error + disable send button.
- Encoding error → Fallback to raw bytes.

**Dependencies:** F-002, F-014 (Environments).

---

## MILESTONE 2: Collections, Environments & Storage
**Goal:** User can organize requests into collections, manage environments with variables, and persist everything in Git-friendly files.

---

### F-011: Collection CRUD
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to create collections of related API requests.

**Functional Requirements:**
1. Create new collection with name and description.
2. Delete collection (with confirmation, optionally keep files).
3. Rename collection.
4. Duplicate collection.
5. Collection color/tag for visual organization.
6. Collection-level variables (override project global variables).
7. Collection-level auth (default auth for all requests in collection).
8. Collection-level pre-request script (runs before every request in collection).
9. Collection-level post-request script (runs after every request in collection).
10. Collection-level headers (default headers for all requests).
11. Move collection to different project.
12. Collection metadata: created date, last modified, request count, total size.
13. Collection import from file.
14. Collection export to file.
15. Collection documentation generation (Markdown).

**Acceptance Criteria:**
- [ ] AC1: Collection creates `.json` file in project `collections/` directory.
- [ ] AC2: Rename updates file name on disk.
- [ ] AC3: Collection-level auth applies to all child requests by default.
- [ ] AC4: Collection color visible in sidebar.
- [ ] AC5: Export produces valid JSON file.

**Technical Spec:**
- Rust: `Collection` serialized to JSON/TOML file. `serde_json` with pretty print.
- File path: `<project>/collections/<collection-name>.json`.
- File watcher: `notify` crate detects external changes, reloads collection.

**Data Model:** `Collection`, `CollectionMetadata`

**UI/UX:** Sidebar tree view. Right-click context menu. Color picker in collection settings. New collection button.

**Error Handling:**
- Collection file corrupted → Show error, offer to restore from backup or reset.
- Duplicate name → Auto-append number or show error.
- File permission denied → Show OS error.

**Dependencies:** F-001.

---

### F-012: Folder Organization Within Collections
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to organize requests into folders within collections.

**Functional Requirements:**
1. Create folder inside collection or inside another folder (nested).
2. Rename folder.
3. Delete folder (with option to delete or move requests to parent).
4. Move folder (drag-and-drop within collection or to another collection).
5. Move request into folder (drag-and-drop).
6. Reorder requests/folders within parent (drag-and-drop sort).
7. Folder-level variables (scoped to folder and children).
8. Folder-level auth (inherits from collection, overrides if set).
9. Folder-level scripts (pre/post request).
10. Folder-level headers.
11. Expand/collapse folders in sidebar.
12. Folder description.
13. Folder icon/color customization.

**Acceptance Criteria:**
- [ ] AC1: Folder structure persists in collection file.
- [ ] AC2: Drag-and-drop reorder updates file immediately.
- [ ] AC3: Nested folders supported (depth limit: 10).
- [ ] AC4: Folder variables resolved before collection variables.
- [ ] AC5: Delete folder with requests shows confirmation with "Move to parent" option.

**Technical Spec:**
- Rust: `CollectionItem::Folder` recursive structure. `serde_json` handles nesting.
- File watcher: Detect changes, reload tree.
- Drag-and-drop: Frontend DnD library (`@dnd-kit/sortable` or similar).

**Data Model:** `CollectionFolder`, `CollectionItem`

**UI/UX:** Sidebar tree with expand/collapse chevrons. Drag handles. Drop zones highlighted. Context menu per folder.

**Error Handling:**
- Circular folder reference (imported) → Detect and break, show warning.
- Max nesting depth exceeded → Prevent creation, show error.
- Move to same location → No-op.

**Dependencies:** F-011.

---

### F-013: Environment Management
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to define environment variables for different deployment stages.

**Functional Requirements:**
1. Create environment with name and description.
2. Delete environment (with confirmation if in use).
3. Rename environment.
4. Duplicate environment.
5. Environment variables: key, value, enabled, secret, description.
6. Secret variable masking: value hidden behind dots, only reveal on click.
7. Secret variable encryption: stored encrypted in SQLite, not in plain text files.
8. Variable autocomplete in URL, headers, body editors.
9. Variable preview: hover over `{{var}}` shows resolved value.
10. Environment switching: quick dropdown in toolbar.
11. Environment color coding.
12. Global environment (applies to all projects).
13. Project environment (applies to all requests in project).
14. Collection environment (applies to collection requests).
15. Request-level variables (one-off, not persisted).
16. Variable inheritance: Global → Project → Collection → Folder → Request.
17. Variable override indicator: show which level a variable comes from.
18. Bulk import/export variables (JSON, CSV, .env file).
19. Variable type hints: string, number, boolean (affects resolution).
20. Current value vs initial value (Postman-style: current is runtime, initial is persisted).

**Acceptance Criteria:**
- [ ] AC1: Variable resolved correctly in sent request.
- [ ] AC2: Secret variable never shown in plain text in UI.
- [ ] AC3: Environment switch updates all requests immediately.
- [ ] AC4: Inheritance chain visible in variable tooltip.
- [ ] AC5: Bulk import parses .env file correctly.

**Technical Spec:**
- Rust: `Environment` stored in SQLite. Secret values encrypted with `aes-gcm` or OS keyring.
- Resolution: Walk inheritance chain, last-one-wins. Handlebars for substitution.
- Frontend: Custom autocomplete provider for Monaco editors.

**Data Model:** `Environment`, `Variable`

**UI/UX:** Sidebar "Environments" panel or modal. Table with key-value. Eye icon for secrets. Inheritance indicator. Quick switch dropdown in toolbar.

**Error Handling:**
- Secret decryption failure → Show "Cannot decrypt — re-enter value".
- Circular inheritance (parent points to child) → Detect and break, show error.
- Variable name collision → Last level wins, show indicator.

**Dependencies:** F-001.

---

### F-014: Variable Resolution Engine
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want template variables to be resolved correctly before sending requests.

**Functional Requirements:**
1. Resolve `{{variable}}` syntax in URL, headers, query params, path params, body.
2. Support nested variable references: `{{base_url}}/{{api_version}}/users`.
3. Support dynamic variables (runtime-generated):
   - `{{$timestamp}}` — current Unix timestamp
   - `{{$randomUUID}}` — random UUID v4
   - `{{$randomInt}}` — random integer 0-1000
   - `{{$randomString}}` — random alphanumeric string
   - `{{$randomEmail}}` — random email address
   - `{{$randomPhone}}` — random phone number
   - `{{$guid}}` — GUID
   - `{{$date}}` — current date (ISO 8601)
   - `{{$dateTime}}` — current date+time
   - `{{$isoTimestamp}}` — ISO timestamp
4. Support response chaining: `{{request_name.response.body.user_id}}`.
5. Support response chaining from history: `{{$history[0].response.body.token}}`.
6. Support environment variable with fallback: `{{variable || "default"}}`.
7. Support script-generated variables (from pre-request script).
8. Variable resolution order: Request → Folder → Collection → Project → Global.
9. Unresolved variable detection before send: warning with list of missing vars.
10. Variable resolution preview mode: show fully resolved request before sending.
11. Secret variable resolution: resolved in Rust backend, never sent to frontend.

**Acceptance Criteria:**
- [ ] AC1: All dynamic variables generate valid values.
- [ ] AC2: Response chaining resolves from last matching request in history.
- [ ] AC3: Fallback syntax works: `{{missing || "default"}}`.
- [ ] AC4: Unresolved variables detected before send with warning.
- [ ] AC5: Preview mode shows fully resolved URL/headers/body.

**Technical Spec:**
- Rust: `Handlebars` registry with custom helpers. Dynamic variables as helpers.
- Response chaining: Query SQLite history for last request by name, parse JSON response.
- Fallback: Custom Handlebars helper `||` or pre-process syntax.
- Secret resolution: Happens in Rust, value never exposed to frontend IPC.

**Data Model:** `Variable`, `Environment`, `ScriptContext`

**UI/UX:** Variable autocomplete in all text fields. Preview button in request builder. Unresolved variable warning banner.

**Error Handling:**
- Response chaining target not found → Show "Request 'X' not found in history".
- JSONPath in response chaining fails → Show "Path not found in response".
- Circular variable reference → Detect and error.

**Dependencies:** F-013.

---

### F-015: Request Save & Update Workflow
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to save requests to collections and update them easily.

**Functional Requirements:**
1. Save new request to collection (choose collection and folder).
2. Save request as (duplicate to new name/collection).
3. Update existing request (Ctrl+S / Cmd+S).
4. Auto-save draft: unsaved request changes stored as draft.
5. Draft indicator: dot on tab or "Unsaved changes" badge.
6. Discard draft changes (revert to saved version).
7. Request locking: lock request to prevent accidental edits (admin/owner only).
8. Request versioning: keep last N versions of request (configurable, default 10).
9. Restore previous version.
10. Compare current request with previous version (diff).
11. Request metadata: created by, last modified by, created date, modified date.
12. Request tags: custom tags for organization.
13. Request description with Markdown support.
14. Request documentation: auto-generated from params, headers, body schema.

**Acceptance Criteria:**
- [ ] AC1: Ctrl+S saves request to collection file within 200ms.
- [ ] AC2: Draft restored on app restart if crash occurred.
- [ ] AC3: Version history shows last 10 versions with timestamps.
- [ ] AC4: Diff view shows what changed between versions.
- [ ] AC5: Locked request shows lock icon, edit disabled.

**Technical Spec:**
- Rust: Collection file rewritten on save. Drafts in SQLite `drafts` table.
- Versions: Store previous JSON in SQLite `request_versions` table.
- Diff: JSON diff via `serde_json` comparison or `similar` crate.

**Data Model:** `ApiRequest`, `RequestVersion`, `DraftRequest`

**UI/UX:** Save button in toolbar. Save-as modal. Version history sidebar panel. Diff viewer for versions. Lock toggle in request settings.

**Error Handling:**
- Save to read-only file → Show error, offer save-as.
- Disk full on save → Show error, keep draft in memory.
- Version limit reached → Auto-delete oldest version.

**Dependencies:** F-011, F-012.

---

### F-016: Collection Runner — Basic
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to run all requests in a collection sequentially.

**Functional Requirements:**
1. Run all requests in a collection (respecting folder order).
2. Run selected requests only (multi-select in collection).
3. Run single folder (all requests in folder + subfolders).
4. Choose environment for the run.
5. Sequential execution: wait for each request to complete before next.
6. Stop on failure option (configurable).
7. Skip disabled requests.
8. Progress display: X of Y completed, current request name, status.
9. Results summary: total, passed, failed, skipped, average response time.
10. Per-request result: status, response time, status code, error, assertion results.
11. Export run results (JSON, HTML report).
12. Cancel run in progress.
13. Run iteration count: repeat collection N times (for basic load testing).
14. Delay between requests: configurable milliseconds.

**Acceptance Criteria:**
- [ ] AC1: 20 requests run sequentially in under 10 seconds (assuming 500ms each).
- [ ] AC2: Stop on failure halts immediately on error.
- [ ] AC3: Results summary accurate (count, timing).
- [ ] AC4: Cancel stops current request and aborts remaining.
- [ ] AC5: HTML report opens in browser and is readable.

**Technical Spec:**
- Rust: `CollectionRunner` struct. `tokio::sync::mpsc` for progress events. `tokio::time::sleep` for delays.
- Execution: Loop through requests, resolve variables, send, collect results.
- Storage: SQLite `run_results` and `run_request_results` tables.

**Data Model:** `CollectionRunResult`, `RequestRunResult`, `RunSummary`

**UI/UX:** "Run Collection" button in collection context menu. Runner modal with progress bar. Results panel with pass/fail icons. Export dropdown.

**Error Handling:**
- Request timeout in run → Mark as failed, continue or stop based on setting.
- Variable resolution failure → Mark as failed, show error.
- Network failure → Mark as failed, show error.

**Dependencies:** F-011, F-014, F-004.

---

### F-017: File-Based Storage & Git-Native Design
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want my API collections stored as files that I can commit to Git.

**Functional Requirements:**
1. Collections stored as individual JSON files in project `collections/` directory.
2. Environments stored as JSON files in project `environments/` directory.
3. Human-readable, pretty-printed JSON with consistent key ordering.
4. File naming: `<collection-name>.json` (slugified, safe for filesystem).
5. File watcher detects external changes (e.g., Git checkout, editor edit) and reloads.
6. Debounced reload (300ms) to batch rapid changes.
7. Conflict detection: if file changed externally while app has unsaved changes → show conflict dialog.
8. Export project as portable directory (all files, no SQLite needed to read collections).
9. Import project from directory.
10. Collection file schema version embedded (for future migrations).
11. Optional TOML format support for collections (user preference).
12. Binary diff friendly: JSON keys ordered alphabetically where possible.
13. Comments in collection files: `_description` fields for human notes.

**Acceptance Criteria:**
- [ ] AC1: Collection file is valid JSON, readable in any editor.
- [ ] AC2: Git diff shows meaningful changes (not reordered keys).
- [ ] AC3: External edit detected and reloaded within 500ms.
- [ ] AC4: Conflict dialog shows local vs external diff.
- [ ] AC5: TOML option produces valid TOML if selected.

**Technical Spec:**
- Rust: `serde_json` with `sort_keys` or custom serialization order. `toml` crate for TOML.
- File watcher: `notify` with `DebouncedEvent` (300ms).
- Conflict: Compare file mtime with last saved mtime before write.

**Data Model:** `Collection`, `Environment`, `CollectionMetadata.schema`

**UI/UX:** Settings > Storage. Format selector (JSON/TOML). Conflict resolution modal: Keep local | Keep external | Merge.

**Error Handling:**
- File deleted externally → Show "File missing" badge, offer recreate or remove from project.
- File permission denied → Show error, suggest different project location.
- JSON parse error on reload → Show error with line number, keep previous version in memory.

**Dependencies:** F-001, F-011.

---

### F-018: SQLite History & Metadata Storage
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want request history and metadata stored efficiently in a local database.

**Functional Requirements:**
1. SQLite database per project: `<project>/.api-tester/cache.db`.
2. History table: all sent requests with metadata (F-008).
3. Response body cache: store full responses for recent history (configurable size limit, default 500MB).
4. Auto-prune: delete old responses when cache size exceeded (LRU).
5. Request versions table: previous versions of saved requests.
6. Drafts table: unsaved request changes.
7. Settings table: app and project settings.
8. FTS5 full-text search on history URL, name, body preview.
9. Database migrations on schema upgrade.
10. Database integrity check on startup.
11. Database backup: auto-backup before migrations.
12. Export database (for debugging).
13. Vacuum database (reclaim space).

**Acceptance Criteria:**
- [ ] AC1: History query returns 1000 entries in < 100ms.
- [ ] AC2: FTS5 search returns results in < 50ms.
- [ ] AC3: Cache size limit respected, old entries purged.
- [ ] AC4: Migration runs automatically on schema change.
- [ ] AC5: Database backup created before any migration.

**Technical Spec:**
- Rust: `sqlx` with `sqlite` feature. Migrations in `migrations/` directory.
- FTS5: `sqlx` raw queries for FTS5 virtual tables.
- Pruning: Background task runs daily or on cache size threshold.

**Data Model:** SQLite schema (Section 1.9)

**UI/UX:** Settings > Storage. Cache size gauge. Prune now button. Database path display.

**Error Handling:**
- Database locked → Retry with exponential backoff, show spinner.
- Database corrupted → Show error, offer to reset (keep collection files) or restore backup.
- Migration failure → Rollback to backup, show error.

**Dependencies:** F-001.

---

## MILESTONE 3: Response Analysis, Diff & Visualization
**Goal:** User can analyze responses deeply, compare them, and visualize different content types.

---

### F-019: JSON Tree Viewer & Navigator
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to explore JSON responses in a collapsible tree with search and path extraction.

**Functional Requirements:**
1. Collapsible tree view for JSON objects and arrays.
2. Syntax highlighting: keys in one color, strings in another, numbers, booleans, null.
3. Array index labels: [0], [1], etc.
4. Object key count badge: {12} for objects with 12 keys.
5. Array length badge: [45] for arrays with 45 items.
6. Search within JSON: find keys or values, highlight matches, navigate with arrows.
7. Copy JSONPath: right-click any node → "Copy JSONPath" (e.g., `$.users[0].name`).
8. Copy value: right-click → "Copy value".
9. Copy formatted JSON: right-click → "Copy as JSON".
10. Filter JSON: show only paths matching query (e.g., `$.users[*].email`).
11. Large array virtualization: only render visible items for arrays > 100 items.
12. Pretty-print toggle: compact vs expanded.
13. JSON schema validation: if schema provided, validate and show errors.
14. JSON diff: compare two JSON responses (see F-020).
15. Export JSON to file.

**Acceptance Criteria:**
- [ ] AC1: 10MB JSON tree renders without crashing (virtualized arrays).
- [ ] AC2: JSONPath copy is accurate for nested arrays/objects.
- [ ] AC3: Search finds matches in < 100ms for 1MB JSON.
- [ ] AC4: Virtualized array scrolls at 60fps for 10,000 items.
- [ ] AC5: Schema validation highlights invalid fields.

**Technical Spec:**
- Frontend: Custom React tree component with virtualization (`@tanstack/react-virtual` for arrays). Recursion with depth limit.
- JSONPath: `jsonpath-plus` or custom path builder from tree traversal.
- Schema: `ajv` (JSON Schema validator) in frontend or Rust `jsonschema` crate.

**Data Model:** `ResponseBody.parsed_json`

**UI/UX:** Response body tab → JSON sub-tab. Tree with indentation. Search bar top-right. Right-click context menu. Expand all / collapse all buttons.

**Error Handling:**
- Malformed JSON → Show raw text with error message, disable tree view.
- Circular reference (rare in HTTP) → Detect and break, show "[Circular]".
- Very deep nesting (> 50 levels) → Collapse automatically, show depth warning.

**Dependencies:** F-003.

---

### F-020: Response Diff & Snapshot Comparison
**Phase:** M3 | **Priority:** P1  
**User Story:** As a user, I want to compare two responses to see what changed between them.

**Functional Requirements:**
1. Select two history entries for comparison.
2. Select current response vs. previous history entry.
3. Select response vs. saved "expected" response (snapshot).
4. Side-by-side diff view for text responses (JSON, XML, HTML, plain text).
5. Unified diff view option.
6. JSON diff: semantic comparison (ignores key order, array order optional).
7. XML diff: structural comparison.
8. Header diff: show added/removed/changed headers.
9. Status code diff: highlight if changed.
10. Timing diff: show faster/slower.
11. Size diff: show size delta.
12. Save response as snapshot (baseline for future comparisons).
13. Snapshot management: list, update, delete, compare.
14. Auto-snapshot on first successful request (optional).
15. Diff export: save diff as HTML or text.

**Acceptance Criteria:**
- [ ] AC1: JSON diff ignores key ordering by default.
- [ ] AC2: Added fields shown in green, removed in red, changed in yellow.
- [ ] AC3: Header diff shows exact changes (value changed from A to B).
- [ ] AC4: Snapshot saved and retrievable.
- [ ] AC5: Diff renders for responses up to 1MB in < 1 second.

**Technical Spec:**
- Frontend: `react-diff-viewer` or custom diff component. For JSON: use `json-diff` or `fast-json-diff`.
- Rust: `similar` crate for text diff. Custom JSON diff algorithm (normalize key order first).
- Snapshots: Stored in SQLite `snapshots` table or as files in `<project>/snapshots/`.

**Data Model:** `Snapshot { id, request_id, name, response_json, headers_json, created_at }`

**UI/UX:** History entry context menu: "Compare with..." → select other entry. Diff modal with side-by-side panes. Snapshot button in response viewer.

**Error Handling:**
- Incomparable formats (JSON vs XML) → Show "Cannot compare different formats".
- Binary response → Show hex diff or "Binary comparison not supported".
- Snapshot too large → Show first 1000 lines with truncation warning.

**Dependencies:** F-008, F-019.

---

### F-021: Image, Video & Binary Preview
**Phase:** M3 | **Priority:** P1  
**User Story:** As a user, I want to preview images, videos, and binary data directly in the response viewer.

**Functional Requirements:**
1. Image preview: PNG, JPG, GIF, SVG, WebP, BMP, ICO, AVIF, HEIC.
2. Image zoom: scroll wheel, fit-to-width, fit-to-window, 1:1, custom zoom %.
3. Image pan: drag to pan when zoomed in.
4. Image info: dimensions, format, file size, color space.
5. Image download: save to file.
6. Image copy to clipboard.
7. Video preview: MP4, WebM, MOV (HTML5 video player).
8. Audio preview: MP3, WAV, OGG, FLAC (HTML5 audio player).
9. PDF preview: embedded PDF viewer or "Open externally".
10. Binary hex viewer: 16 bytes per row, hex + ASCII, offset, copy hex/ASCII.
11. Binary download: save raw bytes to file.
12. Binary info: MIME type, file size, entropy (randomness indicator).
13. Auto-detect file type from magic bytes (not just Content-Type header).
14. Base64 decode option if body is base64-encoded.
15. Image comparison: compare two images (diff mask, swipe, onion skin).

**Acceptance Criteria:**
- [ ] AC1: 5MB PNG image previews instantly.
- [ ] AC2: Zoom from 10% to 500% smoothly.
- [ ] AC3: Hex viewer shows 16 bytes per row with aligned ASCII.
- [ ] AC4: Video player has play/pause/seek/controls.
- [ ] AC5: Magic byte detection identifies file type even with wrong Content-Type.

**Technical Spec:**
- Frontend: HTML5 `<img>`, `<video>`, `<audio>`. Canvas for zoom/pan. Custom hex grid.
- Rust: `infer` crate for magic byte detection. Base64 decode with `base64` crate.
- Image comparison: Canvas manipulation (difference blend mode, swipe divider).

**Data Model:** `ResponseBody.raw_bytes`, `ResponseBody.is_binary`

**UI/UX:** Response body tab auto-detects content type and shows appropriate viewer. Toolbar with zoom, download, copy. Hex viewer for binary.

**Error Handling:**
- Corrupted image → Show "Cannot preview — file may be corrupted" with hex option.
- Unsupported format → Show hex viewer + "Open externally" button.
- Very large image (> 50MB) → Show thumbnail, offer external open.

**Dependencies:** F-003.

---

### F-022: Response Timing Breakdown & Waterfall
**Phase:** M3 | **Priority:** P1  
**User Story:** As a user, I want to see detailed timing information for each request phase.

**Functional Requirements:**
1. Timing breakdown bar: DNS lookup | TCP connection | TLS handshake | Time to first byte | Download | Total.
2. Visual waterfall bar chart showing each phase proportionally.
3. Raw millisecond values for each phase.
4. Timing comparison: compare with previous request (faster/slower delta).
5. Timing history graph: plot response times over time for same endpoint.
6. Average/min/max/percentile (p50, p95, p99) for endpoint from history.
7. Slow request warning: highlight if total time > threshold (configurable, default 5s).
8. Timing export: JSON or CSV.
9. Redirect timing: show each redirect hop with its own timing.
10. Cache hit indicator: show if response came from cache (304 Not Modified, local cache).

**Acceptance Criteria:**
- [ ] AC1: Timing breakdown accurate within 1ms per phase.
- [ ] AC2: Waterfall chart renders clearly for all phases.
- [ ] AC3: History graph shows last 50 requests for same endpoint.
- [ ] AC4: Percentile calculations accurate from history data.
- [ ] AC5: Redirect chain shown as separate timing rows.

**Technical Spec:**
- Rust: Custom `reqwest` middleware or `hyper` client hooks to measure each phase.
- DNS: `tokio::net::lookup_host` timing. TCP: `tokio::net::TcpStream::connect` timing.
- TLS: `tokio_rustls` handshake timing. TTFB: first byte received. Download: total minus TTFB.
- History graph: Query SQLite for same endpoint (method + URL pattern).

**Data Model:** `ResponseTiming`

**UI/UX:** Response tab "Timings". Horizontal bar chart. Table with raw values. History graph (small line chart). Redirect chain table.

**Error Handling:**
- Phase timing unavailable (e.g., reused connection) → Show "N/A (cached connection)".
- Clock skew → Detect and warn if negative timings appear.

**Dependencies:** F-004.

---

### F-023: HTML Response Preview & Inspector
**Phase:** M3 | **Priority:** P1  
**User Story:** As a user, I want to preview HTML responses safely and inspect their structure.

**Functional Requirements:**
1. Rendered HTML preview in sandboxed iframe (no JS, no network requests).
2. Source view: syntax-highlighted HTML source.
3. DOM tree inspector: collapsible tree of HTML elements (like browser devtools).
4. CSS preview: list of stylesheets and inline styles.
5. Link extraction: list all links (href) in response with click to copy.
6. Form extraction: list all forms with method, action, fields.
7. Image extraction: list all images with src, alt, dimensions.
8. Script detection: show script tags (but don't execute).
9. Meta tag extraction: title, description, Open Graph tags.
10. JSON-LD extraction: parse and display structured data.
11. Security warning if HTML contains forms (phishing risk indicator).
12. Download HTML to file.

**Acceptance Criteria:**
- [ ] AC1: HTML renders without executing JavaScript.
- [ ] AC2: Sandbox prevents network requests from iframe.
- [ ] AC3: DOM tree shows all elements in collapsible tree.
- [ ] AC4: Link extraction finds all anchor tags.
- [ ] AC5: Form extraction shows all input fields.

**Technical Spec:**
- Frontend: `iframe sandbox="" srcdoc="<html>...</html>"`. CSP headers via `srcdoc`.
- DOM tree: Parse HTML with `DOMParser` or server-side with `lol_html`/`scraper` (Rust).
- Extraction: CSS selectors to find elements.

**Data Model:** `ResponseBody.parsed_html` (optional)

**UI/UX:** Response tab "Preview" for rendered HTML. Sub-tabs: Rendered | Source | DOM Tree | Links | Forms | Images.

**Error Handling:**
- Malformed HTML → Render as best effort (browser tolerant), show parse warnings.
- External resource blocked by sandbox → Show placeholder icons.
- Very large HTML (> 10MB) → Show first 1000 lines, truncate.

**Dependencies:** F-003.

---

### F-024: XML Response Viewer
**Phase:** M3 | **Priority:** P1  
**User Story:** As a user, I want to view XML responses in a structured, navigable format.

**Functional Requirements:**
1. Pretty-print XML with proper indentation.
2. Syntax highlighting: tags, attributes, values, comments, CDATA.
3. Collapsible tree view for XML nodes.
4. XPath search: query XML with XPath expressions.
5. XPath result highlighting.
6. Copy XML path (like JSONPath but for XML).
7. XML schema validation (XSD) if schema provided.
8. XML to JSON conversion toggle.
9. Namespace handling: show namespace prefixes.
10. Attribute viewer: show all attributes in a table for selected node.
11. XML diff: compare two XML responses (structural).

**Acceptance Criteria:**
- [ ] AC1: XML pretty-print correct indentation.
- [ ] AC2: Tree view collapses/expand nodes.
- [ ] AC3: XPath search returns results in < 500ms for 1MB XML.
- [ ] AC4: XML to JSON conversion produces valid JSON.
- [ ] AC5: Schema validation highlights invalid elements.

**Technical Spec:**
- Frontend: Monaco for raw XML. Custom tree for structured view. `xpath` or `fontoxpath` for XPath.
- Rust: `quick-xml` for parsing. `xmltree` or `roxmltree` for DOM. `jsonxf` for conversion.

**Data Model:** `ResponseBody.parsed_xml`

**UI/UX:** Response tab → XML sub-tab. Tree view. XPath search bar. Convert to JSON button.

**Error Handling:**
- Malformed XML → Show raw with error message, disable tree view.
- Invalid XPath → Show error with suggestion.
- Very large XML → Virtualize tree, lazy load children.

**Dependencies:** F-003.

---

### F-025: CSV & Table Data Viewer
**Phase:** M3 | **Priority:** P2  
**User Story:** As a user, I want to view CSV and tabular JSON responses in a spreadsheet-like table.

**Functional Requirements:**
1. Auto-detect CSV in response body (Content-Type or body sniffing).
2. Parse CSV with header row.
3. Render as sortable, filterable table.
4. Pagination for large CSVs (> 1000 rows).
5. Column type detection: string, number, date, boolean.
6. Column formatting: dates formatted, numbers right-aligned.
7. Search within table data.
8. Export table back to CSV.
9. JSON array of objects → auto-render as table (flatten nested objects).
10. Column visibility toggle: show/hide columns.
11. Row count display.
12. Copy cell, copy row, copy column.

**Acceptance Criteria:**
- [ ] AC1: CSV with 10,000 rows renders with virtualization (60fps scroll).
- [ ] AC2: Sort by column works for numbers, strings, dates.
- [ ] AC3: Filter reduces visible rows in real-time.
- [ ] AC4: JSON array of objects renders as table with nested flattening.
- [ ] AC5: Export produces valid CSV with proper escaping.

**Technical Spec:**
- Frontend: `react-table` or `@tanstack/react-table` with virtualization. `papaparse` for CSV parsing.
- Rust: `csv` crate for server-side parsing if needed.

**Data Model:** `ResponseBody.text_preview` (CSV parsed in frontend)

**UI/UX:** Response tab → Table sub-tab (appears for CSV or JSON array). Spreadsheet-like grid. Column headers with sort icons. Filter row.

**Error Handling:**
- Malformed CSV → Show parse error with row number, fallback to raw text.
- Mixed types in column → Treat as string.
- Very large CSV (> 100MB) → Show first 1000 rows, offer download.

**Dependencies:** F-003.

---

## MILESTONE 4: Scripting, Tests & Automation
**Goal:** User can write test scripts, assertions, and run automated collection tests with reports.

---

### F-026: Rhai Scripting Engine Integration
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want to write pre-request and post-request scripts in a simple, safe language.

**Functional Requirements:**
1. Script editor: Monaco with Rhai syntax highlighting (or JavaScript-like highlighting).
2. Pre-request script: runs before request is sent. Can modify request, set variables.
3. Post-request script: runs after response received. Can analyze response, set variables, run assertions.
4. Collection-level scripts: run before/after every request in collection.
5. Folder-level scripts: run before/after every request in folder.
6. Sandboxed execution: no filesystem access, no network access, no process spawning.
7. Script timeout: 5 seconds max execution time (configurable).
8. Script console: print/log output visible in UI.
9. Script error handling: show line number and error message on failure.
10. Script debugging: step-through not required for MVP, but stack trace on error.
11. Script reuse: save common scripts as snippets/templates.
12. Script import: import script from file.
13. Script version history: track changes (same as request versioning).
14. Script auto-complete: suggest available functions.

**Acceptance Criteria:**
- [ ] AC1: Pre-request script modifies request headers before send.
- [ ] AC2: Post-request script parses JSON and sets environment variable.
- [ ] AC3: Script console output visible in response panel.
- [ ] AC4: Script error shows line number and friendly message.
- [ ] AC5: Sandbox prevents file system access (tested).

**Technical Spec:**
- Rust: `rhai` crate. Register custom functions:
  - `request.set_header(name, value)`
  - `request.set_url(url)`
  - `request.set_body(body)`
  - `request.set_method(method)`
  - `response.status()`
  - `response.json()`
  - `response.text()`
  - `response.headers(name)`
  - `response.cookies(name)`
  - `response.response_time()`
  - `env.set(key, value)`
  - `env.get(key)`
  - `env.unset(key)`
  - `console.log(msg)`
  - `console.error(msg)`
  - `console.warn(msg)`
  - `assert_eq(a, b)`
  - `assert_true(condition)`
  - `assert_contains(haystack, needle)`
  - `pm.test(name, fn)` — Postman-compatible wrapper
  - `pm.expect(value).to.eq(expected)` — Postman-compatible wrapper
  - `pm.environment.set(key, value)` — Postman-compatible wrapper
  - `pm.globals.set(key, value)` — Postman-compatible wrapper
  - `pm.response.json()` — Postman-compatible wrapper
- Sandboxing: Rhai is sandboxed by default. Disable `import` statement. No external modules.
- Timeout: `tokio::time::timeout` around `engine.run()`.

**Data Model:** `ScriptContext`, `ScriptTestResult`

**UI/UX:** Request tab "Scripts". Monaco editor with line numbers. Console output panel below editor. Run script button (for testing). Snippet dropdown.

**Error Handling:**
- Script timeout → Show "Script execution timed out after 5s".
- Script panic → Show stack trace, mark request as failed.
- Syntax error → Monaco squiggles + error panel.
- Sandbox violation → Show "Operation not allowed in script".

**Dependencies:** F-002.

---

### F-027: Test Assertions Engine
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want to define assertions on responses without writing code.

**Functional Requirements:**
1. Assertion builder UI: no-code interface for common assertions.
2. Assertion types:
   - Status code: equals, not equals, contains, matches regex, is one of, is 2xx, is 3xx, is 4xx, is 5xx.
   - Response time: less than, greater than, between.
   - Header exists, header equals, header contains, header matches regex.
   - Body contains, body equals, body matches regex, body is JSON, body is XML, body is HTML.
   - JSON path exists, JSON path equals, JSON path contains, JSON path type check (string, number, boolean, array, object, null).
   - Cookie exists, cookie equals.
   - Content-Type equals.
   - Body length: less than, greater than, equals.
3. Assertion result display: green checkmark for pass, red X for fail, with actual vs expected.
4. Assertion grouping: group assertions by category (Status, Headers, Body, JSON, etc.).
5. Assertion templates: "Common REST checks", "Auth checks", etc.
6. Assertion import from Postman tests.
7. Assertion export as Rhai script.
8. Stop on assertion failure option (per assertion or global).
9. Assertion count in collection run summary.
10. Assertion failure details: show actual value, expected value, operator.

**Acceptance Criteria:**
- [ ] AC1: Status code assertion evaluates correctly.
- [ ] AC2: JSON path assertion finds nested values.
- [ ] AC3: Assertion results visible in response panel.
- [ ] AC4: Failed assertion shows actual vs expected clearly.
- [ ] AC5: Collection run counts passed/failed assertions accurately.

**Technical Spec:**
- Rust: `TestAssertion` evaluated against `ApiResponse`.
- JSON path: `jsonpath_lib` or `serde_json` + custom path parser.
- Regex: `regex` crate.
- Type check: `serde_json::Value` type matching.

**Data Model:** `TestAssertion`, `AssertionResult`, `AssertionType`, `AssertionOperator`

**UI/UX:** Response tab "Tests". No-code builder with dropdowns. Add assertion button. Results panel after request. Pass/fail badges.

**Error Handling:**
- JSON path not found → Assertion fails with "Path not found".
- Regex invalid → Show error before request, disable assertion.
- Type mismatch → Show "Expected string, got number".

**Dependencies:** F-003, F-026.

---

### F-028: Collection Runner — Advanced
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want advanced collection runner features including parallel execution and data-driven tests.

**Functional Requirements:**
1. Parallel execution: run N requests concurrently (configurable, default 1 = sequential).
2. Data-driven testing: import CSV/JSON data file, run collection once per data row.
3. Data file editor: create and edit data files within app.
4. Variable substitution from data file: `{{data.username}}`.
5. Iteration count: run collection N times with same or different data.
6. Conditional execution: skip request if condition met (based on previous response or variable).
7. Request chaining: use response from request N as input for request N+1 (automatic variable setting).
8. Run schedule: schedule collection to run at specific times (cron-like, local only).
9. Run on startup: auto-run collection when app opens.
10. Run hook: pre-run script (before collection) and post-run script (after collection).
11. Run comparison: compare current run results with previous run.
12. Run export: detailed JSON report, HTML report, JUnit XML report (for CI/CD).
13. Run notification: desktop notification on completion (if app backgrounded).
14. Run dashboard: list all past runs with filters, search, trends.
15. Run performance: track response time trends across runs.

**Acceptance Criteria:**
- [ ] AC1: Parallel execution with 6 concurrency completes faster than sequential.
- [ ] AC2: Data-driven run executes once per CSV row with correct variables.
- [ ] AC3: Conditional skip works based on previous response status.
- [ ] AC4: JUnit XML export valid for Jenkins/GitLab CI.
- [ ] AC5: Run dashboard shows trend graph of response times.

**Technical Spec:**
- Rust: `tokio::sync::Semaphore` for concurrency control. `csv` crate for data parsing.
- Data-driven: Iterate data rows, clone collection, substitute variables, run.
- Scheduling: `tokio::time::interval` or `cron` crate. Background task.
- JUnit: XML generation with `xml-rs` or string templates.

**Data Model:** `CollectionRunResult`, `RunSummary`, `DataFile { id, name, format, rows: Vec<HashMap<String, String>> }`

**UI/UX:** Runner modal with advanced options accordion. Data file picker. Concurrency slider. Schedule builder. Run dashboard sidebar panel.

**Error Handling:**
- Data file parse error → Show error with row number, abort run.
- Parallel execution conflict (same variable writes) → Last-write-wins, show warning.
- Schedule missed (app closed) → Show "Missed run" notification on reopen.

**Dependencies:** F-016, F-014, F-026.

---

### F-029: CLI Companion Export
**Phase:** M4 | **Priority:** P1  
**User Story:** As a user, I want to export collections as a CLI tool for CI/CD integration.

**Functional Requirements:**
1. Export collection to standalone Rust CLI project.
2. CLI uses same Rust core as desktop app (shared crate).
3. CLI supports: run collection, run single request, specify environment, output JSON/CLI/JUnit.
4. CLI supports: variable override via command line (`--var key=value`).
5. CLI supports: data file for data-driven tests (`--data-file path.csv`).
6. CLI supports: parallel execution (`--parallel N`).
7. CLI supports: output to file (`--output report.json`).
8. CLI supports: fail-on-error option (`--fail-fast`).
9. CLI supports: quiet mode (`--quiet`).
10. CLI supports: verbose mode (`--verbose` for debugging).
11. CLI supports: timeout override (`--timeout 30`).
12. CLI supports: proxy override (`--proxy http://proxy:8080`).
13. CLI supports: no-SSL-verify (`--insecure`).
14. CLI supports: custom headers (`--header "X-Custom: Value"`).
15. Generated CLI is compilable with `cargo build`.
16. Pre-built binary download option (for users without Rust).

**Acceptance Criteria:**
- [ ] AC1: Exported CLI compiles with `cargo build`.
- [ ] AC2: CLI runs collection and produces same results as desktop app.
- [ ] AC3: JUnit output valid for CI integration.
- [ ] AC4: Variable override works via command line.
- [ ] AC5: Pre-built binary runs without Rust installed.

**Technical Spec:**
- Rust: `clap` crate for CLI args. `tokio` runtime. Shared `api-core` crate.
- Export: Generate `main.rs`, `Cargo.toml` referencing project path or published crate.
- Pre-built: Cross-compile with `cross` or GitHub Actions.

**Data Model:** `CollectionRunResult`, `CliExportConfig`

**UI/UX:** Collection context menu → "Export CLI". Modal with options. Download button for pre-built binary.

**Error Handling:**
- Export path invalid → Show error.
- Missing shared crate → Bundle core crate in export.
- Compilation failure in generated CLI → Show error log.

**Dependencies:** F-028.

---

### F-030: Test Report Generation
**Phase:** M4 | **Priority:** P1  
**User Story:** As a user, I want to generate and share test reports from collection runs.

**Functional Requirements:**
1. HTML report: beautiful, printable, with charts (pass/fail pie chart, response time histogram).
2. JSON report: machine-readable, full detail.
3. JUnit XML report: for CI/CD integration (Jenkins, GitLab, GitHub Actions).
4. CSV report: summary table of all requests and results.
5. PDF report: export HTML report as PDF.
6. Report includes: run metadata (date, environment, collection), request details, assertion results, response times, errors.
7. Report comparison: compare two runs in one report (before/after).
8. Report sharing: copy report to clipboard, save to file, open in browser.
9. Report templates: choose from minimal, detailed, executive summary.
10. Custom report branding: logo, title, colors (enterprise feature).

**Acceptance Criteria:**
- [ ] AC1: HTML report opens in browser and is visually clear.
- [ ] AC2: JUnit XML passes validation against Jenkins schema.
- [ ] AC3: JSON report contains all request/response details.
- [ ] AC4: Report comparison shows delta (improved/regressed).
- [ ] AC5: PDF export produces readable document.

**Technical Spec:**
- Rust: `tera` or `handlebars` for HTML template rendering. `serde_json` for JSON. `xml-rs` for JUnit.
- PDF: `print-html` or `wkhtmltopdf` integration, or frontend print-to-PDF.
- Charts: Inline SVG in HTML report.

**Data Model:** `CollectionRunResult`, `RunSummary`, `RequestRunResult`, `AssertionResult`

**UI/UX:** Runner results panel → "Generate Report" button. Modal with format options. Preview HTML in app. Download button.

**Error Handling:**
- Template render failure → Fallback to plain text report.
- Very large run (> 1000 requests) → Paginate report, warn about size.
- PDF generation failure → Offer HTML download instead.

**Dependencies:** F-028.

---

### F-031: Request Chaining & Variables From Response
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want to extract values from responses and use them in subsequent requests automatically.

**Functional Requirements:**
1. Visual response extractor: click a value in JSON tree → "Set as variable".
2. Extractor types: JSON path, XPath, regex, header value, cookie value, status code.
3. Extractor target: set environment variable, collection variable, global variable.
4. Extractor scope: available for next request, all subsequent requests, or specific request.
5. Extractor preview: show what value will be extracted before saving.
6. Extractor in scripts: `response.json().users[0].id` → `env.set("user_id", value)`.
7. Automatic chaining in collection runner: if request A sets variable, request B uses it.
8. Chaining visualization: show dependency graph between requests (which request feeds which).
9. Chaining validation: detect circular dependencies.
10. Chaining failure handling: if extractor fails, show error and option to continue or stop.

**Acceptance Criteria:**
- [ ] AC1: Click JSON value sets variable correctly.
- [ ] AC2: JSON path extractor finds nested values.
- [ ] AC3: Regex extractor captures groups.
- [ ] AC4: Chaining works in collection runner automatically.
- [ ] AC5: Circular dependency detected and shown as error.

**Technical Spec:**
- Rust: JSON path via `serde_json` + custom path parser. XPath via `roxmltree`. Regex via `regex`.
- Frontend: JSON tree right-click menu. XPath via `fontoxpath`. Regex tester UI.
- Chaining graph: Build dependency graph from variable references. Detect cycles with DFS.

**Data Model:** `ResponseExtractor { id, name, source_type, source_path, target_variable, target_scope, request_id }`

**UI/UX:** Response JSON tree → right-click → "Set as variable". Extractor modal with preview. Chaining graph view in collection settings.

**Error Handling:**
- JSON path not found → Show "Path not found in response".
- Regex no match → Show "Pattern did not match".
- Circular dependency → Show graph with red cycle, disable run.

**Dependencies:** F-019, F-014, F-016.

---

### F-032: Script Snippets & Templates
**Phase:** M4 | **Priority:** P2  
**User Story:** As a user, I want reusable script snippets for common testing patterns.

**Functional Requirements:**
1. Built-in snippet library: 20+ common snippets.
   - "Check status is 200"
   - "Check response time < 500ms"
   - "Check JSON path exists"
   - "Parse JWT token"
   - "Set auth token from response"
   - "Retry on 429"
   - "Generate random email"
   - "Generate timestamp"
   - "HMAC signature"
   - "Base64 encode/decode"
   - "Check all array items have property"
   - "Validate JSON schema"
   - "Parse XML to object"
   - "Check header exists"
   - "Check cookie exists"
   - "Set variable from header"
   - "Conditional request based on variable"
   - "Loop through array and validate"
   - "Compare response with previous"
   - "Send Slack notification on failure"
2. User-defined snippets: save custom scripts as reusable snippets.
3. Snippet search: fuzzy search by name or description.
4. Snippet categories: Auth, Validation, Data Generation, Utilities, Custom.
5. Snippet import/export (JSON).
6. Snippet sharing: export snippet to file or clipboard.
7. Snippet auto-complete: type snippet name, press Tab to insert.
8. Snippet hotkeys: assign keyboard shortcuts to frequently used snippets.

**Acceptance Criteria:**
- [ ] AC1: Built-in snippets cover 80% of common use cases.
- [ ] AC2: Snippet insertion works in script editor.
- [ ] AC3: User snippets persist across restarts.
- [ ] AC4: Snippet search finds match in < 50ms.
- [ ] AC5: Snippet export produces valid JSON.

**Technical Spec:**
- Rust: Snippets stored in SQLite `snippets` table or JSON files in `<project>/snippets/`.
- Frontend: Monaco custom completion provider for snippet names.

**Data Model:** `ScriptSnippet { id, name, description, category, code, hotkey }`

**UI/UX:** Script editor → "Insert Snippet" button. Snippet picker modal. Sidebar snippet library. Right-click → "Insert Snippet".

**Error Handling:**
- Snippet code syntax error → Show warning on insert, don't block.
- Snippet not found → Show "Snippet not found" error.

**Dependencies:** F-026.

---

---

## MILESTONE 5: Protocols Beyond HTTP
**Goal:** User can test WebSocket, SSE, GraphQL, gRPC, and raw TCP/UDP connections.

---

### F-033: WebSocket Client
**Phase:** M5 | **Priority:** P0  
**User Story:** As a user, I want to connect to WebSocket endpoints and send/receive messages.

**Functional Requirements:**
1. URL input for WebSocket (ws:// and wss://).
2. Custom headers for WebSocket handshake (e.g., Authorization).
3. Subprotocol selection (Sec-WebSocket-Protocol).
4. Connect button with connection status indicator (connecting, connected, disconnected, error).
5. Message input area: text or binary (file upload).
6. Send message button (Enter to send).
7. Message history panel: shows all sent and received messages.
8. Message display: text (with syntax highlighting for JSON), binary (hex), ping/pong.
9. Message metadata: timestamp, direction (sent/received), size, opcode.
10. Message search: search within message history.
11. Message filter: show only sent, only received, only text, only binary.
12. Message export: save message history to file (JSON, text).
13. Message clear: clear history (with confirmation).
14. Auto-reconnect: configurable interval and max retries.
15. Heartbeat/ping: auto-send ping at interval (configurable).
16. Connection close: manual disconnect with optional close code and reason.
17. Connection error display: show exact error message.
18. Message formatting: pretty-print JSON, XML. Hex for binary.
19. Message copy: copy single message or all messages.
20. Message count badge in tab.

**Acceptance Criteria:**
- [ ] AC1: WebSocket connects to echo server within 1 second.
- [ ] AC2: Sent and received messages appear in history immediately.
- [ ] AC3: Binary messages shown in hex viewer.
- [ ] AC4: Auto-reconnect works after network interruption.
- [ ] AC5: 1000 messages in history scroll at 60fps (virtualized).

**Technical Spec:**
- Rust: `tokio-tungstenite` crate. `tokio::sync::mpsc` for message passing. `tokio::select!` for cancellation.
- Connection: `connect_async()` with custom headers via `tungstenite::client::ClientRequestBuilder`.
- Messages: Stream incoming via `stream.next()`, send via `sink.send()`.
- Heartbeat: `tokio::time::interval` sending `Message::Ping`.

**Data Model:** `WebSocketConfig { url, headers, subprotocol, auto_reconnect, heartbeat_interval }`, `WebSocketMessage`

**UI/UX:** Request builder switches to WebSocket mode. Connection status dot (green/red). Message history as chat-like bubbles or table. Input area at bottom. Send button.

**Error Handling:**
- Connection refused → Show "Connection refused" with URL.
- Invalid WebSocket URL → Inline error.
- Handshake failure → Show HTTP response status from handshake.
- Send after disconnect → Queue or show error.

**Dependencies:** F-002.

---

### F-034: Server-Sent Events (SSE) Client
**Phase:** M5 | **Priority:** P1  
**User Story:** As a user, I want to connect to SSE endpoints and receive streamed events.

**Functional Requirements:**
1. URL input for SSE endpoint (regular HTTP URL).
2. Custom headers for SSE request.
3. Connect button with status indicator.
4. Event stream display: table or card list of events.
5. Event fields: id, event type, data, retry, timestamp.
6. Event filter: filter by event type.
7. Event search: search within event data.
8. Event detail view: click event to see full data (pretty-printed JSON if applicable).
9. Event count: total events received.
10. Event rate: events per second display.
11. Auto-scroll: scroll to latest event (toggleable).
12. Pause/resume stream: pause receiving new events without disconnecting.
13. Disconnect: close connection.
14. Reconnect: manual reconnect with Last-Event-ID support.
15. Event export: save all events to file (JSON, CSV, text).
16. Event clear: clear display (with confirmation).
17. Connection error display.
18. Reconnection strategy: configurable retry interval, max retries.
19. Event validation: warn if event format doesn't match SSE spec.

**Acceptance Criteria:**
- [ ] AC1: SSE connects and receives events in real-time.
- [ ] AC2: Events parsed correctly (id, event, data, retry fields).
- [ ] AC3: Event rate updates in real-time.
- [ ] AC4: 10,000 events handled without crash (virtualized).
- [ ] AC5: Reconnect with Last-Event-ID resumes from correct point.

**Technical Spec:**
- Rust: `reqwest-eventsource` crate. `EventSource::new()` with custom client.
- Events: `stream.next()` yields `Event` structs. Emit via Tauri events.
- Reconnect: `EventSource` handles automatic reconnect with `Last-Event-ID`.

**Data Model:** `SseConfig { url, headers, reconnect_interval, max_retries }`, `SseEvent`

**UI/UX:** Similar to WebSocket but events shown as cards/table. Event type badges. Auto-scroll toggle. Rate counter.

**Error Handling:**
- Not an SSE endpoint (no text/event-stream) → Show warning, attempt anyway.
- Stream parse error → Show raw line with error, continue.
- Reconnect exhaustion → Show "Max reconnections reached".

**Dependencies:** F-002, F-004.

---

### F-035: GraphQL Client
**Phase:** M5 | **Priority:** P0  
**User Story:** As a user, I want to send GraphQL queries with introspection, variables, and mutation support.

**Functional Requirements:**
1. GraphQL endpoint URL input.
2. Query editor: Monaco with GraphQL syntax highlighting and validation.
3. Query auto-complete: suggest fields, types, arguments from schema.
4. Query builder: visual query builder (click to add fields, like GraphiQL).
5. Schema introspection: fetch schema from endpoint, cache locally.
6. Schema explorer: browse types, queries, mutations, subscriptions, enums, interfaces.
7. Schema documentation: show descriptions from introspection.
8. Variables editor: JSON editor for query variables.
9. Operation selector: if query has multiple operations, choose which to run.
10. Mutation support: same as query but for mutations.
11. Subscription support: WebSocket-based GraphQL subscriptions (graphql-ws protocol).
12. Response viewer: JSON tree with GraphQL-aware formatting.
13. Error display: GraphQL errors shown separately from HTTP errors.
14. Query prettify: format GraphQL query.
15. Query minify: compress GraphQL query (remove whitespace).
16. Query history: save recent GraphQL queries.
17. Query validation: validate against schema before sending.
18. Fragments support: define and use GraphQL fragments.
19. Import/export: import/export queries as .graphql files.
20. GraphQL file association: open .graphql files in app.

**Acceptance Criteria:**
- [ ] AC1: Introspection fetches schema within 3 seconds.
- [ ] AC2: Auto-complete suggests fields from schema.
- [ ] AC3: Query with variables sends correctly.
- [ ] AC4: GraphQL errors displayed separately from HTTP 200.
- [ ] AC5: Subscription receives real-time updates.

**Technical Spec:**
- Rust: `reqwest` for HTTP GraphQL. `tokio-tungstenite` for subscriptions (graphql-ws protocol).
- Introspection: Standard GraphQL introspection query. Cache schema JSON in SQLite.
- Frontend: `graphql` and `graphql-language-service` for Monaco. `graphql-ws` for subscriptions.

**Data Model:** `GraphQLConfig { endpoint, schema_json, headers, subscription_url }`

**UI/UX:** Dedicated GraphQL request mode. Split pane: query editor left, variables bottom-left, response right. Schema explorer sidebar. Operation selector dropdown.

**Error Handling:**
- Introspection disabled → Show "Schema introspection not available", allow manual schema import.
- Invalid GraphQL syntax → Monaco squiggles + error panel.
- Subscription protocol mismatch → Try graphql-ws, fallback to subscriptions-transport-ws.

**Dependencies:** F-002, F-004, F-033.

---

### F-036: gRPC Client
**Phase:** M5 | **Priority:** P1  
**User Story:** As a user, I want to test gRPC services with protobuf support.

**Functional Requirements:**
1. gRPC endpoint input (host:port).
2. Proto file import: import .proto files or directories.
3. Proto file editor: view and edit proto files in app.
4. Service discovery: list all services and methods from proto.
5. Method selector: dropdown of available RPC methods.
6. Request message builder: form-based UI for protobuf message fields (like JSON editor but schema-aware).
7. JSON request body: edit request as JSON, validate against proto schema.
8. Metadata headers: gRPC metadata (key-value pairs).
9. TLS configuration: certificate, mTLS for gRPC.
10. Unary RPC support (single request → single response).
11. Server streaming RPC support (single request → stream of responses).
12. Client streaming RPC support (stream of requests → single response).
13. Bidirectional streaming RPC support (stream ↔ stream).
14. Response viewer: JSON tree for protobuf response.
15. gRPC status codes: display with descriptions (OK, NOT_FOUND, etc.).
16. gRPC trailers: display trailer metadata.
17. gRPC reflection: fetch service definitions from server (if reflection enabled).
18. Proto import resolution: resolve import statements in proto files.
19. Proto compilation: compile proto to Rust or use dynamic message building.
20. Error display: gRPC error details (status message, error details).

**Acceptance Criteria:**
- [ ] AC1: Unary RPC sends and receives correct protobuf message.
- [ ] AC2: Proto file import resolves all dependencies.
- [ ] AC3: Form-based message builder generates valid protobuf.
- [ ] AC4: Server streaming shows responses as they arrive.
- [ ] AC5: Reflection fetches services if enabled on server.

**Technical Spec:**
- Rust: `tonic` crate for gRPC client. `tonic-reflection` for server reflection.
- Protobuf: `prost` for code generation or `protobuf` crate for dynamic messages.
- Dynamic messages: Use `prost-reflect` or `protobuf` reflection for runtime proto parsing (no code generation needed).
- Streaming: `tokio::sync::mpsc` for bidirectional streaming.

**Data Model:** `GrpcConfig { endpoint, proto_files, service, method, tls_config, use_reflection }`

**UI/UX:** Dedicated gRPC request mode. Proto file tree sidebar. Service/method dropdown. Message builder form. Response JSON tree. Streaming messages as list.

**Error Handling:**
- Proto parse error → Show error with file and line.
- Service not found → Show "Service not found in proto or reflection".
- Connection refused → Standard network error.
- Invalid message JSON → Validate against proto schema, show errors.

**Dependencies:** F-002, F-004, F-005.

---

### F-037: Raw TCP & UDP Client
**Phase:** M5 | **Priority:** P2  
**User Story:** As a user, I want to send raw TCP and UDP packets for low-level protocol testing.

**Functional Requirements:**
1. TCP client: connect to host:port, send raw bytes, receive raw bytes.
2. UDP client: send datagram to host:port, receive response.
3. Connection status indicator.
4. Send input: text or hex mode.
5. Receive display: text or hex mode.
6. Line ending options for text: CRLF, LF, CR, none.
7. Receive buffer: scrollable history of all received data.
8. Send on Enter toggle.
9. Auto-reconnect for TCP.
10. Connection timeout configurable.
11. Send/receive timestamps.
12. Byte count display.
13. Hex mode: input hex string (e.g., `48 65 6C 6C 6F`), display hex + ASCII.
14. Raw mode for binary protocols.
15. Save session log to file.

**Acceptance Criteria:**
- [ ] AC1: TCP connects and sends/receives text data.
- [ ] AC2: UDP sends datagram and shows response.
- [ ] AC3: Hex mode sends correct binary data.
- [ ] AC4: Session log saved with timestamps.
- [ ] AC5: 1MB of received data handled without crash.

**Technical Spec:**
- Rust: `tokio::net::TcpStream` and `tokio::net::UdpSocket`.
- TCP: `TcpStream::connect()`, `split()` into read/write halves, `tokio::io::AsyncReadExt`/`AsyncWriteExt`.
- UDP: `UdpSocket::bind("0.0.0.0:0")`, `send_to()`, `recv_from()`.
- Hex parsing: Custom hex string parser (`hex` crate).

**Data Model:** `RawTcpConfig { host, port, timeout, line_ending, send_on_enter }`, `RawUdpConfig { host, port, timeout }`

**UI/UX:** Simple terminal-like interface. Input at bottom, output above. Hex/text toggle. Connect/Disconnect button.

**Error Handling:**
- Connection refused → Show error.
- Host not found → DNS error.
- Invalid hex input → Show error, don't send.
- UDP no response → Show "No response received (UDP is connectionless)".

**Dependencies:** F-002.

---

## MILESTONE 6: Authentication & Security
**Goal:** User can configure all common auth methods securely with credential management.

---

### F-038: Basic & Digest Authentication
**Phase:** M6 | **Priority:** P0  
**User Story:** As a user, I want to configure Basic and Digest auth for my API requests.

**Functional Requirements:**
1. Basic auth: username and password fields.
2. Password masking: hidden behind dots, reveal on click.
3. Password storage: stored in OS keyring, not in collection files.
4. Digest auth: username, password, realm, nonce, algorithm (MD5, MD5-sess, SHA-256, SHA-256-sess).
5. Auto-detect digest challenge: if server returns 401 with WWW-Authenticate: Digest, auto-respond.
6. Auth preview: show what Authorization header will look like (without revealing password).
7. Per-request auth override.
8. Auth inheritance: request → folder → collection → project.
9. Auth test: send test request to verify credentials.
10. Auth status: indicator if credentials are set.

**Acceptance Criteria:**
- [ ] AC1: Basic auth sends correct Base64-encoded header.
- [ ] AC2: Password never stored in plain text in collection files.
- [ ] AC3: Digest auth handles challenge-response correctly.
- [ ] AC4: Auth preview shows header format without password.
- [ ] AC5: Test request verifies credentials.

**Technical Spec:**
- Rust: `reqwest` handles Basic auth natively (`basic_auth()`). Digest: custom implementation or `reqwest` with `digest_auth` middleware.
- Keyring: `keyring` crate for cross-platform secure storage.
- Collection file: Store `password_ref` (keyring key) instead of actual password.

**Data Model:** `AuthConfig::Basic`, `AuthConfig::Digest`

**UI/UX:** Auth tab in request builder. Username/password fields. Password reveal toggle. Auth type dropdown. Test button.

**Error Handling:**
- Keyring unavailable → Fallback to encrypted SQLite storage, warn user.
- Auth test 401 → Show "Authentication failed".
- Digest algorithm unsupported → Show error, suggest Basic or Bearer.

**Dependencies:** F-002.

---

### F-039: Bearer Token & API Key Authentication
**Phase:** M6 | **Priority:** P0  
**User Story:** As a user, I want to configure Bearer tokens and API keys for my requests.

**Functional Requirements:**
1. Bearer token: token input field (masked or visible).
2. Token storage: in keyring or encrypted storage (configurable).
3. Token prefix: configurable (default "Bearer", can be "Token", "JWT", custom).
4. API key: key name, key value, location (header or query parameter).
5. Multiple API keys: support multiple key-value pairs.
6. API key presets: common patterns (X-API-Key, Authorization, etc.).
7. Token refresh: manual refresh button, auto-refresh if expiration known.
8. Token preview: show header/query that will be sent (masked value).
9. Token validation: test request to verify token works.
10. Token history: keep last N tokens (configurable).
11. Token from environment variable: `{{auth_token}}`.
12. Token from previous response: auto-set from login endpoint.

**Acceptance Criteria:**
- [ ] AC1: Bearer token sent as `Authorization: Bearer <token>`.
- [ ] AC2: API key sent as header or query param correctly.
- [ ] AC3: Token stored securely, not in plain text files.
- [ ] AC4: Multiple API keys all sent in request.
- [ ] AC5: Token from environment variable resolves correctly.

**Technical Spec:**
- Rust: `reqwest::header::AUTHORIZATION` for Bearer. Custom header or query param for API key.
- Storage: Keyring for sensitive tokens. Environment variables for non-sensitive.

**Data Model:** `AuthConfig::Bearer`, `AuthConfig::ApiKey`

**UI/UX:** Auth tab. Token textarea. API key table. Location dropdown (Header/Query). Prefix input. Test button.

**Error Handling:**
- Token empty → Show warning, don't send auth header.
- Token expired → Show warning, offer refresh.
- API key location conflict → Show error.

**Dependencies:** F-002, F-013.

---

### F-040: OAuth 2.0 Authentication
**Phase:** M6 | **Priority:** P1  
**User Story:** As a user, I want to authenticate with OAuth 2.0 flows without manual token management.

**Functional Requirements:**
1. OAuth 2.0 grant types: Authorization Code, Client Credentials, Password, Device Code, PKCE.
2. Authorization Code flow: redirect to auth URL, handle callback, exchange code for token.
3. PKCE flow: auto-generate code verifier and challenge.
4. Client Credentials flow: direct token request.
5. Password flow: username/password token request.
6. Device Code flow: show user code, poll for token.
7. Token storage: access token and refresh token in keyring.
8. Token refresh: auto-refresh before expiration (configurable).
9. Token scope: display and configure requested scopes.
10. Multiple OAuth 2.0 configurations per project (named).
11. OAuth config import from OpenID Connect discovery URL.
12. OAuth callback handling: built-in HTTP server on localhost for callback.
13. OAuth error handling: show user-friendly error for each OAuth error type.
14. Token inspection: show decoded JWT claims (if JWT).
15. Token revocation: revoke token on logout.
16. OAuth state parameter: auto-generate and validate.
17. Custom redirect URI: configurable (default: http://localhost:random-port/callback).

**Acceptance Criteria:**
- [ ] AC1: Authorization Code flow completes and stores token.
- [ ] AC2: PKCE auto-generates verifier and challenge.
- [ ] AC3: Token auto-refreshes before expiration.
- [ ] AC4: JWT claims visible in token inspector.
- [ ] AC5: Device Code flow shows user code and polls correctly.

**Technical Spec:**
- Rust: `oauth2` crate. `tokio::net::TcpListener` for local callback server.
- PKCE: `oauth2::PkceCodeChallenge::new_random_sha256()`.
- JWT: `jsonwebtoken` crate for decoding/inspection.
- Refresh: Background task checks expiration, refreshes if within threshold.

**Data Model:** `AuthConfig::OAuth2`, `OAuth2Config`

**UI/UX:** Auth tab → OAuth 2.0. Grant type selector. Fields change based on grant type. "Get New Access Token" button. Token display (masked). Refresh button. JWT inspector panel.

**Error Handling:**
- Callback timeout → Show "Authorization timed out, please try again".
- Invalid client credentials → Show OAuth error from server.
- Refresh token expired → Prompt for re-authorization.
- State mismatch → Security error, abort flow.

**Dependencies:** F-002.

---

### F-041: AWS Signature V4 & Hawk Authentication
**Phase:** M6 | **Priority:** P2  
**User Story:** As a user, I want to authenticate with AWS Signature V4 and Hawk for cloud API testing.

**Functional Requirements:**
1. AWS Signature V4: access key, secret key (stored in keyring), region, service.
2. AWS session token support (for temporary credentials).
3. Auto-sign request with AWS Signature V4 before sending.
4. Hawk authentication: id, key (keyring), algorithm (sha256, sha1).
5. Hawk: timestamp, nonce, payload hash, ext (extension).
6. Hawk: auto-generate timestamp and nonce.
7. Hawk: payload hash option (include body hash in signature).
8. NTLM authentication: username, password (keyring), domain.
9. NTLM: auto-negotiate NTLM challenge-response.
10. Mutual TLS (mTLS): client certificate selection (see F-005).
11. Custom auth: define arbitrary headers for auth.
12. Auth method comparison table in docs.

**Acceptance Criteria:**
- [ ] AC1: AWS Signature V4 generates valid signature.
- [ ] AC2: Hawk auth header sent correctly.
- [ ] AC3: NTLM challenge-response completes.
- [ ] AC4: mTLS client cert sent in handshake.
- [ ] AC5: Custom auth headers sent as configured.

**Technical Spec:**
- Rust: `aws-sigv4` crate or custom implementation. `hawk` crate for Hawk auth.
- NTLM: `ntlm` crate or custom implementation. mTLS: `reqwest` with `Identity`.
- AWS: Sign request using `aws_sigv4::http_request::sign()`.

**Data Model:** `AuthConfig::AwsSignatureV4`, `AuthConfig::Hawk`, `AuthConfig::Ntlm`, `AuthConfig::MutualTls`, `AuthConfig::Custom`

**UI/UX:** Auth tab dropdown for each method. Method-specific fields. Test button. Documentation link.

**Error Handling:**
- AWS signature mismatch → Show error with canonical request for debugging.
- Hawk clock skew → Auto-adjust timestamp, retry once.
- NTLM unsupported → Show error, suggest alternative auth.

**Dependencies:** F-002, F-005.

---

### F-042: Credential Vault & Security
**Phase:** M6 | **Priority:** P0  
**User Story:** As a user, I want my credentials stored securely and never leaked.

**Functional Requirements:**
1. OS keyring integration: macOS Keychain, Windows Credential Manager, Linux Secret Service.
2. Fallback encryption: if keyring unavailable, AES-256-GCM encrypt in SQLite.
3. Encryption key: derived from machine-specific key or user password.
4. Credential listing: view all stored credentials (names only, values hidden).
5. Credential deletion: remove from keyring and app.
6. Credential update: change password/token without recreating.
7. Credential import: import from other tools (Postman, Insomnia).
8. Credential export: encrypted export for backup (password-protected).
9. Credential audit: log all credential access (read, write, delete).
10. Auto-lock: lock credential vault after inactivity (configurable timeout).
11. Master password: optional master password for additional security layer.
12. Biometric unlock: Touch ID / Face ID / Windows Hello (if available).
13. Credential sharing: share between team members via encrypted file (enterprise).
14. Breach detection: warn if credential appears in known breach databases (optional, online).
15. Secure memory: zero sensitive strings from memory after use.

**Acceptance Criteria:**
- [ ] AC1: Password stored in OS keyring, not in app files.
- [ ] AC2: Credential values never visible in UI without explicit reveal.
- [ ] AC3: Export produces encrypted file requiring password.
- [ ] AC4: Audit log shows all credential access.
- [ ] AC5: Auto-lock activates after configured inactivity.

**Technical Spec:**
- Rust: `keyring` crate. `aes-gcm` for fallback encryption. `argon2` for key derivation.
- Secure memory: `zeroize` crate to clear sensitive data from memory.
- Biometric: Platform-specific APIs via Tauri plugins.

**Data Model:** `AuthCredential { id, name, auth_type, config_json, keyring_entry, created_at }`

**UI/UX:** Settings > Security > Credentials. Table with names. Reveal button (requires auth). Add/Edit/Delete buttons. Export/Import buttons. Audit log tab.

**Error Handling:**
- Keyring locked → Prompt for OS password.
- Keyring unavailable → Fallback to encrypted SQLite, show warning.
- Encryption key lost → Credentials unrecoverable, show error.
- Biometric failure → Fallback to master password.

**Dependencies:** F-001.

---

## MILESTONE 7: Import/Export, Ecosystem & Integrations
**Goal:** User can import from competitors, export to various formats, and integrate with development workflows.

---

### F-043: Postman Import & Export
**Phase:** M7 | **Priority:** P0  
**User Story:** As a user, I want to import my Postman collections and environments.

**Functional Requirements:**
1. Import Postman Collection v2.0 and v2.1 (JSON).
2. Import Postman Environment (JSON).
3. Import Postman data dump (all collections, environments, globals).
4. Map Postman features to app features:
   - Collection → Collection
   - Folder → Folder
   - Request → Request
   - Pre-request script → Rhai pre-request script (best effort translation)
   - Tests → Test assertions + Rhai post-request script (best effort)
   - Variables → Environment variables
   - Auth → Auth config
5. Handle Postman dynamic variables: `{{$timestamp}}`, `{{$randomUUID}}`, etc.
6. Handle Postman response chaining: `pm.environment.set()`, `pm.globals.set()`.
7. Handle Postman file uploads: map to multipart fields.
8. Export to Postman format: collection v2.1, environment.
9. Import progress: show file parsing progress for large collections.
10. Import validation: warn about unsupported features.
11. Import merge: merge into existing project or create new.
12. Postman-compatible script functions: `pm.*` API in Rhai (see F-026).

**Acceptance Criteria:**
- [ ] AC1: Postman collection with 100 requests imports correctly.
- [ ] AC2: Environment variables mapped accurately.
- [ ] AC3: Auth config preserved (Basic, Bearer, OAuth2).
- [ ] AC4: Pre-request scripts translated to Rhai (or marked for manual review).
- [ ] AC5: Export produces valid Postman v2.1 JSON.

**Technical Spec:**
- Rust: `serde_json` deserialization of Postman schema. Custom mapping logic.
- Script translation: Best-effort regex/string replacement from JavaScript to Rhai. Mark untranslated lines with comments.
- Validation: Schema validation against Postman collection schema.

**Data Model:** `PostmanCollection`, `PostmanEnvironment` (intermediate structs), mapped to `Collection`, `Environment`.

**UI/UX:** File > Import > Postman. File picker. Preview of what will be imported. Merge/Create new option. Progress bar. Warnings list.

**Error Handling:**
- Invalid Postman JSON → Show parse error with line info.
- Unsupported Postman feature → Warning with description, skip or approximate.
- Script translation failure → Mark as "needs manual review", don't fail import.
- Duplicate names → Auto-append number or prompt user.

**Dependencies:** F-011, F-013.

---

### F-044: Bruno, Insomnia & Other Imports
**Phase:** M7 | **Priority:** P1  
**User Story:** As a user, I want to import from Bruno, Insomnia, and other API clients.

**Functional Requirements:**
1. Bruno import: parse `.bru` files and directory structure.
2. Bruno auth mapping: inherit, basic, bearer, digest.
3. Bruno script mapping: pre-request and post-request scripts (best effort to Rhai).
4. Bruno environment import: `.env` files and `bru` environment files.
5. Insomnia import: v4 JSON export format.
6. Insomnia project → project, folder → folder, request → request mapping.
7. Insomnia environment variables mapping.
8. HTTPie import: parse HTTPie command sequences.
9. Swagger/OpenAPI 2.0 import: generate collection from API spec.
10. Swagger/OpenAPI 3.0 import: generate collection from API spec.
11. OpenAPI import options: generate requests for all operations, or selected tags only.
12. OpenAPI import: preserve descriptions, parameters, request bodies, response schemas.
13. HAR import: import from HTTP Archive files (browser devtools export).
14. cURL import: already covered in F-009.
15. Import from URL: fetch collection from remote URL.

**Acceptance Criteria:**
- [ ] AC1: Bruno collection with folders imports correctly.
- [ ] AC2: Insomnia v4 export imports with requests and environments.
- [ ] AC3: OpenAPI 3.0 spec generates collection with all endpoints.
- [ ] AC4: HAR import creates requests with correct headers and bodies.
- [ ] AC5: Import from URL fetches and parses correctly.

**Technical Spec:**
- Rust: `serde_json`/`serde_yaml` for parsing. `openapi` crate for OpenAPI parsing.
- Bruno: Custom parser for `.bru` format (key-value pairs with `~` separators).
- Insomnia: Parse v4 schema. HAR: Standard HAR JSON schema.

**Data Model:** Intermediate structs for each format, mapped to internal models.

**UI/UX:** File > Import > [Format]. File picker or URL input. Preview. Options (e.g., OpenAPI tag filter).

**Error Handling:**
- Unsupported format version → Show error, suggest update or manual import.
- Missing referenced files → Warning, skip missing items.
- URL import failure → Network error with retry.

**Dependencies:** F-011, F-013, F-009.

---

### F-045: OpenAPI / Swagger Integration
**Phase:** M7 | **Priority:** P1  
**User Story:** As a user, I want to generate collections from OpenAPI specs and keep them in sync.

**Functional Requirements:**
1. Import OpenAPI 2.0/3.0/3.1 spec from file or URL.
2. Generate collection with folders per tag/path.
3. Generate requests for all operations (GET, POST, PUT, DELETE, etc.).
4. Populate request URLs from server/base URL.
5. Populate query parameters from spec parameters.
6. Populate headers from spec parameters.
7. Populate request body from spec requestBody schema (generate example).
8. Generate example bodies from JSON schema (faker-like generation).
9. Store spec reference in collection metadata for sync.
10. Re-import / sync: update collection when spec changes (detect new/removed/changed endpoints).
11. Spec viewer: browse original OpenAPI spec in app (YAML/JSON).
12. Spec validation: validate spec against OpenAPI schema.
13. Generate environment from spec server variables.
14. Generate auth config from spec security schemes.
15. Export collection as OpenAPI spec (reverse generation).

**Acceptance Criteria:**
- [ ] AC1: Petstore OpenAPI 3.0 spec generates complete collection.
- [ ] AC2: Generated request body is valid JSON from schema.
- [ ] AC3: Sync detects new endpoints and adds them.
- [ ] AC4: Sync detects removed endpoints and marks them (don't auto-delete).
- [ ] AC5: Spec viewer renders YAML with syntax highlighting.

**Technical Spec:**
- Rust: `openapi` crate or `openapiv3` for parsing. `schemars` or `fake` for example generation.
- Sync: Compare imported spec hash with current. Diff endpoints.
- Example generation: Walk JSON schema, generate primitive values, arrays with one item, objects with required fields.

**Data Model:** `OpenApiImportConfig { spec_path, auto_sync, sync_interval, tag_filter }`

**UI/UX:** File > Import > OpenAPI. URL or file picker. Preview of generated collection. Sync settings in collection metadata.

**Error Handling:**
- Invalid OpenAPI spec → Show validation errors with paths.
- Circular schema reference → Detect and break, show warning.
- Example generation failure → Use `{}` or `[]` placeholder, show warning.

**Dependencies:** F-044.

---

### F-046: Export to Multiple Formats
**Phase:** M7 | **Priority:** P1  
**User Story:** As a user, I want to export requests and collections to various formats for sharing and documentation.

**Functional Requirements:**
1. Export collection as JSON (native format).
2. Export collection as TOML (native format).
3. Export collection as Postman v2.1.
4. Export collection as Bruno `.bru` files.
5. Export collection as Markdown documentation.
6. Export single request as cURL.
7. Export single request as HTTP (raw HTTP request text).
8. Export single request as Python (requests library).
9. Export single request as JavaScript (fetch API).
10. Export single request as TypeScript (fetch API).
11. Export single request as Go (net/http).
12. Export single request as Rust (reqwest).
13. Export single request as Java (OkHttp).
14. Export single request as C# (HttpClient).
15. Export single request as PHP (cURL).
16. Export single request as Ruby (Net::HTTP).
17. Export single request as PowerShell (Invoke-RestMethod).
18. Export single request as HAR entry.
19. Code generation templates: customizable via templates.
20. Export with/without sensitive data (auth stripping).

**Acceptance Criteria:**
- [ ] AC1: Exported cURL command works in terminal.
- [ ] AC2: Exported Python script runs correctly.
- [ ] AC3: Markdown documentation includes all endpoints with examples.
- [ ] AC4: Auth stripping removes all credentials.
- [ ] AC5: Code generation produces valid syntax for each language.

**Technical Spec:**
- Rust: String templates (Handlebars or Tera) for each language. `serde_json` for JSON export.
- Markdown: Generate from collection structure using template.
- Auth stripping: Remove Authorization headers, query params with "key", "token", "secret".

**Data Model:** `ExportConfig { format, include_auth, include_secrets, template }`

**UI/UX:** Collection context menu → Export. Request context menu → Export. Modal with format list. Auth strip toggle.

**Error Handling:**
- Unsupported feature for format → Warning, skip or approximate.
- Template render error → Fallback to plain text.
- File write error → Show OS error.

**Dependencies:** F-011, F-009.

---

### F-047: Team Collaboration & Sharing
**Phase:** M7 | **Priority:** P2  
**User Story:** As a user, I want to share collections with my team and collaborate.

**Functional Requirements:**
1. Collection export as shareable file (JSON/TOML).
2. Collection import from shared file.
3. Collection sync via Git: collections stored in Git repo, team pulls/pushes.
4. Collection merge: handle conflicts when two team members edit same collection.
5. Collection diff: show what changed between versions (Git diff of JSON).
6. Collection changelog: track who changed what and when (Git history).
7. Collection comments: add comments to requests (stored in collection file).
8. Collection review: mark requests as "needs review", "approved".
9. Team environment sharing: share environment templates (without secrets).
10. Secret environment variables: marked as secret, not shared in Git.
11. Project sharing: share entire project configuration.
12. Collection marketplace: discover and import public collections (future).
13. Collection fork: duplicate and modify shared collection.
14. Collection stars/bookmarks: mark favorite collections.

**Acceptance Criteria:**
- [ ] AC1: Collection file commits to Git cleanly.
- [ ] AC2: Git diff shows meaningful changes in collection.
- [ ] AC3: Secret variables excluded from Git (`.gitignore` or separate file).
- [ ] AC4: Merge conflict shows visual diff with resolution options.
- [ ] AC5: Comments visible in request detail panel.

**Technical Spec:**
- Rust: Git operations via `git2` crate (same as your Git Desktop app — ecosystem synergy).
- Diff: JSON diff with `similar` crate or custom algorithm. Show field-level changes.
- Secrets: Store secrets in `.api-tester/secrets/` (gitignored) or SQLite only.

**Data Model:** `Collection.comments`, `Environment.is_secret`

**UI/UX:** Collection context menu → "Sync with Git". Git status indicator in sidebar. Diff viewer for collection changes. Comments panel.

**Error Handling:**
- Git merge conflict → Open three-way diff (ours/theirs/base).
- Secret in Git → Pre-commit hook warning (optional).
- No Git repo → Prompt to initialize.

**Dependencies:** F-017, F-011.

---

### F-048: System Integration & Protocol Handlers
**Phase:** M7 | **Priority:** P2  
**User Story:** As a user, I want the app to integrate with my OS and other tools.

**Functional Requirements:**
1. URL protocol handler: `api-tester://open?url=` opens request in app.
2. File associations: `.json` (collection), `.env` (environment), `.graphql` (query), `.proto` (protobuf), `.har` (archive).
3. Drag-and-drop: drop collection files, environment files, HAR files onto app window to import.
4. System tray: minimize to tray, quick-send from tray menu.
5. Global hotkey: configurable global shortcut to bring app to front.
6. Share extension / service menu (macOS): send selected text as request body.
7. CLI integration: `api-tester open collection.json` opens in app.
8. Browser extension integration: send request from browser devtools to app (future).
9. VS Code extension: open collection in desktop app from VS Code (future).
10. Auto-update: check for updates, download and install (Tauri updater).
11. Crash reporter: capture and report crashes (opt-in).
12. Telemetry: anonymous usage stats (opt-in, fully transparent).

**Acceptance Criteria:**
- [ ] AC1: Double-click .json collection file opens in app.
- [ ] AC2: Drag-and-drop import works for all supported formats.
- [ ] AC3: System tray shows recent requests and quick actions.
- [ ] AC4: Global hotkey brings app to front from any app.
- [ ] AC5: Auto-update installs without manual intervention.

**Technical Spec:**
- Tauri: `tauri-plugin-deep-link` for protocol handlers. `tauri-plugin-single-instance` for file associations.
- System tray: `tauri::SystemTray` API.
- Auto-update: Tauri updater with GitHub releases or custom server.

**Data Model:** N/A (OS integration)

**UI/UX:** System tray icon with menu. File associations registered on install. Drag-and-drop visual feedback.

**Error Handling:**
- Protocol handler conflict → Show error, offer to re-register.
- File association missing → Settings > Integration > Register associations.
- Update download failure → Retry with exponential backoff, show manual download link.

**Dependencies:** F-001.

---

## MILESTONE 8: Advanced Features, Performance & Polish
**Goal:** App is production-ready with advanced features, performance optimizations, and enterprise capabilities.

---

### F-049: Request & Response Size Limits & Streaming
**Phase:** M8 | **Priority:** P0  
**User Story:** As a user, I want to handle very large requests and responses without crashing the app.

**Functional Requirements:**
1. Configurable max request body size (default 100MB).
2. Configurable max response body size (default 100MB).
3. Streaming upload: send large files without loading entirely into memory.
4. Streaming download: receive large responses without loading entirely into memory.
5. Progress indicator for large uploads/downloads (bytes transferred / total).
6. Pause/resume for downloads (HTTP Range requests).
7. Download to file: stream directly to disk for large responses.
8. Response truncation: show first N KB with "Load more" button.
9. Memory usage monitor: show current RAM usage in status bar.
10. Memory warning: alert if app approaches system memory limit.
11. Request body from file stream: don't read entire file into memory.
12. Compression: handle gzip, deflate, brotli decompression for large responses.
13. Chunked transfer encoding support.
14. HTTP/2 server push handling (ignore or log).

**Acceptance Criteria:**
- [ ] AC1: 1GB file upload streams without memory spike.
- [ ] AC2: 1GB response download streams to disk.
- [ ] AC3: Progress bar updates every 100ms during transfer.
- [ ] AC4: Memory usage stays under 200MB during large transfers.
- [ ] AC5: Truncated response shows first 1MB with load more option.

**Technical Spec:**
- Rust: `reqwest` streaming via `body::Body::wrap_stream()` and `response.bytes_stream()`.
- File streaming: `tokio::fs::File` with `tokio::io::copy()`.
- Memory: `sysinfo` crate for monitoring. `tokio::sync::Semaphore` for backpressure.
- Range requests: `reqwest::header::RANGE` header.

**Data Model:** `ProjectSettings.max_request_size`, `ProjectSettings.max_response_size`

**UI/UX:** Progress bar in status bar during transfers. Memory gauge in status bar. "Save to file" prompt for large responses.

**Error Handling:**
- Out of memory → Cancel request, show error, suggest streaming to file.
- Disk full during download → Pause, show error, resume when space available.
- Network interruption during stream → Retry with Range header (configurable).

**Dependencies:** F-004.

---

### F-050: Performance Monitoring & Benchmarking
**Phase:** M8 | **Priority:** P1  
**User Story:** As a user, I want to benchmark my APIs and monitor performance over time.

**Functional Requirements:**
1. Load test mode: send N concurrent requests for duration T.
2. Load test metrics: requests/sec, avg/median/p95/p99 response time, error rate.
3. Load test visualization: real-time graph of response times and throughput.
4. Load test export: results as CSV, JSON, HTML report.
5. Endpoint performance history: track response times over days/weeks.
6. Performance regression detection: alert if response time increases > threshold.
7. Performance comparison: compare two time periods (before/after deployment).
8. Performance dashboard: charts for all endpoints in a collection.
9. SLA monitoring: define SLA (e.g., p95 < 200ms), track compliance.
10. Performance alerts: desktop notification if SLA violated.
11. Load test scenarios: ramp-up, spike, steady-state, stress test.
12. Load test from multiple locations (if distributed agents available — future).

**Acceptance Criteria:**
- [ ] AC1: 100 concurrent requests run without app crash.
- [ ] AC2: Real-time graph updates every 500ms.
- [ ] AC3: Performance history shows 30 days of data.
- [ ] AC4: Regression alert triggers when p95 exceeds threshold.
- [ ] AC5: SLA compliance percentage accurate.

**Technical Spec:**
- Rust: `tokio::sync::Semaphore` for concurrency. `tokio::time::Instant` for timing.
- Metrics: Store in SQLite. Aggregate with SQL queries.
- Charts: Frontend charts (Recharts or Chart.js) with real-time updates via Tauri events.

**Data Model:** `LoadTestConfig { endpoint, concurrency, duration, ramp_up }`, `PerformanceMetrics { timestamp, response_time_ms, status_code, endpoint }`

**UI/UX:** Collection context menu → "Load Test". Modal with config. Real-time dashboard. History tab. Alert settings.

**Error Handling:**
- Too high concurrency → Limit to safe maximum (based on system resources).
- Target server overload → Show error rate spike, suggest lower concurrency.
- Memory limit during load test → Reduce concurrency automatically.

**Dependencies:** F-028, F-016.

---

### F-051: Plugin System (WASM)
**Phase:** M8 | **Priority:** P3  
**User Story:** As a developer, I want to extend the app with custom plugins.

**Functional Requirements:**
1. Plugin manifest format (JSON).
2. Plugin types: Protocol adapter, Auth provider, Response renderer, Request transformer, Export format, Import format, Script function library.
3. Plugin API: WASM interface with structured function calls.
4. Plugin sandbox: WASM runtime with restricted capabilities.
5. Plugin settings: configuration UI generated from manifest.
6. Plugin marketplace: discover and install plugins (future).
7. Plugin development kit: documentation, examples, template.
8. Plugin hot-reload: reload plugin without restarting app.
9. Plugin versioning: support multiple plugin versions.
10. Plugin dependencies: declare dependencies on other plugins.
11. Official plugins: OpenAPI importer, Postman converter, cURL generator, HAR parser.

**Acceptance Criteria:**
- [ ] AC1: Plugin loads and registers without app restart.
- [ ] AC2: Custom protocol adapter handles requests correctly.
- [ ] AC3: Custom response renderer displays data correctly.
- [ ] AC4: Plugin crash doesn't crash app (isolated).
- [ ] AC5: Plugin SDK documentation is comprehensive.

**Technical Spec:**
- Rust: `wasmtime` crate for WASM runtime. WIT (WASM Interface Types) for API definition.
- Sandbox: WASM memory isolation. Capability-based access via host functions.
- Hot-reload: Unload old WASM module, load new one, re-register.

**Data Model:** `PluginManifest { name, version, author, entry_point, permissions, hooks }`

**UI/UX:** Settings > Plugins. List with toggle. Install from file. Marketplace tab (future). SDK documentation link.

**Error Handling:**
- Plugin incompatible version → Show error, disable plugin.
- Plugin memory limit exceeded → Kill plugin, show error.
- Plugin dependency missing → Show error, offer to install dependency.

**Dependencies:** Core app stable.

---

### F-052: Keyboard Shortcuts & Command Palette
**Phase:** M8 | **Priority:** P2  
**User Story:** As a power user, I want keyboard-driven workflows.

**Functional Requirements:**
1. Command palette (Ctrl/Cmd+Shift+P) with fuzzy search.
2. All actions accessible via command palette.
3. Configurable keyboard shortcuts.
4. Preset keymaps: Default, VS Code, Postman, Insomnia.
5. Shortcut conflict detection.
6. Cheat sheet viewer (printable).
7. Context-aware shortcuts (different panels have different shortcuts).
8. Shortcut for common actions: Send (Ctrl+Enter), Save (Ctrl+S), New Request (Ctrl+N), etc.
9. Shortcut for navigation: next/previous request in collection, next/previous history entry.
10. Shortcut for response viewer modes: Pretty (Ctrl+1), Raw (Ctrl+2), Preview (Ctrl+3), Hex (Ctrl+4).
11. Shortcut for environment switch: Ctrl+Shift+E.
12. Shortcut for collection runner: Ctrl+Shift+R.

**Acceptance Criteria:**
- [ ] AC1: Command palette opens in < 100ms.
- [ ] AC2: Fuzzy search finds "send" from "snd".
- [ ] AC3: Custom shortcuts saved immediately.
- [ ] AC4: Conflict shows warning and suggests alternative.
- [ ] AC5: Cheat sheet opens with ? key.

**Technical Spec:**
- Frontend: `cmdk` or custom command palette component. `react-hotkeys-hook` for shortcuts.
- Registry: Map action IDs to shortcuts. Validate on change.

**Data Model:** `Keybinding { action_id, keys: Vec<String>, context: Global | Panel | Modal }`

**UI/UX:** Settings > Keyboard. Table with editable shortcuts. Command palette overlay (centered, modal). Cheat sheet modal.

**Error Handling:**
- Invalid key combination → Show error.
- System shortcut conflict → Warn but allow override.

**Dependencies:** All UI features.

---

### F-053: Custom Themes & Appearance
**Phase:** M8 | **Priority:** P2  
**User Story:** As a user, I want to customize the app's appearance.

**Functional Requirements:**
1. Built-in themes: Light, Dark, High Contrast, System.
2. Custom theme editor: colors for backgrounds, text, accents, diff additions, diff deletions, status codes.
3. Import/export theme JSON.
4. Font family and size selection (monospace and UI).
5. Density settings: compact, comfortable, spacious.
6. Sidebar position: left, right, hidden.
7. Panel arrangement: drag and drop.
8. Response syntax highlighting themes: 10+ built-in (Monokai, Dracula, One Dark, etc.).
9. Request layout: side-by-side (default) or stacked.
10. Tab behavior: multiple requests in tabs, or single request view.
11. Status bar customization: show/hide elements.
12. Animation toggle: reduce motion for accessibility.

**Acceptance Criteria:**
- [ ] AC1: Theme changes apply immediately without restart.
- [ ] AC2: Custom theme persists across sessions.
- [ ] AC3: Diff colors customizable independently.
- [ ] AC4: Font changes affect all code views.
- [ ] AC5: High contrast theme passes WCAG AAA.

**Technical Spec:**
- CSS variables or Tailwind config dynamic injection. Theme stored in SQLite settings.
- Monaco themes: `monaco.editor.setTheme()` with custom theme definitions.

**Data Model:** `Theme { name, colors: ThemeColors, font_family, font_size, density, layout_config }`

**UI/UX:** Settings > Appearance. Color picker. Live preview. Preset dropdown. Font selector.

**Error Handling:**
- Invalid color format → Reject with error.
- Font not found → Fallback to system default.

**Dependencies:** None.

---

### F-054: Accessibility (a11y)
**Phase:** M8 | **Priority:** P1  
**User Story:** As a user with disabilities, I want the app to be fully accessible.

**Functional Requirements:**
1. Full keyboard navigation: all features accessible without mouse.
2. Screen reader support: ARIA labels, roles, live regions for dynamic content.
3. Focus management: visible focus indicators, logical tab order.
4. Color contrast: WCAG AA minimum, AAA for text.
5. Reduced motion: respect `prefers-reduced-motion`.
6. High contrast mode: system high contrast support.
7. Font size scaling: respect system font size settings.
8. Screen reader announcements: request sent, response received, errors.
9. Alt text for all icons and images.
10. Skip links: skip to main content, skip to sidebar.
11. Accessible modals: focus trap, escape to close, announce to screen reader.
12. Accessible tables: proper headers, captions, sort indicators.
13. Accessible forms: labels, error messages, required indicators.
14. Zoom support: app usable at 200% zoom.
15. Voice control: compatible with OS voice control features.

**Acceptance Criteria:**
- [ ] AC1: All buttons accessible via keyboard.
- [ ] AC2: Screen reader announces request send and response.
- [ ] AC3: Focus visible on all interactive elements.
- [ ] AC4: Color contrast passes WCAG AA on all UI elements.
- [ ] AC5: App usable at 200% browser zoom.

**Technical Spec:**
- Frontend: Radix UI primitives (built-in a11y). `aria-live` regions for announcements.
- Testing: axe-core for automated a11y testing. Manual screen reader testing (NVDA, VoiceOver).

**Data Model:** N/A

**UI/UX:** All components use Radix primitives. Focus rings on all interactive elements. ARIA labels on icons.

**Error Handling:**
- Screen reader focus lost → Restore focus to logical element.
- Animation trigger despite reduced motion → Check `prefers-reduced-motion`.

**Dependencies:** All UI components.

---

### F-055: Search & Discovery
**Phase:** M8 | **Priority:** P1  
**User Story:** As a user, I want to search across all my requests, collections, history, and responses.

**Functional Requirements:**
1. Global search (Ctrl/Cmd+K or Ctrl/Cmd+Shift+F): search across everything.
2. Search scopes: Collections, Requests, History, Environments, Scripts, Responses.
3. Fuzzy search: find "getUser" from "gusr".
4. Search filters: by method, status, date, collection.
5. Search within response bodies: full-text search on cached responses.
6. Search within scripts: find script snippets.
7. Recent searches: show last 10 searches.
8. Search suggestions: autocomplete based on existing data.
9. Search results: grouped by scope, clickable to navigate.
10. Search performance: < 100ms for 10,000 items.
11. Saved searches: save complex queries for reuse.
12. Search export: export search results.

**Acceptance Criteria:**
- [ ] AC1: Global search finds request by partial name in < 100ms.
- [ ] AC2: Search within response body finds text in cached responses.
- [ ] AC3: Fuzzy search matches "getUser" from "gusr".
- [ ] AC4: Results grouped and navigable.
- [ ] AC5: Saved searches persist across sessions.

**Technical Spec:**
- Rust: SQLite FTS5 for full-text search. `fuzzy-matcher` or `sublime_fuzzy` for fuzzy matching.
- Frontend: `cmdk` for search UI. Debounced search (100ms).

**Data Model:** FTS5 virtual tables on `history` and collections (indexed JSON).

**UI/UX:** Global search bar (top of app or modal). Scope tabs. Results list with icons. Preview on hover/selection.

**Error Handling:**
- FTS5 not available → Fallback to LIKE queries (slower, warn user).
- Search timeout → Show partial results with "Search timed out".

**Dependencies:** F-008, F-011.

---

### F-056: Documentation Generator
**Phase:** M8 | **Priority:** P2  
**User Story:** As a user, I want to generate API documentation from my collections.

**Functional Requirements:**
1. Generate Markdown documentation from collection.
2. Include: endpoint table (method, URL, description), request examples, response examples.
3. Generate HTML documentation (styled, printable).
4. Generate OpenAPI 3.0 spec from collection (reverse engineering).
5. Documentation templates: minimal, detailed, API reference, developer guide.
6. Include auth documentation: how to authenticate.
7. Include environment documentation: variable descriptions.
8. Include script documentation: pre/post request scripts explained.
9. Export to PDF.
10. Publish to static site generator (Hugo, Jekyll, Docusaurus — future).
11. Live documentation: auto-update when collection changes.
12. Documentation hosting: built-in static server for preview (future).

**Acceptance Criteria:**
- [ ] AC1: Markdown doc includes all endpoints with examples.
- [ ] AC2: HTML doc is styled and printable.
- [ ] AC3: OpenAPI spec valid and importable.
- [ ] AC4: PDF export produces readable document.
- [ ] AC5: Documentation updates when collection saved.

**Technical Spec:**
- Rust: `tera` or `handlebars` for template rendering. `serde_yaml` for OpenAPI generation.
- Templates: Bundled HTML/CSS templates. Customizable via settings.

**Data Model:** `DocumentationConfig { template, include_examples, include_auth, output_format }`

**UI/UX:** Collection context menu → "Generate Documentation". Modal with options. Preview pane. Export button.

**Error Handling:**
- Template render error → Fallback to plain text.
- Very large collection → Paginate documentation, warn about size.
- Missing response examples → Use placeholder "No example available".

**Dependencies:** F-011, F-046.

---

---

# SECTION 3: STATE MACHINES

## 3.1 Request Lifecycle State Machine
```
[Idle] --send--> [Sending]
[Sending] --response received--> [Completed]
[Sending] --error--> [Failed]
[Sending] --cancel--> [Cancelled]
[Completed] --save--> [Saved]
[Completed] --discard--> [Idle]
[Failed] --retry--> [Sending]
[Failed] --edit--> [Idle]
[Cancelled] --retry--> [Sending]
```

**Agent Implementation Rule:** UI must reflect current state. "Send" button disabled in Sending state. "Cancel" button visible only in Sending state.

## 3.2 WebSocket Connection State Machine
```
[Disconnected] --connect--> [Connecting]
[Connecting] --success--> [Connected]
[Connecting] --failure--> [Disconnected]
[Connected] --send--> [Connected]
[Connected] --receive--> [Connected]
[Connected] --disconnect--> [Disconnected]
[Connected] --error--> [Disconnected]
[Disconnected] --auto-retry--> [Connecting]  (if auto-reconnect enabled)
```

## 3.3 Collection Runner State Machine
```
[Idle] --start--> [Running]
[Running] --request complete--> [Running]  (next request)
[Running] --all complete--> [Completed]
[Running] --failure + stop_on_error--> [Failed]
[Running] --cancel--> [Cancelled]
[Running] --pause--> [Paused]
[Paused] --resume--> [Running]
[Completed] --export--> [Idle]
[Failed] --retry failed--> [Running]
[Cancelled] --reset--> [Idle]
```

## 3.4 OAuth 2.0 Flow State Machine
```
[Idle] --start auth--> [AwaitingAuthorization]
[AwaitingAuthorization] --callback received--> [ExchangingCode]
[AwaitingAuthorization] --timeout--> [Failed]
[AwaitingAuthorization] --user cancels--> [Cancelled]
[ExchangingCode] --token received--> [Authenticated]
[ExchangingCode] --error--> [Failed]
[Authenticated] --token expires + auto_refresh--> [Refreshing]
[Refreshing] --success--> [Authenticated]
[Refreshing] --failure--> [Failed]
[Failed] --retry--> [AwaitingAuthorization]
[Cancelled] --restart--> [Idle]
```

---

# SECTION 4: API SPECIFICATION (Frontend ↔ Backend)

## 4.1 IPC Command Registry
All commands prefixed with `api:`.

| Command | Input | Output | Mutates | Phase |
|---------|-------|--------|---------|-------|
| `api:create_project` | `{ name, path }` | `Project` | Yes | M1 |
| `api:open_project` | `{ path }` | `Project` | No | M1 |
| `api:get_project` | `{ id }` | `Project` | No | M1 |
| `api:update_project_settings` | `{ id, settings }` | `Project` | Yes | M1 |
| `api:delete_project` | `{ id, keep_files }` | `bool` | Yes | M1 |
| `api:list_projects` | `{}` | `Vec<Project>` | No | M1 |
| `api:get_request_builder` | `{ request_id? }` | `ApiRequest` | No | M1 |
| `api:update_request` | `ApiRequest` | `ApiRequest` | Yes | M1 |
| `api:send_request` | `{ request_id, environment_id? }` | `ApiResponse` | Yes | M1 |
| `api:cancel_request` | `{ request_id }` | `bool` | Yes | M1 |
| `api:get_response` | `{ response_id }` | `ApiResponse` | No | M1 |
| `api:stream_response` | `{ response_id }` | `Stream<Chunk>` | No | M1 |
| `api:resolve_variables` | `{ request_id, environment_id }` | `ResolvedRequest` | No | M1 |
| `api:get_history` | `HistorySearchQuery` | `Vec<HistoryEntry>` | No | M1 |
| `api:get_history_entry` | `{ id }` | `HistoryEntry` | No | M1 |
| `api:delete_history_entry` | `{ id }` | `bool` | Yes | M1 |
| `api:clear_history` | `{ project_id }` | `bool` | Yes | M1 |
| `api:search_history` | `{ query, filters }` | `Vec<HistoryEntry>` | No | M1 |
| `api:get_collection` | `{ id }` | `Collection` | No | M2 |
| `api:create_collection` | `{ project_id, name }` | `Collection` | Yes | M2 |
| `api:update_collection` | `Collection` | `Collection` | Yes | M2 |
| `api:delete_collection` | `{ id }` | `bool` | Yes | M2 |
| `api:list_collections` | `{ project_id }` | `Vec<Collection>` | No | M2 |
| `api:move_collection_item` | `{ item_id, target_folder_id }` | `bool` | Yes | M2 |
| `api:save_request_to_collection` | `{ request, collection_id, folder_id? }` | `RequestSummary` | Yes | M2 |
| `api:get_environment` | `{ id }` | `Environment` | No | M2 |
| `api:create_environment` | `{ project_id, name }` | `Environment` | Yes | M2 |
| `api:update_environment` | `Environment` | `Environment` | Yes | M2 |
| `api:delete_environment` | `{ id }` | `bool` | Yes | M2 |
| `api:list_environments` | `{ project_id }` | `Vec<Environment>` | No | M2 |
| `api:resolve_environment` | `{ environment_id, request_id? }` | `HashMap<String, String>` | No | M2 |
| `api:get_diff` | `{ response_a_id, response_b_id }` | `DiffResult` | No | M3 |
| `api:create_snapshot` | `{ request_id, name }` | `Snapshot` | Yes | M3 |
| `api:get_snapshots` | `{ request_id }` | `Vec<Snapshot>` | No | M3 |
| `api:delete_snapshot` | `{ id }` | `bool` | Yes | M3 |
| `api:run_script` | `{ script, context }` | `ScriptResult` | No | M4 |
| `api:run_collection` | `{ collection_id, environment_id?, options }` | `CollectionRunResult` | Yes | M4 |
| `api:cancel_collection_run` | `{ run_id }` | `bool` | Yes | M4 |
| `api:get_run_results` | `{ collection_id }` | `Vec<CollectionRunResult>` | No | M4 |
| `api:get_run_result` | `{ run_id }` | `CollectionRunResult` | No | M4 |
| `api:export_run_report` | `{ run_id, format }` | `String` | No | M4 |
| `api:connect_websocket` | `{ request_id, config }` | `ConnectionStatus` | Yes | M5 |
| `api:send_websocket_message` | `{ connection_id, data, binary? }` | `bool` | Yes | M5 |
| `api:disconnect_websocket` | `{ connection_id }` | `bool` | Yes | M5 |
| `api:get_websocket_messages` | `{ connection_id }` | `Vec<WebSocketMessage>` | No | M5 |
| `api:connect_sse` | `{ request_id, config }` | `ConnectionStatus` | Yes | M5 |
| `api:disconnect_sse` | `{ connection_id }` | `bool` | Yes | M5 |
| `api:get_sse_events` | `{ connection_id }` | `Vec<SseEvent>` | No | M5 |
| `api:introspect_graphql` | `{ endpoint, headers }` | `GraphQLSchema` | No | M5 |
| `api:send_graphql` | `{ request_id, environment_id? }` | `ApiResponse` | Yes | M5 |
| `api:import_proto` | `{ files }` | `ProtoSchema` | No | M5 |
| `api:send_grpc` | `{ request_id, environment_id? }` | `ApiResponse` | Yes | M5 |
| `api:discover_grpc_services` | `{ endpoint, use_reflection }` | `Vec<GrpcService>` | No | M5 |
| `api:connect_tcp` | `{ host, port }` | `ConnectionStatus` | Yes | M5 |
| `api:send_tcp` | `{ connection_id, data }` | `bool` | Yes | M5 |
| `api:disconnect_tcp` | `{ connection_id }` | `bool` | Yes | M5 |
| `api:send_udp` | `{ host, port, data }` | `UdpResponse` | Yes | M5 |
| `api:get_auth_config` | `{ id }` | `AuthConfig` | No | M6 |
| `api:set_auth_config` | `AuthConfig` | `AuthConfig` | Yes | M6 |
| `api:test_auth` | `{ auth_id, url }` | `AuthTestResult` | No | M6 |
| `api:start_oauth_flow` | `{ auth_id }` | `OAuthFlowState` | Yes | M6 |
| `api:complete_oauth_flow` | `{ auth_id, code, state }` | `AuthConfig` | Yes | M6 |
| `api:refresh_oauth_token` | `{ auth_id }` | `AuthConfig` | Yes | M6 |
| `api:revoke_oauth_token` | `{ auth_id }` | `bool` | Yes | M6 |
| `api:get_credentials` | `{ project_id }` | `Vec<AuthCredential>` | No | M6 |
| `api:store_credential` | `{ name, value, keyring? }` | `String` | Yes | M6 |
| `api:delete_credential` | `{ id }` | `bool` | Yes | M6 |
| `api:import_postman` | `{ path }` | `ImportResult` | Yes | M7 |
| `api:import_bruno` | `{ path }` | `ImportResult` | Yes | M7 |
| `api:import_insomnia` | `{ path }` | `ImportResult` | Yes | M7 |
| `api:import_openapi` | `{ path_or_url, options }` | `ImportResult` | Yes | M7 |
| `api:import_har` | `{ path }` | `ImportResult` | Yes | M7 |
| `api:export_collection` | `{ collection_id, format, options }` | `String` | No | M7 |
| `api:export_request` | `{ request_id, format, options }` | `String` | No | M7 |
| `api:generate_documentation` | `{ collection_id, format, template }` | `String` | No | M8 |
| `api:run_load_test` | `{ request_id, config }` | `LoadTestResult` | Yes | M8 |
| `api:cancel_load_test` | `{ test_id }` | `bool` | Yes | M8 |
| `api:get_performance_metrics` | `{ request_id, days }` | `Vec<PerformanceMetrics>` | No | M8 |
| `api:global_search` | `{ query, scopes }` | `SearchResults` | No | M8 |
| `api:get_app_settings` | `{}` | `AppSettings` | No | M8 |
| `api:update_app_settings` | `AppSettings` | `AppSettings` | Yes | M8 |
| `api:get_plugins` | `{}` | `Vec<PluginManifest>` | No | M8 |
| `api:install_plugin` | `{ path }` | `PluginManifest` | Yes | M8 |
| `api:uninstall_plugin` | `{ id }` | `bool` | Yes | M8 |
| `api:toggle_plugin` | `{ id, enabled }` | `bool` | Yes | M8 |

## 4.2 Event Stream (Backend → Frontend)
| Event | Payload | Description |
|-------|---------|-------------|
| `api:request_started` | `{ request_id, timestamp }` | Request sent to network |
| `api:request_progress` | `{ request_id, stage, bytes_sent, bytes_total }` | Upload progress |
| `api:response_chunk` | `{ request_id, chunk_data }` | Response streaming chunk |
| `api:response_complete` | `{ request_id, response_id }` | Response fully received |
| `api:request_cancelled` | `{ request_id }` | Request was cancelled |
| `api:request_error` | `{ request_id, error }` | Request failed |
| `api:websocket_connected` | `{ connection_id }` | WebSocket connected |
| `api:websocket_message` | `{ connection_id, message }` | WebSocket message received |
| `api:websocket_disconnected` | `{ connection_id, reason }` | WebSocket disconnected |
| `api:sse_event` | `{ connection_id, event }` | SSE event received |
| `api:sse_connected` | `{ connection_id }` | SSE connected |
| `api:sse_disconnected` | `{ connection_id, reason }` | SSE disconnected |
| `api:collection_run_progress` | `{ run_id, current, total, request_name, status }` | Runner progress |
| `api:collection_run_complete` | `{ run_id, result }` | Runner finished |
| `api:load_test_progress` | `{ test_id, metrics }` | Load test real-time metrics |
| `api:load_test_complete` | `{ test_id, result }` | Load test finished |
| `api:oauth_callback` | `{ auth_id, code, state }` | OAuth callback received |
| `api:environment_changed` | `{ environment_id }` | Environment variables updated |
| `api:collection_file_changed` | `{ collection_id }` | External file change detected |
| `api:credential_unlocked` | `{ credential_id }` | Credential vault unlocked |
| `api:notification` | `{ title, body, level }` | Desktop notification |

---

# SECTION 5: UI/UX COMPONENT MAP

## 5.1 Core Layout
```
AppWindow
├── TitleBar (custom for Tauri: project name, request name, window controls)
├── MenuBar (File, Edit, View, Request, Collection, Tools, Help)
├── Toolbar (Send, Cancel, Environment switch, Save, Import/Export)
├── MainLayout (split panes, resizable)
│   ├── Sidebar (collapsible, 280px default)
│   │   ├── ProjectNavigator (project list, switcher)
│   │   ├── CollectionTree (collections, folders, requests)
│   │   ├── HistoryPanel (recent requests)
│   │   ├── EnvironmentPanel (quick env switch)
│   │   └── CookiePanel (cookie jar)
│   ├── CenterPanel (tabbed)
│   │   ├── RequestBuilder (method, URL, params, headers, body, auth, scripts)
│   │   ├── ResponseViewer (body, headers, cookies, timings)
│   │   ├── WebSocketPanel (connection, messages)
│   │   ├── SsePanel (events)
│   │   ├── GraphQLPanel (query, variables, schema)
│   │   └── GrpcPanel (services, message builder)
│   └── RightPanel (collapsible, 320px default)
│       ├── ResponseDetail (JSON tree, diff, preview)
│       ├── TestResults (assertions, script output)
│       ├── CollectionRunner (config, progress, results)
│       └── Documentation (preview)
├── BottomPanel (collapsible, 180px default)
│   ├── ConsolePanel (script logs, errors)
│   ├── TimelinePanel (request history timeline)
│   └── StatusBar (method, URL, status, time, size, connection info)
└── Modals (overlay)
    ├── ImportModal
    ├── ExportModal
    ├── EnvironmentModal
    ├── AuthModal
    ├── SettingsModal
    ├── CollectionRunnerModal
    ├── LoadTestModal
    ├── DiffModal
    ├── SnapshotModal
    ├── PluginModal
    └── CommandPalette
```

## 5.2 Component Inventory (React)
| Component | File | Props | State | Phase |
|-----------|------|-------|-------|-------|
| `AppShell` | `AppShell.tsx` | `theme` | `sidebarOpen, rightPanelOpen, bottomPanelOpen` | M1 |
| `RequestBuilder` | `RequestBuilder.tsx` | `request: ApiRequest` | `activeTab, dirty` | M1 |
| `UrlBar` | `UrlBar.tsx` | `url, method` | `focused, suggestions` | M1 |
| `MethodSelector` | `MethodSelector.tsx` | `method` | `open` | M1 |
| `HeadersTable` | `HeadersTable.tsx` | `headers` | `searchQuery` | M1 |
| `QueryParamsTable` | `QueryParamsTable.tsx` | `params` | `searchQuery` | M1 |
| `BodyEditor` | `BodyEditor.tsx` | `body: RequestBody` | `mode, format` | M1 |
| `ResponseViewer` | `ResponseViewer.tsx` | `response: ApiResponse` | `activeTab, zoom` | M1 |
| `JsonTree` | `JsonTree.tsx` | `data: JSON` | `expandedPaths, searchQuery` | M1 |
| `TimingBreakdown` | `TimingBreakdown.tsx` | `timing: ResponseTiming` | `hoveredPhase` | M1 |
| `HistoryPanel` | `HistoryPanel.tsx` | `entries` | `searchQuery, filters` | M1 |
| `HistoryEntry` | `HistoryEntry.tsx` | `entry: HistoryEntry` | `hover, selected` | M1 |
| `CollectionTree` | `CollectionTree.tsx` | `collections` | `expandedIds, selectedId` | M2 |
| `CollectionItem` | `CollectionItem.tsx` | `item: CollectionItem` | `dragging, expanded` | M2 |
| `EnvironmentEditor` | `EnvironmentEditor.tsx` | `environment: Environment` | `dirty, selectedVar` | M2 |
| `VariableTable` | `VariableTable.tsx` | `variables` | `searchQuery` | M2 |
| `DiffViewer` | `DiffViewer.tsx` | `diff: DiffResult` | `mode: unified|split` | M3 |
| `ImagePreview` | `ImagePreview.tsx` | `data: Base64` | `zoom, pan` | M3 |
| `HexViewer` | `HexViewer.tsx` | `data: Uint8Array` | `offset, bytesPerRow` | M3 |
| `ScriptEditor` | `ScriptEditor.tsx` | `script: String` | `consoleOutput, errors` | M4 |
| `AssertionBuilder` | `AssertionBuilder.tsx` | `assertions` | `editingId` | M4 |
| `CollectionRunner` | `CollectionRunner.tsx` | `collection: Collection` | `config, progress` | M4 |
| `RunResults` | `RunResults.tsx` | `result: CollectionRunResult` | `filter, sort` | M4 |
| `WebSocketPanel` | `WebSocketPanel.tsx` | `config: WebSocketConfig` | `connected, messages` | M5 |
| `SsePanel` | `SsePanel.tsx` | `config: SseConfig` | `connected, events` | M5 |
| `GraphQLPanel` | `GraphQLPanel.tsx` | `config: GraphQLConfig` | `query, variables, schema` | M5 |
| `GrpcPanel` | `GrpcPanel.tsx` | `config: GrpcConfig` | `service, method, message` | M5 |
| `AuthModal` | `AuthModal.tsx` | `auth: AuthConfig` | `type, fields` | M6 |
| `OAuthFlow` | `OAuthFlow.tsx` | `config: OAuth2Config` | `stage, progress` | M6 |
| `ImportModal` | `ImportModal.tsx` | `format: ImportFormat` | `file, preview` | M7 |
| `ExportModal` | `ExportModal.tsx` | `item, format` | `options` | M7 |
| `CommandPalette` | `CommandPalette.tsx` | `open` | `query, selectedIndex` | M8 |
| `SettingsModal` | `SettingsModal.tsx` | `settings` | `activeTab, dirty` | M8 |

---

# SECTION 6: TESTING MATRIX

## 6.1 Unit Tests (Rust Backend)
| Module | Test Cases | Coverage Target |
|--------|-----------|-----------------|
| `http::client` | Send GET/POST, headers, body, timeout, cancel, redirect | 100% |
| `http::templating` | Variable resolution, dynamic vars, response chaining, fallback | 100% |
| `http::auth` | Basic, Bearer, API key, OAuth2, AWS V4, Hawk | 100% |
| `http::cookies` | Set, get, match, expire, domain, path | 100% |
| `http::proxy` | HTTP proxy, SOCKS5, system detection, no-proxy list | 100% |
| `http::certificates` | Custom CA, client cert, mTLS, pinning | 100% |
| `storage::collections` | CRUD, file sync, Git-native, conflict detection | 100% |
| `storage::history` | Insert, query, search, prune, FTS5 | 100% |
| `storage::environments` | CRUD, inheritance, secret encryption | 100% |
| `scripting::rhai` | Pre-request, post-request, sandbox, timeout, console | 100% |
| `testing::assertions` | All assertion types, operators, JSON path | 100% |
| `runner::sequential` | Run collection, stop on error, skip disabled | 100% |
| `runner::parallel` | Concurrency, semaphore, shared state | 100% |
| `runner::data_driven` | CSV parse, row iteration, variable substitution | 100% |
| `websocket::client` | Connect, send, receive, binary, close, reconnect | 100% |
| `sse::client` | Connect, events, filter, reconnect, Last-Event-ID | 100% |
| `graphql::client` | Introspection, query, mutation, subscription, variables | 100% |
| `grpc::client` | Unary, streaming, reflection, proto parse | 95% |
| `import::postman` | Collection v2.0, v2.1, environment, scripts | 100% |
| `import::openapi` | v2.0, v3.0, v3.1, spec validation, example gen | 100% |
| `export::codegen` | cURL, Python, JS, TS, Go, Rust, Java, C# | 100% |
| `security::vault` | Keyring, encryption, decryption, zeroize | 100% |
| `security::oauth2` | All grant types, PKCE, refresh, revoke | 100% |

## 6.2 Integration Tests
| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Send GET → 200 OK | Create request, send, view response | Response body visible, timing shown |
| Send POST with JSON | Set body to JSON, send | Correct Content-Type, body parsed |
| Variable substitution | Set env var, use in URL, send | Variable resolved in sent request |
| Collection run | Create 3 requests, run collection | All execute, summary correct |
| WebSocket echo | Connect to ws://echo, send "hello" | Receive "hello" back |
| GraphQL introspection | Set GraphQL endpoint, introspect | Schema loaded, auto-complete works |
| OAuth2 flow | Configure OAuth2, start flow, authorize | Token received, stored in keyring |
| Postman import | Import Postman collection | All requests, folders, variables imported |
| Load test | Configure 10 concurrent, 100 requests | Metrics calculated, no crash |
| SSL with custom CA | Import CA, send to self-signed | Request succeeds with custom CA |

## 6.3 E2E Tests (Playwright/Tauri Driver)
| Flow | Critical Path |
|------|--------------|
| First launch → Create project → Send first request | P0 |
| Import Postman → Run collection → Export report | P0 |
| WebSocket connect → Send message → Disconnect | P0 |
| OAuth2 authorize → Send authenticated request | P1 |
| Collection runner with assertions → View results | P0 |
| Load test 100 concurrent → View metrics | P1 |
| Plugin install → Custom panel appears | P3 |

## 6.4 Performance Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| App startup | < 2s | Cold start to project |
| Request send overhead | < 50ms | App overhead (not network) |
| Response render (1MB JSON) | < 500ms | First paint |
| Response render (10MB JSON) | < 2s | First paint (virtualized) |
| History search (10k entries) | < 100ms | Query to results |
| Collection run (20 requests) | < 15s | Sequential, 500ms each |
| Collection run (100 parallel) | < 10s | 100 concurrent, 100ms each |
| WebSocket message latency | < 10ms | Send to display |
| GraphQL introspection | < 3s | Fetch to schema loaded |
| gRPC reflection | < 3s | Fetch to services listed |
| Import Postman (100 requests) | < 2s | Parse to collection created |
| Memory idle | < 80MB | Single window, no requests |
| Memory during load test | < 300MB | 100 concurrent requests |

---

# SECTION 7: SECURITY & PRIVACY

## 7.1 Credential Security
- Passwords, tokens, secrets: NEVER stored in plain text. Always in OS keyring or AES-256-GCM encrypted.
- Secret variables: masked in UI, resolved server-side only, never sent to frontend IPC.
- Memory scrubbing: `zeroize` crate clears sensitive strings from memory after use.
- No credentials in logs, error messages, or exported files (unless explicitly included).
- Auth stripping: export functions remove credentials by default.
- Credential audit log: track all access to credentials (read, write, delete).

## 7.2 Scripting Sandbox
- Rhai engine: disabled `import` statement, no filesystem access, no network access.
- Script timeout: 5 seconds max execution (configurable).
- Script memory limit: 10MB max (configurable).
- No access to environment variables outside of provided `env` object.
- No access to request/response outside of provided `request`/`response` objects.
- Script errors: isolated — one script failure doesn't crash app.

## 7.3 Network Security
- SSL verification: ON by default. Custom CA support for internal APIs.
- Certificate pinning: optional, per-host.
- Proxy support: HTTP, HTTPS, SOCKS5 with authentication.
- No credential leakage in URL query params (warn user).
- Secure cookie handling: HttpOnly, Secure, SameSite respected.
- HSTS: respect HTTP Strict Transport Security headers.

## 7.4 Data Privacy
- No telemetry without explicit opt-in.
- No cloud sync by default. All data local.
- Optional anonymous usage stats (fully transparent, opt-in).
- Crash reporting: opt-in, no request/response data included.
- No AI/ML processing of request data (unless user explicitly uses AI feature — future).
- GDPR compliance: all data stored locally, user can export/delete everything.

## 7.5 Enterprise Compliance
- Audit log: append-only, tamper-evident checksums.
- Data retention policies: configurable auto-prune.
- Secret scanning: optional pre-commit scan for API keys (like GitLeaks).
- Mandatory auth: enterprise policy can require all requests use auth.
- Export restrictions: policy can disable export of certain collections.

---

# SECTION 8: ERROR CODES & HANDLING

## 8.1 Standardized Error Format
```typescript
interface ApiTesterError {
  code: string;           // Machine-readable
  message: string;        // Human-readable
  detail?: string;        // Technical detail
  recoverable: boolean;   // Can user fix and retry?
  suggestion?: string;    // Actionable suggestion
  operation?: string;     // Which operation failed
  request_id?: string;    // Related request ID
}
```

## 8.2 Error Code Registry
| Code | Message | Recoverable | Suggestion | Phase |
|------|---------|-------------|------------|-------|
| `CORE_PROJECT_NOT_FOUND` | Project not found | Yes | Create or open a project | M1 |
| `API_INVALID_URL` | Invalid URL format | Yes | Check URL syntax | M1 |
| `API_REQUEST_TIMEOUT` | Request timed out | Yes | Increase timeout or check server | M1 |
| `API_CONNECTION_REFUSED` | Connection refused | Yes | Check server is running and port is correct | M1 |
| `API_DNS_ERROR` | Could not resolve host | Yes | Check URL and network connection | M1 |
| `API_SSL_ERROR` | SSL/TLS handshake failed | Yes | Check certificate or disable SSL verification | M1 |
| `API_PROXY_ERROR` | Proxy connection failed | Yes | Check proxy settings | M1 |
| `API_REQUEST_CANCELLED` | Request was cancelled | Yes | Retry the request | M1 |
| `API_RESPONSE_TOO_LARGE` | Response body exceeds limit | Yes | Increase limit or save to file | M1 |
| `API_COLLECTION_NOT_FOUND` | Collection not found | Yes | Check collection ID or recreate | M2 |
| `API_COLLECTION_FILE_CORRUPT` | Collection file is corrupted | Partial | Restore from backup or Git | M2 |
| `API_ENV_NOT_FOUND` | Environment not found | Yes | Select existing environment | M2 |
| `API_VARIABLE_UNRESOLVED` | Variable not found | Yes | Define variable in environment | M2 |
| `API_CIRCULAR_VAR_REF` | Circular variable reference detected | Yes | Fix variable dependency chain | M2 |
| `API_DIFF_FORMAT_MISMATCH` | Cannot compare different formats | No | Select two responses of same type | M3 |
| `API_SCRIPT_TIMEOUT` | Script execution timed out | Yes | Optimize script or increase timeout | M4 |
| `API_SCRIPT_SANDBOX_VIOLATION` | Script attempted forbidden operation | Yes | Remove forbidden operation from script | M4 |
| `API_ASSERTION_FAILED` | Test assertion failed | Yes | Check assertion or fix API | M4 |
| `API_RUNNER_STOPPED` | Collection run stopped on failure | Yes | Fix failed request or disable stop-on-error | M4 |
| `API_WS_CONNECTION_FAILED` | WebSocket connection failed | Yes | Check URL and server | M5 |
| `API_WS_HANDSHAKE_FAILED` | WebSocket handshake failed | Yes | Check headers and subprotocol | M5 |
| `API_SSE_NOT_SUPPORTED` | Endpoint does not support SSE | Yes | Verify endpoint supports text/event-stream | M5 |
| `API_GRAPHQL_INTROSPECTION_DISABLED` | GraphQL introspection disabled | Yes | Import schema manually or enable introspection | M5 |
| `API_GRPC_PROTO_PARSE_ERROR` | Failed to parse protobuf file | Yes | Check proto syntax | M5 |
| `API_GRPC_SERVICE_NOT_FOUND` | gRPC service not found | Yes | Check proto or enable reflection | M5 |
| `API_AUTH_FAILED` | Authentication failed | Yes | Check credentials | M6 |
| `API_OAUTH_TIMEOUT` | OAuth authorization timed out | Yes | Retry authorization flow | M6 |
| `API_OAUTH_STATE_MISMATCH` | OAuth state parameter mismatch | No | Restart authorization flow | M6 |
| `CORE_KEYRING_UNAVAILABLE` | OS keyring not available | Yes | Use encrypted file fallback | M6 |
| `CORE_CREDENTIAL_NOT_FOUND` | Credential not found in vault | Yes | Re-enter credential | M6 |
| `API_IMPORT_PARSE_ERROR` | Failed to parse import file | Yes | Check file format and version | M7 |
| `API_IMPORT_UNSUPPORTED_FEATURE` | Import contains unsupported features | Yes | Review warnings and manually fix | M7 |
| `API_EXPORT_RENDER_ERROR` | Failed to render export | Yes | Try different format | M7 |
| `CORE_PLUGIN_INCOMPATIBLE` | Plugin incompatible with app version | Yes | Update plugin or app | M8 |
| `CORE_PLUGIN_CRASH` | Plugin crashed during execution | Yes | Disable plugin and retry | M8 |
| `API_LOAD_TEST_LIMIT_EXCEEDED` | Load test exceeds safe limits | Yes | Reduce concurrency | M8 |
| `API_SEARCH_TIMEOUT` | Search query timed out | Yes | Simplify query or reduce scope | M8 |

---

# SECTION 9: AI AGENT IMPLEMENTATION GUIDE

## 9.1 How to Use This Document
1. **Select Phase:** Start with Milestone 1 features only.
2. **Implement by Feature ID:** Each feature is self-contained. Follow FAT-REQ template.
3. **Data First:** Implement data models (Section 1) before UI.
4. **IPC Second:** Implement Rust command, then TypeScript frontend wrapper.
5. **Test per Feature:** Use Testing Matrix (Section 6) for each feature.

## 9.2 Implementation Order Within Phase
For each phase, implement in this order:
1. Data models and Rust structs
2. Backend commands (IPC handlers)
3. Frontend API wrappers (TanStack Query hooks)
4. UI components
5. Integration tests
6. Move to next feature

## 9.3 Critical Rules for AI Agents
- **NEVER** send secret variables to frontend. Resolve server-side in Rust.
- **ALWAYS** sandbox scripts. No filesystem, no network access in Rhai.
- **NEVER** store credentials in collection files. Use keyring or encrypted storage.
- **ALWAYS** use streaming for payloads > 1MB. Don't buffer entire response in memory.
- **ALWAYS** debounce file watcher events (300ms).
- **NEVER** block the main thread with network operations.
- **ALWAYS** provide request cancellation via CancellationToken.
- **ALWAYS** return structured errors (Section 8).
- **ALWAYS** validate SSL by default. Allow override with clear warning.
- **ALWAYS** use virtualized lists for collections > 100 items.

## 9.4 File Naming Conventions
```
src-tauri/
  src/
    main.rs
    lib.rs
    commands/           # IPC handlers
      project_commands.rs
      request_commands.rs
      response_commands.rs
      collection_commands.rs
      environment_commands.rs
      history_commands.rs
      auth_commands.rs
      script_commands.rs
      runner_commands.rs
      websocket_commands.rs
      sse_commands.rs
      graphql_commands.rs
      grpc_commands.rs
      import_commands.rs
      export_commands.rs
      settings_commands.rs
    domain/             # Business logic
      http_engine.rs
      websocket_engine.rs
      sse_engine.rs
      graphql_engine.rs
      grpc_engine.rs
      tcp_engine.rs
      templating_engine.rs
      scripting_engine.rs
      auth_manager.rs
      cookie_jar.rs
      proxy_manager.rs
      cert_manager.rs
    models/             # Data structures
      project.rs
      request.rs
      response.rs
      collection.rs
      environment.rs
      auth.rs
      script.rs
      history.rs
    storage/            # SQLite + file storage
      db.rs
      file_storage.rs
      migrations/
    utils/              # Helpers
      error.rs
      validation.rs
      encoding.rs
      timing.rs
src/
  components/
    layout/
    request/
    response/
    collection/
    environment/
    history/
    auth/
    script/
    runner/
    websocket/
    sse/
    graphql/
    grpc/
    settings/
    modals/
  hooks/                # React hooks
    useProject.ts
    useRequest.ts
    useResponse.ts
    useCollection.ts
    useEnvironment.ts
    useHistory.ts
    useAuth.ts
    useScript.ts
    useRunner.ts
  stores/               # Zustand
    projectStore.ts
    requestStore.ts
    responseStore.ts
    uiStore.ts
    settingsStore.ts
  types/                # TypeScript types
    api.ts
    models.ts
    ui.ts
  lib/
    api.ts              # Tauri IPC wrappers
    utils.ts
```

---

# SECTION 10: GLOSSARY FOR AI AGENTS

| Term | Definition |
|------|------------|
| **API** | Application Programming Interface — endpoint for software communication |
| **HTTP** | HyperText Transfer Protocol — foundation of web communication |
| **REST** | Representational State Transfer — architectural style for APIs |
| **JSON** | JavaScript Object Notation — lightweight data format |
| **XML** | eXtensible Markup Language — structured data format |
| **GraphQL** | Query language for APIs — allows clients to request exactly what they need |
| **gRPC** | Google Remote Procedure Call — high-performance RPC framework |
| **WebSocket** | Full-duplex communication protocol over TCP |
| **SSE** | Server-Sent Events — one-way server-to-client streaming over HTTP |
| **Protobuf** | Protocol Buffers — binary serialization format used by gRPC |
| **OAuth2** | Open Authorization 2.0 — delegation protocol for API access |
| **JWT** | JSON Web Token — compact, self-contained way to transmit information |
| **HMAC** | Hash-based Message Authentication Code — cryptographic signature |
| **mTLS** | Mutual TLS — both client and server authenticate with certificates |
| **Rhai** | Rust scripting language — embedded, sandboxed, Rust-native |
| **Handlebars** | Logicless templating engine — `{{variable}}` syntax |
| **JSONPath** | Query language for JSON — XPath for JSON |
| **XPath** | XML Path Language — query language for XML |
| **FTS5** | Full-Text Search version 5 — SQLite extension for text search |
| **Tauri** | Framework for building desktop apps with web frontend + Rust backend |
| **IPC** | Inter-Process Communication — Frontend ↔ Backend communication |
| **WASM** | WebAssembly — binary instruction format for sandboxed execution |
| **CA** | Certificate Authority — trusted entity that issues SSL certificates |
| **PKCE** | Proof Key for Code Exchange — OAuth2 security extension |
| **HAR** | HTTP Archive — JSON format for recording HTTP transactions |
| **cURL** | Command-line tool for transferring data with URLs |
| **SLA** | Service Level Agreement — performance guarantee |
| **p95/p99** | 95th/99th percentile — statistical measure of response times |
| **TTFB** | Time To First Byte — time from request to first response byte |
| **DNS** | Domain Name System — translates hostnames to IP addresses |
| **TLS** | Transport Layer Security — cryptographic protocol for secure communication |
| **QUIC** | Quick UDP Internet Connections — transport protocol for HTTP/3 |
| **SOCKS5** | Socket Secure version 5 — proxy protocol |
| **ETag** | Entity Tag — HTTP header for cache validation |
| **CORS** | Cross-Origin Resource Sharing — browser security mechanism |
| **CSRF** | Cross-Site Request Forgery — web security vulnerability |
| **XSS** | Cross-Site Scripting — web security vulnerability |
| **WIT** | WASM Interface Types — type system for WASM component model |

---

**END OF SPECIFICATION**
**Total Features:** 56 core features + 20+ sub-capabilities = 76+ implementable units  
**Total Pages:** ~55 (if printed)  
**Estimated Implementation:** 4-6 months with 2-3 engineers  
**AI Agent Ready:** YES — every feature has ID, acceptance criteria, data model, and API spec.
-e 

<!-- ============================================================ -->
<!-- PART 4: TYERUN — FULL MERGED SPECIFICATION -->
<!-- ============================================================ -->

## Merged Files List
- 1. tyrerun_spec_chunk_1.md (21.5 KB)
- 2. tyrerun_spec_chunk_2.md (31.5 KB)
- 3. tyrerun_spec_chunk_3.md (20 KB)
- 4. tyrerun_spec_chunk_4.md (15.8 KB)
- 5. tyrerun_spec_chunk_5.md (12.3 KB)
- 6. tyrerun_spec_chunk_6.md (16.6 KB)


## 1. tyrerun_spec_chunk_1.md

```md
# TYRERUN — AI-AGENT-READY MASTER SPECIFICATION
## Task Runner Dashboard — Complete Technical Blueprint
**Version:** 1.0.0  
**Format:** Agent-Executable Specification (AES)  
**Total Features:** 280+  
**Milestones:** 6  
**Target Stack:** React + TypeScript + Tailwind (Frontend) | Rust + Tauri (Backend) | SQLite (Cache) | tokio (Async Runtime)

---

## DOCUMENT STRUCTURE FOR AI AGENTS
Each section follows the **FAT-REQ** template:  
`Feature ID | User Story | Functional Requirements | Acceptance Criteria | Technical Spec | Data Model | UI/UX | Error Handling | Dependencies | Phase`

---

# SECTION 0: EXECUTIVE SUMMARY & PRODUCT VISION

## 0.1 What is TyeRun?
TyeRun is a **unified task runner dashboard** that auto-detects, visualizes, and orchestrates development tasks across all major ecosystems — npm, pnpm, yarn, bun, Make, Just, Docker, Docker Compose, Cargo, Taskfile, and custom scripts. Inspired by mprocs but reimagined as a first-class desktop GUI application, TyeRun eliminates the friction of managing multiple terminals, remembering commands, and switching between project tools.

## 0.2 Core Value Proposition
| Pain Point | Current Solutions | TyeRun Solution |
|------------|-------------------|------------------|
| Multiple terminal windows | tmux, mprocs | Single visual dashboard with process cards |
| Forgetting project commands | README, wiki | Auto-detection from config files |
| npm-only tools | concurrently, npm-run-all | Cross-ecosystem (npm, Make, Cargo, Docker, etc.) |
| No process health visibility | htop, Activity Monitor | Real-time health badges, auto-restart, alerts |
| Manual monorepo orchestration | Lerna, Turborepo | Visual project graph with dependency-aware execution |
| No AI assistance | Manual scripting | AI suggests tasks, detects issues, optimizes commands |
| CLI-only experience | mprocs, overmind | Rich GUI with logs, metrics, environment editor |

## 0.3 Competitive Landscape Analysis
| Tool | Type | Ecosystem | GUI | Auto-Detect | Parallel | Health | AI | Monorepo |
|------|------|-----------|-----|-------------|----------|--------|-----|----------|
| mprocs | TUI | Any | No | Manual (YAML) | Yes | No | No | No |
| concurrently | CLI | npm | No | No | Yes | No | No | No |
| Just | CLI | Any | No | No | Yes | No | No | No |
| Taskfile | CLI | Any | No | No | Yes | No | No | No |
| overmind | CLI | Any | No | Manual (Procfile) | Yes | No | No | No |
| foreman | CLI | Any | No | Manual (Procfile) | Yes | No | No | No |
| Docker Desktop | GUI | Docker | Yes | Partial | Yes | Yes | No | No |
| **TyeRun** | **GUI** | **All** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |

## 0.4 Target Users
1. **Full-stack developers** managing frontend + backend + database processes
2. **DevOps engineers** orchestrating Docker, k8s, and infrastructure tools
3. **Monorepo maintainers** running builds, tests, and dev servers across packages
4. **Open-source contributors** switching between projects with different toolchains
5. **Team leads** standardizing development environments across the team

## 0.5 Integration with Git Desktop App Suite
TyeRun is designed as a **standalone product** that optionally integrates with the Git Desktop App:
- Shared project detection (monorepos with Git + task configs)
- Git hooks can trigger TyeRun tasks (pre-commit → lint, pre-push → test)
- TyeRun tasks can trigger Git operations (build → commit → tag)
- Unified dashboard: Git status + Task status side by side
- Shared SQLite database for project metadata

---

---

## ⚑ UNIFIED-SUITE PATCH NOTES (apply before implementing)
This is TyeRun's full original specification, merged into the tye platform per
`TYE_PLATFORM_UNIFIED_SPEC.md`. Mechanical changes applied throughout this
document; everything else below is verbatim from the original spec:

1. **Product name corrected**: "TyreRun" (typo in the original merged-chunks
   file) → "TyeRun" throughout, matching the actual brand.
2. **IPC prefix renamed**: every `tr:*` command below is now `run:*`
   (pattern was already internally consistent, just aligned with `git:`/`api:`
   using the full product name rather than an abbreviation — Master Spec Part E.1).
3. **`Workspace` renamed to `Project` throughout** (struct, IPC commands, SQL
   tables, UI copy) — it is now literally the shared root `Project` object
   from Master Spec Part C.1. Module-specific fields (`tasks`, `task_groups`,
   `pipelines`) live under `Project.run` (`RunProjectState`).
4. **`projects` and `environments` SQLite tables removed** from this file's
   local schema — replaced by the shared `~/.tye/registry.db` projects table
   and the shared `core_environments` table (Master Spec Parts C.2/C.3). This
   fixes the literal `CREATE TABLE workspaces` / `CREATE TABLE environments`
   collision that existed against the TyeApi spec (Audit Finding B.1).
5. **Remaining SQLite tables prefixed `run_`**: `tasks`, `process_instances`,
   `log_lines`, `task_groups`, `pipelines`, `pipeline_runs`, `monorepo_packages`,
   `run_history`, `settings`, `ai_suggestions`.
6. **`run:get_git_status` / `run:configure_git_hooks` now delegate to
   `tye-git-engine`** instead of re-implementing a slice of Git status/hooks
   reading — in standalone TyeRun builds (which don't link the git engine)
   they degrade gracefully to `has_git: false`; in Hub they call straight into
   the same engine Tyegit uses, so status never disagrees between the two panels.
7. **Directory layout relocated** under `apps/tyerun/` (Section 10.4).
8. **Credential Store and Event Bus** (Layer 3 / Layer 5 in Section 1.1) are
   implemented once, in `tye-core-vault` and `tye-core-events`, and consumed
   here rather than re-implemented — see Master Spec Parts E, G. The AI
   Orchestration layer (Layer 2) is built on the shared `tye-core-ai-gateway`
   (Master Spec Part F); the `run:ai_*` command surface below is unchanged.

---

# SECTION 1: ARCHITECTURE BLUEPRINT

## 1.1 System Layers
```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: PRESENTATION (React 18 + TypeScript 5 + Tailwind)  │
│  ├─ Component Library (shadcn/ui + Radix primitives)        │
│  ├─ State: Zustand (client) + TanStack Query (server)       │
│  ├─ Virtualization: react-window / tanstack-virtual         │
│  ├─ Terminal Rendering: xterm.js (embedded)                 │
│  ├─ Charts: Recharts / Tremor                               │
│  └─ Process Visualization: Canvas 2D / SVG                   │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2: AI ORCHESTRATION (TypeScript + MCP Protocol)       │
│  ├─ MCP Client (Model Context Protocol)                     │
│  ├─ Task Analysis Engine (pattern recognition)              │
│  ├─ LLM Gateway (OpenAI / Anthropic / Local)               │
│  ├─ Safety Layer (Approval for destructive operations)     │
│  └─ Suggestion Service (command optimization)             │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3: APPLICATION SHELL (Tauri + Rust)                   │
│  ├─ Command Router (IPC handlers)                         │
│  ├─ Window Management (multi-window per project)         │
│  ├─ OS Integration (Notifications, Menu Bar, File Assoc)      │
│  ├─ Credential Store (Keychain/Keyring for env vars)        │
│  └─ File System Watcher (notify crate)                      │
├─────────────────────────────────────────────────────────────┤
│ LAYER 4: DOMAIN ENGINE (Rust)                               │
│  ├─ Task Discovery Engine (config file parsers)             │
│  ├─ Process Manager (spawn, monitor, control)               │
│  ├─ Ecosystem Adapters (npm, Make, Docker, Cargo, etc.)     │
│  ├─ Project Engine (monorepo graph, dependency resolution) │
│  ├─ Environment Manager (env vars, .env files, secrets)      │
│  ├─ Log Engine (structured logging, filtering, search)       │
│  ├─ Health Monitor (CPU, memory, port, heartbeat)           │
│  ├─ Pipeline Engine (task chains, conditional logic)       │
│  └─ Port Manager (auto-assign, conflict detection)          │
├─────────────────────────────────────────────────────────────┤
│ LAYER 5: INFRASTRUCTURE & CACHE (Rust + SQLite)             │
│  ├─ Project Cache (detected tasks, run history)             │
│  ├─ Process State Cache (running/failed/completed)          │
│  ├─ Log Cache (compressed, searchable)                      │
│  ├─ Environment Cache (env var snapshots)                   │
│  ├─ Event Bus (tokio channels)                              │
│  └─ Background Scheduler (health checks, auto-restart)       │
├─────────────────────────────────────────────────────────────┤
│ LAYER 6: NATIVE PROCESS BRIDGE                              │
│  ├─ PTY Spawner (pseudo-terminal for interactive processes) │
│  ├─ Process Spawner (async subprocess with stdio capture)   │
│  ├─ Signal Router (SIGINT, SIGTERM, SIGKILL)                │
│  └─ Exit Code Parser (structured exit reason detection)      │
└─────────────────────────────────────────────────────────────┘
```

## 1.2 Data Flow Architecture
```
User Action → React Component → Zustand Store → TanStack Query 
→ Tauri IPC Invoke → Rust Command Handler → Domain Service 
→ Process Spawner / Config Parser / File Watcher 
→ OS Process / File System 
→ Event emitted (stdout, stderr, exit, health) → Frontend reactive update
```

## 1.3 Critical Constraints
- **All process operations run on tokio threadpool, never block UI thread.**
- **PTY processes get real terminal emulation (xterm.js backend).**
- **Log output streams with backpressure — drop old lines, never OOM.**
- **Auto-detect must complete within 2 seconds for typical projects.**
- **Health checks every 5 seconds, debounced alerts.**
- **Environment variables NEVER logged or exposed to AI context.**
- **Port conflicts auto-detected and resolved with user prompt.**
- **Process kill is graceful (SIGTERM → 5s timeout → SIGKILL).**

---

# SECTION 2: CORE DATA MODELS & SCHEMAS

## 2.1 Project Model
```rust
struct Project {
    id: Uuid,
    name: String,
    path: PathBuf,              // Root directory
    detected_ecosystems: Vec<Ecosystem>,
    tasks: Vec<Task>,
    task_groups: Vec<TaskGroup>,
    pipelines: Vec<Pipeline>,
    environments: Vec<Environment>,
    last_opened: Option<DateTime<Utc>>,
    is_pinned: bool,
    icon: Option<String>,       // Emoji or custom icon
    color: Option<String>,      // Theme color
}

enum Ecosystem {
    Npm,        // package.json
    Pnpm,       // pnpm-project.yaml + package.json
    Yarn,       // yarn.lock + package.json
    Bun,        // bun.lockb + package.json
    Make,       // Makefile
    Just,       // Justfile
    Cargo,      // Cargo.toml
    Docker,     // Dockerfile / docker-compose.yml
    DockerCompose, // docker-compose.yml
    Taskfile,   // Taskfile.yml
    Python,     // requirements.txt / pyproject.toml / setup.py
    Go,         // go.mod
    Ruby,       // Gemfile
    Composer,   // composer.json
    Maven,      // pom.xml
    Gradle,     // build.gradle
    Custom,     // User-defined
}
```

## 2.2 Task Model
```rust
struct Task {
    id: Uuid,
    project_id: Uuid,
    name: String,               // Display name (e.g., "dev server")
    command: String,            // Raw command string
    args: Vec<String>,
    cwd: PathBuf,               // Working directory
    env: HashMap<String, String>, // Merged env vars
    ecosystem: Ecosystem,
    source: TaskSource,         // Where it was detected from
    category: TaskCategory,
    tags: Vec<String>,

    // Execution config
    auto_start: bool,           // Start when project opens
    restart_policy: RestartPolicy,
    restart_delay_secs: u64,
    max_restarts: u32,

    // Resource config
    expected_ports: Vec<u16>,   // Ports this task should bind
    required_ports: Vec<u16>,   // Ports that must be free before start
    cpu_limit: Option<f32>,     // Percentage (0-100)
    memory_limit_mb: Option<u64>,

    // Display config
    color: String,              // ANSI color for logs
    icon: String,
    description: Option<String>,

    // Metadata
    created_at: DateTime<Utc>,
    last_run_at: Option<DateTime<Utc>>,
    run_count: u64,
    success_count: u64,
    fail_count: u64,
}

enum TaskSource {
    AutoDetected { file: PathBuf, line: Option<u32> },
    Manual,
    Imported { format: String },
    AiSuggested,
}

enum TaskCategory {
    DevServer,      // Long-running development server
    Build,          // One-shot build command
    Test,           // Test runner
    Lint,           // Code quality
    Deploy,         // Deployment
    Database,       // DB operations
    Infrastructure, // Docker, k8s, terraform
    Utility,        // Helper scripts
    Custom,
}

enum RestartPolicy {
    Never,
    OnFailure,
    OnCrash,        // Non-zero exit only
    Always,
    UnlessStopped,
}
```

## 2.3 Process Instance Model
```rust
struct ProcessInstance {
    id: Uuid,
    task_id: Uuid,
    project_id: Uuid,
    pid: Option<u32>,           // OS process ID
    status: ProcessStatus,
    started_at: DateTime<Utc>,
    exited_at: Option<DateTime<Utc>>,
    exit_code: Option<i32>,

    // I/O
    stdout_lines: Vec<LogLine>, // Ring buffer (last N lines)
    stderr_lines: Vec<LogLine>,
    total_stdout_bytes: u64,
    total_stderr_bytes: u64,

    // Terminal
    is_pty: bool,
    pty_master: Option<PtyMaster>,

    // Health
    health: ProcessHealth,
    last_health_check: DateTime<Utc>,

    // Ports
    bound_ports: Vec<PortMapping>,
}

enum ProcessStatus {
    Pending,        // Queued but not started
    Starting,       // Spawn requested, waiting for PID
    Running,        // Active process
    Stopping,       // SIGTERM sent, waiting for exit
    Stopped,        // Gracefully stopped
    Crashed,        // Exited with non-zero
    Failed,         // Failed to start
    Zombie,         // Orphaned process
}

struct LogLine {
    timestamp: DateTime<Utc>,
    stream: StreamType,         // Stdout | Stderr | System
    content: String,
    ansi_stripped: String,      // For search/filtering
    line_number: u64,
}

enum StreamType {
    Stdout,
    Stderr,
    System,     // TyeRun-generated messages
    Ai,         // AI-generated messages
}

struct ProcessHealth {
    cpu_percent: f32,
    memory_mb: f64,
    memory_percent: f32,
    threads: u32,
    open_files: u32,
    is_responsive: bool,        // Port/heartbeat check
    health_score: u8,             // 0-100 composite
}

struct PortMapping {
    port: u16,
    protocol: String,           // tcp, udp
    is_listening: bool,
    bound_interface: String,  // 127.0.0.1, 0.0.0.0, ::1
}
```

## 2.4 Task Group Model
```rust
struct TaskGroup {
    id: Uuid,
    project_id: Uuid,
    name: String,
    description: Option<String>,
    tasks: Vec<Uuid>,           // Task IDs
    execution_mode: GroupExecutionMode,
    icon: String,
    color: String,
    shortcut: Option<String>,   // Keyboard shortcut
}

enum GroupExecutionMode {
    Parallel,       // Start all at once
    Sequential,     // Start one after another (previous must succeed)
    Staggered { delay_ms: u64 }, // Start with delay between each
    DependencyGraph, // Based on task dependencies
}
```

## 2.5 Pipeline Model
```rust
struct Pipeline {
    id: Uuid,
    project_id: Uuid,
    name: String,
    description: Option<String>,
    stages: Vec<PipelineStage>,
    trigger: PipelineTrigger,
    is_enabled: bool,
    last_run: Option<PipelineRun>,
}

struct PipelineStage {
    id: Uuid,
    name: String,
    tasks: Vec<Uuid>,           // Task IDs to execute
    execution_mode: GroupExecutionMode,
    condition: Option<StageCondition>, // Skip if condition not met
    timeout_secs: Option<u64>,
    allow_failure: bool,        // Continue pipeline if this stage fails
}

enum PipelineTrigger {
    Manual,
    OnGitPush { branch_pattern: String },
    OnFileChange { patterns: Vec<String> },
    Scheduled { cron: String },
    OnTaskComplete { task_id: Uuid, status: ProcessStatus },
    Webhook { endpoint: String },
}

enum StageCondition {
    FileExists { path: String },
    EnvVarSet { key: String },
    GitBranch { pattern: String },
    PreviousStageSuccess,
    Custom { expression: String },
}

struct PipelineRun {
    id: Uuid,
    pipeline_id: Uuid,
    started_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
    status: PipelineRunStatus,
    stages_results: Vec<StageResult>,
    triggered_by: String,       // user, git, schedule, etc.
}

enum PipelineRunStatus {
    Running,
    Succeeded,
    Failed,
    Cancelled,
    TimedOut,
}

struct StageResult {
    stage_id: Uuid,
    status: StageRunStatus,
    started_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
    task_results: Vec<TaskRunResult>,
    logs: Vec<LogLine>,
}

enum StageRunStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Skipped,
    Cancelled,
}

struct TaskRunResult {
    task_id: Uuid,
    process_id: Uuid,
    status: ProcessStatus,
    duration_ms: u64,
    exit_code: Option<i32>,
}
```

## 2.6 Environment Model
```rust
struct Environment {
    id: Uuid,
    project_id: Uuid,
    name: String,               // e.g., "development", "production"
    is_active: bool,            // Only one active per project
    variables: Vec<EnvVar>,
    source_files: Vec<PathBuf>, // .env, .env.local, etc.
    inherited_from: Option<Uuid>, // Parent environment
}

struct EnvVar {
    key: String,
    value: String,
    is_secret: bool,            // Masked in UI, stored encrypted
    is_overridden: bool,        // Differs from source file
    source: EnvSource,
    description: Option<String>,
}

enum EnvSource {
    DotEnvFile { path: PathBuf },
    System,
    UserDefined,
    Inherited,
    AiSuggested,
}
```

## 2.7 Monorepo Package Model
```rust
struct MonorepoPackage {
    id: Uuid,
    project_id: Uuid,
    name: String,
    path: PathBuf,
    package_manager: Ecosystem,
    tasks: Vec<Task>,            // Tasks specific to this package
    dependencies: Vec<String>,   // Package names (internal deps)
    dependents: Vec<String>,     // Packages that depend on this
    scripts: HashMap<String, String>, // Raw scripts from package.json
    is_root: bool,
}

struct DependencyGraph {
    packages: Vec<MonorepoPackage>,
    edges: Vec<DependencyEdge>,
    cycles: Vec<Vec<String>>,    // Detected circular dependencies
}

struct DependencyEdge {
    from: String,               // Package name
    to: String,
    type: DependencyType,       // Dev, Prod, Peer, Project
}

enum DependencyType {
    Development,
    Production,
    Peer,
    Project,
}
```

## 2.8 SQLite Cache Schema
```sql
-- projects & environments tables — REMOVED HERE.
-- Project identity now lives in the shared ~/.tye/registry.db `projects` table
-- (Master Spec Part C.3). Environment/variable storage now lives in the shared
-- <project_root>/.tye/project.db `core_environments` / `core_environment_variables`
-- tables (Master Spec Part C.2), scope='RunOnly' or scope='Project'.
-- See TYE_PLATFORM_UNIFIED_SPEC.md Parts C.2/C.3 for the replacement schema.

-- run_tasks
CREATE TABLE run_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    args TEXT, -- JSON array
    cwd TEXT,
    env TEXT, -- JSON object
    ecosystem TEXT,
    source TEXT,
    category TEXT,
    tags TEXT, -- JSON array
    auto_start BOOLEAN DEFAULT 0,
    restart_policy TEXT,
    restart_delay_secs INTEGER DEFAULT 5,
    max_restarts INTEGER DEFAULT 3,
    expected_ports TEXT, -- JSON array
    required_ports TEXT, -- JSON array
    color TEXT,
    icon TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_run_at TIMESTAMP,
    run_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0
);

-- run_process_instances
CREATE TABLE run_process_instances (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    pid INTEGER,
    status TEXT,
    started_at TIMESTAMP,
    exited_at TIMESTAMP,
    exit_code INTEGER,
    is_pty BOOLEAN DEFAULT 0,
    health_score INTEGER,
    bound_ports TEXT, -- JSON array
    FOREIGN KEY (task_id) REFERENCES run_tasks(id)
);

-- run_log_lines (partitioned by process, ring buffer in app)
CREATE TABLE run_log_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    process_id TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stream_type TEXT,
    content TEXT,
    line_number INTEGER,
    FOREIGN KEY (process_id) REFERENCES run_process_instances(id)
);
CREATE INDEX idx_log_lines_process ON run_log_lines(process_id, line_number);

-- run_task_groups
CREATE TABLE run_task_groups (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    run_tasks TEXT, -- JSON array of task IDs
    execution_mode TEXT,
    icon TEXT,
    color TEXT,
    shortcut TEXT
);

-- run_pipelines
CREATE TABLE run_pipelines (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    stages TEXT, -- JSON
    trigger TEXT, -- JSON
    is_enabled BOOLEAN DEFAULT 1
);

-- run_pipeline_runs
CREATE TABLE run_pipeline_runs (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT,
    stages_results TEXT, -- JSON
    triggered_by TEXT,
    FOREIGN KEY (pipeline_id) REFERENCES run_pipelines(id)
);

-- run_monorepo_packages
CREATE TABLE run_monorepo_packages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    package_manager TEXT,
    scripts TEXT, -- JSON
    dependencies TEXT, -- JSON array
    dependents TEXT, -- JSON array
    is_root BOOLEAN DEFAULT 0
);

-- run_execution_history
CREATE TABLE run_execution_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    process_id TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    exit_code INTEGER,
    status TEXT,
    FOREIGN KEY (task_id) REFERENCES run_tasks(id)
);

-- run_settings
CREATE TABLE run_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    scope TEXT -- global, project, user
);

-- run_ai_suggestions
CREATE TABLE run_ai_suggestions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT, -- task_suggestion, optimization, issue_detection
    content TEXT,
    confidence REAL,
    applied BOOLEAN DEFAULT 0,
    dismissed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---
END OF CHUNK 1: Executive Summary + Architecture + Data Models
```

## 2. tyrerun_spec_chunk_2.md

```md
# SECTION 3: FEATURE SPECIFICATIONS (Complete FAT-REQ)

---

## MILESTONE 1: Project Discovery & Task Detection Engine
**Goal:** App can discover, open, and auto-detect tasks from any project. Foundation is solid.

---

### F-001: Project Auto-Discovery
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want the app to find my development projects and their task configurations automatically.

**Functional Requirements:**
1. Scan common directories on first launch: `~/Projects`, `~/Documents`, `~/Code`, `~/dev`, `~/project`, `~/repos`.
2. Recursively detect project root markers (max depth: 4 levels):
   - `package.json` → npm/pnpm/yarn/bun project
   - `Cargo.toml` → Rust project
   - `Makefile` → Make project
   - `Justfile` / `justfile` → Just project
   - `Taskfile.yml` / `taskfile.yml` → Taskfile project
   - `docker-compose.yml` / `compose.yaml` → Docker Compose
   - `Dockerfile` → Docker project
   - `pyproject.toml` / `requirements.txt` / `setup.py` → Python
   - `go.mod` → Go project
   - `Gemfile` → Ruby project
   - `composer.json` → PHP project
   - `pom.xml` / `build.gradle` → Java project
3. Detect nested projects (monorepos) and show as project with packages.
4. Add discovered projects to dashboard with "New" badge.
5. Allow user to exclude paths (e.g., `node_modules`, `target`, `.git`).
6. Optional: Watch filesystem for new project markers and auto-add.
7. Show discovery progress with cancel option.
8. Detect project tools: `pnpm-project.yaml`, `lerna.json`, `nx.json`, `turbo.json`, `rush.json`.

**Acceptance Criteria:**
- [ ] AC1: Discovery completes within 5 seconds for 50 projects.
- [ ] AC2: Monorepo detected and shown as single project with packages.
- [ ] AC3: User can exclude directories from discovery.
- [ ] AC4: Auto-discovered projects marked with sparkle icon until visited.
- [ ] AC5: Cancel button stops scan immediately.
- [ ] AC6: Multiple ecosystem markers in same dir shown as single project with multiple ecosystems.

**Technical Spec:**
- Rust: `WalkDir` or `jwalk` for parallel directory traversal. Look for marker files.
- Filter: Skip dirs matching exclude patterns.
- Background: Run in `tokio::task::spawn_blocking`.
- Monorepo: Check for project config files, parse package globs.

**Data Model:** Updates `projects` table with `auto_discovered: true`.

**UI/UX:** Settings > Discovery. Toggle auto-discovery. Exclude list editor. Progress modal on first launch.

**Error Handling:**
- Permission denied on directory → Skip silently, log to debug console.
- Circular symlinks → Detect and break (max depth).
- Corrupted config file → Show warning, skip task detection for that file.

**Dependencies:** None (first feature).

---

### F-002: Task Auto-Detection — npm / pnpm / yarn / bun
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want the app to read my package.json scripts and create runnable tasks automatically.

**Functional Requirements:**
1. Parse `package.json` `scripts` section.
2. Create a Task for each script with:
   - Name: script name (e.g., "dev", "build", "test")
   - Command: `npm run <script>` (or `pnpm run`, `yarn`, `bun run` based on lockfile)
   - Category: Auto-categorized by name patterns
3. Detect package manager from lockfiles: `package-lock.json` (npm), `pnpm-lock.yaml` (pnpm), `yarn.lock` (yarn), `bun.lockb` (bun).
4. Read `projects` field for monorepo packages.
5. For each project package, detect its scripts and prefix with package name.
6. Detect `pre-` and `post-` hooks and mark as hidden by default.
7. Read `engines` field to suggest Node version.
8. Detect `npx` / `pnpx` / `yarn dlx` / `bunx` usage in scripts.

**Acceptance Criteria:**
- [ ] AC1: All package.json scripts detected within 500ms.
- [ ] AC2: Correct package manager identified from lockfile.
- [ ] AC3: Monorepo project packages detected and scripts prefixed.
- [ ] AC4: Pre/post hooks hidden but accessible via toggle.
- [ ] AC5: Scripts with `watch`, `dev`, `serve` in name auto-categorized as DevServer.

**Technical Spec:**
- Rust: Parse JSON with `serde_json`. Read `package.json` scripts map.
- Package manager detection: Check for lockfiles in priority order (bun > pnpm > yarn > npm).
- Project: Parse `projects` array or `pnpm-project.yaml` packages field.

**Data Model:** Creates `Task` entries with `source: AutoDetected`, `ecosystem: Npm/Pnpm/Yarn/Bun`.

**UI/UX:** Task list with package manager badge. Grouped by package in monorepos.

**Error Handling:**
- Malformed package.json → Show error, skip file.
- No scripts field → Show "No scripts found" empty state.
- Missing lockfile → Default to npm, show warning.

**Dependencies:** F-001.

---

### F-003: Task Auto-Detection — Make / Just / Taskfile
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want the app to read my Makefile, Justfile, and Taskfile targets and create runnable tasks.

**Functional Requirements:**
1. **Makefile:** Parse targets (lines before `:` that don't start with tab/space).
   - Skip built-in targets (`.PHONY`, `.DEFAULT`, pattern rules with `%`).
   - Extract target name and description (from comments above target).
   - Command: `make <target>`.
2. **Justfile:** Parse recipe names (lines ending with `:` before indented block).
   - Support `[group: 'name']` annotations for categorization.
   - Support `[private]` annotation — hide by default.
   - Support `[no-cd]` annotation — preserve CWD.
   - Command: `just <recipe>`.
3. **Taskfile (Task):** Parse `tasks` map from `Taskfile.yml`.
   - Read task name, description, commands, dir, env.
   - Support `includes` for modular Taskfiles.
   - Command: `task <taskname>`.
4. For all three: Detect `.PHONY`-equivalent and mark as non-file targets.
5. Show target/recipe description in task tooltip.

**Acceptance Criteria:**
- [ ] AC1: Makefile targets detected within 200ms.
- [ ] AC2: Justfile recipes with groups shown in categorized sections.
- [ ] AC3: Taskfile tasks with includes resolved recursively.
- [ ] AC4: Private/hidden targets accessible via "Show Hidden" toggle.
- [ ] AC5: Target descriptions shown as task subtitles.

**Technical Spec:**
- Rust: 
  - Makefile: Regex-based parser for target lines. Handle variable assignments and includes.
  - Justfile: Parse with `just --dump --dump-format json` subprocess, or custom parser.
  - Taskfile: Parse YAML with `serde_yaml`.

**Data Model:** Creates `Task` entries with `ecosystem: Make/Just/Taskfile`.

**UI/UX:** Task cards show target name + description. Grouped by `[group]` for Just.

**Error Handling:**
- Makefile with include directives → Follow includes, detect cycles.
- Justfile syntax error → Show error, offer to open in editor.
- Taskfile version mismatch → Show warning, attempt best-effort parse.

**Dependencies:** F-001.

---

### F-004: Task Auto-Detection — Docker & Docker Compose
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want the app to detect my Docker services and create tasks to start/stop them.

**Functional Requirements:**
1. **Docker Compose:** Parse `docker-compose.yml` / `compose.yaml`.
   - Create a task per service: `docker compose up <service>`.
   - Create a task for full stack: `docker compose up`.
   - Create a task for build: `docker compose build`.
   - Detect service dependencies (`depends_on`) and mark for ordered startup.
   - Read service ports, environment variables, health checks.
2. **Dockerfile:** Detect and create build task: `docker build -t <name> .`.
3. **Standalone Docker:** Detect running containers and offer attach/stop tasks.
4. Show Docker service status (running/stopped) in real-time.
5. Support multiple compose files (`-f docker-compose.yml -f docker-compose.override.yml`).

**Acceptance Criteria:**
- [ ] AC1: Docker Compose services detected within 300ms.
- [ ] AC2: Service dependencies shown as connection lines in graph view.
- [ ] AC3: Running containers shown with green status indicator.
- [ ] AC4: Build task auto-named from directory or `image` field.
- [ ] AC5: Port mappings displayed per service.

**Technical Spec:**
- Rust: Parse YAML with `serde_yaml`. Run `docker compose config` to resolve extends/merges.
- Docker API: Use `bollard` crate for Docker daemon communication.
- Status: Poll `docker ps` or use bollard events stream.

**Data Model:** `Task` with `ecosystem: Docker/DockerCompose`, `category: Infrastructure`.

**UI/UX:** Service cards with port badges. Dependency graph visualization.

**Error Handling:**
- Docker daemon not running → Show "Start Docker Desktop" CTA.
- Invalid compose file → Show YAML parse error with line number.
- Service build failure → Show build logs inline.

**Dependencies:** F-001.

---

### F-005: Task Auto-Detection — Cargo & Other Ecosystems
**Phase:** M1 | **Priority:** P1  
**User Story:** As a user, I want the app to detect tasks from Cargo, Python, Go, and other ecosystems.

**Functional Requirements:**
1. **Cargo:** Parse `Cargo.toml` `[package.scripts]` and built-in commands.
   - Built-ins: `cargo build`, `cargo test`, `cargo run`, `cargo check`, `cargo clippy`, `cargo fmt`.
   - Custom scripts from `[package.metadata.scripts]` if present.
2. **Python:** Detect from `pyproject.toml` `[project.scripts]` / `[tool.poetry.scripts]`, `setup.py` entry points, or `manage.py` (Django).
3. **Go:** Detect `go run`, `go test`, `go build` from module.
4. **Ruby:** Parse `Gemfile` + `Rakefile` tasks.
5. **PHP:** Parse `composer.json` `scripts`.
6. **Java:** Parse `pom.xml` goals or `build.gradle` tasks.
7. For all: Auto-categorize by command patterns.

**Acceptance Criteria:**
- [ ] AC1: Cargo built-in commands shown as tasks.
- [ ] AC2: Python scripts detected from pyproject.toml.
- [ ] AC3: Go module commands shown with module name.
- [ ] AC4: Multi-ecosystem projects show all detected tasks.

**Technical Spec:**
- Rust: Parse TOML with `toml` crate, XML with `quick-xml`, etc.
- Ecosystem-specific: Use native parsers where available.

**Data Model:** `Task` entries with appropriate `ecosystem` enum.

**UI/UX:** Ecosystem badge on each task. Filter by ecosystem.

**Error Handling:**
- Missing required toolchain → Show "Install Rust/Python/Go" CTA.
- Invalid TOML/XML → Show parse error, skip file.

**Dependencies:** F-001.

---

### F-006: Home Screen Dashboard
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want a central dashboard showing my projects and their running tasks at a glance.

**Functional Requirements:**
1. Display grid/list of projects with cards.
2. Each card shows: project name, path, detected ecosystems, running task count, last activity.
3. Show "Open Recent" section (last 10 opened projects).
4. Show "Pinned" section (user-starred projects).
5. "Open Project" button (directory picker).
6. "Create Project" button (manual configuration).
7. Search/filter projects by name or path.
8. Empty state for first-time users with tutorial CTA.
9. AI summary panel: "You have 3 projects with running tasks. Project X has 2 failed processes."
10. Quick actions: Start all dev servers, Stop all, Restart all failed.

**Acceptance Criteria:**
- [ ] AC1: Dashboard loads within 1 second showing cached data.
- [ ] AC2: Background refresh updates status badges without blocking UI.
- [ ] AC3: Pin/unpin action immediate with animation.
- [ ] AC4: Search filters in real-time (< 50ms for 100 projects).
- [ ] AC5: Empty state shows "Open your first project" with directory picker.

**Technical Spec:**
- React: Grid layout with `react-window` for >20 projects.
- Rust: On app start, read SQLite `projects` table for cached state. Background thread refreshes each project's running processes.
- IPC: `get_dashboard_data()` → returns `Vec<ProjectCard>`.

**Data Model:** `ProjectCard { id, name, path, ecosystems, running_count, failed_count, last_activity, is_pinned }`

**UI/UX:** Responsive grid (3 cols large, 2 medium, 1 small). Cards with color-coded status badges. Sticky search bar.

**Error Handling:**
- Project moved/deleted since last open → Show "Path not found" badge, offer to locate.
- Project corrupted → Show warning icon, offer re-detection.

**Dependencies:** F-001, SQLite schema.

---

### F-007: Open Project
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to open an existing project directory and have TyeRun auto-detect all tasks.

**Functional Requirements:**
1. File picker dialog (directory selection).
2. Validate directory is readable.
3. Run full task detection (F-002 through F-005).
4. If valid, load project into app state.
5. Add to recent projects list (max 50, LRU eviction).
6. Persist open project path for session restore.
7. Load cached tasks from SQLite first, then background refresh.
8. Update window title to "ProjectName — TyeRun".
9. Show detection progress with per-ecosystem status.

**Acceptance Criteria:**
- [ ] AC1: Valid project opens within 2 seconds (cached) / 5 seconds (cold).
- [ ] AC2: All detected ecosystems shown in sidebar.
- [ ] AC3: Recent list updated immediately.
- [ ] AC4: Window title reflects project name.
- [ ] AC5: Previous session's open project restored on relaunch.

**Technical Spec:**
- Rust: Directory validation → run all ecosystem detectors in parallel.
- Cache: Read from SQLite `projects` + `tasks` tables; if missing, insert.
- Session: Store `last_opened_project` in app config.

**Data Model:** `OpenProjectRequest { path: PathBuf }` → `Project`

**UI/UX:** File picker + drag-and-drop directory onto app window. Recent list in sidebar.

**Error Handling:**
- Directory not readable → Permission error with elevated prompt suggestion.
- No tasks detected → Show "No tasks found" with manual task creation CTA.
- Detection timeout → Show partial results with "Continue detecting" button.

**Dependencies:** F-001, F-002, F-003, F-004, F-005, SQLite schema.

---

### F-008: Manual Task Creation
**Phase:** M1 | **Priority:** P0  
**User Story:** As a user, I want to manually add tasks that weren't auto-detected.

**Functional Requirements:**
1. Dialog: Task name, command, working directory, environment variables.
2. Command validation: Check if executable exists in PATH.
3. Working directory picker (default to project root).
4. Environment variable editor: key-value pairs with secret toggle.
5. Category selector with icon picker.
6. Color picker for task card.
7. Auto-start toggle.
8. Restart policy selector.
9. Port configuration: expected and required ports.
10. Save to project configuration.

**Acceptance Criteria:**
- [ ] AC1: Manual task created and appears in task list immediately.
- [ ] AC2: Command validation shows green checkmark or red error.
- [ ] AC3: Environment variables saved and applied on task run.
- [ ] AC4: Task persists across app restarts.

**Technical Spec:**
- Rust: Validate command via `which` crate or PATH traversal.
- Store: Insert into SQLite `tasks` table.

**Data Model:** `CreateTaskRequest { name, command, args, cwd, env, category, color, icon, auto_start, restart_policy, expected_ports, required_ports }`

**UI/UX:** Modal with form. Live command preview. Environment variable table with add/remove.

**Error Handling:**
- Command not found → Inline error with "Install X" suggestion.
- Invalid working directory → Directory picker error.
- Duplicate task name → Inline error, suggest alternative.

**Dependencies:** F-007.

---

### F-009: Project Configuration Editor
**Phase:** M1 | **Priority:** P1  
**User Story:** As a user, I want to edit project settings, including detection rules and defaults.

**Functional Requirements:**
1. Edit project name, icon, color.
2. Configure auto-detection rules: which ecosystems to scan, exclude patterns.
3. Set default environment (dev/staging/prod).
4. Configure global environment variables applied to all tasks.
5. Set default shell (bash, zsh, fish, PowerShell, cmd).
6. Configure task execution defaults: timeout, max restarts, kill signal.
7. Import/export project configuration (JSON/YAML).
8. Reset to auto-detected state.

**Acceptance Criteria:**
- [ ] AC1: Name change reflects immediately in UI.
- [ ] AC2: Exclude patterns prevent re-detection of specified paths.
- [ ] AC3: Global env vars applied to all tasks.
- [ ] AC4: Export produces valid JSON with all tasks and settings.

**Technical Spec:**
- Rust: Read/write project config to SQLite + optional `.tyrerun.json` in project root.
- Detection rules: Stored as glob patterns.

**Data Model:** `ProjectConfig { name, icon, color, detection_rules, default_env, global_env, default_shell, execution_defaults }`

**UI/UX:** Settings panel with tabs: General, Detection, Environment, Execution, Import/Export.

**Error Handling:**
- Invalid glob pattern → Inline error with example.
- Export fails (disk full) → Show error, suggest different location.

**Dependencies:** F-007.

---

## MILESTONE 2: Task Execution, Monitoring & Process Management
**Goal:** User can run tasks, view real-time logs, monitor health, and manage process lifecycle.

---

### F-010: Task Execution — Start/Stop/Restart
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to start, stop, and restart tasks with one click.

**Functional Requirements:**
1. **Start Task:**
   - Spawn process with configured command, args, cwd, env.
   - Support both PTY (interactive) and non-PTY modes.
   - Apply environment variables (merged: system → project → task → user override).
   - Check required ports are free before starting.
   - Show startup progress (spinner → running).
   - Capture PID immediately.
2. **Stop Task:**
   - Send SIGTERM (graceful shutdown).
   - Wait 5 seconds (configurable).
   - If still running, send SIGKILL.
   - Show stopping state.
3. **Restart Task:**
   - Stop then start with same configuration.
   - Preserve log history option (clear vs append).
4. **Kill Task:**
   - Immediate SIGKILL, no grace period.
   - Confirmation for tasks marked as "important".
5. Batch operations: Start all, Stop all, Restart all, Kill all.

**Acceptance Criteria:**
- [ ] AC1: Task starts within 500ms of click.
- [ ] AC2: Stop sends SIGTERM and shows "Stopping..." state.
- [ ] AC3: Restart preserves log history if configured.
- [ ] AC4: Kill shows confirmation for important tasks.
- [ ] AC5: Batch start all starts tasks respecting dependency order.

**Technical Spec:**
- Rust: 
  - Non-PTY: `tokio::process::Command` with stdout/stderr piped.
  - PTY: `portable-pty` or `tokio-pty-process` crate for terminal emulation.
  - Signals: `nix::sys::signal::kill` for Unix, `windows::Win32::System::Threading` for Windows.
- Port check: `tokio::net::TcpListener::bind` before start.
- Events: Emit `process_started`, `process_stopped`, `process_output` via Tauri events.

**Data Model:** `ProcessInstance` created on start, updated on state changes.

**UI/UX:** Task cards with play/stop/restart buttons. Status badge (color-coded). Progress spinner during startup.

**Error Handling:**
- Port conflict → Show dialog: "Port 3000 in use by Process X. Kill and retry?"
- Command not found → Show error with installation suggestion.
- Permission denied → Show elevated permission prompt.
- Process fails to start → Show error output immediately.

**Dependencies:** F-007, F-008.

---

### F-011: Real-Time Log Viewer
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to see real-time output from running tasks with powerful viewing options.

**Functional Requirements:**
1. Stream stdout and stderr in real-time (WebSocket-like via Tauri events).
2. ANSI color support (rendered correctly).
3. Line numbering.
4. Timestamps (toggleable).
5. Word wrap toggle.
6. Search within logs (regex support, highlight matches).
7. Filter by stream (stdout only, stderr only, both).
8. Auto-scroll to bottom (toggleable).
9. Clear logs button.
10. Copy selected lines or all logs.
11. Export logs to file.
12. Log truncation: Keep last N lines in memory (configurable, default 10,000).
13. Full log persistence to SQLite (compressed, searchable).
14. Clickable URLs in logs.
15. Error pattern detection: Highlight lines matching error regexes.

**Acceptance Criteria:**
- [ ] AC1: Log updates within 50ms of process output.
- [ ] AC2: ANSI colors rendered correctly.
- [ ] AC3: Search finds matches in < 100ms for 10k lines.
- [ ] AC4: Auto-scroll stops when user scrolls up, resumes at bottom.
- [ ] AC5: Export produces valid text file with all lines.

**Technical Spec:**
- Frontend: `xterm.js` for PTY mode, custom virtualized list for non-PTY.
- Rust: Buffer stdout/stderr in ring buffer. Emit lines via `tokio::sync::broadcast`.
- ANSI: Use `ansi-to-html` or `xterm.js` parser.
- Search: Frontend regex search on loaded lines. Backend FTS5 for historical search.

**Data Model:** `LogLine` entries. Ring buffer in app state + SQLite for persistence.

**UI/UX:** Terminal-like panel with toolbar (search, filter, wrap, timestamps, clear, export). Split view for multiple tasks.

**Error Handling:**
- Log buffer full → Drop oldest lines, show "Buffer full" indicator.
- Export fails → Show error, suggest different location.
- Search regex invalid → Inline error with suggestion.

**Dependencies:** F-010.

---

### F-012: Process Health Monitoring
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to monitor CPU, memory, and responsiveness of my running tasks.

**Functional Requirements:**
1. Real-time CPU usage percentage per process.
2. Real-time memory usage (RSS, VMS) per process.
3. Thread count.
4. Open file descriptor count.
5. Network connections (listening ports, established connections).
6. Process uptime.
7. Health check: HTTP endpoint ping (configurable URL + interval).
8. Health check: TCP port connect.
9. Health check: Custom command (exit 0 = healthy).
10. Composite health score (0-100).
11. Alert on high CPU (>90% for 30s).
12. Alert on high memory (> limit or >80% system).
13. Alert on unresponsive (health check fails 3 times).
14. Alert on crash (unexpected exit).
15. Health history graph (last 5 minutes).

**Acceptance Criteria:**
- [ ] AC1: CPU/memory updates every 2 seconds.
- [ ] AC2: Health score accurate within 5 points.
- [ ] AC3: Alert appears within 10 seconds of threshold breach.
- [ ] AC4: Health graph renders smoothly at 60fps.
- [ ] AC5: Unresponsive task marked as "Unhealthy" with red badge.

**Technical Spec:**
- Rust: 
  - `sysinfo` crate for cross-platform process metrics.
  - `tokio::time::interval` for health checks.
  - `reqwest` for HTTP health checks.
  - `tokio::net::TcpStream::connect` for TCP checks.
- Events: Emit `health_changed` with metrics.

**Data Model:** `ProcessHealth` updated every interval. History stored in circular buffer.

**UI/UX:** Task card mini-graphs. Detailed health panel with gauges. Alert toast notifications.

**Error Handling:**
- Process metrics unavailable (permissions) → Show "Limited metrics" warning.
- Health check timeout → Mark as unhealthy, retry with backoff.
- System info read failure → Degrade gracefully, show available metrics.

**Dependencies:** F-010.

---

### F-013: Port Management & Conflict Resolution
**Phase:** M2 | **Priority:** P1  
**User Story:** As a user, I want the app to detect port conflicts and help me resolve them.

**Functional Requirements:**
1. Auto-detect ports used by each task (parse command args, config files).
2. Scan running processes for bound ports.
3. Show port usage map: which task owns which port.
4. Conflict detection: Two tasks want the same port.
5. Conflict resolution options:
   - Auto-assign alternate port (find next available).
   - Kill existing process and retry.
   - Edit task configuration to change port.
   - Skip task startup.
6. Port forwarding visualization (Docker container → host port).
7. Click port number to open in browser.
8. Port availability check before task start.

**Acceptance Criteria:**
- [ ] AC1: Ports detected from `package.json` scripts, Docker compose, env vars.
- [ ] AC2: Conflict detected before task start.
- [ ] AC3: Auto-assign finds available port within 100ms.
- [ ] AC4: Port map updates in real-time as tasks start/stop.
- [ ] AC5: Click port opens browser to `http://localhost:<port>`.

**Technical Spec:**
- Rust: 
  - Parse port from command strings (regex for `--port`, `-p`, `PORT=`).
  - `tokio::net::TcpListener::bind("127.0.0.1:0")` to find available ports.
  - `sysinfo` or `netstat` equivalent for port ownership.
- Docker: Parse `ports` section in compose file.

**Data Model:** `PortMapping` per process. Global port registry.

**UI/UX:** Port map panel. Conflict modal with resolution options. Port badges on task cards.

**Error Handling:**
- No available ports in range → Show error, suggest manual configuration.
- Port already bound by system process → Show process name, offer kill.
- Docker port mapping conflict → Show compose file line, offer edit.

**Dependencies:** F-010.

---

### F-014: Task Grouping & Execution
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to group related tasks and run them together with one click.

**Functional Requirements:**
1. Create named task groups (e.g., "Dev Stack", "CI Checks", "Deployment").
2. Add/remove tasks to/from groups via drag-and-drop or multi-select.
3. Group execution modes:
   - **Parallel:** Start all tasks simultaneously.
   - **Sequential:** Start one after another (previous must succeed).
   - **Staggered:** Start with configurable delay between each.
   - **Dependency-aware:** Use task dependencies to determine order.
4. Group-level actions: Start all, Stop all, Restart all.
5. Group status aggregation (all running, some failed, etc.).
6. Group-level logs (merged or tabbed).
7. Keyboard shortcut per group.
8. Save groups to project configuration.

**Acceptance Criteria:**
- [ ] AC1: Group creation takes < 1 second.
- [ ] AC2: Parallel group starts all tasks within 500ms.
- [ ] AC3: Sequential group waits for previous task success before next.
- [ ] AC4: Group status updates in real-time as individual tasks change.
- [ ] AC5: Keyboard shortcut triggers group start.

**Technical Spec:**
- Rust: `tokio::join_all` for parallel. Sequential via `tokio::sync::mpsc` channel.
- Dependencies: Build DAG from task metadata, topological sort.
- Events: Group status = aggregate of member statuses.

**Data Model:** `TaskGroup` with `execution_mode` and `tasks` array.

**UI/UX:** Collapsible group cards. Drag-and-drop task reordering. Group action buttons. Status summary bar.

**Error Handling:**
- Circular dependency in group → Show error, break cycle arbitrarily.
- Task fails in sequential mode → Stop group, show error, offer continue.
- Group contains non-existent task → Skip with warning.

**Dependencies:** F-010.

---

### F-015: Environment Variable Management
**Phase:** M2 | **Priority:** P0  
**User Story:** As a user, I want to manage environment variables for my tasks without editing files.

**Functional Requirements:**
1. Auto-detect `.env` files in project root.
2. Parse and display all env vars in table: key, value, source, secret status.
3. Add new env vars inline.
4. Edit existing env vars.
5. Delete env vars.
6. Secret masking: values hidden behind dots, toggle visibility.
7. Override system env vars (show original vs override).
8. Per-task env vars (override project-level).
9. Environment profiles: dev, staging, production, custom.
10. Import/export `.env` files.
11. Validate env var references in commands (warn if referenced but not set).
12. AI suggestion: "You referenced DATABASE_URL but it's not set. Add it?"

**Acceptance Criteria:**
- [ ] AC1: `.env` file parsed within 200ms.
- [ ] AC2: Secret values masked by default.
- [ ] AC3: Per-task env vars override project-level.
- [ ] AC4: Profile switch changes env vars for all tasks.
- [ ] AC5: Export produces valid `.env` file format.

**Technical Spec:**
- Rust: Parse `.env` with `dotenvy` crate. Store in SQLite encrypted for secrets.
- Validation: Regex scan commands for `$VAR` or `${VAR}` patterns.
- Profiles: Store multiple `Environment` records per project.

**Data Model:** `Environment` with `EnvVar` entries. Secret values encrypted with `keyring`.

**UI/UX:** Table with key-value pairs. Secret toggle (eye icon). Profile selector dropdown. Import/export buttons.

**Error Handling:**
- Malformed `.env` file → Show parse error with line number, offer raw edit.
- Secret storage failure → Show warning, store unencrypted (with warning).
- Duplicate keys → Merge with precedence rules, show warning.

**Dependencies:** F-007.

---

### F-016: Log Filtering & Search
**Phase:** M2 | **Priority:** P1  
**User Story:** As a user, I want to search and filter logs to find specific events quickly.

**Functional Requirements:**
1. Full-text search across all task logs (current session + historical).
2. Regex search support.
3. Filter by: task, stream type (stdout/stderr), time range, severity.
4. Severity auto-detection: ERROR, WARN, INFO, DEBUG based on log content patterns.
5. Bookmark important lines.
6. Jump to bookmarked lines.
7. Search within specific task or across all tasks.
8. Search results highlighted in context.
9. Save search queries for reuse.
10. Export filtered results.

**Acceptance Criteria:**
- [ ] AC1: Search across 100k lines returns in < 1 second.
- [ ] AC2: Regex search validates pattern before execution.
- [ ] AC3: Severity detection accurate for common formats (Rust, Node, Python).
- [ ] AC4: Bookmarks persist across app restarts.
- [ ] AC5: Export filtered results produces valid text file.

**Technical Spec:**
- Rust: SQLite FTS5 for full-text search. Index log lines on insert.
- Frontend: Virtualized list with search highlight. Debounced search input (300ms).
- Severity: Regex patterns per ecosystem (e.g., `^\s*error` for Rust).

**Data Model:** `LogLine` with FTS5 index. `Bookmark` table.

**UI/UX:** Search bar with filters (chips). Results panel with context lines. Bookmark star icon per line.

**Error Handling:**
- Invalid regex → Inline error with suggestion.
- Search timeout → Show partial results with "Continue searching" button.
- FTS index corruption → Rebuild index, show warning.

**Dependencies:** F-011.

---

### F-017: Notification System
**Phase:** M2 | **Priority:** P1  
**User Story:** As a user, I want to be notified when tasks complete, fail, or have issues.

**Functional Requirements:**
1. Toast notifications for: task started, task completed, task failed, task crashed.
2. OS-native notifications (macOS Notification Center, Windows Toast, Linux libnotify).
3. Configurable notification rules per task:
   - Notify on failure only
   - Notify on completion
   - Notify on crash
   - Never notify
4. Notification actions: View logs, Restart task, Dismiss.
5. Sound alerts (configurable, can be disabled).
6. Do Not Disturb mode (suppress all notifications).
7. Notification history panel.
8. Critical alerts: Port conflict, out of memory, disk full.

**Acceptance Criteria:**
- [ ] AC1: Notification appears within 1 second of event.
- [ ] AC2: OS notification shows task name and status.
- [ ] AC3: Click notification opens app and focuses relevant task.
- [ ] AC4: Do Not Disturb suppresses all notifications.
- [ ] AC5: Notification history shows last 100 events.

**Technical Spec:**
- Rust: `notify-rust` crate for cross-platform notifications. Tauri native notification API.
- Rules: Stored per task in SQLite.
- History: Circular buffer in SQLite.

**Data Model:** `NotificationRule { task_id, on_start, on_complete, on_fail, on_crash }`. `NotificationHistory { id, timestamp, task_id, type, message, read }`.

**UI/UX:** Toast in bottom-right. Settings > Notifications. History panel in sidebar.

**Error Handling:**
- OS notification permission denied → Show in-app toast only.
- Sound file missing → Silent notification, log warning.
- Notification queue full → Drop oldest, show indicator.

**Dependencies:** F-010.

---
END OF CHUNK 2: Milestone 1-2 Features (Discovery, Dashboard, Process Management)
```

## 3. tyrerun_spec_chunk_3.md

```md
## MILESTONE 3: Advanced Runner, Monorepo Support & Pipelines
**Goal:** Power user features for complex projects, monorepos, and automated workflows.

---

### F-018: Pipeline Builder & Execution
**Phase:** M3 | **Priority:** P0  
**User Story:** As a user, I want to create automated task pipelines (e.g., lint → test → build → deploy) that run in sequence.

**Functional Requirements:**
1. Visual pipeline builder: drag-and-drop stages.
2. Each stage contains one or more tasks.
3. Stage execution modes: parallel, sequential, conditional.
4. Conditional stages: skip if file doesn't exist, env var not set, git branch doesn't match.
5. Pipeline triggers: manual, on file change, on git push, scheduled (cron), webhook, on task completion.
6. Pipeline status: running, succeeded, failed, cancelled, timed out.
7. Pipeline logs: aggregated per stage, per task.
8. Pipeline artifacts: capture output files, test reports.
9. Pipeline retry: retry failed stage with one click.
10. Pipeline templates: CI-like templates (lint-test-build, deploy-staging, etc.).
11. Pipeline history: last N runs with status and duration.
12. Pipeline export/import (JSON/YAML).

**Acceptance Criteria:**
- [ ] AC1: Pipeline created via drag-and-drop in < 30 seconds.
- [ ] AC2: Sequential stage waits for previous stage success.
- [ ] AC3: Conditional stage skips correctly based on condition.
- [ ] AC4: Pipeline run shows real-time progress per stage.
- [ ] AC5: Failed stage shows exact task and error output.

**Technical Spec:**
- Rust: DAG execution engine. `petgraph` for dependency graph. `tokio::sync::mpsc` for stage coordination.
- Triggers: File watcher (`notify` crate), git hook integration, cron (`tokio-cron-scheduler`).
- Artifacts: Capture specified output paths, store in project `.tyrerun/artifacts/`.

**Data Model:** `Pipeline`, `PipelineStage`, `PipelineRun`, `StageResult`.

**UI/UX:** Visual pipeline builder (canvas with nodes). Stage cards with status. Progress bar. Run history table.

**Error Handling:**
- Circular dependency in pipeline → Show error, prevent save.
- Stage timeout → Mark as timed out, kill running tasks, offer retry.
- Trigger webhook failure → Log error, retry with backoff.

**Dependencies:** F-014.

---

### F-019: Monorepo Package Graph
**Phase:** M3 | **Priority:** P0  
**User Story:** As a monorepo user, I want to see my packages and their dependencies as a visual graph.

**Functional Requirements:**
1. Auto-detect monorepo structure from project configs.
2. Parse package dependencies (internal + external).
3. Visual graph: packages as nodes, dependencies as edges.
4. Edge types: dev dependency (dashed), peer dependency (dotted), project dependency (solid).
5. Package status: build status, test status, last modified.
6. Click package to see its tasks and scripts.
7. Run task across all packages (e.g., "test all packages").
8. Topological sort for build order.
9. Detect circular dependencies and highlight.
10. Filter by package name, status, or dependency depth.
11. Package size and file count.

**Acceptance Criteria:**
- [ ] AC1: Graph renders for 50 packages in < 2 seconds.
- [ ] AC2: Circular dependencies highlighted in red.
- [ ] AC3: Click package opens package detail panel.
- [ ] AC4: "Build all" runs in topological order.
- [ ] AC5: Graph zooms and pans smoothly at 60fps.

**Technical Spec:**
- Rust: Parse project configs. Build dependency graph with `petgraph`.
- Layout: Force-directed or hierarchical layout algorithm.
- Rendering: HTML5 Canvas 2D or SVG. Virtualize for large graphs.

**Data Model:** `MonorepoPackage`, `DependencyGraph`, `DependencyEdge`.

**UI/UX:** Interactive graph view. Package cards with status badges. Toolbar: zoom, filter, layout toggle.

**Error Handling:**
- Project config parse error → Show error, attempt partial graph.
- Graph too large (>200 packages) → Suggest filtered view.
- Circular dependency detected → Show cycle path, offer resolution.

**Dependencies:** F-002, F-005.

---

### F-020: Monorepo Task Orchestration
**Phase:** M3 | **Priority:** P0  
**User Story:** As a monorepo user, I want to run tasks across multiple packages with dependency awareness.

**Functional Requirements:**
1. Run task across all packages (e.g., `pnpm -r run build`).
2. Run task across filtered packages (e.g., only changed packages).
3. Topological execution: build dependencies first.
4. Parallel execution within same dependency level.
5. Watch mode: re-run affected packages on file change.
6. Caching: skip packages whose inputs haven't changed.
7. Filter by: package name pattern, changed since last run, changed since git ref.
8. Output aggregation: merged logs or per-package tabs.
9. Progress tracking: X of Y packages completed.
10. Failure handling: stop on first failure or continue all.

**Acceptance Criteria:**
- [ ] AC1: Build all packages runs in correct dependency order.
- [ ] AC2: Parallel execution respects dependency levels.
- [ ] AC3: Watch mode detects file changes in < 500ms.
- [ ] AC4: Caching skips unchanged packages.
- [ ] AC5: Progress shows accurate completion percentage.

**Technical Spec:**
- Rust: Topological sort via `petgraph`. Parallel execution with `tokio::join_all` per level.
- Watch: `notify` crate on package source directories.
- Cache: Hash input files, compare with last run hash stored in SQLite.
- Filter: Git diff to find changed files, map to packages.

**Data Model:** `MonorepoRun { id, task_name, packages, status, started_at, completed_at }`.

**UI/UX:** Monorepo run panel. Package progress grid. Filter chips. Watch toggle.

**Error Handling:**
- Dependency graph cycle → Error, show cycle, abort.
- Package build fails → Show error, offer retry or skip.
- Watch mode file watcher limit → Show warning, suggest selective watch.

**Dependencies:** F-019.

---

### F-021: Interactive Terminal (PTY) Support
**Phase:** M3 | **Priority:** P1  
**User Story:** As a user, I want to interact with processes that require terminal input (e.g., REPLs, interactive CLIs, password prompts).

**Functional Requirements:**
1. Spawn tasks in PTY mode for interactive processes.
2. Full terminal emulation: ANSI escape sequences, cursor movement, colors.
3. Keyboard input forwarding: all keys including special keys (Ctrl+C, arrows, Tab).
4. Terminal size synchronization (resize events forwarded to PTY).
5. Multiple terminal tabs per task.
6. Terminal themes: match app theme (light/dark).
7. Copy/paste support.
8. Search within terminal output.
9. Terminal session recording (optional).
10. Auto-detect when task needs PTY (heuristic: known interactive commands).

**Acceptance Criteria:**
- [ ] AC1: Interactive process (e.g., `python`, `node`) accepts keyboard input.
- [ ] AC2: ANSI colors and cursor movement render correctly.
- [ ] AC3: Terminal resizes without breaking process.
- [ ] AC4: Copy/paste works across all platforms.
- [ ] AC5: Terminal theme matches app theme.

**Technical Spec:**
- Rust: `portable-pty` crate for cross-platform PTY.
- Frontend: `xterm.js` with WebSocket-like Tauri event stream.
- Input: Capture all keyboard events, forward via PTY master.
- Resize: `window.addEventListener('resize')` → Tauri → `pty_master.resize()`.

**Data Model:** `ProcessInstance` with `is_pty: true`, `pty_master: Option<PtyMaster>`.

**UI/UX:** Terminal panel with tabs. xterm.js canvas rendering. Theme sync.

**Error Handling:**
- PTY spawn fails → Fall back to non-PTY mode, show warning.
- Terminal resize unsupported by process → Ignore, log debug.
- Input encoding issues → Use UTF-8, show warning for non-UTF-8.

**Dependencies:** F-010.

---

### F-022: Task Scheduling & Cron
**Phase:** M3 | **Priority:** P2  
**User Story:** As a user, I want to schedule tasks to run at specific times or intervals.

**Functional Requirements:**
1. Cron expression editor with human-readable preview ("Every day at 9 AM").
2. One-time scheduled tasks.
3. Recurring tasks: daily, weekly, monthly, custom cron.
4. Schedule pipelines (not just single tasks).
5. Timezone support.
6. Schedule history: last run, next run, run count.
7. Enable/disable schedules.
8. Schedule conflict detection (same task scheduled twice).
9. Missed run handling (run immediately or skip).
10. Schedule export/import.

**Acceptance Criteria:**
- [ ] AC1: Cron expression validated in real-time.
- [ ] AC2: Schedule triggers within 1 minute of target time.
- [ ] AC3: Next run preview accurate.
- [ ] AC4: Disabled schedule never triggers.
- [ ] AC5: Missed run handled according to configured policy.

**Technical Spec:**
- Rust: `tokio-cron-scheduler` or `cron` crate + `tokio::time::sleep_until`.
- Timezone: `chrono-tz` crate.
- Persistence: Store schedules in SQLite, restore on app start.

**Data Model:** `Schedule { id, task_id_or_pipeline_id, cron_expr, timezone, is_enabled, next_run, last_run, missed_run_policy }`.

**UI/UX:** Schedule list with next run countdown. Cron builder (visual + text). Timezone picker.

**Error Handling:**
- Invalid cron expression → Inline error with suggestion.
- App not running at scheduled time → Check missed runs on startup.
- Schedule triggers while task already running → Queue or skip based on policy.

**Dependencies:** F-010, F-018.

---

### F-023: Task Templates & Sharing
**Phase:** M3 | **Priority:** P2  
**User Story:** As a user, I want to save task configurations as templates and share them with my team.

**Functional Requirements:**
1. Save current task configuration as template.
2. Template gallery: built-in templates for common stacks (React, Next.js, Django, Rails, etc.).
3. Template variables: placeholders for project-specific values (e.g., `{PORT}`, `{APP_NAME}`).
4. Template import from URL or file.
5. Template export to JSON/YAML.
6. Team template sharing via GitHub Gist, URL, or shared directory.
7. Template versioning.
8. Template marketplace (optional, community-driven).
9. Auto-suggest templates based on detected ecosystem.

**Acceptance Criteria:**
- [ ] AC1: Template saved and appears in gallery.
- [ ] AC2: Template variables prompted on apply.
- [ ] AC3: Built-in templates cover top 10 frameworks.
- [ ] AC4: Import from URL validates template format.
- [ ] AC5: Auto-suggest shows relevant templates on project open.

**Technical Spec:**
- Rust: Template stored as JSON in SQLite + filesystem cache.
- Variables: Mustache-style `{{var}}` syntax.
- Marketplace: HTTP fetch from configured registry URL.

**Data Model:** `TaskTemplate { id, name, description, category, variables, tasks, source }`.

**UI/UX:** Template gallery grid. Apply modal with variable inputs. Import/export buttons.

**Error Handling:**
- Template validation fails → Show error, don't save.
- Marketplace unreachable → Show cached templates, offline indicator.
- Variable missing on apply → Prompt user, don't fail silently.

**Dependencies:** F-008.

---

## MILESTONE 4: AI-Native Tooling & Intelligence
**Goal:** AI assists users with task discovery, optimization, troubleshooting, and automation.

---

### F-024: AI Safety Layer
**Phase:** M4 | **Priority:** P0  
**User Story:** As a user, I want AI to suggest but never accidentally run destructive commands or expose secrets.

**Functional Requirements:**
1. AI has READ-ONLY access to project state, tasks, logs, and config.
2. AI generates plans (sequence of operations) in structured format.
3. Plan displayed to user with human-readable explanation.
4. User must explicitly approve each plan before execution.
5. Each planned operation creates a checkpoint before execution.
6. After execution, AI validates result and reports success/failure.
7. Rollback available if AI operation fails.
8. AI cannot access: credentials, env vars (values), SSH keys, tokens.
9. All AI interactions logged for audit.
10. AI context window excludes: `.env` files, secret values, private keys.

**Acceptance Criteria:**
- [ ] AC1: AI analysis shows "Read-only analysis complete" badge.
- [ ] AC2: Plan modal shows each step with preview.
- [ ] AC3: User must click "Approve and Execute" for each plan.
- [ ] AC4: Failed AI operation auto-rolls back.
- [ ] AC5: No secrets exposed to AI context.

**Technical Spec:**
- Rust: AI tools registry. Each tool has `can_mutate: bool` flag. Mutating tools require approval.
- MCP: Implement Model Context Protocol server exposing read-only task tools.
- Plan format: JSON array of operations with `type`, `args`, `risk_level`.

**Data Model:** `AiPlan { id, prompt, steps: Vec<AiStep>, status, user_approved }`. `AiStep { operation, args, risk_level, checkpoint_id }`.

**UI/UX:** AI panel (sidebar or bottom). Chat interface. Plan preview modal with red/green indicators. Approve/Reject buttons.

**Error Handling:**
- AI hallucinates invalid operation → Validate against allowed operations, reject.
- Execution fails mid-plan → Rollback completed steps.

**Dependencies:** All mutating features.

---

### F-025: Natural Language Task Operations
**Phase:** M4 | **Priority:** P1  
**User Story:** As a user, I want to type "start my dev server and the database" and have it done.

**Functional Requirements:**
1. Chat input for natural language commands.
2. Examples:
   - "Start dev mode" → Start all tasks categorized as DevServer
   - "Run tests and show me failures" → Run test tasks, filter logs for errors
   - "Why is my server crashing?" → Analyze logs, suggest fixes
   - "Set up a new React project" → Create project, detect/create tasks, set env vars
   - "Clean up stopped processes" → Remove zombie processes, clear old logs
3. AI translates to task operations plan.
4. Preview shown before execution.
5. Execute on approval.
6. Explain what was done in plain English.
7. Context awareness: knows current project, running tasks, recent failures.

**Acceptance Criteria:**
- [ ] AC1: "Start dev mode" starts all DevServer tasks.
- [ ] AC2: "Run tests" identifies test tasks and runs them.
- [ ] AC3: Complex requests broken into multiple steps.
- [ ] AC4: Explanation clear enough for beginners.

**Technical Spec:**
- LLM prompt engineering with structured output (JSON mode).
- Context: Current project state (tasks, running processes, recent logs) provided as system prompt context.
- Tool calling: LLM selects from available task tools.

**Data Model:** `NlTaskRequest { prompt, generated_plan: AiPlan, execution_result: Option<String> }`.

**UI/UX:** Chat panel with suggestion chips. Plan preview cards. Execution progress.

**Error Handling:**
- Ambiguous request → AI asks clarifying question.
- Unsupported operation → "I can't do that yet, but here's the manual way."
- LLM unavailable → Show error, fallback to manual.

**Dependencies:** F-024.

---

### F-026: AI Task Suggestion & Auto-Configuration
**Phase:** M4 | **Priority:** P1  
**User Story:** As a user, I want AI to suggest missing tasks based on my project structure.

**Functional Requirements:**
1. Analyze project files to suggest missing tasks.
2. Examples:
   - Detect `Dockerfile` but no Docker tasks → Suggest build/run tasks
   - Detect `jest.config.js` but no test task → Suggest `jest --watch`
   - Detect `tailwind.config.js` → Suggest `tailwindcss --watch`
   - Detect `prisma/schema.prisma` → Suggest `prisma migrate dev`, `prisma studio`
3. Suggest environment variables based on detected frameworks.
4. Suggest task groups (e.g., "Full Stack Dev" = frontend + backend + db).
5. Suggest pipeline templates based on project type.
6. One-click apply suggestion.
7. Confidence score per suggestion.
8. Dismiss suggestions permanently.

**Acceptance Criteria:**
- [ ] AC1: Suggestions generated within 3 seconds of project open.
- [ ] AC2: Suggestions relevant to detected frameworks.
- [ ] AC3: One-click creates task with correct configuration.
- [ ] AC4: Low confidence suggestions flagged for review.
- [ ] AC5: Dismissed suggestions never reappear.

**Technical Spec:**
- LLM context: File tree, detected ecosystems, existing tasks, framework patterns.
- Prompt: "Analyze this project and suggest missing development tasks."
- Validation: Check if suggested command exists in PATH before showing.

**Data Model:** `AiSuggestion { id, project_id, type, content, confidence, applied, dismissed }`.

**UI/UX:** Suggestion cards in sidebar. "Apply" and "Dismiss" buttons. Confidence badge.

**Error Handling:**
- Suggestion command not found → Don't show, or show with "Install X first" note.
- LLM timeout → Show cached suggestions or "Try again later".
- Duplicate suggestion → Merge with existing, update confidence.

**Dependencies:** F-024.

---

### F-027: AI Log Analysis & Troubleshooting
**Phase:** M4 | **Priority:** P1  
**User Story:** As a user, I want AI to analyze my task logs and suggest fixes when things go wrong.

**Functional Requirements:**
1. Detect error patterns in logs automatically.
2. Suggest fixes based on error type:
   - Port in use → Suggest changing port or killing existing process
   - Module not found → Suggest `npm install` or checking package.json
   - Database connection failed → Suggest checking env vars or starting DB service
   - TypeScript compilation error → Suggest fixing specific file
   - Docker image not found → Suggest `docker pull` or checking image name
3. Show relevant documentation links.
4. One-click apply fix (if safe and approved).
5. Log summarization: "Your build failed because of 3 TypeScript errors in src/components."
6. Compare logs across runs: "This error started after the last commit."
7. Anomaly detection: "CPU usage spiked to 95% during test run."

**Acceptance Criteria:**
- [ ] AC1: Error detected within 5 seconds of log output.
- [ ] AC2: Suggestion relevant to error type.
- [ ] AC3: One-click fix works for safe operations (e.g., port change).
- [ ] AC4: Log summary accurate and actionable.
- [ ] AC5: Anomaly detection catches unusual patterns.

**Technical Spec:**
- LLM context: Log lines (last 100), task config, project state.
- Error patterns: Pre-built regex + LLM analysis.
- Fixes: Map error types to safe operations (read-only analysis first, then suggest mutation).

**Data Model:** `AiAnalysis { id, process_id, error_type, suggestion, confidence, applied }`.

**UI/UX:** Error badge on task card. Suggestion panel in log viewer. "Fix it" button with approval flow.

**Error Handling:**
- Analysis timeout → Show partial results.
- False positive → Allow dismiss with "Not helpful" feedback.
- Fix application fails → Show error, offer manual resolution.

**Dependencies:** F-024, F-011.

---

### F-028: AI Environment Optimization
**Phase:** M4 | **Priority:** P2  
**User Story:** As a user, I want AI to suggest optimal environment variable configurations for my project.

**Functional Requirements:**
1. Analyze project type and suggest standard env vars.
2. Examples:
   - Node.js → `NODE_ENV`, `PORT`, `DATABASE_URL`
   - Rails → `RAILS_ENV`, `DATABASE_URL`, `REDIS_URL`
   - Django → `DEBUG`, `SECRET_KEY`, `DATABASE_URL`
   - Docker → `COMPOSE_PROJECT_NAME`, `DOCKER_DEFAULT_PLATFORM`
3. Detect missing required env vars from framework documentation.
4. Suggest `.env.example` generation from current env vars.
5. Detect sensitive values and suggest moving to secrets manager.
6. Validate env var values (e.g., URL format, port number range).
7. Suggest env var descriptions for team documentation.

**Acceptance Criteria:**
- [ ] AC1: Standard env vars suggested for detected framework.
- [ ] AC2: Missing required vars flagged.
- [ ] AC3: `.env.example` generated with non-secret values.
- [ ] AC4: Sensitive values detected and flagged.
- [ ] AC5: Validation catches invalid URL/port formats.

**Technical Spec:**
- LLM context: Detected frameworks, existing env vars, project files.
- Framework knowledge base: Embedded in prompt or retrieved from docs.
- Validation: Regex patterns for common formats.

**Data Model:** `AiEnvSuggestion { id, project_id, key, suggested_value, reason, is_secret, applied }`.

**UI/UX:** Env var panel with AI suggestions. "Add" and "Ignore" buttons. Sensitivity warning badge.

**Error Handling:**
- Framework not recognized → Generic suggestions only.
- Secret detection false positive → Allow dismiss.
- Validation conflict → Show both values, let user choose.

**Dependencies:** F-015, F-024.

---
END OF CHUNK 3: Milestone 3-4 Features (Advanced Runner, Monorepo, AI)
```

## 4. tyrerun_spec_chunk_4.md

```md
## MILESTONE 5: Enterprise, Plugin SDK & Ecosystem
**Goal:** Extensible platform with enterprise features, plugin system, and deep integrations.

---

### F-029: Plugin System Architecture
**Phase:** M5 | **Priority:** P3  
**User Story:** As a developer, I want to extend TyeRun with custom plugins.

**Functional Requirements:**
1. Plugin manifest format (JSON).
2. Plugin types:
   - **Ecosystem Adapter:** Add support for new task runner (e.g., Maven, Gradle, Bazel).
   - **Task Action:** Add custom actions to task context menu.
   - **Panel:** Add custom UI panels.
   - **Theme:** Custom color schemes and icons.
   - **AI Tool:** Add custom AI capabilities.
   - **Notification:** Custom notification channels (Slack, Discord, etc.).
3. Plugin API:
   - Read project state
   - Register custom commands
   - Add UI components (React)
   - React to task events (start, stop, fail)
   - Access AI tool registry
   - Register new ecosystem detectors
4. Plugin marketplace/discovery (optional).
5. Plugin sandboxing (WASM or restricted JS via Deno).
6. Plugin settings UI.
7. Enable/disable plugins.
8. Plugin permissions system (read-only vs read-write).

**Acceptance Criteria:**
- [ ] AC1: Plugin loads and registers successfully.
- [ ] AC2: Custom panel appears in UI.
- [ ] AC3: Task event hooks execute in correct order.
- [ ] AC4: Disabled plugin has no performance impact.
- [ ] AC5: Plugin permissions enforced (read-only can't modify tasks).

**Technical Spec:**
- Tauri: Plugin system via Tauri plugins or custom WASM runtime.
- API: Expose selected Rust functions via structured IPC.
- Sandboxing: WASMtime or Deno runtime for untrusted plugins.
- Permissions: Declared in manifest, enforced at runtime.

**Data Model:** `PluginManifest { name, version, author, entry_point, permissions, hooks, type }`.

**UI/UX:** Settings > Plugins. List with toggle. Install from file or marketplace. Permission viewer.

**Error Handling:**
- Plugin crash → Isolate, show error, disable plugin.
- Permission violation → Block and warn user.
- Plugin incompatible with app version → Show error, suggest update.

**Dependencies:** Core app stable.

---

### F-030: Team Project Sharing
**Phase:** M5 | **Priority:** P2  
**User Story:** As a team lead, I want to share project configurations with my team so everyone has the same development environment.

**Functional Requirements:**
1. Export project config as shareable file (`.tyrerun.json` or `.tyrerun.yaml`).
2. Import project config from file.
3. Git integration: commit `.tyrerun.json` to repo for versioned sharing.
4. Team defaults: shared task groups, environment templates, pipeline templates.
5. User overrides: personal env vars, local port preferences.
6. Merge strategy: team config + user overrides = effective config.
7. Config validation on import.
8. Config diff viewer (compare team vs local).
9. Auto-sync: detect changes to `.tyrerun.json` and prompt to reload.
10. Template project: create from team template URL.

**Acceptance Criteria:**
- [ ] AC1: Export produces valid JSON with all tasks and settings.
- [ ] AC2: Import creates identical project configuration.
- [ ] AC3: Git-tracked config auto-detected on project open.
- [ ] AC4: User overrides preserved across team config updates.
- [ ] AC5: Auto-sync prompt appears within 5 seconds of file change.

**Technical Spec:**
- Rust: Serialize/deserialize project config to JSON/YAML.
- Git: Watch `.tyrerun.json` with `notify` crate.
- Merge: Deep merge with precedence: user > team > defaults.

**Data Model:** `ProjectConfig { team_config: Option<Json>, user_overrides: Json, effective_config: Json }`.

**UI/UX:** Settings > Team. Export/import buttons. Diff viewer. Auto-sync toggle.

**Error Handling:**
- Import validation fails → Show errors, don't apply.
- Merge conflict → Show diff, let user choose.
- Git conflict on `.tyrerun.json` → Show standard Git conflict resolution.

**Dependencies:** F-009.

---

### F-031: Enterprise Compliance & Audit
**Phase:** M5 | **Priority:** P3  
**User Story:** As an enterprise user, I need compliance, audit logs, and policy enforcement.

**Functional Requirements:**
1. Audit log of all operations: who, what, when, result.
2. Immutable audit log (append-only, tamper-evident checksums).
3. Compliance reporting (CSV/JSON export).
4. Policy enforcement:
   - Restricted commands (block `rm -rf /`, `sudo`, etc.)
   - Required environment variables (e.g., `NODE_ENV=production` for deploy)
   - Max resource limits per task
   - Allowed ecosystems only
5. Centralized configuration (enterprise defaults).
6. SSO/SAML authentication (optional).
7. Data loss prevention (DLP) scanning in env vars and commands.
8. Mandatory review for destructive operations.
9. Audit log streaming to SIEM (Splunk, Datadog, etc.).

**Acceptance Criteria:**
- [ ] AC1: Every operation logged with timestamp and user.
- [ ] AC2: Audit log append-only, can't be modified.
- [ ] AC3: Policy violation blocks operation with explanation.
- [ ] AC4: Compliance report exportable as CSV.
- [ ] AC5: DLP scan detects secrets in env vars before save.

**Technical Spec:**
- Rust: Append-only SQLite table with SHA-256 chain of hashes.
- Policy engine: Configurable rules in JSON/YAML, evaluated before each operation.
- DLP: Regex + entropy scanning (like GitLeaks).
- SIEM: HTTP POST or syslog streaming.

**Data Model:** `AuditLogEntry { id, timestamp, user, project_id, operation, args, result, checksum, prev_checksum }`. `PolicyRule { type, severity, enabled, config }`.

**UI/UX:** Settings > Enterprise. Policy editor. Audit log viewer with search. Export button.

**Error Handling:**
- Policy violation → Block operation, show rule violated.
- Audit log full → Warn admin, rotate logs.
- DLP false positive → Allow dismiss with justification.

**Dependencies:** F-030.

---

### F-032: Custom Themes & Appearance
**Phase:** M5 | **Priority:** P3  
**User Story:** As a user, I want to customize the app's appearance to match my preferences.

**Functional Requirements:**
1. Built-in themes: Light, Dark, High Contrast, System, GitHub Dark, Dracula, Solarized.
2. Custom theme editor: colors for backgrounds, text, accents, task cards, logs, terminal.
3. Import/export theme JSON.
4. Font family and size selection (monospace for logs, UI font).
5. Density settings: compact, comfortable, spacious.
6. Sidebar position: left, right, hidden.
7. Panel arrangement: drag and drop.
8. Task card size: compact, detailed.
9. Log viewer themes: match app or custom terminal themes.
10. Animation speed: fast, normal, slow, none.

**Acceptance Criteria:**
- [ ] AC1: Theme changes apply immediately without restart.
- [ ] AC2: Custom theme persists across sessions.
- [ ] AC3: Log colors customizable independently.
- [ ] AC4: Font changes affect all code views.
- [ ] AC5: Density changes reflow layout without reload.

**Technical Spec:**
- CSS variables or Tailwind config dynamic injection.
- Theme stored in SQLite settings.
- Terminal themes: xterm.js theme API.

**Data Model:** `Theme { name, colors: ThemeColors, font_family, font_size, density, layout_config }`.

**UI/UX:** Settings > Appearance. Color picker. Live preview. Import/export buttons.

**Error Handling:**
- Invalid color format → Reject with error.
- Font not found → Fallback to system default.
- Theme parse error → Revert to default, show error.

**Dependencies:** None.

---

### F-033: Keyboard Shortcuts & Command Palette
**Phase:** M5 | **Priority:** P2  
**User Story:** As a power user, I want keyboard-driven workflows.

**Functional Requirements:**
1. Command palette (Ctrl/Cmd+Shift+P) with fuzzy search.
2. All actions accessible via command palette.
3. Configurable keyboard shortcuts.
4. Preset keymaps: Default, VS Code, Vim, Emacs, mprocs.
5. Shortcut conflict detection.
6. Cheat sheet viewer (printable).
7. Context-aware shortcuts:
   - Global shortcuts (app-level)
   - Task panel shortcuts
   - Log viewer shortcuts
   - Pipeline builder shortcuts
8. Quick task launch: Cmd+1, Cmd+2, etc. for first 9 tasks.
9. Quick group launch: Cmd+Shift+1, etc.
10. Vim mode for log viewer (j/k scroll, / search, etc.).

**Acceptance Criteria:**
- [ ] AC1: Command palette opens in < 100ms.
- [ ] AC2: Fuzzy search finds "start dev" from "sd".
- [ ] AC3: Custom shortcuts saved immediately.
- [ ] AC4: Conflict shows warning and suggests alternative.
- [ ] AC5: Vim mode works in log viewer.

**Technical Spec:**
- Frontend: `cmdk` or custom command palette component.
- Registry: Map action IDs to shortcuts. Validate on change.
- Vim mode: Custom key handler in log viewer component.

**Data Model:** `Keybinding { action_id, keys, context }`.

**UI/UX:** Settings > Keyboard. Table with editable shortcuts. Command palette overlay. Cheat sheet modal.

**Error Handling:**
- Invalid key combination → Show error.
- System shortcut conflict → Warn but allow override.
- Keymap import fails → Show error, don't apply.

**Dependencies:** All UI features.

---

### F-034: Git Integration (Suite Product)
**Phase:** M5 | **Priority:** P1  
**User Story:** As a user of both TyeRun and the Git Desktop App, I want seamless integration between them.

**Functional Requirements:**
1. Detect if project is a Git repository.
2. Show Git branch and status in project header.
3. Git hooks integration: pre-commit → run lint task, pre-push → run test task.
4. Task triggers on Git events: on branch switch, on merge, on tag.
5. Show commit history alongside task runs ("What was running when this commit was made?").
6. Git-aware task filtering: "Show only tasks for packages changed in last commit."
7. Shared project metadata: both apps read/write same SQLite database.
8. Launch Git Desktop App from TyeRun (and vice versa) for current project.
9. Git status badge on project card (clean, dirty, ahead/behind).

**Acceptance Criteria:**
- [ ] AC1: Git branch shown in project header.
- [ ] AC2: Pre-commit hook runs lint task successfully.
- [ ] AC3: Git event triggers task pipeline.
- [ ] AC4: Shared database accessible by both apps.
- [ ] AC5: Launch other app opens current project.

**Technical Spec:**
- Rust: `git2` crate for Git operations (same as Git Desktop App).
- Hooks: Write `.git/hooks/pre-commit` script that calls TyeRun IPC.
- Shared DB: SQLite in project root `.tyrerun/` directory.
- Launch: Use OS-specific app launch APIs.

**Data Model:** Shared `projects` table. Git metadata stored in project record.

**UI/UX:** Git badge in header. Hook configuration panel. "Open in Git App" button.

**Error Handling:**
- Git not installed → Show warning, disable Git features.
- Hook write fails (permissions) → Show error, suggest manual setup.
- Shared DB locked by other app → Queue writes, retry.

**Dependencies:** Git Desktop App (optional).

---

## MILESTONE 6: Performance, Reliability & Polish
**Goal:** App is fast, reliable, and delightful to use at scale.

---

### F-035: Performance & Resource Optimization
**Phase:** M6 | **Priority:** P0  
**User Story:** As a user with many tasks and large logs, I want the app to stay fast and not consume excessive resources.

**Functional Requirements:**
1. **Log Virtualization:** Only render visible log lines (react-window or custom virtual list).
2. **Log Truncation:** Automatic truncation of old logs (configurable: keep last N lines, N hours, or N MB).
3. **Log Compression:** Compress historical logs in SQLite (zstd or gzip).
4. **Lazy Loading:** Load task details and logs on demand.
5. **Process Throttling:** Limit concurrent process starts to prevent system overload.
6. **Memory Monitoring:** Alert if app memory usage exceeds threshold.
7. **Background Process Cleanup:** Detect and kill orphaned processes on app crash/exit.
8. **Startup Optimization:** Parallel task detection, lazy UI rendering.
9. **GPU Acceleration:** Use CSS transforms for animations, Canvas 2D for graphs.
10. **Database Optimization:** Indexed queries, periodic VACUUM.

**Acceptance Criteria:**
- [ ] AC1: 100k log lines scroll at 60fps.
- [ ] AC2: App memory stays under 500MB with 20 running tasks.
- [ ] AC3: Startup to dashboard in < 2 seconds.
- [ ] AC4: Orphaned processes cleaned up on app exit.
- [ ] AC5: Database queries complete in < 50ms.

**Technical Spec:**
- Frontend: Virtualized lists, memoized components, lazy imports.
- Rust: Ring buffers for logs, background compression task, process reaper on SIGTERM.
- Database: Proper indexing, query optimization, WAL mode for SQLite.

**Data Model:** Log retention policies per project.

**UI/UX:** Performance indicator in status bar. Settings > Performance.

**Error Handling:**
- Memory limit exceeded → Show warning, suggest closing tasks.
- Database corruption → Show error, offer rebuild from logs.
- Orphaned process detection fails → Log warning, manual cleanup guide.

**Dependencies:** All previous features.

---

### F-036: Backup & Recovery
**Phase:** M6 | **Priority:** P1  
**User Story:** As a user, I want my project configurations and logs backed up and recoverable.

**Functional Requirements:**
1. Automatic backup of project configs to `.tyrerun/backups/`.
2. Backup on significant changes (task creation, pipeline modification).
3. Restore from backup (select backup, preview, apply).
4. Export all project data (tasks, logs, pipelines, env vars) to archive.
5. Import from archive.
6. Cloud backup option (optional, encrypted): iCloud, Google Drive, Dropbox.
7. Backup retention: keep last N backups, auto-delete old ones.
8. Disaster recovery: restore all projects from backup on fresh install.

**Acceptance Criteria:**
- [ ] AC1: Backup created within 1 second of significant change.
- [ ] AC2: Restore from backup recreates exact project state.
- [ ] AC3: Export produces valid archive file.
- [ ] AC4: Import from archive restores all data.
- [ ] AC5: Cloud backup syncs within 1 minute of change.

**Technical Spec:**
- Rust: Serialize project data to JSON, compress to tar.gz or zip.
- Cloud: Use OS-specific cloud APIs or OAuth-based sync.
- Retention: Background task cleans old backups.

**Data Model:** `Backup { id, project_id, timestamp, size_bytes, path, cloud_url }`.

**UI/UX:** Settings > Backup. Backup list with restore buttons. Export/import buttons. Cloud sync toggle.

**Error Handling:**
- Backup write fails (disk full) → Show error, suggest different location.
- Restore fails (incompatible version) → Show error, offer migration.
- Cloud sync fails → Retry with backoff, show offline indicator.

**Dependencies:** All previous features.

---

### F-037: Accessibility (a11y)
**Phase:** M6 | **Priority:** P1  
**User Story:** As a user with disabilities, I want the app to be fully accessible.

**Functional Requirements:**
1. Full keyboard navigation (Tab, Arrow keys, Enter, Escape).
2. Screen reader support (ARIA labels, roles, live regions).
3. High contrast mode.
4. Font size scaling (respects OS settings).
5. Color-blind friendly status indicators (not just color: icons + patterns).
6. Reduced motion support (respects `prefers-reduced-motion`).
7. Focus indicators visible and clear.
8. Log viewer accessible (screen reader can read logs).
9. Task cards accessible (role, state, actions).
10. WCAG 2.1 AA compliance.

**Acceptance Criteria:**
- [ ] AC1: All features accessible via keyboard only.
- [ ] AC2: Screen reader announces task status changes.
- [ ] AC3: High contrast mode passes contrast ratio checks.
- [ ] AC4: Color-blind users can distinguish all status states.
- [ ] AC5: Reduced motion disables all animations.

**Technical Spec:**
- React: Radix UI primitives (built-in a11y). Custom components with ARIA.
- Testing: axe-core automated testing. Manual screen reader testing.

**UI/UX:** Settings > Accessibility. Toggle for each option.

**Error Handling:**
- ARIA attribute missing → Caught by automated testing.
- Focus trap issues → Manual testing, fix in component.

**Dependencies:** All UI features.

---
END OF CHUNK 4: Milestone 5-6 Features (Enterprise, Plugin SDK, Security, Performance)
```

## 5. tyrerun_spec_chunk_5.md

```md
# SECTION 4: API SPECIFICATION (Frontend ↔ Backend)

## 4.1 IPC Command Registry
All commands prefixed with `run:` (TyeRun).

| Command | Input | Output | Mutates | Phase |
|---------|-------|--------|---------|-------|
| `run:discover_projects` | `{ paths: Vec<String>, max_depth: number }` | `Vec<ProjectCard>` | No | M1 |
| `run:detect_tasks` | `{ project_id, ecosystem? }` | `Vec<Task>` | Yes | M1 |
| `run:open_project` | `{ path }` | `Project` | Yes | M1 |
| `run:close_project` | `{ project_id }` | `bool` | No | M1 |
| `run:create_task` | `CreateTaskRequest` | `Task` | Yes | M1 |
| `run:update_task` | `Task` | `Task` | Yes | M1 |
| `run:delete_task` | `{ task_id }` | `bool` | Yes | M1 |
| `run:get_project_config` | `{ project_id }` | `ProjectConfig` | No | M1 |
| `run:update_project_config` | `ProjectConfig` | `bool` | Yes | M1 |
| `run:start_task` | `{ task_id, env_overrides? }` | `ProcessInstance` | Yes | M2 |
| `run:stop_task` | `{ process_id }` | `bool` | Yes | M2 |
| `run:restart_task` | `{ process_id, clear_logs? }` | `ProcessInstance` | Yes | M2 |
| `run:kill_task` | `{ process_id }` | `bool` | Yes | M2 |
| `run:get_process_status` | `{ process_id }` | `ProcessInstance` | No | M2 |
| `run:get_logs` | `{ process_id, offset?, limit?, filter? }` | `Vec<LogLine>` | No | M2 |
| `run:search_logs` | `{ project_id, query, regex?, time_range? }` | `Vec<LogLine>` | No | M2 |
| `run:send_input` | `{ process_id, input: String }` | `bool` | Yes | M2 |
| `run:resize_pty` | `{ process_id, cols, rows }` | `bool` | Yes | M2 |
| `run:get_health` | `{ process_id }` | `ProcessHealth` | No | M2 |
| `run:get_port_map` | `{ project_id }` | `Vec<PortMapping>` | No | M2 |
| `run:resolve_port_conflict` | `{ port, strategy }` | `PortResolution` | Yes | M2 |
| `run:create_group` | `TaskGroup` | `TaskGroup` | Yes | M2 |
| `run:update_group` | `TaskGroup` | `TaskGroup` | Yes | M2 |
| `run:delete_group` | `{ group_id }` | `bool` | Yes | M2 |
| `run:run_group` | `{ group_id }` | `Vec<ProcessInstance>` | Yes | M2 |
| `run:stop_group` | `{ group_id }` | `bool` | Yes | M2 |
| `run:get_environments` | `{ project_id }` | `Vec<Environment>` | No | M2 |
| `run:create_environment` | `Environment` | `Environment` | Yes | M2 |
| `run:update_environment` | `Environment` | `Environment` | Yes | M2 |
| `run:set_active_environment` | `{ project_id, env_id }` | `bool` | Yes | M2 |
| `run:validate_env_refs` | `{ project_id }` | `Vec<EnvValidationResult>` | No | M2 |
| `run:create_pipeline` | `Pipeline` | `Pipeline` | Yes | M3 |
| `run:update_pipeline` | `Pipeline` | `Pipeline` | Yes | M3 |
| `run:delete_pipeline` | `{ pipeline_id }` | `bool` | Yes | M3 |
| `run:run_pipeline` | `{ pipeline_id }` | `PipelineRun` | Yes | M3 |
| `run:cancel_pipeline` | `{ pipeline_run_id }` | `bool` | Yes | M3 |
| `run:get_pipeline_runs` | `{ pipeline_id, limit? }` | `Vec<PipelineRun>` | No | M3 |
| `run:get_monorepo_graph` | `{ project_id }` | `DependencyGraph` | No | M3 |
| `run:run_monorepo_task` | `{ project_id, task_name, filter? }` | `MonorepoRun` | Yes | M3 |
| `run:create_schedule` | `Schedule` | `Schedule` | Yes | M3 |
| `run:update_schedule` | `Schedule` | `Schedule` | Yes | M3 |
| `run:delete_schedule` | `{ schedule_id }` | `bool` | Yes | M3 |
| `run:get_schedules` | `{ project_id }` | `Vec<Schedule>` | No | M3 |
| `run:ai_analyze_project` | `{ project_id }` | `AiAnalysisResult` | No | M4 |
| `run:ai_suggest_tasks` | `{ project_id }` | `Vec<AiSuggestion>` | No | M4 |
| `run:ai_troubleshoot` | `{ process_id }` | `AiTroubleshootResult` | No | M4 |
| `run:ai_execute_plan` | `{ plan_id }` | `AiPlanResult` | Yes | M4 |
| `run:ai_chat` | `{ project_id, message }` | `AiChatResponse` | No | M4 |
| `run:export_project` | `{ project_id, format }` | `PathBuf` | No | M5 |
| `run:import_project` | `{ path, format }` | `Project` | Yes | M5 |
| `run:get_plugins` | `{}` | `Vec<PluginManifest>` | No | M5 |
| `run:install_plugin` | `{ path_or_url }` | `PluginManifest` | Yes | M5 |
| `run:toggle_plugin` | `{ plugin_id, enabled }` | `bool` | Yes | M5 |
| `run:get_audit_log` | `{ limit?, offset? }` | `Vec<AuditLogEntry>` | No | M5 |
| `run:get_settings` | `{ scope? }` | `Vec<Setting>` | No | M6 |
| `run:update_settings` | `Vec<Setting>` | `bool` | Yes | M6 |
| `run:get_backups` | `{ project_id? }` | `Vec<Backup>` | No | M6 |
| `run:create_backup` | `{ project_id }` | `Backup` | Yes | M6 |
| `run:restore_backup` | `{ backup_id }` | `Project` | Yes | M6 |
| `run:get_git_status` | `{ project_id }` | `GitStatus` | No | M5 |
| `run:configure_git_hooks` | `{ project_id, hooks }` | `bool` | Yes | M5 |

> **UNIFIED:** `run:get_git_status` delegates to `git:get_status` via `tye-git-engine`
> when linked (Hub, or Tyegit-installed-alongside); returns `has_git: false` gracefully
> in standalone TyeRun builds that don't link the git engine. `run:configure_git_hooks`
> writes hooks that call back into `run:run_pipeline`, realizing "pre-commit → lint"
> without a second git implementation (Master Spec Part E.2 / audit note on B.5).

## 4.2 Event Stream (Backend → Frontend)
| Event | Payload | Description |
|-------|---------|-------------|
| `run:project_changed` | `{ project_id, change_type }` | Project config or tasks changed |
| `run:task_detected` | `{ project_id, tasks: Vec<Task> }` | New tasks auto-detected |
| `run:process_started` | `{ process_id, task_id, pid }` | Process spawned successfully |
| `run:process_output` | `{ process_id, lines: Vec<LogLine> }` | New stdout/stderr output |
| `run:process_stopped` | `{ process_id, exit_code, reason }` | Process exited |
| `run:process_status_changed` | `{ process_id, status: ProcessStatus }` | Status transition |
| `run:health_changed` | `{ process_id, health: ProcessHealth }` | Health metrics updated |
| `run:port_changed` | `{ process_id, ports: Vec<PortMapping> }` | Port bindings changed |
| `run:group_status_changed` | `{ group_id, status: GroupStatus }` | Group aggregate status changed |
| `run:pipeline_run_update` | `{ run_id, stage_id, status }` | Pipeline stage status update |
| `run:pipeline_run_complete` | `{ run_id, status, duration_ms }` | Pipeline finished |
| `run:notification` | `{ type, title, message, action? }` | User notification |
| `run:ai_plan_ready` | `{ plan }` | AI plan generated for approval |
| `run:ai_suggestion` | `{ suggestion }` | New AI suggestion available |
| `run:ai_chat_response` | `{ message, is_complete }` | Streaming AI chat response |
| `run:config_file_changed` | `{ project_id, file_path }` | `.tyrerun.json` or task config changed |
| `run:schedule_triggered` | `{ schedule_id, next_run }` | Scheduled task triggered |
| `run:audit_log_entry` | `{ entry }` | New audit log entry |

---

# SECTION 5: UI/UX COMPONENT MAP

## 5.1 Core Layout
```
AppWindow
├── TitleBar (custom for Tauri: project name, running count, window controls)
├── MenuBar (File, Edit, View, Project, Task, Tools, Help)
├── Toolbar (Start All, Stop All, Restart Failed, Environment, Pipeline buttons)
├── MainLayout (split panes, resizable)
│   ├── Sidebar (collapsible, 280px default)
│   │   ├── ProjectNavigator (project list, pinned, recent)
│   │   ├── TaskList (all tasks, grouped by category/ecosystem)
│   │   ├── TaskGroups (user-defined groups)
│   │   ├── Pipelines (pipeline list)
│   │   ├── MonorepoPackages (package graph thumbnail)
│   │   └── Environments (env profiles)
│   ├── CenterPanel (tabbed)
│   │   ├── TaskGridView (cards with status, health, ports)
│   │   ├── TaskListView (compact table)
│   │   ├── LogViewer (terminal-like output panel)
│   │   ├── PipelineBuilder (visual canvas)
│   │   ├── MonorepoGraph (interactive dependency graph)
│   │   └── PortMap (visual port usage map)
│   └── RightPanel (collapsible, 320px default)
│       ├── TaskDetailPanel (config, env vars, health)
│       ├── LogFilterPanel (search, severity, bookmarks)
│       ├── HealthPanel (graphs, alerts)
│       └── AiPanel (chat, suggestions, analysis)
├── BottomPanel (collapsible, 200px default)
│   ├── TerminalPanel (PTY terminal for interactive tasks)
│   ├── NotificationPanel (toasts, alerts, history)
│   └── ProgressPanel (pipeline progress, monorepo run progress)
└── Modals (overlay)
    ├── OpenProjectModal
    ├── CreateTaskModal
    ├── CreateGroupModal
    ├── PipelineBuilderModal
    ├── EnvironmentEditorModal
    ├── PortConflictModal
    ├── AiPlanApprovalModal
    ├── SettingsModal
    ├── CommandPaletteModal
    └── BackupRestoreModal
```

## 5.2 Component Inventory (React)
| Component | File | Props | State | Phase |
|-----------|------|-------|-------|-------|
| `AppShell` | `AppShell.tsx` | `theme` | `sidebarOpen, rightPanelOpen, bottomPanelOpen` | M1 |
| `ProjectCard` | `ProjectCard.tsx` | `project: ProjectCard` | `hover` | M1 |
| `Dashboard` | `Dashboard.tsx` | `projects` | `filter, searchQuery` | M1 |
| `TaskCard` | `TaskCard.tsx` | `task: Task, process?: ProcessInstance` | `expanded, hover` | M2 |
| `TaskList` | `TaskList.tsx` | `tasks, selectedId` | `filter, sortKey, groupBy` | M2 |
| `LogViewer` | `LogViewer.tsx` | `processId, lines` | `searchQuery, filter, wrap, timestamps` | M2 |
| `HealthBadge` | `HealthBadge.tsx` | `health: ProcessHealth` | `pulse` | M2 |
| `PortBadge` | `PortBadge.tsx` | `port: PortMapping` | `hover` | M2 |
| `TaskGroupCard` | `TaskGroupCard.tsx` | `group: TaskGroup` | `expanded` | M2 |
| `EnvironmentEditor` | `EnvironmentEditor.tsx` | `env: Environment` | `editingKey, editingValue` | M2 |
| `PipelineBuilder` | `PipelineBuilder.tsx` | `pipeline: Pipeline` | `selectedNode, draggingNode` | M3 |
| `PipelineRunViewer` | `PipelineRunViewer.tsx` | `run: PipelineRun` | `selectedStage` | M3 |
| `MonorepoGraph` | `MonorepoGraph.tsx` | `graph: DependencyGraph` | `zoom, pan, selectedPackage` | M3 |
| `MonorepoRunPanel` | `MonorepoRunPanel.tsx` | `run: MonorepoRun` | `filter, viewMode` | M3 |
| `TerminalPanel` | `TerminalPanel.tsx` | `processId, isPty` | `fitAddon` | M3 |
| `AiChatPanel` | `AiChatPanel.tsx` | `projectId` | `messages, isTyping` | M4 |
| `AiPlanPreview` | `AiPlanPreview.tsx` | `plan: AiPlan` | `expandedSteps` | M4 |
| `AiSuggestionCard` | `AiSuggestionCard.tsx` | `suggestion: AiSuggestion` | `hover` | M4 |
| `PortMap` | `PortMap.tsx` | `ports: Vec<PortMapping>` | `hoveredPort` | M2 |
| `NotificationToast` | `NotificationToast.tsx` | `notification` | `visible` | M2 |
| `CommandPalette` | `CommandPalette.tsx` | `open` | `query, selectedIndex` | M5 |
| `SettingsPanel` | `SettingsPanel.tsx` | `activeTab` | `unsavedChanges` | M1 |
| `GitStatusBadge` | `GitStatusBadge.tsx` | `status: GitStatus` | `hover` | M5 |

---

# SECTION 6: STATE MACHINES

## 6.1 Process Lifecycle State Machine
```
[Pending] --start--> [Starting]
[Starting] --spawn_success--> [Running]
[Starting] --spawn_fail--> [Failed]
[Running] --stop_request--> [Stopping]
[Running] --crash--> [Crashed]
[Running] --health_check_fail--> [Unhealthy] (still Running, but flagged)
[Stopping] --graceful_exit--> [Stopped]
[Stopping] --timeout--> [Killing]
[Killing] --kill_success--> [Stopped]
[Killing] --kill_fail--> [Zombie]
[Crashed] --restart_policy--> [Pending] (if auto-restart)
[Stopped] --restart--> [Pending]
[Failed] --retry--> [Pending]
[Zombie] --cleanup--> [Stopped]
```

**Agent Implementation Rule:** Before any operation, check `process.status`. If `Stopping` or `Killing`, reject new operations. If `Zombie`, attempt cleanup first.

## 6.2 Pipeline Run State Machine
```
[Pending] --trigger--> [Running]
[Running] --stage_complete--> [Running] (next stage)
[Running] --stage_fail--> [Failed] (if !allow_failure)
[Running] --stage_fail--> [Running] (if allow_failure, continue)
[Running] --cancel--> [Cancelled]
[Running] --timeout--> [TimedOut]
[Running] --all_stages_complete--> [Succeeded]
[Failed] --retry--> [Pending]
[Cancelled] --retry--> [Pending]
[TimedOut] --retry--> [Pending]
```

## 6.3 AI Operation State Machine
```
[Idle] --user prompt--> [Planning]
[Planning] --plan generated--> [Awaiting Approval]
[Awaiting Approval] --user approves--> [Executing]
[Awaiting Approval] --user rejects--> [Idle]
[Executing] --success--> [Validating]
[Executing] --failure--> [Rolling Back]
[Validating] --valid--> [Idle]
[Validating] --invalid--> [Rolling Back]
[Rolling Back] --success--> [Idle]
[Rolling Back] --failure--> [Recovery Needed]
```

## 6.4 Project State Machine
```
[Closed] --open--> [Detecting]
[Detecting] --complete--> [Ready]
[Detecting] --partial--> [Ready] (with warnings)
[Ready] --task_start--> [Active]
[Active] --all_stopped--> [Ready]
[Active] --close--> [Closed]
[Ready] --config_change--> [Detecting] (re-detect tasks)
[Closed] --delete--> [Deleted]
```

---
END OF CHUNK 5: API Spec + UI/UX Component Map + State Machines
```

## 6. tyrerun_spec_chunk_6.md

```md
# SECTION 7: TESTING MATRIX

## 7.1 Unit Tests (Rust Backend)
| Module | Test Cases | Coverage Target |
|--------|-----------|-----------------|
| `discovery::scanner` | Detect markers, monorepo, exclude patterns, depth limit | 100% |
| `discovery::npm` | Parse package.json, scripts, projects, lockfile detection | 100% |
| `discovery::make` | Parse Makefile targets, .PHONY, includes | 100% |
| `discovery::just` | Parse Justfile recipes, groups, private, arguments | 100% |
| `discovery::docker` | Parse compose services, ports, dependencies | 100% |
| `discovery::cargo` | Parse Cargo.toml, built-in commands, custom scripts | 100% |
| `process::spawner` | Spawn PTY/non-PTY, env vars, cwd, signals | 100% |
| `process::monitor` | Health check, port detection, resource metrics | 100% |
| `process::logs` | Ring buffer, truncation, compression, search | 100% |
| `project::config` | Read/write config, merge team/user, validation | 100% |
| `pipeline::engine` | DAG execution, stage conditions, timeout, retry | 100% |
| `monorepo::graph` | Dependency parsing, topological sort, cycle detection | 100% |
| `monorepo::runner` | Filter, cache, watch, parallel execution | 100% |
| `env::manager` | Parse .env, profiles, secrets, validation | 100% |
| `port::registry` | Detect, conflict, auto-assign, map | 100% |
| `ai::safety` | Plan validation, approval flow, rollback | 100% |
| `ai::analyzer` | Log analysis, error detection, suggestion | 95% |
| `plugin::loader` | Manifest validation, sandbox, permissions | 100% |
| `audit::logger` | Append-only, checksum, tamper detection | 100% |

## 7.2 Integration Tests
| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Open → Detect → Run | Open project, detect npm tasks, start dev server | Server running, logs visible |
| Port Conflict → Resolve | Start two tasks on port 3000, resolve with auto-assign | Both tasks running on different ports |
| Group Parallel → Stop | Create group with 3 tasks, start all, stop group | All 3 processes stopped |
| Pipeline → Fail → Retry | Run lint-test-build pipeline, fail test, retry | Test retries, pipeline continues |
| Monorepo → Build All | Open pnpm monorepo, build all packages | Built in topological order |
| AI Suggest → Apply | AI suggests missing Docker task, user applies | Task created and visible |
| Env Var → Secret Mask | Add secret env var, view in UI | Value masked with dots |
| Git Hook → Pre-commit | Configure pre-commit hook, commit | Lint task runs, commit proceeds if pass |
| Plugin Install → Activate | Install ecosystem plugin, enable | New ecosystem tasks detected |
| Backup → Restore | Create backup, modify project, restore | Original project restored |

## 7.3 E2E Tests (Playwright/Tauri Driver)
| Flow | Critical Path |
|------|--------------|
| First launch → Discover → Open → Start task | P0 |
| Port conflict detection and resolution | P0 |
| Pipeline builder drag-and-drop | P1 |
| Monorepo graph interaction | P1 |
| AI chat → Plan approval → Execute | P1 |
| Plugin install → Custom panel | P3 |
| Accessibility keyboard navigation | P1 |
| Performance: 100k log lines scroll | P1 |

## 7.4 Performance Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| App startup | < 2s | Cold start to dashboard |
| Project open (cached) | < 1s | Click to interactive |
| Project open (cold) | < 5s | First time open with detection |
| Task detection (npm) | < 500ms | package.json parse to task list |
| Task detection (all ecosystems) | < 2s | All parsers complete |
| Task start | < 500ms | Click to process running |
| Log output latency | < 50ms | Process output to UI render |
| Health check update | < 2s | Metric change to UI update |
| Port conflict detection | < 100ms | Start request to resolution dialog |
| Log search (100k lines) | < 1s | Query to results |
| Monorepo graph render (50 packages) | < 2s | First paint |
| Pipeline execution (5 stages) | < 1s | Stage transition |
| AI suggestion generation | < 3s | Project analysis to suggestion |
| AI log analysis | < 5s | Error detection to suggestion |
| Database query | < 50ms | Any SQLite query |
| Memory usage (20 tasks) | < 500MB | App RSS |
| Log scroll (100k lines) | 60fps | Scroll benchmark |

---

# SECTION 8: SECURITY & PRIVACY

## 8.1 Credential Security
- Environment variables: Secret values encrypted with OS keychain (Keychain/Keyring/Secret Service).
- No secret values in logs, AI context, error messages, or exports.
- Memory scrubbing: Zero sensitive strings after use.
- Secret detection: DLP scanning prevents accidental commit of secrets to `.tyrerun.json`.

## 8.2 AI Safety
- AI context window excludes: `.env` files, secret values, private keys, credentials.
- AI mutations require explicit user approval (no auto-execute).
- All AI plans logged with user identity and timestamp.
- Local LLM option for air-gapped environments.
- AI cannot spawn processes directly; only suggest plans.

## 8.3 Process Safety
- Restricted command list: Block `rm -rf /`, `sudo`, `chmod`, etc. (configurable).
- Resource limits: CPU, memory, file descriptor limits per task (configurable).
- Process isolation: Tasks run in their configured cwd, can't escape.
- Orphaned process cleanup: On app exit, graceful shutdown of all managed processes.
- Port binding: Only bind to localhost by default (configurable).

## 8.4 Enterprise Compliance
- Audit log append-only (tamper-evident checksums).
- Configurable data retention policies.
- No telemetry without explicit opt-in.
- SIEM integration for audit streaming.
- SSO/SAML support (optional).

---

# SECTION 9: ERROR CODES & HANDLING

## 9.1 Standardized Error Format
```typescript
interface TyeRunError {
  code: string;           // Machine-readable
  message: string;        // Human-readable
  detail?: string;        // Technical detail
  recoverable: boolean;   // Can user fix and retry?
  suggestion?: string;    // Actionable suggestion
  operation?: string;     // Which operation failed
  checkpoint_id?: string; // Rollback available?
}
```

## 9.2 Error Code Registry
| Code | Message | Recoverable | Suggestion | Phase |
|------|---------|-------------|------------|-------|
| `CORE_PROJECT_NOT_FOUND` | Project directory not found | Yes | Select a valid directory | M1 |
| `RUN_TASK_DETECT_FAILED` | Failed to detect tasks from config | Partial | Check config file syntax | M1 |
| `RUN_TASK_NOT_FOUND` | Task not found in project | Yes | Check task name or re-detect | M1 |
| `RUN_PROCESS_SPAWN_FAILED` | Failed to start process | Yes | Check command exists and is executable | M2 |
| `RUN_PROCESS_ALREADY_RUNNING` | Task is already running | Yes | Stop current instance first | M2 |
| `RUN_PORT_CONFLICT` | Port already in use | Yes | Change port or kill existing process | M2 |
| `RUN_PORT_UNAVAILABLE` | No available ports in range | Yes | Expand port range or free ports | M2 |
| `RUN_ENV_VAR_MISSING` | Required environment variable not set | Yes | Set the variable in environment panel | M2 |
| `RUN_HEALTH_CHECK_FAILED` | Process health check failed | Yes | Check process logs for errors | M2 |
| `RUN_LOG_BUFFER_FULL` | Log buffer reached limit | Yes | Increase buffer size or clear logs | M2 |
| `RUN_GROUP_CIRCULAR_DEP` | Circular dependency in task group | Yes | Remove circular reference | M2 |
| `RUN_PIPELINE_CYCLE` | Circular dependency in pipeline | Yes | Remove cycle before saving | M3 |
| `RUN_PIPELINE_STAGE_TIMEOUT` | Pipeline stage timed out | Yes | Increase timeout or optimize task | M3 |
| `RUN_MONOREPO_CYCLE` | Circular dependency in package graph | Partial | Break cycle manually | M3 |
| `RUN_MONOREPO_CACHE_INVALID` | Build cache invalidation failed | Yes | Clear cache and retry | M3 |
| `RUN_SCHEDULE_INVALID` | Invalid cron expression | Yes | Check cron syntax | M3 |
| `CORE_AI_PLAN_INVALID` | AI generated invalid operation plan | Yes | Reject plan and try different prompt | M4 |
| `CORE_AI_SUGGESTION_INVALID` | AI suggestion validation failed | Yes | Dismiss and try again | M4 |
| `CORE_PLUGIN_INVALID` | Plugin manifest validation failed | Yes | Check manifest format | M5 |
| `CORE_PLUGIN_PERMISSION_DENIED` | Plugin lacks required permission | Yes | Enable permission in settings | M5 |
| `CORE_POLICY_VIOLATION` | Operation violates enterprise policy | No | Contact admin for policy change | M5 |
| `CORE_AUDIT_LOG_CORRUPT` | Audit log checksum mismatch | No | Contact admin, possible tampering | M5 |
| `CORE_BACKUP_FAILED` | Backup creation failed | Yes | Check disk space and permissions | M6 |
| `CORE_RESTORE_FAILED` | Restore from backup failed | Yes | Check backup integrity | M6 |
| `CORE_DATABASE_LOCKED` | Database locked by another process | Yes | Close other app instance | M6 |

---

# SECTION 10: AI AGENT IMPLEMENTATION GUIDE

## 10.1 How to Use This Document
1. **Select Phase:** Start with Milestone 1 features only.
2. **Implement by Feature ID:** Each feature is self-contained. Follow FAT-REQ template.
3. **Data First:** Implement data models (Section 2) before UI.
4. **IPC Second:** Implement Rust command, then TypeScript frontend wrapper.
5. **Test per Feature:** Use Testing Matrix (Section 7) for each feature.

## 10.2 Implementation Order Within Phase
For each phase, implement in this order:
1. Data models and Rust structs
2. Backend commands (IPC handlers)
3. Frontend API wrappers (TanStack Query hooks)
4. UI components
5. Integration tests
6. Move to next feature

## 10.3 Critical Rules for AI Agents
- **NEVER** implement a mutating command without safety validation (F-024 for AI, F-031 for enterprise).
- **ALWAYS** validate process state before operations (Section 6.1).
- **NEVER** expose secrets or env var values to frontend or AI context.
- **ALWAYS** use virtualized lists for collections > 100 items.
- **ALWAYS** debounce file watcher events (300ms).
- **NEVER** block the main thread with process operations.
- **ALWAYS** provide graceful shutdown with SIGTERM → timeout → SIGKILL.
- **ALWAYS** return structured errors (Section 9).
- **ALWAYS** check port availability before process start.
- **ALWAYS** handle orphaned processes on app exit.

## 10.4 File Naming Conventions
```
apps/tyerun/                    # UNIFIED: relocated from repo root, see Master Spec Part D
  src-tauri/
    Cargo.toml          # depends on: tye-core-models, tye-core-storage, tye-core-events,
                         #             tye-core-vault, tye-core-ai-gateway, tye-run-engine
                         # (+ tye-git-engine ONLY when built as part of tye-hub, for
                         #   run:get_git_status / run:configure_git_hooks delegation)
  src/
    main.rs
    lib.rs
    commands/
      project_commands.rs
      discovery_commands.rs
      task_commands.rs
      process_commands.rs
      group_commands.rs
      pipeline_commands.rs
      monorepo_commands.rs
      env_commands.rs
      port_commands.rs
      ai_commands.rs
      plugin_commands.rs
      audit_commands.rs
    domain/
      project_manager.rs
      discovery_engine.rs
      process_manager.rs
      health_monitor.rs
      log_engine.rs
      pipeline_engine.rs
      monorepo_engine.rs
      env_manager.rs
      port_registry.rs
      ai_orchestrator.rs
      plugin_manager.rs
      audit_logger.rs
    models/
      project.rs
      task.rs
      process.rs
      log.rs
      group.rs
      pipeline.rs
      monorepo.rs
      environment.rs
      port.rs
      ai.rs
      plugin.rs
      audit.rs
    cache/
      db.rs
      migrations/
    utils/
      error.rs
      paths.rs
      validation.rs
      security.rs
src/
  components/
    layout/
    project/
    task/
    log/
    health/
    group/
    pipeline/
    monorepo/
    env/
    port/
    ai/
    settings/
    notifications/
  hooks/
    useProject.ts
    useTasks.ts
    useProcess.ts
    useLogs.ts
    useHealth.ts
    useGroups.ts
    usePipelines.ts
    useMonorepo.ts
    useEnv.ts
    useAi.ts
  stores/
    projectStore.ts
    taskStore.ts
    processStore.ts
    uiStore.ts
    aiStore.ts
  types/
    task.ts
    api.ts
    ui.ts
  lib/
    api.ts                # Tauri IPC wrappers
    utils.ts
```

## 10.5 Glossary for AI Agents
| Term | Definition |
|------|------------|
| **Task** | A runnable command with configuration (name, command, env, etc.) |
| **Process** | A running instance of a task (has PID, status, logs) |
| **Project** | A project directory with detected tasks and configuration |
| **Task Group** | A collection of tasks that can be run together |
| **Pipeline** | A multi-stage workflow of tasks with conditions and triggers |
| **Monorepo** | A repository containing multiple packages with dependencies |
| **PTY** | Pseudo-Terminal — allows interactive process communication |
| **Ecosystem** | The tool/framework family (npm, Cargo, Docker, Make, etc.) |
| **Health Check** | Periodic verification that a process is functioning correctly |
| **Port Conflict** | When two tasks attempt to bind the same network port |
| **Environment Profile** | A named set of environment variables (dev, staging, prod) |
| **MCP** | Model Context Protocol (AI tool interface) |
| **IPC** | Inter-Process Communication (Frontend ↔ Backend) |
| **WAL** | Write-Ahead Logging (SQLite performance mode) |
| **DLP** | Data Loss Prevention (secret scanning) |
| **SIEM** | Security Information and Event Management |
| **DAG** | Directed Acyclic Graph (dependency structure) |

---

# SECTION 11: APPENDICES

## Appendix A: Supported Ecosystem Detection Matrix
| Ecosystem | Marker Files | Parser | Built-in Tasks | Auto-Detect | Phase |
|-----------|-------------|--------|--------------|-------------|-------|
| npm | package.json | serde_json | scripts | Yes | M1 |
| pnpm | pnpm-project.yaml + package.json | serde_yaml + serde_json | scripts + project | Yes | M1 |
| yarn | yarn.lock + package.json | serde_json | scripts | Yes | M1 |
| bun | bun.lockb + package.json | custom + serde_json | scripts | Yes | M1 |
| Make | Makefile | regex | targets | Yes | M1 |
| Just | Justfile | regex / subprocess | recipes | Yes | M1 |
| Taskfile | Taskfile.yml | serde_yaml | tasks | Yes | M1 |
| Docker | Dockerfile | regex | build, run | Yes | M1 |
| Docker Compose | docker-compose.yml | serde_yaml | services | Yes | M1 |
| Cargo | Cargo.toml | toml | build, test, run, check | Yes | M1 |
| Python | pyproject.toml | toml | scripts | Yes | M1 |
| Go | go.mod | regex | run, test, build | Yes | M1 |
| Ruby | Gemfile + Rakefile | regex | rake tasks | Yes | M1 |
| PHP | composer.json | serde_json | scripts | Yes | M1 |
| Java | pom.xml / build.gradle | quick-xml | goals / tasks | Yes | M1 |
| Gradle | build.gradle | regex | tasks | Yes | M1 |
| Maven | pom.xml | quick-xml | goals | Yes | M1 |
| Custom | user-defined | manual | user-defined | Manual | M1 |

## Appendix B: Built-in Task Templates
| Template | Ecosystems | Tasks | Use Case |
|----------|-----------|-------|----------|
| React App | npm, pnpm, yarn, bun | dev, build, test, lint | Frontend development |
| Next.js | npm, pnpm, yarn, bun | dev, build, test, lint, start | Full-stack React |
| Node API | npm, pnpm, yarn, bun | dev, start, test, lint | Backend API |
| Django | Python | runserver, migrate, test, shell | Python web app |
| Rails | Ruby | server, console, test, db:migrate | Ruby web app |
| Go Service | Go | run, test, build, fmt | Go microservice |
| Rust Service | Cargo | run, test, build, clippy | Rust application |
| Docker Stack | Docker Compose | up, down, build, logs | Containerized app |
| Full Stack | Mixed | frontend dev, backend dev, db, proxy | Complete stack |
| CI Pipeline | Mixed | lint, test, build, deploy | Continuous integration |

## Appendix C: Keyboard Shortcuts Reference (Default Keymap)
| Shortcut | Action | Context |
|----------|--------|---------|
| Cmd/Ctrl+Shift+P | Command palette | Global |
| Cmd/Ctrl+Shift+N | Open new project | Global |
| Cmd/Ctrl+W | Close current project | Global |
| Cmd/Ctrl+R | Refresh project detection | Global |
| Cmd/Ctrl+1-9 | Start task 1-9 | Global |
| Cmd/Ctrl+Shift+1-9 | Start group 1-9 | Global |
| Cmd/Ctrl+K | Focus search | Global |
| Space | Start/stop selected task | Task panel |
| R | Restart selected task | Task panel |
| K | Kill selected task | Task panel |
| L | Focus log viewer | Task panel |
| E | Edit environment variables | Task panel |
| G | Toggle task groups | Task panel |
| P | Toggle pipelines | Task panel |
| M | Toggle monorepo view | Task panel |
| F | Search/filter tasks | Task panel |
| Cmd/Ctrl+F | Search in logs | Log viewer |
| Cmd/Ctrl+G | Next search result | Log viewer |
| Cmd/Ctrl+Shift+G | Previous search result | Log viewer |
| Esc | Clear search / Close modal | Global |
| Cmd/Ctrl+Plus | Zoom in | Global |
| Cmd/Ctrl+Minus | Zoom out | Global |
| Cmd/Ctrl+0 | Reset zoom | Global |
| Cmd/Ctrl+Shift+D | Toggle dev tools | Global |
| Cmd/Ctrl+, | Open settings | Global |
| F11 | Toggle fullscreen | Global |

---

**END OF SPECIFICATION**
**Total Features:** 37 core features + 50+ sub-capabilities = 90+ implementable units
**Total Pages:** ~45 (if printed)
**Estimated Implementation:** 4-8 months with 2-3 engineers
**AI Agent Ready:** YES — every feature has ID, acceptance criteria, data model, and API spec
**Suite Integration:** Designed to work alongside the Git Desktop App with shared SQLite database and project metadata
```
-e 

<!-- ============================================================ -->
<!-- PART 5: TYE HUB — NEW SPECIFICATION -->
<!-- ============================================================ -->


---

# PART 5 (of the Master Spec) — TYE HUB
## The Fourth App: Combined Workspace Shell
**Status:** NEW — no source spec existed; written fresh, in the same FAT-REQ format
as Tyegit/TyeApi/TyeRun, so the agent builds it the same way it builds the other three.
Hub is deliberately thin: it contributes almost no new domain logic of its own — every
domain feature (diffing, request sending, task running) already lives in the three
engine crates. Hub's entire job is composition: mount the three UIs behind one shell,
and make the things possible that are *only* possible with two or more modules loaded.

---

## 0. Architecture Recap (see Master Spec Parts A–E for full detail)

```
apps/tye-hub/
  src-tauri/     # links tye-git-engine + tye-api-engine + tye-run-engine + all tye-core-* crates
  src/           # <AppShell modules={["git","api","run"]} />, adds <ActivityBar/>
```

Hub owns exactly one new data concept not present in any of the three source specs:
the **AutomationRule** — a user-editable binding from a `TyeEvent` (Master Spec Part
E.2) to an action in another module. This is the feature that actually justifies
Hub existing as more than "three apps in tabs."

```rust
// crates/tye-core-models/src/automation.rs
pub struct AutomationRule {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub enabled: bool,
    pub trigger: AutomationTrigger,
    pub action: AutomationAction,
    pub created_at: DateTime<Utc>,
    pub last_fired: Option<DateTime<Utc>>,
    pub fire_count: u32,
}

pub enum AutomationTrigger {
    OnGitCommit { branch_pattern: Option<String> },
    OnGitPush,
    OnGitMergeConflict,
    OnApiCollectionRunCompleted { collection_id: Option<Uuid> },
    OnApiRequestFailed,
    OnRunTaskExited { task_id: Option<Uuid> },
    OnRunPipelineCompleted { pipeline_id: Option<Uuid> },
}

pub enum AutomationAction {
    RunPipeline { pipeline_id: Uuid },
    RunApiCollection { collection_id: Uuid },
    ShowNotification { title: String, body: String },
    CreateGitBranch { name_template: String },
    RunTask { task_id: Uuid },
}
```

`core_automation_rules` table lives in `<project_root>/.tye/project.db` alongside the
`core_*` tables from Master Spec Part C.3.

---

## 1. FEATURE SPECIFICATIONS (FAT-REQ)

### MILESTONE H1: Shell & Navigation
**Goal:** One window, one opened project, all three modules reachable, state preserved per-module when switching.

---

### F-H01: Activity Bar Module Switching
**Phase:** H1 | **Priority:** P0
**User Story:** As a user with a project open in Hub, I want a persistent icon bar so I can jump between Git, API, and Run without losing my place in any of them.

**Functional Requirements:**
1. Render a fixed-width vertical icon strip (VS Code activity-bar convention) with three icons: Git (cube mark), API, Run — plus a bottom-pinned Settings icon.
2. Clicking an icon mounts that module's `Sidebar + CenterPanel + RightPanel + BottomPanel` (as defined in that module's own Section 5.1) into the shell body.
3. Each module's UI state (open diff, selected request, running task view) is preserved in memory when switching away and restored when switching back — no re-fetch, no scroll-position loss.
4. Active module's icon shows an accent-colored left border stripe (`--tye-lavender` for Git, API-accent for API, `--tye-mustard` for Run — Master Spec Part H.2).
5. Keyboard shortcuts: `Cmd/Ctrl+1/2/3` switch modules directly.
6. A small colored dot on an inactive module's icon indicates unread activity (e.g., a task just failed while you were in the Git panel).

**Acceptance Criteria:**
- [ ] AC1: Switching modules is instant (<50ms) — no loading spinner, since data is already resident from `hub:open_project`.
- [ ] AC2: Diff scroll position, open panels, and selected items survive a switch-away-and-back.
- [ ] AC3: Activity dot clears when the module is viewed.
- [ ] AC4: If a module has no data for this project (e.g. `has_api_collections: false`), its icon is shown dimmed but still clickable, leading to that module's own onboarding/empty state.

**Technical Spec:** React: activity-bar state is a simple `activeModule: "git" | "api" | "run"` in a Zustand store; all three module UIs stay mounted (`display: none` on inactive ones), never unmounted, to preserve state without needing serialization.

**Data Model:** `HubUiState { active_module, module_activity_dots: Set<Module> }` — UI-only, not persisted.

**UI/UX:** Activity bar 56px wide, `--tye-cream` background, icons in the stipple/halftone mark style.

**Error Handling:** If a module's engine fails to initialize (rare — e.g. corrupt `.git` dir), that module's icon shows an error badge instead of an activity dot; clicking it shows the error inline instead of crashing the shell.

**Dependencies:** `hub:open_project`.

---

### F-H02: Project Overview Aggregation
**Phase:** H1 | **Priority:** P0
**User Story:** As a user, I want a single glance — before picking a module — at whether my project's git, API tests, and tasks are all healthy.

**Functional Requirements:**
1. `hub:get_project_overview` returns one payload combining: git branch + ahead/behind + dirty-file count (from `tye-git-engine`), last API collection run pass/fail counts (from `tye-api-engine`), and running/failed task counts (from `tye-run-engine`).
2. Rendered as a small persistent status strip at the top of the shell, always visible regardless of active module.
3. Each segment of the strip is clickable and deep-links into the relevant module at the relevant item (failing test, dirty file list, failed task).
4. Strip updates live via the `TyeEvent` bus (Master Spec Part E.2) — no polling.

**Acceptance Criteria:**
- [ ] AC1: `hub:get_project_overview` resolves in under 150ms for a project with git+api+run all populated.
- [ ] AC2: Strip reflects a new failing task within 1s of `RunTaskExited` firing, no manual refresh.
- [ ] AC3: Clicking the git segment switches to the Git module and focuses the changes panel.
- [ ] AC4: Segments for modules with no data (`has_git: false`) are omitted, not shown empty.

**Technical Spec:** Backend: `hub:get_project_overview` fans out to three engine-crate read functions concurrently via `tokio::join!`, no engine blocks on another.

**Data Model:** `ProjectOverview { git: Option<GitSummary>, api: Option<ApiSummary>, run: Option<RunSummary> }`.

**UI/UX:** Single-row strip, `--tye-ink` text on `--tye-cream`, three segments separated by hairlines.

**Error Handling:** If one engine's summary fails to load (e.g. git repo mid-operation), that segment shows a subtle spinner/retry rather than blocking the other two segments.

**Dependencies:** F-H01, git `git:get_status`, api collection run history, run task state.

---

### F-H03: Unified Recent Projects & Switcher
**Phase:** H1 | **Priority:** P0
**User Story:** As a user, I want one "recent projects" list shared across Hub and all three standalone apps, so opening a project anywhere remembers it everywhere.

**Functional Requirements:**
1. `hub:list_projects` reads `~/.tye/registry.db` (Master Spec Part C.3) — the same file every standalone app reads/writes.
2. Recent-projects picker accessible from `Cmd/Ctrl+O` and from a dropdown under the window title.
3. Each entry shows name, path, pinned state, icon/color, and small badges for which modules that project has data for (git/api/run), sourced from the registry's `has_git`/`has_api_collections`/`detected_ecosystems` columns.
4. Pinning/unpinning, renaming, and removing from recents all write back to the shared registry — visible immediately in TyeApi's or Tyegit's own recent-projects list too, since it's the same file.

**Acceptance Criteria:**
- [ ] AC1: A project opened in standalone Tyegit yesterday appears in Hub's recents list today without re-scanning disk.
- [ ] AC2: Pinning in Hub is reflected in standalone TyeRun's recents list on its next launch.
- [ ] AC3: Removing a project from recents does not delete its `.tye/project.db` or its code — registry-only operation.

**Technical Spec:** `tye-core-storage` opens `~/.tye/registry.db` with `sqlx::SqlitePool`, WAL mode, so concurrent standalone-app + Hub access doesn't lock.

**Data Model:** `Project` (Master Spec Part C.1), registry row per Part C.3.

**UI/UX:** Command-palette-style modal, fuzzy filename search, arrow-key navigation.

**Error Handling:** If a recent project's path no longer exists on disk, entry is shown greyed out with "Locate…" action instead of silently vanishing.

**Dependencies:** Master Spec Part C.3 registry schema.

---

### MILESTONE H2: Cross-Module Search & Commands

---

### F-H04: Global Command Palette
**Phase:** H2 | **Priority:** P0
**User Story:** As a power user, I want one command palette (`Cmd/Ctrl+K`) that reaches actions in whichever modules are loaded, not just the active one.

**Functional Requirements:**
1. `hub:command_palette_actions { query }` merges results from each loaded module's own command registry (each module already exposes its palette actions internally per its own Section 5 UI spec) plus Hub-level actions (switch module, open project, manage automations).
2. Results grouped by module with a small colored dot matching that module's accent.
3. Executing a cross-module action (e.g. "Run pipeline: lint") switches to that module and performs the action, or performs it silently in the background if it doesn't require a visible panel (e.g. "Push to origin").
4. Fuzzy match on action name, and on module name as a prefix filter (typing "git:" narrows to Git actions only, matching the IPC prefix convention users will already recognize from error messages/logs).

**Acceptance Criteria:**
- [ ] AC1: Typing "commit" surfaces Git's commit action even if the API module is currently active.
- [ ] AC2: Palette responds within 100ms for a query against 3 loaded modules.
- [ ] AC3: Recently-used actions surface first on an empty query, per-project.

**Technical Spec:** Each module's existing `CommandPalette` component (present in all three source specs' Section 5.2) exposes a `getActions(query): Action[]` hook; Hub's palette is a thin aggregator calling all mounted modules' hooks, not a reimplementation.

**Data Model:** `Action { id, label, module: Module, icon, shortcut?, handler }`.

**UI/UX:** Same visual component as each standalone app's palette (`tye-design-system`), grouped list instead of flat list.

**Error Handling:** A module whose action throws does not block the other modules' results from displaying.

**Dependencies:** F-H01; each module's own command-palette action registry.

---

### F-H05: Global Search Across Modules
**Phase:** H2 | **Priority:** P1
**User Story:** As a user, I want to search for a term (e.g. an endpoint path or a variable name) and see matches across commit history, API requests, and task definitions at once.

**Functional Requirements:**
1. `hub:global_search { query, scopes: [git|api|run] }` fans out to each module's existing search capability (Git's commit/file search, API's request/collection search, Run's task/log search — all already specified in the source specs) and merges results.
2. Results list grouped by module, each result deep-links to the exact item in that module.
3. Scope checkboxes let the user narrow to one or two modules.
4. Search runs against local SQLite/flat-file indices only — no network calls, consistent with each module's original "search is local" constraint.

**Acceptance Criteria:**
- [ ] AC1: A query matching both a commit message and an API request name returns both, correctly attributed.
- [ ] AC2: Empty result set per-module is hidden, not shown as an empty group.
- [ ] AC3: Search results update live if the underlying data changes while the results panel is open (e.g. a new commit lands).

**Technical Spec:** Concurrent `tokio::join!` fan-out identical in shape to F-H02; each module returns `Vec<SearchResult>` from its own existing search implementation.

**Data Model:** `SearchResult { module: Module, kind: String, title: String, snippet: String, deep_link: DeepLink }`.

**UI/UX:** Full-panel overlay, similar visual weight to the command palette but persistent (not auto-dismissing) so results can be scanned.

**Error Handling:** A slow module's search does not block faster modules' results — results stream in per-module as they resolve.

**Dependencies:** Each module's own search/filter feature (already specified in its source spec).

---

### MILESTONE H3: Cross-Module Automation

---

### F-H06: Automation Rule Engine
**Phase:** H3 | **Priority:** P0
**User Story:** As a user, I want to wire "when X happens in one module, do Y in another" without writing a plugin, so my three tools actually act like one workflow.

**Functional Requirements:**
1. CRUD for `AutomationRule` (data model above) via `hub:create_automation_rule`, `hub:update_automation_rule`, `hub:delete_automation_rule`, `hub:list_automation_rules`.
2. Rules are evaluated by a subscriber on `tye-core-events`' bus (Master Spec Part E.2): on each `TyeEvent`, all enabled rules whose `trigger` variant matches are executed in registration order.
3. Rule actions call directly into the target module's existing engine functions — no new execution paths, no privilege escalation beyond what that module's own commands already allow.
4. Every firing is written to `core_automation_log` (id, rule_id, fired_at, event_json, action_result, success) — visible in F-H09.
5. Rules are project-scoped (stored in that project's `project.db`), not global — matches the project-scoped mental model established in Master Spec Part C.

**Acceptance Criteria:**
- [ ] AC1: A rule "On git commit → run pipeline 'lint'" fires within 500ms of `GitCommitCreated`.
- [ ] AC2: Disabling a rule stops it from firing without deleting its configuration.
- [ ] AC3: A rule referencing a deleted pipeline/collection/task is auto-disabled with a surfaced warning, not silently failing on every event.
- [ ] AC4: Rules never fire for events from a different project than the one they're scoped to, even if Hub has switched projects since the rule fired last.

**Technical Spec:** `tye-core-events::EventBus::subscribe` registers Hub's `AutomationEngine` once per opened project; engine holds an in-memory `Vec<AutomationRule>` refreshed on any CRUD op.

**Data Model:** `AutomationRule`, `AutomationLogEntry` (above + Master Spec Part E.2 `TyeEvent`).

**UI/UX:** Dedicated "Automations" screen off the Settings icon; rule editor is trigger-dropdown → action-dropdown → target-picker, no code required.

**Error Handling:** Action execution failure (e.g. pipeline already running) logs the failure to `core_automation_log` and surfaces a non-blocking notification; never retries silently in a loop.

**Dependencies:** Master Spec Part E.2 event bus; F-H07 for starter templates.

---

### F-H07: Built-in Automation Templates
**Phase:** H3 | **Priority:** P1
**User Story:** As a new Hub user, I want ready-made automation rules for the obvious workflows so I don't have to invent them myself.

**Functional Requirements:**
1. Ship a fixed set of templates, offered during onboarding and from the Automations screen's "+ New from template" action:
   - "Lint before commit" — `OnGitCommit → RunPipeline(lint)`
   - "Notify on failing API tests" — `OnApiCollectionRunCompleted(failed>0) → ShowNotification`
   - "Tag release on version bump" — `OnGitPush(branch=main) → RunTask(tag-release)` *(disabled by default — mutating)*
   - "Re-run API smoke tests after deploy task" — `OnRunTaskExited(task=deploy, success) → RunApiCollection(smoke-tests)`
2. Applying a template pre-fills the rule editor (F-H06) with template values but requires explicit Save — never auto-installs silently.
3. Templates only appear when the referenced module/pipeline/task actually exists in the current project (e.g. the lint template only offers pipelines actually named/tagged for linting).

**Acceptance Criteria:**
- [ ] AC1: Templates referencing a non-existent pipeline/task/collection are hidden, not shown broken.
- [ ] AC2: Applying a template never auto-enables a mutating rule without the user pressing Save on the reviewed configuration.

**Technical Spec:** Templates are a static Rust `const` list in `tye-core-models::automation::templates()`, filtered client-side against the current project's known pipelines/tasks/collections.

**Data Model:** `AutomationTemplate { id, name, description, trigger, action, requires: Requirement }`.

**UI/UX:** Card grid in the Automations screen, one card per applicable template.

**Error Handling:** N/A (read-only until applied; F-H06 governs execution errors).

**Dependencies:** F-H06.

---

### F-H08: Automation Rule Editor UI
**Phase:** H3 | **Priority:** P0
**User Story:** As a user, I want to build and edit an automation rule visually, with the same clarity as the rest of the suite's forms.

**Functional Requirements:**
1. Three-step form: Trigger (module + event type + optional filters like branch pattern) → Action (module + action type + target picker, e.g. a pipeline dropdown sourced live from `run:list_pipelines`) → Review (plain-English sentence summarizing the rule, e.g. "When a commit lands on `main`, run pipeline `lint`.").
2. Target pickers are populated live from the relevant module's own list commands (`run:list_pipelines`, `api:list_collections`, `run:list_tasks`) — never hardcoded, always current.
3. Save is disabled until trigger and action are both fully specified.
4. Existing rules open in the same editor pre-filled, in edit mode.

**Acceptance Criteria:**
- [ ] AC1: The Review step's generated sentence accurately reflects every filter set in the Trigger step.
- [ ] AC2: Deleting the pipeline a rule points to, while the editor is open, surfaces an inline warning before Save.

**Technical Spec:** React form using `tye-design-system` primitives; no new component library.

**Data Model:** `AutomationRule` (draft state client-side until Save).

**UI/UX:** Modal, 3-step wizard pattern already used elsewhere in the suite (matches API Tester's environment setup wizard and TyeRun's pipeline builder, per their own Section 5 specs).

**Error Handling:** Client-side validation prevents Save with an incomplete rule; server-side `hub:create_automation_rule` re-validates regardless (never trust client validation alone).

**Dependencies:** F-H06.

---

### F-H09: Automation Execution Log
**Phase:** H3 | **Priority:** P1
**User Story:** As a user, I want to see exactly when and why an automation fired, so I can trust (or debug) rules I'm not watching in real time.

**Functional Requirements:**
1. `hub:get_automation_log { project_id, rule_id?, limit?, offset? }` returns `core_automation_log` entries newest-first.
2. Each entry shows: rule name, trigger event summary, action taken, result (success/failure), and timestamp.
3. Failed entries are visually distinct and link directly to the affected item (e.g. the pipeline run that failed to start).
4. Log is capped at 500 entries per project (oldest pruned), consistent with the retention pattern already used by each module's own history/audit tables in the source specs.

**Acceptance Criteria:**
- [ ] AC1: A rule firing is visible in the log within 1s of execution.
- [ ] AC2: Log survives app restart (persisted in `project.db`, not in-memory).
- [ ] AC3: Clearing the log is a separate explicit action, never automatic beyond the 500-entry cap.

**Technical Spec:** Simple paginated SQLite read against `core_automation_log`.

**Data Model:** `AutomationLogEntry` (F-H06).

**UI/UX:** Table view under the Automations screen's "History" tab.

**Error Handling:** N/A (read-only view).

**Dependencies:** F-H06.

---

### MILESTONE H4: Unified Settings & Polish

---

### F-H10: Unified Settings Aggregator
**Phase:** H4 | **Priority:** P0
**User Story:** As a user, I want one Settings screen in Hub, not three separate ones stitched together, even though the underlying settings belong to different modules.

**Functional Requirements:**
1. Settings screen has module-labeled sections (Git, API, Run, Core) but is one continuous scrollable/searchable surface, not a re-mount of three separate settings modals.
2. Core section covers: AI provider/key (shared across all modules via `tye-core-ai-gateway`), vault status, theme, and the Automations screen entry point.
3. Each module's existing settings fields (from that module's own Section 5/9 UI spec) are reused as-is — this is a layout change, not a redesign of any individual field.
4. Setting a value writes through the same per-module IPC command the standalone app would use (`git:update_settings`, `api:update_settings`, `run:update_settings`) — Hub does not introduce a parallel settings-write path.

**Acceptance Criteria:**
- [ ] AC1: Changing a Git setting in Hub produces an identical on-disk/DB result to changing it in standalone Tyegit.
- [ ] AC2: Settings search (`Cmd/Ctrl+F` while Settings is open) matches across all module sections at once.

**Technical Spec:** Each module already exports a `<SettingsSection/>` component per its own spec; Hub concatenates them under one scroll container.

**Data Model:** No new model — reuses each module's existing settings tables (`git_settings`, `api_app_settings`, `run_settings`) plus `core:` settings for AI/vault/theme.

**UI/UX:** Single settings screen, left-hand section nav (Git / API / Run / Core / Automations).

**Error Handling:** A save failure in one module's section shows an inline error scoped to that section; does not block saving other sections.

**Dependencies:** F-H01; each module's own settings commands.

---

### F-H11: First-Run Module Selection
**Phase:** H4 | **Priority:** P1
**User Story:** As a new Hub user who only cares about Git and Run (not API), I want to hide the API icon entirely rather than see a module I'll never use.

**Functional Requirements:**
1. On first launch, Hub asks which modules to show in the Activity Bar (all three enabled by default).
2. Disabling a module hides its Activity Bar icon and excludes it from Global Search/Command Palette/Automation triggers — it does not uninstall or delete any of that module's data.
3. Setting is per-machine (stored in Hub's own local settings, not the shared project registry), changeable anytime from Core settings.
4. A hidden module's data (if any exists for the current project) is still visible via `hub:get_project_overview` badges, with a one-click "Show this module" affordance rather than being fully invisible.

**Acceptance Criteria:**
- [ ] AC1: Disabling API mid-session immediately removes its Activity Bar icon without requiring restart.
- [ ] AC2: Re-enabling a module restores it with all data intact (nothing was deleted).

**Technical Spec:** Simple boolean flags in Hub's local `app_settings`; gates which `<AppShell modules={[...]}>` array entries render.

**Data Model:** `HubPreferences { enabled_modules: Set<Module> }`.

**UI/UX:** Single onboarding screen with three toggles; same toggles reachable later from Core settings.

**Error Handling:** N/A.

**Dependencies:** F-H01.

---

### F-H12: Unified Notification Center
**Phase:** H4 | **Priority:** P1
**User Story:** As a user, I want one notification tray for events from any module, instead of missing a Run failure because I was looking at Git.

**Functional Requirements:**
1. All three modules' existing toast/notification events (each already specified per-module) additionally post into one shared, persistent notification tray (bell icon, badge count) rather than only appearing as an ephemeral toast.
2. Tray entries deep-link to the source item, same pattern as F-H02/F-H05.
3. Tray persists across module switches and across a short app restart (last 50 entries kept in memory + `core_events_log`, per Master Spec Part C.3).
4. Mark-as-read / clear-all supported.

**Acceptance Criteria:**
- [ ] AC1: A background task failure while viewing the API module still increments the bell badge.
- [ ] AC2: Clicking a tray entry switches modules and focuses the relevant item.

**Technical Spec:** Subscribes to the same `TyeEvent` bus as F-H06's automation engine — notification tray and automation engine are two independent subscribers to one bus, exactly the decoupling Master Spec Part E.2 exists to enable.

**Data Model:** Reuses `core_events_log`.

**UI/UX:** Bell icon in the title bar, dropdown list, unread-count badge.

**Error Handling:** N/A (read-only view of already-handled events).

**Dependencies:** Master Spec Part E.2; F-H01.

---

## 2. IPC COMMAND REGISTRY — `hub:*` (complete)

| Command | Input | Output | Mutates |
|---|---|---|---|
| `hub:list_projects` | `{}` | `Vec<Project>` | No |
| `hub:open_project` | `{ path }` | `Project` | No |
| `hub:get_project_overview` | `{ project_id }` | `ProjectOverview` | No |
| `hub:global_search` | `{ query, scopes: [git\|api\|run] }` | `Vec<SearchResult>` | No |
| `hub:command_palette_actions` | `{ query }` | `Vec<Action>` | No |
| `hub:create_automation_rule` | `AutomationRule` (draft) | `AutomationRule` | Yes |
| `hub:update_automation_rule` | `AutomationRule` | `AutomationRule` | Yes |
| `hub:delete_automation_rule` | `{ rule_id }` | `bool` | Yes |
| `hub:list_automation_rules` | `{ project_id }` | `Vec<AutomationRule>` | No |
| `hub:get_automation_log` | `{ project_id, rule_id?, limit?, offset? }` | `Vec<AutomationLogEntry>` | No |
| `hub:get_hub_preferences` | `{}` | `HubPreferences` | No |
| `hub:update_hub_preferences` | `HubPreferences` | `bool` | Yes |
| `hub:get_notifications` | `{ limit? }` | `Vec<NotificationEntry>` | No |
| `hub:mark_notification_read` | `{ notification_id }` | `bool` | Yes |

All `git:*`, `api:*`, `run:*`, and `core:*` commands from the three merged parts remain callable as-is inside Hub — this table lists only what's new.

---

## 3. STATE MACHINE — Hub Shell Lifecycle

```
Launching
   ↓ (registry.db read)
NoProjectOpen ──(hub:open_project)──→ Opening
   ↑                                     │
   │ (hub:close_project)                 ↓ (all 3 engines initialized, may be partial)
   └──────────────────── ProjectOpen ────┘
                             │
                             ├─ ActiveModule: Git | Api | Run  (F-H01, freely switchable)
                             └─ AutomationEngine: Idle ⇄ Evaluating ⇄ Executing (F-H06)
```

`ProjectOpen` does not require all three engines to succeed — a project with only a `.git` directory opens with `has_api_collections: false`/`detected_ecosystems: []` and Hub simply dims those Activity Bar icons (F-H11 interaction).

---

## 4. TESTING MATRIX (Hub-specific — module-internal behavior is covered by each module's own Section 6/7 matrix)

| Test | Scenario | Expected |
|---|---|---|
| T-H01 | Open a project with only `.git`, no API collections, no detected tasks | Only Git icon active; overview strip shows only git segment |
| T-H02 | Switch modules rapidly (10x in 2s) | No state loss, no duplicate network/engine calls |
| T-H03 | Create "commit → lint pipeline" automation, then commit | Pipeline run appears within 500ms, logged in automation log |
| T-H04 | Delete a pipeline referenced by an enabled automation rule | Rule auto-disables, warning surfaced, no crash on next matching event |
| T-H05 | Pin a project in Hub, then open standalone Tyegit | Same project appears pinned in Tyegit's recents |
| T-H06 | Disable API module (F-H11) mid-session with an API-triggered automation rule enabled | Rule is disabled alongside the module; re-enabling module re-offers (not auto-re-enables) the rule |
| T-H07 | Global search query matching both a commit and a task name | Both results returned, correctly grouped, both deep-link correctly |

---

## 5. FILE NAMING CONVENTIONS

```
apps/tye-hub/
  src-tauri/
    Cargo.toml                 # depends on ALL of: tye-git-engine, tye-api-engine,
                                #   tye-run-engine, tye-core-models, tye-core-storage,
                                #   tye-core-events, tye-core-vault, tye-core-ai-gateway
    tauri.conf.json             # identifier: dev.tyes.hub
    capabilities/
      default.json               # git:*, api:*, run:*, hub:*, core:* all allowed
    src/
      main.rs
      lib.rs
      commands/
        hub_commands.rs          # hub:list_projects, hub:open_project, hub:get_project_overview
        automation_commands.rs   # hub:*_automation_rule, hub:get_automation_log
        search_commands.rs       # hub:global_search, hub:command_palette_actions
        notification_commands.rs
      automation/
        engine.rs                 # AutomationEngine, TyeEvent subscriber
        templates.rs               # F-H07 built-in templates
  src/
    App.tsx                     # <AppShell modules={["git","api","run"]} />
    components/
      ActivityBar.tsx
      ProjectOverviewStrip.tsx
      GlobalSearchModal.tsx
      AutomationEditor.tsx
      AutomationLogTable.tsx
      NotificationTray.tsx
    stores/
      hubUiStore.ts              # active module, activity dots
```
-e 

<!-- ============================================================ -->
<!-- PART 6: CONSOLIDATED APPENDICES -->
<!-- ============================================================ -->


---

# PART 6 (of the Master Spec) — CONSOLIDATED APPENDICES

## 6.1 Audit Finding B.10 (new): Error codes collide across modules too

Same category of bug as the `Workspace`/IPC-namespace collisions in the main audit
(Parts B.1–B.2), found while merging Section 8/9 "Error Code Registry" of all three
specs: **`AUTH_FAILED` is defined independently by both Tyegit (§8.2) and TyeApi
(§8.2)** with different meanings (git credential failure vs. HTTP auth failure).
**`PROJECT_NOT_FOUND`** (originally `WORKSPACE_NOT_FOUND`) is defined independently
by TyeApi and TyeRun. **`PLUGIN_CRASH`** is defined independently by Tyegit and
TyeApi. **`AI_PLAN_INVALID`** is defined independently by Tyegit and TyeRun. If a
frontend error handler ever does a flat `switch (code)` across a merged Hub error
stream, these silently resolve to whichever module's variant was declared last.

**Fix:** every error code gets a module prefix, exactly like the IPC commands
(Part E.1). Codes for genuinely shared concepts (project lookup, AI planning,
plugin lifecycle, credential vault, database locking) collapse to one `CORE_*`
code instead of being redefined per module, since those subsystems are now
literally one shared crate each (Parts F, G).

## 6.2 Unified Error Code Registry (supersedes each module's own §8.2/§9.2)

**Core (shared subsystems — `tye-core-*` crates):**

| Code | Message | Recoverable | Suggestion | Origin |
|---|---|---|---|---|
| `CORE_PROJECT_NOT_FOUND` | Project not found | Yes | Create or open a project | was API `PROJECT_NOT_FOUND` + Run `PROJECT_NOT_FOUND` |
| `CORE_AI_PLAN_INVALID` | AI generated invalid operation plan | Yes | Reject plan and try different prompt | was Git `AI_PLAN_INVALID` + Run `AI_PLAN_INVALID` |
| `CORE_AI_SUGGESTION_INVALID` | AI suggestion validation failed | Yes | Dismiss and try again | was Run `AI_SUGGESTION_INVALID` |
| `CORE_PLUGIN_CRASH` | Plugin crashed during execution | Yes | Disable plugin and retry | was Git `PLUGIN_CRASH` + API `PLUGIN_CRASH` |
| `CORE_PLUGIN_INVALID` | Plugin manifest validation failed | Yes | Check manifest format | was Run `PLUGIN_INVALID` |
| `CORE_PLUGIN_INCOMPATIBLE` | Plugin incompatible with app version | Yes | Update plugin or app | was API `PLUGIN_INCOMPATIBLE` |
| `CORE_PLUGIN_PERMISSION_DENIED` | Plugin lacks required permission | Yes | Enable permission in settings | was Run `PLUGIN_PERMISSION_DENIED` |
| `CORE_KEYRING_UNAVAILABLE` | OS keyring not available | Yes | Use encrypted file fallback | was API `KEYRING_UNAVAILABLE` |
| `CORE_CREDENTIAL_NOT_FOUND` | Credential not found in vault | Yes | Re-enter credential | was API `CREDENTIAL_NOT_FOUND` |
| `CORE_DATABASE_LOCKED` | Database locked by another process | Yes | Close other app instance | was Run `DATABASE_LOCKED` |
| `CORE_POLICY_VIOLATION` | Operation violates enterprise policy | No | Contact admin for policy change | was Run `POLICY_VIOLATION` |
| `CORE_AUDIT_LOG_CORRUPT` | Audit log checksum mismatch | No | Contact admin, possible tampering | was Run `AUDIT_LOG_CORRUPT` |
| `CORE_BACKUP_FAILED` | Backup creation failed | Yes | Check disk space and permissions | was Run `BACKUP_FAILED` |
| `CORE_RESTORE_FAILED` | Restore from backup failed | Yes | Check backup integrity | was Run `RESTORE_FAILED` |

**Git (`GIT_*`, Tyegit-specific — unchanged behavior, prefix added):**

| Code | Message | Recoverable | Suggestion |
|---|---|---|---|
| `GIT_NOT_FOUND` | Git is not installed | Yes | Install Git or set custom path |
| `GIT_REPO_NOT_FOUND` | Not a valid Git repository | Yes | Select a directory containing .git |
| `GIT_AUTH_FAILED` | Git authentication failed | Yes | Check credentials or SSH key |
| `GIT_MERGE_CONFLICT` | Merge resulted in conflicts | Yes | Open conflict resolver to resolve |
| `GIT_REBASE_CONFLICT` | Rebase conflict at step N | Yes | Resolve conflicts and click Continue |
| `GIT_DIRTY_WORKTREE` | Working tree has uncommitted changes | Yes | Stash, commit, or discard changes |
| `GIT_NON_FAST_FORWARD` | Push rejected: non-fast-forward | Yes | Pull remote changes first |
| `GIT_CHECKPOINT_FAIL` | Failed to create safety checkpoint | No | Check disk space and permissions |
| `GIT_HOOK_FAILED` | Pre-commit hook failed | Yes | Fix issues or use --no-verify |
| `GIT_INDEX_LOCKED` | Git index is locked | Yes | Wait for other process or remove index.lock |
| `GIT_OBJECT_CORRUPT` | Git object database corrupted | Partial | Run recovery center or git fsck |
| `GIT_NETWORK_TIMEOUT` | Git network operation timed out | Yes | Check connection and retry |

**API (`API_*`, TyeApi-specific — unchanged behavior, prefix added):**

| Code | Message | Recoverable | Suggestion |
|---|---|---|---|
| `API_INVALID_URL` | Invalid URL format | Yes | Check URL syntax |
| `API_REQUEST_TIMEOUT` | Request timed out | Yes | Increase timeout or check server |
| `API_CONNECTION_REFUSED` | Connection refused | Yes | Check server is running and port is correct |
| `API_DNS_ERROR` | Could not resolve host | Yes | Check URL and network connection |
| `API_SSL_ERROR` | SSL/TLS handshake failed | Yes | Check certificate or disable SSL verification |
| `API_PROXY_ERROR` | Proxy connection failed | Yes | Check proxy settings |
| `API_REQUEST_CANCELLED` | Request was cancelled | Yes | Retry the request |
| `API_RESPONSE_TOO_LARGE` | Response body exceeds limit | Yes | Increase limit or save to file |
| `API_COLLECTION_NOT_FOUND` | Collection not found | Yes | Check collection ID or recreate |
| `API_COLLECTION_FILE_CORRUPT` | Collection file is corrupted | Partial | Restore from backup or Git |
| `API_ENV_NOT_FOUND` | Environment not found | Yes | Select existing environment |
| `API_VARIABLE_UNRESOLVED` | Variable not found | Yes | Define variable in environment |
| `API_CIRCULAR_VAR_REF` | Circular variable reference detected | Yes | Fix variable dependency chain |
| `API_DIFF_FORMAT_MISMATCH` | Cannot compare different formats | No | Select two responses of same type |
| `API_SCRIPT_TIMEOUT` | Script execution timed out | Yes | Optimize script or increase timeout |
| `API_SCRIPT_SANDBOX_VIOLATION` | Script attempted forbidden operation | Yes | Remove forbidden operation from script |
| `API_ASSERTION_FAILED` | Test assertion failed | Yes | Check assertion or fix API |
| `API_RUNNER_STOPPED` | Collection run stopped on failure | Yes | Fix failed request or disable stop-on-error |
| `API_WS_CONNECTION_FAILED` | WebSocket connection failed | Yes | Check URL and server |
| `API_WS_HANDSHAKE_FAILED` | WebSocket handshake failed | Yes | Check headers and subprotocol |
| `API_SSE_NOT_SUPPORTED` | Endpoint does not support SSE | Yes | Verify endpoint supports text/event-stream |
| `API_GRAPHQL_INTROSPECTION_DISABLED` | GraphQL introspection disabled | Yes | Import schema manually or enable introspection |
| `API_GRPC_PROTO_PARSE_ERROR` | Failed to parse protobuf file | Yes | Check proto syntax |
| `API_GRPC_SERVICE_NOT_FOUND` | gRPC service not found | Yes | Check proto or enable reflection |
| `API_AUTH_FAILED` | API authentication failed | Yes | Check credentials |
| `API_OAUTH_TIMEOUT` | OAuth authorization timed out | Yes | Retry authorization flow |
| `API_OAUTH_STATE_MISMATCH` | OAuth state parameter mismatch | No | Restart authorization flow |
| `API_IMPORT_PARSE_ERROR` | Failed to parse import file | Yes | Check file format and version |
| `API_IMPORT_UNSUPPORTED_FEATURE` | Import contains unsupported features | Yes | Review warnings and manually fix |
| `API_EXPORT_RENDER_ERROR` | Failed to render export | Yes | Try different format |
| `API_LOAD_TEST_LIMIT_EXCEEDED` | Load test exceeds safe limits | Yes | Reduce concurrency |
| `API_SEARCH_TIMEOUT` | Search query timed out | Yes | Simplify query or reduce scope |

**Run (`RUN_*`, TyeRun-specific — unchanged behavior, prefix added):**

| Code | Message | Recoverable | Suggestion |
|---|---|---|---|
| `RUN_TASK_DETECT_FAILED` | Failed to detect tasks from config | Partial | Check config file syntax |
| `RUN_TASK_NOT_FOUND` | Task not found in project | Yes | Check task name or re-detect |
| `RUN_PROCESS_SPAWN_FAILED` | Failed to start process | Yes | Check command exists and is executable |
| `RUN_PROCESS_ALREADY_RUNNING` | Task is already running | Yes | Stop current instance first |
| `RUN_PORT_CONFLICT` | Port already in use | Yes | Change port or kill existing process |
| `RUN_PORT_UNAVAILABLE` | No available ports in range | Yes | Expand port range or free ports |
| `RUN_ENV_VAR_MISSING` | Required environment variable not set | Yes | Set the variable in environment panel |
| `RUN_HEALTH_CHECK_FAILED` | Process health check failed | Yes | Check process logs for errors |
| `RUN_LOG_BUFFER_FULL` | Log buffer reached limit | Yes | Increase buffer size or clear logs |
| `RUN_GROUP_CIRCULAR_DEP` | Circular dependency in task group | Yes | Remove circular reference |
| `RUN_PIPELINE_CYCLE` | Circular dependency in pipeline | Yes | Remove cycle before saving |
| `RUN_PIPELINE_STAGE_TIMEOUT` | Pipeline stage timed out | Yes | Increase timeout or optimize task |
| `RUN_MONOREPO_CYCLE` | Circular dependency in package graph | Partial | Break cycle manually |
| `RUN_MONOREPO_CACHE_INVALID` | Build cache invalidation failed | Yes | Clear cache and retry |
| `RUN_SCHEDULE_INVALID` | Invalid cron expression | Yes | Check cron syntax |

**Hub (`HUB_*`, new):**

| Code | Message | Recoverable | Suggestion |
|---|---|---|---|
| `HUB_MODULE_INIT_FAILED` | One module's engine failed to initialize | Partial | Reopen project; affected module shows inline error |
| `HUB_AUTOMATION_TARGET_MISSING` | Automation rule's target (pipeline/task/collection) no longer exists | Yes | Edit or delete the rule |

## 6.3 Master IPC Command Index (all four apps)

The complete, authoritative command list is the union of:
- Part 2 (Tyegit) §4.1 — `git:*` (unchanged from source spec except `ai:` → `git:ai_`)
- Part 3 (TyeApi) §4.1 — `api:*` (unchanged from source spec except `Project` renames) + new `api:ai_*` (Part 3's Milestone 9)
- Part 4 (TyeRun) §4.1 — `run:*` (renamed from `tr:*`) + delegation notes on `run:get_git_status`/`run:configure_git_hooks`
- Part 5 (Hub) §2 — `hub:*` (entirely new)

No further transcription here — restating ~230 individual command rows a fourth
time would itself become a fifth source of drift. This index exists to state the
one invariant that makes the split safe: **prefixes are globally unique across
all four tables above; no two ever share a full command name.** If a future
feature is added to any module, the agent must verify its command name isn't
already used by another module's table before merging — this is now a linting
rule, not just a convention (Master Spec Part K).

## 6.4 Glossary Addendum (new terms introduced by unification — see each Part's own §10 for all pre-existing terms)

| Term | Definition |
|---|---|
| **Project** | The root "opened folder" object shared by all four apps. Replaces the old, incompatible `Workspace` concept from TyeApi and TyeRun. See Master Spec Part C.1. |
| **`tye-core-*`** | The family of shared Rust crates (models, storage, events, vault, ai-gateway, plugin-host, fs-watcher) that all four apps link against instead of each reimplementing the same subsystem. |
| **TyeEvent** | The typed cross-module event enum on the shared event bus; the mechanism by which, e.g., a Git commit can trigger a TyeRun pipeline. See Master Spec Part E.2. |
| **AutomationRule** | A user-configured trigger→action binding, Hub-only concept, built on TyeEvent. See Part 5 §0. |
| **Hub** | The fourth app (`apps/tye-hub`) that mounts Tyegit + TyeApi + TyeRun as panels behind one Activity Bar in a single window, instead of three separate installs. |
| **registry.db** | The one machine-wide SQLite file (`~/.tye/registry.db`) listing every project ever opened by any of the four apps — replaces each app's separate "recent projects" list. |
| **project.db** | The one per-project SQLite file (`<project_root>/.tye/project.db`) holding that project's cache/history tables, namespaced `core_`/`git_`/`api_`/`run_`. |

---

# HOW THE SIX PARTS FIT TOGETHER

| Part | File | What it is |
|---|---|---|
| 0 | `TYE_PLATFORM_UNIFIED_SPEC.md` (this repo's first deliverable) | Architecture, audit findings, unified data model, monorepo layout, IPC/event-bus/AI/security unification, roadmap |
| 2 | Tyegit — full merged spec | Everything from the original Git Desktop spec, with the 5 mechanical patches applied |
| 3 | TyeApi — full merged spec | Everything from the original API Tester spec, with the 6 mechanical patches applied, + new AI milestone |
| 4 | TyeRun — full merged spec | Everything from the original TyeRun spec, with the 8 mechanical patches applied, including the typo fix and git-delegation fix |
| 5 | tye Hub — new spec | The fourth app: activity bar, project overview, global search/palette, automation engine, unified settings/notifications |
| 6 | This appendix | Cross-module error code fix, IPC index pointer, glossary addendum |

All six parts below are concatenated, in this order, into one file:
`TYE_PLATFORM_COMPLETE_SPEC.md`.
