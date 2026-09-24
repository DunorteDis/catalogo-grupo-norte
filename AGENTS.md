# Notas para agentes

Projeto Next.js 16 + Postgres (schema `crm`, SQL direto via postgres.js). Veja README.md.

A interface segue o design system Abastex: tokens em `src/abastex.css` (tema escuro por `data-theme="dark"` no `<html>`), mapa para as classes do Tailwind/shadcn em `src/styles.css` e componentes (PageHeader, KpiCard, IconTile, FilterTabs, ListRow...) em `src/components/abastex.tsx`. Use os tokens, nunca hex solto; a cor de uma distribuidora é dado, não tema.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
