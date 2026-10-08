#!/bin/sh
set -eu

binary=${1:-./bin/fm-cli}
smoke_dir=$(mktemp -d)
trap 'rm -rf "$smoke_dir"' EXIT HUP INT TERM

check() {
    expected=$1
    shift
    actual=0
    "$binary" "$@" >"$smoke_dir/stdout" 2>"$smoke_dir/stderr" || actual=$?
    if [ "$actual" -ne "$expected" ]; then
        echo "Unexpected exit $actual (wanted $expected): $*" >&2
        cat "$smoke_dir/stderr" >&2
        exit 1
    fi
    if [ "$expected" -eq 0 ]; then
        test -s "$smoke_dir/stdout"
        test ! -s "$smoke_dir/stderr"
    else
        test ! -s "$smoke_dir/stdout"
        test -s "$smoke_dir/stderr"
    fi
}

check 0 help
check 0 version
check 0 run --help
check 2 unknown-command
check 2 run --input missing.json
check 2 validate --input missing.json
check 0 validate --input fixtures/match/equal.json
check 0 validate --input fixtures/match/favorite.json
check 0 validate --input fixtures/match/tired.json
check 0 validate --input fixtures/match/equal.json --config configs/baseline.json
check 0 validate --input fixtures/match/equal.json --config configs/short_test.json
check 2 validate --input testdata/match/missing_gk.json
check 2 validate --input fixtures/match/equal.json --config testdata/config/zero_step.json
check 0 validate --input fixtures/match/equal_b1.json --config configs/b1_short_test.json
check 2 validate --input fixtures/match/equal.json --config configs/b1_short_test.json
check 1 run --input fixtures/match/equal.json --config configs/b1_short_test.json --seed 0
check 2 run --input missing.json --seed 0 --format json --record "$smoke_dir/recording"
check 1 replay --record "$smoke_dir/recording" --verify
check 2 batch --input missing.json --seed 42 --count 2 --out "$smoke_dir/batch"
test ! -e "$smoke_dir/recording"
test ! -e "$smoke_dir/batch"
check 0 run --input fixtures/match/equal.json --config configs/short_test.json --commands fixtures/commands/halftime.json --seed 3 --format json --record "$smoke_dir/completed"
check 0 replay --record "$smoke_dir/completed" --verify
check 0 run --input fixtures/match/equal_b1.json --config configs/b1_short_test.json --seed 509 --ai-coach --format json --record "$smoke_dir/coached"
check 0 replay --record "$smoke_dir/coached" --verify
check 0 run --input fixtures/match/equal_b1.json --config configs/b1_short_test.json --seed 509 --ai-coach
check 0 batch --input fixtures/match/equal.json --config configs/short_test.json --seed 500 --count 20 --workers 1 --out "$smoke_dir/batch1"
check 0 batch --input fixtures/match/equal.json --config configs/short_test.json --seed 500 --count 20 --workers 4 --out "$smoke_dir/batch4"
cmp "$smoke_dir/batch1/results.ndjson" "$smoke_dir/batch4/results.ndjson"
cmp "$smoke_dir/batch1/summary.json" "$smoke_dir/batch4/summary.json"
check 0 batch --input fixtures/match/real/fc_barcelona_vs_manchester_city.json --config configs/short_test.json --seed 500 --count 4 --workers 2 --mirror --out "$smoke_dir/mirror"
test -s "$smoke_dir/mirror/paired.json"
test -s "$smoke_dir/mirror/mirrored/results.ndjson"
grep -q '"distributions"' "$smoke_dir/mirror/summary.json"
echo "CLI smoke passed."
