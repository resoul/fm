#!/usr/bin/env python3
"""
FMInside Squad Table HTML Parser.

Parses club squad table HTML snippet into a team JSON file.
- If team JSON file doesn't exist, creates it.
- If it already exists, updates/merges player info without overwriting
  already parsed player attributes!

Usage:
  # Auto-creates <team_name>.json (e.g. fc_barcelona.json):
  python3 scripts/parse_squad.py squad.txt

  # Explicit output file:
  python3 scripts/parse_squad.py squad.txt -o data/barcelona.json

  # Only first team players:
  python3 scripts/parse_squad.py squad.txt --first-team-only -o data/barcelona.json
"""

import argparse
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


def extract_team_name(html_content: str) -> str:
    """Extracts team name from the squad heading, e.g. <h2>FC Barcelona squad</h2>.

    The page has several unrelated <h2> elements before it (e.g. "Community
    Chat"), so this specifically requires the "... squad" suffix rather than
    matching the first <h2> in document order.
    """
    match = re.search(r"<h2[^>]*>([^<]*?\s+squad)</h2>", html_content, re.IGNORECASE)
    if match:
        name = clean_html_text(match.group(1))
        name = re.sub(r"\s+squad$", "", name, flags=re.IGNORECASE)
        return name
    return "Team"


def parse_squad_html(html_content: str, first_team_only: bool = False):
    row_pattern = re.compile(
        r'<tr\s+[^>]*?data-club-squad-row=""(.*?)</tr>',
        re.DOTALL | re.IGNORECASE,
    )
    attr_pattern = re.compile(r'data-([a-z\-]+)="([^"]*)"', re.IGNORECASE)

    players = {}

    for row_match in row_pattern.finditer(html_content):
        row_content = row_match.group(0)
        tr_opening = row_content[: row_content.find(">")]

        attrs = dict(attr_pattern.findall(tr_opening))
        team_group = attrs.get("club-team", "")
        is_first_team = team_group == "first-team"

        if first_team_only and not is_first_team:
            continue

        player_link_match = re.search(
            r'<a\s+[^>]*?class="club-squad-player"[^>]*?href="([^"]+)"',
            row_content,
            re.IGNORECASE,
        )
        relative_url = player_link_match.group(1) if player_link_match else ""

        id_match = re.search(r"/players/[^/]+/(\d+)-", relative_url)
        fm_id = id_match.group(1) if id_match else attrs.get("name", "")

        img_match = re.search(
            r'<img\s+[^>]*?src="([^"]+)"', row_content, re.IGNORECASE
        )
        photo_url = img_match.group(1) if img_match else ""
        if photo_url.startswith("//"):
            photo_url = "https:" + photo_url

        name_match = re.search(
            r"<strong>(.*?)</strong>", row_content, re.IGNORECASE
        )
        if name_match:
            name = clean_html_text(name_match.group(1))
        else:
            name = attrs.get("name", "").title()

        small_match = re.search(
            r"<small>(.*?)</small>", row_content, re.IGNORECASE
        )
        nation = ""
        sub_team = ""
        if small_match:
            parts = [p.strip() for p in clean_html_text(small_match.group(1)).split("·")]
            nation = parts[0] if len(parts) > 0 else ""
            sub_team = parts[1] if len(parts) > 1 else ""

        pos_match = re.search(
            r'<span\s+[^>]*?class="club-position-list"[^>]*?>(.*?)</span>',
            row_content,
            re.IGNORECASE,
        )
        positions = []
        if pos_match:
            raw_pos = clean_html_text(pos_match.group(1))
            positions = [p.strip() for p in raw_pos.split(",") if p.strip()]

        time_match = re.search(
            r'<time\s+[^>]*?datetime="([^"]+)"', row_content, re.IGNORECASE
        )
        contract_until = time_match.group(1) if time_match else ""

        wage_match = re.search(
            r"<td>(€[^<]+(?:<acronym[^>]*>[^<]+</acronym>)?[^<]*)<small[^>]*?>\s*pw</small></td>",
            row_content,
            re.IGNORECASE,
        )
        wage = clean_html_text(wage_match.group(1)) + " pw" if wage_match else ""

        value_match = re.search(
            r'<td\s+[^>]*?class="club-squad-value"[^>]*?>.*?<span\s+[^>]*?class="price"[^>]*?>(.*?)</span>',
            row_content,
            re.DOTALL | re.IGNORECASE,
        )
        value_formatted = clean_html_text(value_match.group(1)) if value_match else ""

        ca = int(attrs.get("ability", 0)) if attrs.get("ability", "").isdigit() else 0
        try:
            pa = float(attrs.get("potential", 0))
        except ValueError:
            pa = 0.0
        age = int(attrs.get("age", 0)) if attrs.get("age", "").isdigit() else 0
        try:
            value_eur = int(attrs.get("value", 0))
        except ValueError:
            value_eur = 0

        player_data = {
            "id": fm_id,
            "name": name,
            "nation": nation,
            "team_group": team_group,
            "sub_team": sub_team,
            "position_group": attrs.get("position-group", ""),
            "positions": positions,
            "ca": ca,
            "pa": pa,
            "age": age,
            "value_eur": value_eur,
            "value_formatted": value_formatted,
            "wage": wage,
            "contract_until": contract_until,
            "status": attrs.get("squad-status", ""),
            "relative_url": relative_url,
            "full_url": f"https://fminside.net{relative_url}" if relative_url else "",
            "photo_url": photo_url,
            "is_first_team": is_first_team,
            "attributes": None,  # to be populated by parse_player.py
        }
        players[fm_id] = player_data

    return players


