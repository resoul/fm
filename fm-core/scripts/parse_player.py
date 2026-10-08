#!/usr/bin/env python3
"""
FMInside Player Attributes HTML Parser & Team Integrator.

Parses player attributes HTML snippet and links/saves it directly into
the team JSON file by Player ID or Name.

Features:
- Detects player ID / name automatically from HTML if present (from URL, photo ID, or header).
- Or matches player by --player (ID or Name, e.g. --player 67293495 or --player Pedri).
- Updates the player's 'attributes' block inside the team JSON file.
- Keeps 1-20 FM attributes, 1-99 display values, and pre-calculated engine_attributes_v2.

Usage:
  # Add attributes to Pedri in fc_barcelona.json:
  python3 scripts/parse_player.py pedri_stats.txt -t fc_barcelona.json -p Pedri

  # If player ID or name is inside the HTML snippet (e.g. from URL or photo):
  python3 scripts/parse_player.py pedri_page.txt -t fc_barcelona.json

  # Standalone mode (just print player JSON to stdout):
  python3 scripts/parse_player.py pedri_stats.txt
"""

import argparse
import glob
import html
import json
import os
import re
import sys


def clean_html_text(text: str) -> str:
    if not text:
        return ""
    stripped = re.sub(r"<[^>]+>", "", text)
    return html.unescape(stripped).strip()


def detect_player_identity(html_content: str):
    """
    Attempts to extract player ID and name if present in the HTML snippet.
    """
    player_id = None
    player_name = None

    # Try from URL: /players/7-fm-26/67293495-pedri
    url_match = re.search(r"/players/[^/]+/(\d+)-([a-z0-9\-]+)", html_content, re.IGNORECASE)
    if url_match:
        player_id = url_match.group(1)
        player_name = url_match.group(2).replace("-", " ").title()

    # Try from face image: facesfm26/67293495.png
    if not player_id:
        img_match = re.search(r"/facesfm26/(\d+)\.png", html_content)
        if img_match:
            player_id = img_match.group(1)

    # Try from <h1>Name</h1>
    h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", html_content, re.IGNORECASE)
    if h1_match:
        h1_text = clean_html_text(h1_match.group(1))
        if h1_text and "attributes" not in h1_text.lower():
            player_name = h1_text

    return player_id, player_name


