<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## FoodLab workflow

- Use the existing checkout; each cloud task is isolated. Do not create a worktree unless the user requests it.
- `main` is the approved stable source. Develop changes on `develop` or a feature branch. Save meaningful verified checkpoints in Git and preserve release tags; never rewrite published history to remove a release.
- The stable app/runtime and testing app/runtime are separate. Preserve `/workspace/food-runtime`, `/workspace/food-runtime-staging`, and `/workspace/food-releases`. Use `npm run supabase:staging` and port 3001 for new work. Never point testing at the stable database.
- Promote a particular candidate to stable after the user has approved that candidate in the conversation. Reuse an approval already given; local preview, fixes, tests, commits and authorized GitHub history saves do not require repeated confirmation.
- Source is not the only backup. Back up PostgreSQL before migrations, validate restoration in an isolated database, and keep runtime secrets separately. Code rollback must preserve current user data and enforce schema compatibility. Never use destructive resets or delete database volumes to implement rollback.
- No secret belongs in Git, public env variables, logs or chat. Server AI keys are configured securely. Public anon keys are protected by RLS, not hidden in client code.
- The meal builder distinguishes daily per-person nutrition, plate size, cooked yield, batch quantities and actual consumption. Approved menus and consumed meals reference frozen recipe snapshots.
- AI nutrition/price/instrument claims require sources or clear estimate labels. Unconfigured AI and live-store integrations must not be presented as working. Synthetic test prices must never be seeded into real user carts.
- Verify relevant changes with unit tests, typecheck, production build and desktop/mobile browser scenarios. Live cloud tests and restore checks target the testing runtime and remove only their own disposable accounts/databases.
- Read `docs/IMPLEMENTATION_V2.md`, `docs/RELEASES.md`, `VALIDATION.md` and `deploy/README.md` for current startup, release and external-service limitations. Update them when behaviour changes.
