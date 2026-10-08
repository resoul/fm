#!/usr/bin/env python3
"""
Build a schema-v2 match fixture from two team files in data/teams.

Each team file (produced by parse_squad.py / parse_player.py) carries the
FMInside squad with a ready `attributes.engine_v2` block per player. This
script picks a 4-4-2 starting XI plus five substitutes by current ability
(`ca`) and emits a fixture the CLI can validate/run/batch directly:

  python3 scripts/build_fixture.py fc_barcelona manchester_city \
      -o fixtures/match/real/fc_barcelona_vs_manchester_city.json

Slot assignment is greedy in a fixed slot order (GK, CB_L, CB_R, LB, RB,
CM_L, CM_R, ST_L, ST_R, LM, RM): for every slot the highest-CA unassigned
player whose FM positions map to one of the slot's accepted roles is taken.
Strikers are filled before the wide midfield slots because a forward listed
as both AML and ST would otherwise be spent on the wing.
The bench is the best remaining goalkeeper plus the four best remaining
outfield players. Tactics are neutral (0.5 everywhere) unless overridden,
so two fixtures differ only in the players' attributes. Formation is only a
slot template in the engine (docs/simulation/model.md), so every team is
laid out as 4-4-2 regardless of the club's real shape.
"""

import argparse
import json
import os
import sys

# FMInside position code -> engine role (docs/simulation/model.md roles).
POSITION_ROLE = {
    "GK": "GK",
    "DL": "LB", "WBL": "LB",
    "DC": "CB",
    "DR": "RB", "WBR": "RB",
    "DM": "DM",
    "MC": "CM",
    "AMC": "AM",
    "ML": "LM",
    "MR": "RM",
    "AML": "LW",
    "AMR": "RW",
    "ST": "ST",
}

# Slot -> roles accepted, best fit first. Order of this list is the
# assignment order: specialist slots first so a CB is not consumed by LB.
SLOT_ROLES = [
    ("GK", ["GK"]),
    ("CB_L", ["CB", "DM", "LB", "RB"]),
    ("CB_R", ["CB", "DM", "RB", "LB"]),
    ("LB", ["LB", "LW", "LM", "CB"]),
    ("RB", ["RB", "RW", "RM", "CB"]),
    ("CM_L", ["CM", "DM", "AM"]),
    ("CM_R", ["CM", "DM", "AM"]),
    ("ST_L", ["ST", "AM", "LW", "RW"]),
    ("ST_R", ["ST", "AM", "RW", "LW"]),
    ("LM", ["LM", "LW", "AM", "CM", "LB"]),
    ("RM", ["RM", "RW", "AM", "CM", "RB"]),
]

# Slot -> role the picked player is declared with in the fixture, so the
# engine's role-based checks (GK slot, bench compatibility) see the slot
# they actually fill rather than their nominal FM position.
SLOT_ROLE = {slot: roles[0] for slot, roles in SLOT_ROLES}

ENGINE_FIELDS = [
    "pace", "acceleration", "stamina", "passing", "first_touch", "dribbling",
    "tackling", "positioning", "decisions", "finishing", "long_shots", "crossing",
    "heading", "jumping_reach", "left", "right", "corners", "free_kick_taking",
    "penalty_taking",
]
GK_FIELDS = ["handling", "reflexes", "one_on_ones", "aerial_reach", "command_of_area", "kicking", "throwing"]


