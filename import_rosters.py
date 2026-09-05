#!/usr/bin/env python3
import sys
import re
import os
import ssl
import json
import time
import urllib.request
import urllib.parse
import html

# Fleaflicker D/ST IDs
DST_IDS = {
    "KC": 2343, "DEN": 2336, "MIN": 2349, "PHI": 2351, "LAR": 2356,
    "HOU": 2345, "SEA": 2358, "LAC": 2355, "PIT": 2357, "BAL": 2334,
    "NE": 2352, "JAX": 2346, "DAL": 2338, "BUF": 2335, "FA": 2335
}

# ClickyDraft -> Fleaflicker Team Name Mapping (handles common historical nicknames)
TEAM_NAME_ALIASES = {
    "thrawns blue balls": "THE BAD SNATCH",
    "bad snatch": "THE BAD SNATCH",
    "wookie of the year": "Wookie of the Year",
    "macejaydu": "macejaydu",
    "jar jar skywalker": "Jar Jar Skywalker",
    "ashoka nightmare": "Ashoka Nightmare",
    "death carr": "The Death Carr",
    "the death carr": "The Death Carr",
    "darth bane": "Darth Bane",
    "army": "Army",
    "jedi mind tricks": "Jedi Mind Tricks",
    "mandelorian mudhorns": "Mandalorian Mudhorns",
    "mandalorian mudhorns": "Mandalorian Mudhorns",
    "finns football force": "Finn’s Football Force",
    "finn's football force": "Finn’s Football Force",
    "finn’s football force": "Finn’s Football Force",
    "java the butt": "Java the BUTT"
}

def unverified_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        ctx.set_ciphers("DEFAULT@SECLEVEL=0")
    except Exception:
        pass
    return ctx

def fetch_clickydraft_board(board_url_or_id):
    match = re.search(r"(\d+)", str(board_url_or_id))
    if not match:
        raise ValueError(f"Invalid ClickyDraft URL or ID: {board_url_or_id}")
    board_id = match.group(1)
    full_url = f"https://clickydraft.com/draftapp/board/{board_id}"
    print(f"📥 Fetching ClickyDraft board #{board_id} ({full_url})...")

    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
    with urllib.request.urlopen(req, context=unverified_ctx()) as resp:
        page_html = resp.read().decode("utf-8")

    lg_match = re.search(r"requestedLgInstJSON\s*:\s*'(\{.*?\})'", page_html)
    picks_match = re.search(r"requestedPicksJSON\s*:\s*'(\[.*?\])'", page_html)

    if not lg_match or not picks_match:
        raise ValueError("Could not extract draft JSON from ClickyDraft page HTML.")

    lg_inst = json.loads(lg_match.group(1))
    picks = json.loads(picks_match.group(1))

    cd_teams = {t["id"]: t["teamName"] for t in lg_inst.get("fantasyTeams", [])}
    sorted_picks = sorted(picks, key=lambda p: (p.get("round", 0), p.get("posInRound", 0)))

    parsed_picks = []
    overall = 1
    for p in sorted_picks:
        cd_tid = p.get("fantasyTeamId")
        cd_name = cd_teams.get(cd_tid, "Unknown")
        player = p.get("draftablePlayer", {})
        fname = player.get("firstName", "")
        lname = player.get("lastName", "")
        player_name = f"{fname} {lname}".strip()
        positions = "/".join(player.get("positions", []))
        nfl_team = player.get("teamAbbr", "")

        parsed_picks.append({
            "overall": overall,
            "round": p.get("round"),
            "pick_in_round": p.get("posInRound"),
            "clickydraft_team": cd_name,
            "player_name": player_name,
            "position": positions,
            "nfl_team": nfl_team
        })
        overall += 1

    return board_id, parsed_picks

