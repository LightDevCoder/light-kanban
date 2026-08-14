# Go single binary for the Light-Kanban service

Light-Kanban is a self-hosted task board that any agent must be able to talk to over HTTP. We decided to build it in Go (chi router, `modernc.org/sqlite` pure-Go driver, embedded static frontend) compiled to a single cross-platform binary, so deployment is one executable and any agent can `curl` one port.

## Considered Options

- **Go single binary (chosen)** — single-file artifact, zero runtime dependency, proven by Vikunja / Kanboard / Focalboard. The author does not write Go, so maintenance is delegated to agents via written constraints.
- **Bun + TypeScript (`bun build --compile`)** — single binary plus a language the author can read; rejected because Bun's ecosystem is newer and less proven.
- **Node + TypeScript + Hono** — most familiar to the author; rejected because it needs a Node runtime and is not a single-file artifact.

## Consequences

- The author reviews the Go codebase only at a high level; day-to-day maintenance is delegated to agents via the project's written constraints.
- Cross-compiled single binaries for Linux / macOS / Windows are expected to be the release artifact.
