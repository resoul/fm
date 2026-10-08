#!/usr/bin/env python3
"""
Shows parsing status of a team JSON file.
"""

import argparse
import glob
import json
import os
import sys


def print_team_status(team_file: str):
    if not os.path.exists(team_file):
        print(f"File not found: {team_file}", file=sys.stderr)
        return

    with open(team_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    team_name = data.get("team_name", "Unknown Team")
    players = data.get("players", {})

    total = len(players)
    populated = [p for p in players.values() if p.get("attributes") is not None]
    pending = [p for p in players.values() if p.get("attributes") is None]

    print(f"\n=======================================================")
    print(f" Team: {team_name} ({os.path.basename(team_file)})")
    print(f" Progress: {len(populated)} / {total} players with attributes ({len(populated)*100//total if total else 0}%)")
    print(f"=======================================================\n")

    first_team = [p for p in players.values() if p.get("is_first_team")]
    other_teams = [p for p in players.values() if not p.get("is_first_team")]

    print("--- FIRST TEAM PLAYERS ---")
    print(f"{'Name':<22} | {'Pos':<12} | {'CA':<4} | {'Age':<4} | {'Attributes'}")
    print("-" * 65)
    for p in first_team:
        has_attr = "✓ Done" if p.get("attributes") is not None else "- Pending"
        pos = ", ".join(p.get("positions", []))[:12]
        print(f"{p.get('name', ''):<22} | {pos:<12} | {p.get('ca', 0):<4} | {p.get('age', 0):<4} | {has_attr}")

    if other_teams:
        print(f"\n({len(other_teams)} other squad players from B-team / U19 not listed here)")
    print()


def main():
    parser = argparse.ArgumentParser(description="Check team attributes parsing progress")
    parser.add_argument("team_file", nargs="?", help="Path to team JSON file")
    args = parser.parse_args()

    team_file = args.team_file
    if not team_file:
        candidates = []
        for d in ["workspace/fm-core/data/teams", "data/teams", "."]:
            if os.path.isdir(d):
                candidates.extend(glob.glob(os.path.join(d, "*.json")))
        candidates = [c for c in candidates if not os.path.basename(c).startswith("package")]
        if len(candidates) == 1:
            team_file = candidates[0]
        elif len(candidates) > 1:
            print("Multiple teams found, please specify one:")
            for c in candidates:
                print(f"  {c}")
            sys.exit(1)
        else:
            print("No team JSON files found.", file=sys.stderr)
            sys.exit(1)

    print_team_status(team_file)


if __name__ == "__main__":
    main()
