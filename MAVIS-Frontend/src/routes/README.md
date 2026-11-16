# Route components

The application uses the Next.js App Router. URL entrypoints live in `app/`,
while the interactive page components remain in this directory so they can be
shared and tested independently from the route wrappers.

| App Router entrypoint | Component |
| --- | --- |
| `app/page.tsx` | `src/routes/index.tsx` |
| `app/import/page.tsx` | `src/routes/import.tsx` |
| `app/architecture/page.tsx` | `src/routes/architecture.tsx` |
| `app/impact/page.tsx` | `src/routes/impact.tsx` |
| `app/explain/page.tsx` | `src/routes/explain.tsx` |