def load_team(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    players = []
    for p in data["players"].values():
        attrs = (p.get("attributes") or {}).get("engine_v2")
        if not attrs or not p.get("is_first_team"):
            continue
        roles = []
        for pos in p.get("positions", []):
            role = POSITION_ROLE.get(pos)
            if role and role not in roles:
                roles.append(role)
        if not roles:
            continue
        players.append({
            "id": p["id"],
            "name": p["name"],
            "roles": roles,
            "ca": int(p.get("ca") or 0),
            "attrs": attrs,
        })
    return data["team_name"], players


def clamp_attr(value):
    return max(1, min(20, int(value)))


def engine_attributes(player, gk):
    attrs = player["attrs"]
    out = {k: clamp_attr(attrs.get(k, 10)) for k in ENGINE_FIELDS}
    if gk:
        for k in GK_FIELDS:
            out[k] = clamp_attr(attrs.get(k, 10))
    return out


def pick_squad(players):
    remaining = sorted(players, key=lambda p: (-p["ca"], p["id"]))
    lineup = []
    for slot, roles in SLOT_ROLES:
        chosen = None
        for role in roles:
            for p in remaining:
                if role in p["roles"]:
                    chosen = p
                    break
            if chosen:
                break
        if chosen is None:
            raise SystemExit(f"no eligible player for slot {slot}")
        remaining.remove(chosen)
        lineup.append((slot, chosen))
    bench = []
    gk = next((p for p in remaining if "GK" in p["roles"]), None)
    if gk:
        remaining.remove(gk)
        bench.append(gk)
    bench.extend([p for p in remaining if "GK" not in p["roles"]][: 5 - len(bench)])
    return lineup, bench


def build_team(slug, path, tactics):
    name, players = load_team(path)
    lineup, bench = pick_squad(players)
    fixture_players = []
    lineup_entries = []
    for slot, p in lineup:
        role = SLOT_ROLE[slot]
        pid = f"{slug}_{p['id']}"
        allowed = [r for r in p["roles"] if r != role]
        entry = {
            "id": pid,
            "name": p["name"],
            "role": role,
        }
        if allowed:
            entry["allowed_positions"] = allowed
        entry["attributes"] = engine_attributes(p, role == "GK")
        entry["starting_condition"] = {"fitness": 100.0, "sharpness": 90.0, "initial_fatigue": 0.0}
        fixture_players.append(entry)
        lineup_entries.append({"slot": slot, "player_id": pid})
    bench_ids = []
    for p in bench:
        role = p["roles"][0]
        pid = f"{slug}_{p['id']}"
        allowed = p["roles"][1:]
        entry = {"id": pid, "name": p["name"], "role": role}
        if allowed:
            entry["allowed_positions"] = allowed
        entry["attributes"] = engine_attributes(p, role == "GK")
        entry["starting_condition"] = {"fitness": 100.0, "sharpness": 85.0, "initial_fatigue": 0.0}
        fixture_players.append(entry)
        bench_ids.append(pid)
    return {
        "id": slug,
        "name": name,
        "tactics": tactics,
        "players": fixture_players,
        "starting_lineup": lineup_entries,
        "bench": bench_ids,
    }


def parse_tactics(text):
    tactics = {"formation": "4-4-2", "width": 0.5, "line_height": 0.5, "tempo": 0.5, "pressing": 0.5}
    if text:
        for part in text.split(","):
            key, value = part.split("=")
            if key not in ("width", "line_height", "tempo", "pressing"):
                raise SystemExit(f"unknown tactics key {key!r}")
            tactics[key] = float(value)
    return tactics


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("home", help="home team slug (file name in data/teams without .json)")
    ap.add_argument("away", help="away team slug")
    ap.add_argument("-o", "--output", help="fixture path (default: fixtures/match/real/<home>_vs_<away>.json)")
    ap.add_argument("--teams-dir", default="data/teams")
    ap.add_argument("--home-tactics", default="", help="e.g. width=0.6,pressing=0.7")
    ap.add_argument("--away-tactics", default="")
    ap.add_argument("--rules-profile", default="profile_a")
    args = ap.parse_args()

    home = build_team(args.home, os.path.join(args.teams_dir, args.home + ".json"), parse_tactics(args.home_tactics))
    away = build_team(args.away, os.path.join(args.teams_dir, args.away + ".json"), parse_tactics(args.away_tactics))
    fixture = {
        "schema_version": "v2",
        "match_id": f"{args.home}_vs_{args.away}",
        "rules_profile": args.rules_profile,
        "pitch": {"width": 68.0, "length": 105.0},
        "home_team": home,
        "away_team": away,
    }
    out = args.output or os.path.join("fixtures", "match", "real", f"{args.home}_vs_{args.away}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(fixture, f, ensure_ascii=False, indent=2)
        f.write("\n")
    for team in (home, away):
        xi = ", ".join(f"{s['slot']}={next(p['name'] for p in team['players'] if p['id'] == s['player_id'])}" for s in team["starting_lineup"])
        print(f"{team['name']}: {xi}", file=sys.stderr)
    print(out)


if __name__ == "__main__":
    main()
