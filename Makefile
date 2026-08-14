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

# Cross-compiled release artifacts (linux / darwin / windows, amd64).
cross:
	GOOS=linux GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban-linux-amd64 ./cmd/light-kanban
	GOOS=darwin GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban-darwin-amd64 ./cmd/light-kanban
	GOOS=windows GOARCH=amd64 $(GO) build -o $(DIST)/light-kanban-windows-amd64.exe ./cmd/light-kanban

run:
	$(GO) run ./cmd/light-kanban -addr :8080

clean:
	rm -rf $(DIST)
