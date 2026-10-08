GO ?= go
BINARY := bin/fm-cli

.PHONY: help build test vet fmt fmt-check check smoke bench proto

help:
	@echo "Targets: build test vet fmt fmt-check check smoke bench proto"

proto:
	sh scripts/generate-proto.sh

build:
	@mkdir -p bin
	$(GO) build -trimpath -o $(BINARY) ./cmd/fm-cli

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

fmt:
	gofmt -w .

fmt-check:
	@files="$$(gofmt -l .)" || exit 1; if [ -n "$$files" ]; then echo "Run make fmt:"; echo "$$files"; exit 1; fi

check: fmt-check test vet

smoke: build
	sh scripts/smoke.sh ./$(BINARY)

bench:
	$(GO) test ./internal/match/engine/... ./internal/recording/... -run '^$$' -bench . -benchmem
