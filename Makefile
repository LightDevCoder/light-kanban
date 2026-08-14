BINARY := light-kanban
DIST := dist
GO ?= go

.PHONY: build test vet cross run clean

build:
	$(GO) build -o $(DIST)/$(BINARY) ./cmd/light-kanban

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

# Cross-compiled release artifacts (linux / darwin amd64+arm64; windows
# keeps the plain name light-kanban.exe that the docs reference).
cross:
	GOOS=linux GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban-linux-amd64 ./cmd/light-kanban
	GOOS=darwin GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban-darwin-amd64 ./cmd/light-kanban
	GOOS=darwin GOARCH=arm64 $(GO) build -o $(DIST)/light-kanban-darwin-arm64 ./cmd/light-kanban
	GOOS=windows GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban.exe ./cmd/light-kanban

run:
	$(GO) run ./cmd/light-kanban -addr :8080

clean:
	rm -rf $(DIST)
