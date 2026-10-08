#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PROTO="$ROOT/api/proto/fm/match/v1/match.proto"
CSHARP_OUT="$ROOT/../fm-simulation/Assets/FM/Generated/Proto/Match/V1"

command -v protoc >/dev/null 2>&1 || { echo "protoc is required" >&2; exit 1; }
if ! command -v protoc-gen-go >/dev/null 2>&1; then
  GOPATH_BIN=$(go env GOPATH)/bin
  PATH="$GOPATH_BIN:$PATH"
  export PATH
fi
command -v protoc-gen-go >/dev/null 2>&1 || { echo "protoc-gen-go is required" >&2; exit 1; }
mkdir -p "$ROOT/gen/go" "$CSHARP_OUT"

protoc \
  --experimental_allow_proto3_optional \
  --proto_path="$ROOT/api/proto" \
  --go_out="$ROOT" \
  --go_opt=module=github.com/resoul/fm-core \
  --csharp_out="$CSHARP_OUT" \
  "$PROTO"

echo "Generated Go and C# protobuf sources from ${PROTO#$ROOT/}"
