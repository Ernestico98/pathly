# Pathly

Seguimiento local de procesos de selección: cronología de cada entrevista, resúmenes con IA (Claude u Ollama), fichas de empresa y puesto para preparar entrevistas, analíticas y export/import.

## Arrancar

Requiere Node 24 (`nvm use`, ver `.nvmrc`).

```bash
pnpm install
pnpm dev                      # API en :8787 + web en http://localhost:5199
PORT=8790 WEB_PORT=5200 pnpm dev   # si esos puertos están ocupados
```

### IA

Se elige en **Ajustes**:

- **Claude Code (por defecto)**: usa tu instalación y login de Claude Code (`claude -p`), así que tira de tu plan Pro/Max, sin API key. Ejecuta sin herramientas (solo WebSearch/WebFetch para fichas de empresa), sin MCP, sin hooks y sin guardar sesiones. Si tienes `ANTHROPIC_API_KEY` en el entorno, se quita al lanzar el CLI para no facturar la API por error.
- **API de Anthropic**: `ANTHROPIC_API_KEY` en `.env` (ver `.env.example`).
- **Ollama**: modelo local (p. ej. `gemma4`); arranca Ollama antes.

Importar el Excel original (CSV exportado desde Excel):

```bash
pnpm seed:csv "~/Downloads/Interview process(Sheet1).csv"            # fusiona
pnpm seed:csv "<csv>" --replace                                        # borra y reimporta
pnpm seed:csv "<csv>" --llm                                            # + resumen IA de cada proceso
```

Tests: `pnpm test` · Tipos: `pnpm typecheck`

## Arquitectura

| Capa | Tecnología | Dónde |
|---|---|---|
| Modelo de datos (fuente única) | Zod | `src/shared/schema.ts` |
| API local | Hono en Node, solo `127.0.0.1` | `server/app.ts` |
| Persistencia | SQLite vía sql.js (WASM, sin compilación nativa) → `data/pathly.db` | `server/db.ts` |
| IA | interfaz `LlmProvider`: Claude Code CLI (`--json-schema`), API de Claude (`@anthropic-ai/sdk`, salidas estructuradas + búsqueda web) u Ollama (`/api/chat` con JSON Schema) | `server/llm/` |
| Web | React + React Router + TanStack Query + Tailwind | `src/web/` |

`data/` está en `.gitignore`: tus datos no se versionan.

## Modelo

- **Company**: nombre, web, `summary` (ficha IA editable), `notes` (tuyas). Una empresa puede tener varios procesos.
- **Process**: puesto, ubicación, modalidad, fuente, link y texto de la oferta, `jobSummary`, salario, `status`, `stage`, `summary` (estado vivo del proceso), fechas de aplicación/cierre.
- **Entry** (cronología): fecha (+ `dateIsApprox`), tipo (`interview`, `assessment`, `email`, `offer`, `note`, `application`), tipo de entrevista, entrevistadores, `rawNotes` (lo que escribiste, nunca se sobrescribe), `summary`, temas, decisiones, siguientes pasos, autoevaluación 1–5.
- **StatusChange**: historial `from → to` con fecha y motivo; alimenta las analíticas de embudo.

Estados: `wishlist`, `applied`, `ongoing`, `paused`, `offer` (activos) · `accepted`, `declined` (yo rechazo la oferta), `rejected` (me descartan), `withdrawn` (abandono yo), `ghosted` (cerrados).

## Export / import

`GET /api/export.json` devuelve `{ app: "pathly", schemaVersion, exportedAt, companies, processes, entries, statusChanges }`.
Al importar se valida con Zod y se migra desde versiones anteriores (`server/exportImport.ts`). Modos: **merge** (por `id`, gana el `updatedAt` más reciente) o **replace**. También hay CSV planos de procesos y entradas para Excel.
