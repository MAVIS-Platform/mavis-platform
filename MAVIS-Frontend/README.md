# MAVIS Dashboard

Next.js / React / strict TypeScript frontend for architecture learning, source analysis, runtime evidence and versioned coursework. Stage 2 reuses the Stage 1 shell, role navigation and Light/Dark/System semantic styles.

The default is **mock mode**, with clearly labeled sample accounts/data and simulated operations. No backend integration has been verified. See the [architecture](docs/architecture/stage-2.md) and [API integration checklist](docs/architecture/api-integration.md).

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
cd <repository-name>
npm ci
npm run dev
```

Run `npm run typecheck`, `npm test`, and `npm run build` for verification. Copy `.env.example` to `.env.local` to select mock scenarios or configure backend mode. Never commit session secrets or expose them through `NEXT_PUBLIC_*` settings.

In mock mode `/login` offers Student, Lecturer and Administrator sample accounts. Reload resets sample changes; switching sample roles keeps the current in-memory submissions available for review.
