# MAVIS Dashboard

Next.js / React / strict TypeScript frontend for architecture learning, source analysis, runtime evidence and versioned coursework. Stage 2 reuses the Stage 1 shell, role navigation and Light/Dark/System semantic styles.

The default is **backend mode**. The shared `/api/mavis` boundary connects the component screens and source analysis to Java. Mock previews require the explicit setting `MAVIS_API_MODE=mock`.

For a new Windows clone, start with [the clean-clone runbook](../docs/CLEAN_CLONE_SETUP.md) and repository-root `Start-Mavis.ps1`. Database credentials and verified-account passwords are intentionally absent from Git. Java and FE must come from the same revision; the integrated FE requires Java `/api/v1/auth/me`.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0baf637b-d700-4068-b6ba-1780cbb74ebe).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>/MAVIS-Frontend
npm ci
npm run dev
```

Run `npm run typecheck`, `npm test`, and `npm run build` for verification. Copy `.env.example` to `.env.local` to select mock scenarios or configure backend mode. Never commit session secrets or expose them through `NEXT_PUBLIC_*` settings.

In mock mode `/login` offers labeled sample accounts. For actual login, use backend mode and an active verified account stored in the configured database; seed placeholder passwords cannot authenticate.

Set `MAVIS_JAVA_URL=http://127.0.0.1:8081` server-side if running FE manually. The root launcher supplies backend mode and the paired ports/keys automatically. Restart Next.js after changing environment variables. Run `npm run typecheck`, `npm test`, `npm run test:mainflow` and `npm run build` for verification.