def fetch_fleaflicker_teams(league_id, year):
    print(f"📥 Fetching Fleaflicker league teams for Year {year} (League #{league_id})...")
    url = f"https://www.fleaflicker.com/api/FetchLeagueStandings?sport=NFL&league_id={league_id}&season={year}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
    try:
        with urllib.request.urlopen(req, context=unverified_ctx()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        # Fallback dictionary of teams if API is blocked by WAF
        return {
            "Jar Jar Skywalker": 873137,
            "Java the BUTT": 811297,
            "Finn’s Football Force": 928665,
            "Mandalorian Mudhorns": 786929,
            "Darth Bane": 788025,
            "macejaydu": 807995,
            "Wookie of the Year": 793918,
            "THE BAD SNATCH": 787863,
            "Jedi Mind Tricks": 786874,
            "Ashoka Nightmare": 788878,
            "The Death Carr": 1787909,
            "Army": 873124
        }

    ff_teams = {}
    for div in data.get("divisions", []):
        for t in div.get("teams", []):
            ff_teams[t.get("name")] = t.get("id")

    return ff_teams

def match_team_name(cd_name, ff_teams):
    clean_cd = html.unescape(cd_name).strip()
    # Check exact match
    if clean_cd in ff_teams:
        return clean_cd, ff_teams[clean_cd]
    # Check alias dictionary
    alias = TEAM_NAME_ALIASES.get(clean_cd.lower())
    if alias and alias in ff_teams:
        return alias, ff_teams[alias]
    # Check case-insensitive match
    for ff_name, ff_id in ff_teams.items():
        if ff_name.lower() == clean_cd.lower():
            return ff_name, ff_id
    # Fallback to loose match
    for ff_name, ff_id in ff_teams.items():
        if clean_cd.lower() in ff_name.lower() or ff_name.lower() in clean_cd.lower():
            return ff_name, ff_id

    return clean_cd, 0

PLAYER_OVERRIDE_IDS = {
    "Aaron Jones Sr.": 13111,
    "Aaron Jones": 13111,
    "Sam LaPorta": 17681,
    "Mike Washington Jr.": 19346,
    "Tank Bigsby": 17625
}

def resolve_player_id(player_name, position, nfl_team, league_id):
    clean_name = html.unescape(player_name).replace("&#39;", "'").strip()
    if clean_name in PLAYER_OVERRIDE_IDS:
        return PLAYER_OVERRIDE_IDS[clean_name], clean_name

    if "DEF" in position or "DEF" in clean_name:
        if nfl_team in DST_IDS:
            return DST_IDS[nfl_team], f"{nfl_team} Defense"

    query_encoded = urllib.parse.quote(clean_name)
    url = f"https://www.fleaflicker.com/api/FetchPlayerListing?sport=NFL&league_id={league_id}&filter.query={query_encoded}"

    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                players = data.get("players", [])
                for cand in players:
                    p = cand.get("proPlayer", {})
                    cname = p.get("nameFull", "")
                    cpos = p.get("position", "")
                    if clean_name.lower() in cname.lower() or cname.lower() in clean_name.lower():
                        return p.get("id"), cname
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                time.sleep((attempt + 1) * 1.5)
            else:
                break
        except Exception:
            time.sleep(1)

    return None, clean_name

def main():
    print("=========================================================")
    print(" ⚔️ STAR WARS FFL - CLICKYDRAFT TO FLEAFLICKER IMPORTER")
    print("=========================================================\n")

    if len(sys.argv) < 3:
        print("Usage:")
        print("  ./import_rosters.py <CLICKYDRAFT_URL_OR_ID> \"<COOKIE_OR_COOKIE_ID>\" [YEAR] [LEAGUE_ID]\n")
        print("Examples:")
        print("  ./import_rosters.py 306290 \"cookieId=MzYx...\" 2026 111626")
        print("  ./import_rosters.py https://clickydraft.com/draftapp/board/306290 \"cookieId=MzYx...\"")
        sys.exit(1)

    cd_arg = sys.argv[1]
    cookie_arg = sys.argv[2]
    year = sys.argv[3] if len(sys.argv) > 3 else "2026"
    league_id = int(sys.argv[4]) if len(sys.argv) > 4 else 111626

    # Clean cookie
    if "cookieId=" not in cookie_arg and "fleaflicker_session=" not in cookie_arg:
        cookie_header = f"cookieId={cookie_arg}"
    else:
        cookie_header = cookie_arg

    # Step 1: Parse ClickyDraft
    board_id, raw_picks = fetch_clickydraft_board(cd_arg)
    print(f"✓ Parsed {len(raw_picks)} draft picks from ClickyDraft board #{board_id}.")

    # Step 2: Fetch Fleaflicker Teams
    ff_teams = fetch_fleaflicker_teams(league_id, year)
    print(f"✓ Found {len(ff_teams)} teams in Fleaflicker for {year}.")

    # Step 3: Resolve Team Mappings & Player IDs
    print(f"\n🔍 Resolving player & team IDs for {len(raw_picks)} picks...")
    resolved_picks = []
    rosters_by_team = {}
    missing_count = 0

    preverified_map = {}
    verified_file = "docs/data/draft_rosters_2026_with_ids.json"
    if os.path.exists(verified_file):
        try:
            with open(verified_file, "r", encoding="utf-8") as vf:
                vdata = json.load(vf)
                for vp in vdata:
                    v_raw = vp.get("player_name", "").replace("&#39;", "'").strip()
                    if vp.get("fleaflicker_player_id"):
                        preverified_map[v_raw] = vp["fleaflicker_player_id"]
        except Exception:
            pass

    for idx, p in enumerate(raw_picks):
        ff_tname, ff_tid = match_team_name(p["clickydraft_team"], ff_teams)
        raw_pname = p["player_name"].replace("&#39;", "'").strip()
        
        if raw_pname in preverified_map:
            pid = preverified_map[raw_pname]
            pname_clean = raw_pname
        else:
            pid, pname_clean = resolve_player_id(p["player_name"], p["position"], p["nfl_team"], league_id)

        p["fleaflicker_team"] = ff_tname
        p["fleaflicker_team_id"] = ff_tid
        p["fleaflicker_player_id"] = pid
        p["player_name_clean"] = pname_clean

        resolved_picks.append(p)

        if ff_tid and pid:
            tid_str = str(ff_tid)
            if tid_str not in rosters_by_team:
                rosters_by_team[tid_str] = []
            rosters_by_team[tid_str].append(str(pid))
        else:
            missing_count += 1
            print(f"  ⚠️ Warning: Pick #{p['overall']} ({p['player_name']}) could not be resolved.")

    print(f"✓ Resolved {len(resolved_picks) - missing_count}/{len(raw_picks)} picks across {len(rosters_by_team)} teams.")

    # Step 4: Construct Encoded Payload
    # Format: TEAM_ID:PID1,PID2|TEAM_ID2:PID1,PID2
    team_chunks = [f"{tid}:{','.join(pids)}" for tid, pids in rosters_by_team.items()]
    rosters_encoded = "|".join(team_chunks)

    # Step 5: Submit Payload to Fleaflicker
    print(f"\n🚀 Submitting roster import payload to Fleaflicker...")
    submit_url = "https://www.fleaflicker.com/nfl/importRostersSubmit"
    post_data = urllib.parse.urlencode({
        "leagueId": league_id,
        "position": 287,
        "rosters": rosters_encoded,
        "keeperOptions": "FULL_IMPORT"
    }).encode("utf-8")

    req = urllib.request.Request(submit_url, data=post_data, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Cookie": cookie_header,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": f"https://www.fleaflicker.com/nfl/importRosters?leagueId={league_id}"
    })

    try:
        with urllib.request.urlopen(req, context=unverified_ctx()) as resp:
            res_body = resp.read().decode("utf-8")
            print(f"\n🎉 SUCCESS! Fleaflicker responded with HTTP {resp.status}.")
            print(f"Rosters for all {len(rosters_by_team)} teams have been imported to Fleaflicker!")
    except urllib.error.HTTPError as e:
        print(f"\n❌ Error submitting to Fleaflicker: HTTP {e.code}")
        print(e.read().decode("utf-8")[:400])
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Execution Error: {e}")
        sys.exit(1)

    # Step 6: Update draftboards.json & save logs
    db_file = "docs/data/draftboards.json"
    if os.path.exists(db_file):
        try:
            with open(db_file, "r", encoding="utf-8") as f:
                db_data = json.load(f)
            db_data[str(year)] = f"https://clickydraft.com/draftapp/board/{board_id}"
            with open(db_file, "w", encoding="utf-8") as f:
                json.dump(db_data, f, indent=2)
            print(f"✓ Updated docs/data/draftboards.json with {year} draft board link.")
        except Exception as e:
            print(f"Notice: Could not update draftboards.json: {e}")

    print("\n✨ All done! Your website dashboard and Fleaflicker league are now fully up to date.")

if __name__ == "__main__":
    main()
