# Session Summary — MyTeam Basketball Dashboard

## Project Overview
A Hebrew RTL basketball stats dashboard (`dashboard.js`, `style.css`, `index.html`) served locally via Python HTTP server from `C:\Users\User\Downloads\WEBAPP`.

## Data Files
| File | Description |
|---|---|
| `games.json` | 45 games across 6 seasons |
| `players.json` | 23 players (player_id = jersey number) |
| `players_stats.json` | 419 per-game player stat rows |
| `rotations.json` | 40 games with rotation segment data |
| `teams_stats.json` | 90 rows (2 per game — our team always listed FIRST) |
| `shot_chart.json` | Currently only game 42 (פתח תקווה 25/26 vs ארזי הלבנון) |

## Key Architecture Decisions Made This Session

### Team Name Detection
- Our team name changes per season: `נועם` (פתח תקווה 23), `פסגת הדר` (all others)
- **Fix**: `MY_TEAM_BY_GAME` map built at load time — our team is always the **first row** per game in `teams_stats.json`
- Function: `myTeamForGame(gameId)`

### Navigation
- 4 sections: games, players, teams, player-profile
- `goTo()` short-circuits if already on that section
- Each section renders independently — `renderCurrentSection()` not `renderAll()`

### Date Parsing
- Dates are `DD/MM/YYYY` — parsed via `parseDate()` function (native `new Date()` fails on this format)

### Shot Chart Integration
- Shot chart button (`🎯 מפת זריקות`) appears on game cards only when `data.shotChartByGame[game_id]` exists
- Button rendered via helper `scGameBtn(gameId)` — avoids nested template literal quoting bug
- Modal reuses the existing `#rotation-modal` (same modal, different content)
- `openShotChartModal()` sets `height: 85vh` on modal, resets to `auto` on close so rotation modal is unaffected

### Shot Chart Data
- `shot_chart.json` uses `game_id` (fixed from original `gameid`) — **user still has old file in WEBAPP folder with `gameid`** — the fixed version is in outputs
- Shot strings: uppercase = make, lowercase = miss (e.g. `"dddD"` = 3 misses by D, 1 make by D)
- Player mapping: char → player_id (= jersey number) → name via `data.players`

## What Was Completed This Session

### Bug Fixes
- Date parsing DD/MM/YYYY broken in all browsers
- Duplicate `#rotation-modal` in HTML
- `setStatMode` was calling `renderPlayerProfile` twice
- Dead `renderRotation()` function removed
- Fragile "my team" detection replaced with per-game lookup
- Nested template literal bug in shot chart button onclick
- `gameid` → `game_id` field rename in shot_chart.json
- Destructuring order mismatch (`sc` and `ts` were swapped in loadData)
- Court lines SVG path was truncated (5273 chars instead of 11309) — replaced with full path from INDEX.html

### Features Added
- Win/loss record badge on games page
- Stage badges (gold color for all playoff/finals stages)
- Game cards: winning team highlighted green (us) or red (opponent) — only winner colored
- Loading overlay with spinner
- Shot chart modal integrated into games page
- Player buttons show real Hebrew names (not jersey numbers)
- Summary badges (3PT / 2PT / MID / CLOSE) floating over court

### UI/Design
- Shot chart player panel moved to RIGHT side
- Player buttons: blue color scheme (`#3d7fe6`)
- כולם button visually distinct (larger, brighter border)
- Court SVG background rect added to eliminate white edge gaps
- Court fills modal via `aspect-ratio: 2189/1827` with `height: auto`
- Modal size: `width: auto`, `max-width: 95vw`, `height: auto`, `max-height: 90vh`

### Separator Lines (Tables)
- `show-separators` class: thick line after name/season/GP columns, thinner lines at PTS/2P%/3P%/FT%/TRB/STL/BA/FD/+/-/PIR
- `adv-separators` class: thick `adv-label-line` after first column, thin `adv-separator-line` between all stat columns
- Highs table always uses `show-separators` regardless of mode
- ADV tables use `width-fit` class (shrink to content width)

---

## Where We Left Off — UNRESOLVED

### Mobile Shot Chart Layout (Last Thing Attempted — Did Not Work)
**Goal**: On mobile, the shot chart modal should fit entirely on screen with:
1. Badges displayed **vertically on the LEFT** of the bottom bar
2. Player buttons **scrollable horizontally** on the RIGHT of the bottom bar

**What was attempted**: 
- Added `#sc-badges-mobile` div inside `.sc-player-panel`
- Added `.sc-players-scroll` wrapper div around player buttons
- CSS: `.sc-player-panel` as horizontal flex row, badges column on left, scroll div on right
- `scUpdateCourt()` now populates both `#sc-badges` (desktop) and `#sc-badges-mobile`

**What's broken**: The layout didn't render correctly — needs debugging. Likely a flex/overflow issue in the mobile CSS or the DOM structure not matching what CSS expects.

**Recommended next approach**: 
- Open browser DevTools on mobile (or use responsive mode in Chrome)
- Inspect the `.sc-player-panel` to see actual rendered structure
- Alternatively: simplify — just make the badges a static row ABOVE the player buttons (stacked vertically), both scrollable if needed

### Files to Always Get from Outputs (not uploads)
The user's WEBAPP folder still has the **old** `shot_chart.json` with `gameid` instead of `game_id`. Every session, remind user to use the fixed version from outputs.

---

## File State at End of Session
- `dashboard.js` — 1146 lines, all fixes applied
- `style.css` — 664 lines, all fixes applied  
- `index.html` — 66 lines, clean
- `shot_chart.json` (outputs) — fixed with `game_id`, game 42 only

## Tech Stack
- Vanilla JS, no frameworks
- Hebrew RTL layout
- Served via Python `http.server`
- JSON data files (some with UTF-8 BOM — parsed with `utf-8-sig` encoding)
- Google Fonts: Assistant