def parse_player_attributes(html_content: str):
    row_pattern = re.compile(
        r'<tr\s+id="([^"]+)">\s*'
        r'<td\s+class="name">(?:<button[^>]*?data-player-stat-name="([^"]+)"[^>]*?>([^<]+)</button>|([^<]+))</td>\s*'
        r'<td\s+class="stat\s+([^"]+)">([^<]+)</td>\s*'
        r"</tr>",
        re.DOTALL | re.IGNORECASE,
    )

    category_pattern = re.compile(
        r"<h3[^>]*>([^<]+)</h3>\s*<table[^>]*>.*?<tbody>(.*?)</tbody>\s*</table>",
        re.DOTALL | re.IGNORECASE,
    )

    categories = {}
    all_attributes_20 = {}
    all_attributes_99 = {}

    for cat_match in category_pattern.finditer(html_content):
        cat_name = clean_html_text(cat_match.group(1))
        cat_body = cat_match.group(2)
        cat_dict_20 = {}
        cat_dict_99 = {}

        for row in row_pattern.finditer(cat_body):
            stat_id = row.group(1).strip()
            stat_name = row.group(2) or row.group(3) or row.group(4) or stat_id
            stat_name = stat_name.strip()
            class_str = row.group(5).strip()
            val_99_str = row.group(6).strip()

            val_20 = 0
            val_20_match = re.search(r"value_(\d+)", class_str)
            if val_20_match:
                val_20 = int(val_20_match.group(1))

            try:
                val_99 = int(val_99_str)
            except ValueError:
                val_99 = val_20 * 5

            cat_dict_20[stat_name] = val_20
            cat_dict_99[stat_name] = val_99
            all_attributes_20[stat_id] = val_20
            all_attributes_99[stat_id] = val_99

        if cat_dict_20:
            categories[cat_name] = {
                "fm_scale_20": cat_dict_20,
                "display_scale_99": cat_dict_99,
            }

    # Fallback if categories wrapper wasn't matched
    if not all_attributes_20:
        for row in row_pattern.finditer(html_content):
            stat_id = row.group(1).strip()
            stat_name = row.group(2) or row.group(3) or row.group(4) or stat_id
            stat_name = stat_name.strip()
            class_str = row.group(5).strip()
            val_99_str = row.group(6).strip()

            val_20 = 0
            val_20_match = re.search(r"value_(\d+)", class_str)
            if val_20_match:
                val_20 = int(val_20_match.group(1))

            try:
                val_99 = int(val_99_str)
            except ValueError:
                val_99 = val_20 * 5

            all_attributes_20[stat_id] = val_20
            all_attributes_99[stat_id] = val_99

    # Build clean match-engine dictionary (domain.PlayerAttributes schema v2)
    engine_attributes = {
        # Outfield (1..20)
        "pace": all_attributes_20.get("pace", 10),
        "acceleration": all_attributes_20.get("acceleration", 10),
        "stamina": all_attributes_20.get("stamina", 10),
        "passing": all_attributes_20.get("passing", 10),
        "first_touch": all_attributes_20.get("first-touch", 10),
        "dribbling": all_attributes_20.get("dribbling", 10),
        "tackling": all_attributes_20.get("tackling", 10),
        "positioning": all_attributes_20.get("positioning", 10),
        "decisions": all_attributes_20.get("decisions", 10),
        "finishing": all_attributes_20.get("finishing", 10),
        "long_shots": all_attributes_20.get("long-shots", 10),
        "crossing": all_attributes_20.get("crossing", 10),
        "heading": all_attributes_20.get("heading", 10),
        "jumping_reach": all_attributes_20.get("jumping-reach", 10),
        "corners": all_attributes_20.get("corners", 10),
        "free_kick_taking": all_attributes_20.get("free-kick-taking", 10),
        "penalty_taking": all_attributes_20.get("penalty-taking", 10),
        # Goalkeeper (1..20)
        "handling": all_attributes_20.get("handling", 0),
        "reflexes": all_attributes_20.get("reflexes", 0),
        "one_on_ones": all_attributes_20.get("one-on-ones", 0),
        "aerial_reach": all_attributes_20.get("aerial-reach", 0),
        "command_of_area": all_attributes_20.get("command-of-area", 0),
        "kicking": all_attributes_20.get("kicking", 0),
        "throwing": all_attributes_20.get("throwing", 0),
        # Preferred foot (default right 20, left 10 if not given)
        "left": all_attributes_20.get("left-foot", 10),
        "right": all_attributes_20.get("right-foot", 20),
    }

    return {
        "categories": categories,
        "raw_attributes_20": all_attributes_20,
        "raw_attributes_99": all_attributes_99,
        "engine_attributes_v2": engine_attributes,
    }


def find_target_player(players: dict, query: str):
    """
    Finds player in team players dict by ID or Name.
    """
    if not query:
        return None, None

    q = str(query).strip()

    # Exact ID match
    if q in players:
        return q, players[q]

    # Exact name match (case-insensitive)
    for pid, p in players.items():
        if p.get("name", "").strip().lower() == q.lower():
            return pid, p

    # Partial name match (case-insensitive)
    matches = []
    for pid, p in players.items():
        if q.lower() in p.get("name", "").strip().lower():
            matches.append((pid, p))

    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        names = [f"{m[1].get('name')} (ID: {m[0]})" for m in matches]
        print(f"Ambiguous player query '{query}'. Matches found: {', '.join(names)}", file=sys.stderr)
        return None, None

    return None, None


