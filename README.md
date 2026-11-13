# Pathly

A local-first tracker for job application processes. Keep a timeline of every interview, let an LLM turn your rough post-interview notes into a clean entry, keep company and role briefs to review before each round, and get analytics on how your search is going. Everything lives on your machine and can be exported and imported as versioned JSON.

## Features

- **Processes**: one per role you apply to, with status (wishlist → applied → in progress → offer → accepted, or rejected / withdrawn / declined / ghosted), stage, salary range, location, and a living summary.
- **Timeline**: every interview, assessment, email or note. Write what happened in your own words, in any language, and the AI proposes a summary, topics, decisions, next steps, a self-assessment, and status/stage changes. **You review everything before it's saved.** Your raw notes are always kept.
- **Prep view**: an AI-generated company brief (what they do, product, funding, stack, smart questions to ask) and role summary from the job posting link or pasted text, plus the people you've met and the pending next steps.
- **Overview and analytics**: active processes, processes that need attention, recent activity, funnel, interviews per week, where rejections happen, interview types.
- **Export/import**: full JSON (versioned, with migrations, merge or replace) and flat CSVs for spreadsheets.
- **Spreadsheet importer**: bootstrap from an existing "one row per company" sheet (`.csv` with `,` or `;`, or `.numbers` on macOS).

## Getting started

Requires Node 24 (`nvm use`, see `.nvmrc`) and pnpm.

```bash
pnpm install
pnpm dev                              # API on :8787 + web app on http://localhost:5199
PORT=8790 WEB_PORT=5200 pnpm dev      # if those ports are taken
```

### AI provider

Choose one in **Settings**:

| Provider | What it uses | Notes |
|---|---|---|
| **Claude Code** (default) | Your local Claude Code install and login (`claude -p`) | Uses your Claude Pro/Max plan, so you don't need an API key. Runs with no tools except WebSearch/WebFetch for company briefs, and with no MCP servers, no hooks and no saved sessions. `ANTHROPIC_API_KEY` is removed from the child process so your plan is used. |
| **Anthropic API** | `ANTHROPIC_API_KEY` in `.env` (see `.env.example`) | Pay-as-you-go. Structured outputs plus web search. |
| **Ollama** | A local model, e.g. `gemma4` | Private and free. Slower, and has no web search. Start Ollama first. |

### Importing a spreadsheet

```bash
pnpm seed:csv "path/to/tracker.numbers"         # or .csv; merges into existing data
pnpm seed:csv "path/to/tracker.csv" --replace   # wipe and re-import
pnpm seed:csv "path/to/tracker.csv" --llm       # also generate an AI summary per process
```

Expected columns: `Company` (or `Empresa`), `Description`, `Stage` (a free-text timeline of `- dd/mm/yyyy: …` bullets) and `Status`. Rows with only a company name become wishlist items.

### Scripts

`pnpm test` · `pnpm typecheck` · `pnpm build` · `pnpm start` (serves the built app and the API on one port)

## Architecture

| Layer | Tech | Where |
|---|---|---|
| Data model (single source of truth) | Zod | `src/shared/schema.ts` |
| Local API | Hono on Node, bound to `127.0.0.1` | `server/app.ts` |
| Storage | SQLite via sql.js (WASM, no native build) → `data/pathly.db` | `server/db.ts` |
| AI | `LlmProvider` interface: Claude Code CLI (`--json-schema`), Claude API (`@anthropic-ai/sdk`, structured outputs + web search), Ollama (`/api/chat` with JSON Schema) | `server/llm/` |
| Web | React, React Router, TanStack Query, Tailwind | `src/web/` |

`data/` is git-ignored, so your data never ends up in the repo.

## Data model

- **Company**: name, website, `summary` (editable AI brief) and `notes` (yours). A company can have several processes.
- **Process**: role, location, work mode, source, posting link and text, `jobSummary`, salary, `status`, `stage`, `summary` (living status of the process), applied and closed dates.
- **Entry**: one timeline item.
  - Date, plus `dateIsApprox` when the date was inferred.
  - Kind: `interview`, `assessment`, `email`, `offer`, `note` or `application`.
  - Interview type and interviewers.
  - `rawNotes`: what you wrote, never overwritten.
  - `summary`, topics, decisions, next steps, and a 1–5 self-assessment.
- **StatusChange**: `from → to` history with date and reason; it powers the funnel analytics.

Statuses: `wishlist`, `applied`, `ongoing`, `paused`, `offer` (active) · `accepted`, `declined` (you turned the offer down), `rejected` (they turned you down), `withdrawn` (you dropped out), `ghosted` (closed).

## Export format

`GET /api/export.json` returns:

```json
{ "app": "pathly", "schemaVersion": 1, "exportedAt": "…", "companies": [], "processes": [], "entries": [], "statusChanges": [] }
```

Imports are validated with Zod and migrated from older schema versions (`server/exportImport.ts`). In **merge** mode, records are matched by `id` and the newer `updatedAt` wins. **Replace** mode wipes the existing data first.

## License

MIT