def save_or_merge_team(team_file: str, team_name: str, new_players: dict):
    """
    Saves new team file or merges with existing file, preserving any already
    parsed player attributes.
    """
    os.makedirs(os.path.dirname(os.path.abspath(team_file)), exist_ok=True)

    data = {
        "team_name": team_name,
        "players": {},
    }

    if os.path.exists(team_file):
        try:
            with open(team_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Warning: Could not read existing file '{team_file}', creating fresh: {e}", file=sys.stderr)

    if not data.get("team_name") and team_name:
        data["team_name"] = team_name

    existing_players = data.setdefault("players", {})

    merged_count = 0
    updated_count = 0

    for pid, pdata in new_players.items():
        if pid in existing_players:
            # Preserve existing attributes if already scraped
            old_attrs = existing_players[pid].get("attributes")
            if old_attrs is not None:
                pdata["attributes"] = old_attrs
            existing_players[pid].update(pdata)
            updated_count += 1
        else:
            existing_players[pid] = pdata
            merged_count += 1

    with open(team_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    return len(existing_players), merged_count, updated_count


def main():
    parser = argparse.ArgumentParser(
        description="Parse player list from FMInside club squad HTML table into a team JSON file"
    )
    parser.add_argument(
        "input_file",
        nargs="?",
        help="Path to txt/html file with the squad snippet. If not provided, reads from stdin.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Path to team JSON file (e.g. data/barcelona.json). If omitted, automatically creates <team_name>.json.",
    )
    parser.add_argument(
        "--first-team-only",
        action="store_true",
        help="Only include first-team players (skip B team, U19, etc.).",
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

    team_name = extract_team_name(content)
    players = parse_squad_html(content, first_team_only=args.first_team_only)

    if not players:
        print("Warning: No player rows found in input.", file=sys.stderr)
        sys.exit(1)

    if args.output:
        team_file = args.output
    else:
        # Default filename based on team name, e.g. "fc_barcelona.json"
        safe_name = re.sub(r"[^a-zA-Z0-9]+", "_", team_name.strip().lower()).strip("_")
        default_dirs = [
            "workspace/fm-core/data/teams",
            "data/teams",
            ".",
        ]
        chosen_dir = "."
        for d in default_dirs:
            if os.path.isdir(d):
                chosen_dir = d
                break
        team_file = os.path.join(chosen_dir, f"{safe_name}.json")

    total, added, updated = save_or_merge_team(team_file, team_name, players)
    print(
        f"✓ Team: '{team_name}' -> '{team_file}'\n"
        f"  Total players in file: {total} (New added: {added}, Updated: {updated})",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