def main():
    parser = argparse.ArgumentParser(
        description="Parse player attributes from HTML snippet and attach to player in team JSON file"
    )
    parser.add_argument(
        "input_file",
        nargs="?",
        help="Path to txt/html file with player attributes. If omitted, reads from stdin.",
    )
    parser.add_argument(
        "-t",
        "--team",
        help="Path to team JSON file to update (e.g. fc_barcelona.json).",
    )
    parser.add_argument(
        "-p",
        "--player",
        help="Player ID or Name to attach attributes to (e.g. -p 67293495 or -p Pedri).",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Output path for standalone player JSON (used when not updating a team file).",
    )

    args = parser.parse_args()

    if args.input_file:
        try:
            with open(args.input_file, "r", encoding="utf-8") as f:
                content = f.read()
        except OSError as err:
            print(f"Error opening file '{args.input_file}': {err}", file=sys.stderr)
            sys.exit(1)
    else:
        if sys.stdin.isatty():
            parser.print_help()
            sys.exit(1)
        content = sys.stdin.read()

    # 1. Parse attributes
    attr_data = parse_player_attributes(content)
    if not attr_data["raw_attributes_20"]:
        print("Warning: No attributes found in input.", file=sys.stderr)
        sys.exit(1)

    # 2. Try to auto-detect player ID or name from HTML
    detected_id, detected_name = detect_player_identity(content)
    player_query = args.player or detected_id or detected_name

    # 3. If team file is specified or can be found:
    team_file = args.team
    if team_file:
        possible_paths = [
            team_file,
            f"{team_file}.json",
            os.path.join("workspace/fm-core/data/teams", team_file if team_file.endswith(".json") else f"{team_file}.json"),
            os.path.join("data/teams", team_file if team_file.endswith(".json") else f"{team_file}.json"),
        ]
        for p in possible_paths:
            if os.path.exists(p):
                team_file = p
                break
    else:
        candidates = []
        for d in ["workspace/fm-core/data/teams", "data/teams", "."]:
            if os.path.isdir(d):
                candidates.extend(glob.glob(os.path.join(d, "*.json")))
        candidates = [c for c in candidates if not os.path.basename(c).startswith("package")]
        if len(candidates) == 1:
            team_file = candidates[0]

    # Collect all candidate team files
    team_files_to_search = []
    if team_file and os.path.exists(team_file):
        team_files_to_search = [team_file]
    elif team_file:
        print(f"Error: Team file '{team_file}' not found.", file=sys.stderr)
        sys.exit(1)
    else:
        # No --team given: search all known team dirs
        for d in ["workspace/fm-core/data/teams", "data/teams", "."]:
            if os.path.isdir(d):
                team_files_to_search.extend(glob.glob(os.path.join(d, "*.json")))
        team_files_to_search = [
            c for c in team_files_to_search
            if not os.path.basename(c).startswith("package")
        ]

    if team_files_to_search:
        if not player_query:
            print(
                f"Error: Could not identify player from input HTML.\n"
                f"Please specify --player with player name or ID (e.g. -p Pedri or -p 67293495).",
                file=sys.stderr,
            )
            sys.exit(1)

        found_any = False
        last_player_entry = None

        for tf in team_files_to_search:
            try:
                with open(tf, "r", encoding="utf-8") as f:
                    team_data = json.load(f)
            except Exception as e:
                print(f"Warning: Could not read '{tf}': {e}", file=sys.stderr)
                continue

            players = team_data.get("players", {})
            pid, player_entry = find_target_player(players, player_query)
            if not player_entry:
                continue

            # Attach attributes to player
            player_entry["attributes"] = {
                "categories": attr_data["categories"],
                "engine_v2": attr_data["engine_attributes_v2"],
            }

            # Save updated team file
            with open(tf, "w", encoding="utf-8") as f:
                json.dump(team_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            populated_count = sum(1 for p in players.values() if p.get("attributes") is not None)
            total_count = len(players)
            print(
                f"✓ Attached attributes to {player_entry['name']} (ID: {pid}) in '{tf}'\n"
                f"  Team attributes progress: {populated_count}/{total_count} players populated.",
                file=sys.stderr,
            )
            found_any = True
            last_player_entry = player_entry

        if not found_any:
            searched = ", ".join(team_files_to_search)
            print(
                f"Error: Player '{player_query}' not found in any team file.\n"
                f"Searched: {searched}",
                file=sys.stderr,
            )
            sys.exit(1)

        # Print updated player record (last match)
        print(json.dumps(last_player_entry, indent=2, ensure_ascii=False))

    else:
        # Standalone mode: just output the parsed attributes
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(attr_data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            print(f"Saved player attributes to '{args.output}'", file=sys.stderr)
        else:
            print(json.dumps(attr_data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
