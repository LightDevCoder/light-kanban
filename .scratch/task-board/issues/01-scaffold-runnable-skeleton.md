# 01 — Scaffold & runnable skeleton

**What to build:** A runnable Go service skeleton — an HTTP server (chi), a SQLite database with the `tasks` and `agents` tables, an embedded web UI shell (empty board page), and a `/api/health` endpoint. Buildable to a single binary, with cross-compile targets for Linux / macOS / Windows.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Running the build produces a single executable that starts an HTTP server on a configured port.
- [x] `GET /api/health` returns 200 with a JSON body confirming the service and database are reachable.
- [x] The SQLite database is created on first run with the `tasks` and `agents` tables (fields per the spec schema).
- [x] The server serves the embedded web UI shell (the board page loads, even if empty).
- [x] Cross-compiling for linux / darwin / windows produces three platform binaries.
