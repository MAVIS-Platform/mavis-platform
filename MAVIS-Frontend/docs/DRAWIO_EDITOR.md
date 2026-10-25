# Local draw.io editor

Start Docker Desktop, then run from the repository root:

```powershell
docker compose -f compose.drawio.yml up -d
```

In Architecture diagrams, choose a generated diagram and DRAWIO_XML. The real editor is served on http://127.0.0.1:8090 and embedded in the frontend in offline mode. The iframe bridge accepts messages only from that origin and the current iframe window. Diagram XML is not posted to an external editor service.

Move shapes, connect arrows, edit labels, use draw.io's layout menu, and open Fullscreen for more space. Save draft and autosave persist XML in localStorage, scoped to the authenticated user, immutable model ID and diagram ID. Download edited .drawio retrieves the current editor document. Download generated diagram remains the original Java export.

Drafts stay in this browser. They are not synchronized to Java/PostgreSQL, do not modify the semantic architecture model, and are not part of submissions or analysis evidence. Clearing browser storage removes drafts; download the edited document to keep a separate copy. Reopening the same account/model/diagram restores its local draft.

Stop the optional editor with `docker compose -f compose.drawio.yml stop`. This does not stop Java, Worker or the frontend. The initial integration targets local development; a deployed installation needs its own editor origin/proxy configuration.