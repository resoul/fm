#!/usr/bin/env python3
"""
Internal helper (not part of the public CLI pipeline): pulls per-player
{"id": ..., "html": ...} JSON payloads out of a saved Claude Browser
browser_batch tool-result file (one produced whenever the batch output
exceeds the inline token limit) and writes each player's html to
data/raw/players/<id>.html.

Usage:
  python3 scripts/_extract_batch_result.py <tool-result-file> [out_dir]
"""
import json
import sys

PREFIX = "[javascript_tool:javascript_exec] "


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <tool-result-file> [out_dir]", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "data/raw/players"

    with open(path, "r", encoding="utf-8") as f:
        outer = json.load(f)

    decoder = json.JSONDecoder()
    count = 0
    for item in outer:
        t = item.get("text", "")
        if not t.startswith(PREFIX):
            continue
        t = t[len(PREFIX):]
        try:
            inner, _ = decoder.raw_decode(t)
            obj = json.loads(inner)
        except Exception as e:
            print(f"decode fail: {e}: {t[:120]!r}", file=sys.stderr)
            continue
        pid = obj["id"]
        html = obj["html"]
        with open(f"{out_dir}/{pid}.html", "w", encoding="utf-8") as out:
            out.write(html)
        count += 1
        print(pid, len(html))
    print(f"total saved: {count}", file=sys.stderr)


if __name__ == "__main__":
    main()
