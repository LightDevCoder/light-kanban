BINARY := light-kanban
DIST := dist
GO ?= go
NPM ?= npm
FRONTEND_DIR := frontend
WEBUI_DIST := internal/webui/dist

.PHONY: build test vet cross run clean frontend-install frontend-build dev-frontend check

# Install frontend deps exactly from the lockfile (first run / after upgrades).
frontend-install:
	cd $(FRONTEND_DIR) && $(NPM) ci

# Build the React frontend and stage it where go:embed picks it up.
frontend-build:
	cd $(FRONTEND_DIR) && [ -d node_modules ] || $(NPM) ci
	cd $(FRONTEND_DIR) && $(NPM) run build
	rm -rf $(WEBUI_DIST)
	cp -R $(FRONTEND_DIR)/dist $(WEBUI_DIST)

# Production binary with the embedded frontend.
build: frontend-build
	$(GO) build -o $(DIST)/$(BINARY) ./cmd/light-kanban

# Tests exercise the Go seams (HTTP API + store); the committed webui/dist
# keeps them green on a fresh clone without npm.
test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

# Cross-compiled release artifacts (linux / darwin amd64+arm64; windows
# keeps the plain name light-kanban.exe that the docs reference).
cross: frontend-build
	GOOS=linux GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban-linux-amd64 ./cmd/light-kanban
	GOOS=darwin GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban-darwin-amd64 ./cmd/light-kanban
	GOOS=darwin GOARCH=arm64 $(GO) build -o $(DIST)/light-kanban-darwin-arm64 ./cmd/light-kanban
	GOOS=windows GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban.exe ./cmd/light-kanban

# Pre-commit gate (SPEC v1.0.3 Fix 6): rebuild the frontend, verify the
# committed embedded dist matches the source, and run every Go check.
# CI (.github/workflows/ci.yml) runs the same steps.
check: frontend-build
	test -z "$$(gofmt -l cmd internal scripts)"
	$(GO) vet ./...
	$(GO) test ./...
	git diff --exit-code -- $(WEBUI_DIST)

run:
	$(GO) run ./cmd/light-kanban -addr :8641

# Frontend dev server (proxies /api to the Go backend on :8641).
dev-frontend:
	cd $(FRONTEND_DIR) && $(NPM) run dev

clean:
	rm -rf $(DIST)
