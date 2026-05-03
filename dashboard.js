/* =====================================================
   State
   ===================================================== */
let data = { games: [], players: {}, playersStats: [], rotations: [], teamStats: [] };
let activeGameIds    = new Set();
let currentSection   = 'games';
let currentSeason    = null;
let currentStatMode  = 'AVG';
let isAdvancedMode   = false;
let sortConfig       = { key: null, direction: 'desc', tableId: null };
let openBoxScores    = new Set();

// Our team name per game_id — built once after load (we are always listed first in teams_stats)
const MY_TEAM_BY_GAME = {};

// Columns that are never shown in any table
const ALWAYS_HIDDEN = [
    'game_id','player_id','tech_Fouls','reg_FD','OFD','And1',
    'team scored with','opp scored with','poss','ended person','ended poss',
    'opt_DRB','opt_ORB','%DRB','%ORB','ORB%','DRB%','ORtg','DRtg'
];

// Columns that get a visual separator line drawn to their left
const SEPARATOR_COLS = ['MIN','PTS','2P%','3P%','FT%','TRB','STL','BA','FD','+/-','PIR'];

/* =====================================================
   Initialisation
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-games').onclick         = () => goTo('games');
    document.getElementById('nav-players').onclick       = () => goTo('players');
    document.getElementById('nav-teams').onclick         = () => goTo('teams');
    document.getElementById('nav-player-profile').onclick = () => goTo('player-profile');
    loadData();
});

function toggleSidebar() { document.body.classList.toggle('sidebar-closed'); }

/* =====================================================
   Navigation — only re-render the section we're going to
   ===================================================== */
function goTo(id) {
    if (currentSection === id) return; // already here — nothing to do
    currentSection = id;

    const pages = ['games','players','teams','player-profile'];
    pages.forEach(p => {
        const section = document.getElementById('sec-' + p);
        const btn     = document.getElementById('nav-' + p);
        if (section) section.style.display = 'none';
        if (btn)     btn.classList.remove('active');
    });

    document.getElementById('sec-' + id).style.display = 'block';
    document.getElementById('nav-' + id).classList.add('active');

    renderCurrentSection();
    if (id !== 'player-profile') renderSeasonFilters();
}

/* Only render the section that is currently visible */
function renderCurrentSection() {
    switch (currentSection) {
        case 'games':          populateGames();   break;
        case 'players':        populatePlayers(); break;
        case 'teams':          populateTeams();   break;
        case 'player-profile': renderPlayerProfile(); break;
    }
}

/* renderAll is still used after season/game-toggle changes that affect multiple views */
function renderAll() {
    populateGames();
    populatePlayers();
    populateTeams();
    if (currentSection === 'player-profile') renderPlayerProfile();
    applyTableSeparators();
}

/* =====================================================
   Data Loading
   ===================================================== */
async function loadData() {
    try {
        const [gs, pls, ps, rots, ts] = await Promise.all([
            fetch('games.json').then(r => r.json()),
            fetch('players.json').then(r => r.json()),
            fetch('players_stats.json').then(r => r.json()),
            fetch('rotations.json').then(r => r.json()),
            fetch('teams_stats.json').then(r => r.json()),
        ]);

        const pMap = {};
        pls.forEach(p => pMap[p.player_id] = p);
        data = { games: gs, players: pMap, playersStats: ps, rotations: rots, teamStats: ts };

        // Build a per-game map: our team is always the first row for each game_id
        buildMyTeamMap(ts);

        const sortedSeasons = getSortedSeasons();
        if (sortedSeasons.length > 0) currentSeason = sortedSeasons[sortedSeasons.length - 1];

        updateActiveGamesBySeason();
        populatePlayerSelect();
        renderAll();
        renderSeasonFilters();
    } catch (e) {
        console.error('Load Error', e);
    } finally {
        // Hide loading overlay whether load succeeded or failed
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.remove(), 400);
        }
    }
}

/* Build a per-game map of our team name.
   Our team is always the FIRST row for each game_id in teams_stats. */
function buildMyTeamMap(teamStats) {
    const seen = new Set();
    teamStats.forEach(t => {
        const gid = String(t['game_id']);
        if (!seen.has(gid)) {
            seen.add(gid);
            MY_TEAM_BY_GAME[gid] = t['team name'];
        }
    });
}

function myTeamForGame(gameId) {
    return MY_TEAM_BY_GAME[String(gameId)] || '';
}

/* =====================================================
   Date helpers
   Fix: dates are DD/MM/YYYY — parse properly so sorting is correct
   ===================================================== */
function parseDate(d) {
    if (!d) return null;
    const parts = d.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    return new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`);
}

function getTimestamp(d) {
    const dt = parseDate(d);
    return dt ? dt.getTime() : 0;
}

/* =====================================================
   Seasons
   ===================================================== */
function getSortedSeasons() {
    const seasonFirstDate = {};
    data.games.forEach(g => {
        const ts = getTimestamp(g.date);
        if (!seasonFirstDate[g.season] || ts < seasonFirstDate[g.season]) {
            seasonFirstDate[g.season] = ts;
        }
    });
    return Object.keys(seasonFirstDate).sort((a, b) => seasonFirstDate[a] - seasonFirstDate[b]);
}

function renderSeasonFilters() {
    const containers = document.querySelectorAll('.season-filters-container');
    const sortedSeasons = getSortedSeasons();
    const html = sortedSeasons.map(s => `
        <div class="season-pill ${String(s) === String(currentSeason) ? 'active' : ''}"
             onclick="selectSeason('${s}')">${s}</div>
    `).join('');
    containers.forEach(c => { c.innerHTML = html; });
}

function selectSeason(s) {
    currentSeason = s;
    updateActiveGamesBySeason();
    renderAll();
    renderSeasonFilters();
}

function updateActiveGamesBySeason() {
    activeGameIds.clear();
    data.games.forEach(g => {
        if (String(g.season) === String(currentSeason)) activeGameIds.add(String(g.game_id));
    });
}

/* =====================================================
   Stat mode & advanced toggle
   ===================================================== */
function setStatMode(m) {
    currentStatMode = m;
    // renderAll re-renders everything including player profile if open
    renderAll();
}

function toggleAdvancedMode() {
    isAdvancedMode = !isAdvancedMode;
    renderAll();
}

/* =====================================================
   Game toggles & box score
   ===================================================== */
function handleGameToggle(id, chk, e) {
    e.stopPropagation();
    chk ? activeGameIds.add(String(id)) : activeGameIds.delete(String(id));
    // Re-render players & teams (which depend on activeGameIds), but NOT games list
    populatePlayers();
    populateTeams();
    applyTableSeparators();
}

function toggleBoxScore(id) {
    if (openBoxScores.has(String(id))) openBoxScores.delete(String(id));
    else openBoxScores.add(String(id));
    // Only re-render the games section (not players/teams)
    populateGames();
    applyTableSeparators();
}

/* =====================================================
   Sorting
   ===================================================== */
function setSort(key, tableId, e) {
    if (e) e.stopPropagation();
    if (sortConfig.key === key && sortConfig.tableId === tableId) {
        sortConfig.direction = sortConfig.direction === 'desc' ? 'asc' : 'desc';
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'desc';
        sortConfig.tableId = tableId;
    }
    tableId === 'prof-career' ? renderPlayerProfile() : renderCurrentSection();
}

/* =====================================================
   Stats calculations
   ===================================================== */
function calculateAdvanced(row, isSum = false) {
    const gp  = isSum ? (row.gp || 1) : 1;
    const fga = (Number(row['2PA']) || 0) + (Number(row['3PA']) || 0);
    const fgm = (Number(row['2PM']) || 0) + (Number(row['3PM']) || 0);
    const pm3 = Number(row['3PM']) || 0;
    const pts = Number(row['PTS'])  || 0;
    const fta = Number(row['FTA'])  || 0;
    const ast = Number(row['AST'])  || 0;
    const tov = Number(row['TOV'])  || 0;

    const s = {};
    s['MIN']    = isSum ? (row['MIN'] / gp) : Number(row['MIN']);
    s['eFG%']   = fga > 0 ? (((fgm + pm3 * 0.5) / fga) * 100).toFixed(1) + '%' : '0.0%';
    const tsDiv = 2 * (fga + 0.44 * fta);
    s['TS%']    = tsDiv > 0 ? ((pts / tsDiv) * 100).toFixed(1) + '%' : '0.0%';
    s['AST/TO'] = tov > 0 ? (ast / tov).toFixed(2) : (ast > 0 ? ast.toFixed(2) : '0.00');
    s['ORB%']   = isSum ? (Number(row['ORB%']) / gp).toFixed(1) + '%' : (Number(row['ORB%']) || 0).toFixed(1) + '%';
    s['DRB%']   = isSum ? (Number(row['DRB%']) / gp).toFixed(1) + '%' : (Number(row['DRB%']) || 0).toFixed(1) + '%';
    return s;
}

function smartRound(v) {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'string' && v.includes('%')) return v;
    const n = Number(v);
    return isNaN(n) ? v : (Number.isInteger(n) ? n : Math.round(n * 10) / 10);
}

function getCellValue(row, col, mode) {
    // Advanced stats — always computed from raw totals
    if (['eFG%','TS%','AST/TO','ORB%','DRB%'].includes(col)) {
        return calculateAdvanced(row, true)[col];
    }

    // Percentage columns — compute from raw makes/attempts to avoid averaging averages
    if (col === '2P%')  return row['2PA']  > 0 ? (row['2PM']  / row['2PA']  * 100).toFixed(1) + '%' : '0.0%';
    if (col === '3P%')  return row['3PA']  > 0 ? (row['3PM']  / row['3PA']  * 100).toFixed(1) + '%' : '0.0%';
    if (col === 'FT%')  return row['FTA']  > 0 ? (row['FTM']  / row['FTA']  * 100).toFixed(1) + '%' : '0.0%';
    if (col === 'FG%') {
        const fga = (row['2PA'] || 0) + (row['3PA'] || 0);
        const fgm = (row['2PM'] || 0) + (row['3PM'] || 0);
        return fga > 0 ? (fgm / fga * 100).toFixed(1) + '%' : '0.0%';
    }
    if (col === 'USG%') return (row['USG%'] / (row.gp || 1)).toFixed(1) + '%';

    // Regular numeric columns
    if (mode === 'TOT') return row[col];
    return row[col] / (row.gp || 1);
}

function getCellValueForSort(p, col) {
    if (col === 'NAME') return data.players[p.id]?.Name || '';
    // Sort by chronological season index
    if (col === 'season') return getSortedSeasons().indexOf(p.season);
    if (col === 'gp') return p.total ? p.total.gp : p.gp;
    if (currentStatMode === 'ADV') return parseFloat(calculateAdvanced(p.total, true)[col]) || 0;
    const val = getCellValue(p.total, col, currentStatMode);
    return typeof val === 'string' ? parseFloat(val) || 0 : (val || 0);
}

/* =====================================================
   Stage badge helper
   ===================================================== */
function stageBadge(stage) {
    if (!stage || stage === 'עונה סדירה') return '';
    // All playoff/finals stages get the gold colour
    return `<div class="stage-badge stage-gold">${stage}</div>`;
}

/* =====================================================
   Table separator lines
   Applied once after DOM is populated, using requestAnimationFrame
   ===================================================== */
function applyTableSeparators() {
    const highsCols  = ['2PM','3PM','FTM'];
    const labelCols  = ['\u05e2\u05d5\u05e0\u05d4','GP','\u05e9\u05d7\u05e7\u05df','\u05e7\u05d1\u05d5\u05e6\u05d4']; // עונה, GP, שחקן, קבוצה

    requestAnimationFrame(() => {
        document.querySelectorAll('.box-table').forEach(table => {
            const isShowSep   = table.classList.contains('show-separators');
            const isAdvTable  = table.classList.contains('adv-separators');
            const headers     = Array.from(table.querySelectorAll('thead th'));
            const headerTexts = headers.map(th => th.innerText.trim());
            const isHighsTable = headerTexts.includes('2PM') && !headerTexts.includes('2P%');

            headers.forEach((th, index) => {
                const text     = th.innerText.trim();
                const colIndex = index + 1;
                const cells    = table.querySelectorAll(
                    `tr td:nth-child(${colIndex}), tr th:nth-child(${colIndex})`
                );

                cells.forEach(el => {
                    el.classList.remove('stat-separator-line');
                    el.classList.remove('adv-separator-line');
                    el.classList.remove('adv-label-line');
                });

                if (isShowSep) {
                    if (labelCols.includes(text) || th.classList.contains('player-name-cell')) {
                        cells.forEach(el => el.classList.add('stat-separator-line'));
                    }
                    if (SEPARATOR_COLS.includes(text) || (isHighsTable && highsCols.includes(text))) {
                        cells.forEach(el => el.classList.add('stat-separator-line'));
                    }
                }

                if (isAdvTable) {
                    if (index === 0) {
                        // Thick separator after the label column (GP / עונה / שחקן)
                        cells.forEach(el => el.classList.add('adv-label-line'));
                    } else {
                        // Thin separator between every stat column
                        cells.forEach(el => el.classList.add('adv-separator-line'));
                    }
                }
            });
        });
    });
}

/* =====================================================
   Games section
   ===================================================== */
function populateGames() {
    const container = document.getElementById('games-container');
    if (!container) return;

    const filtered = data.games
        .filter(g => String(g.season) === String(currentSeason))
        .sort((a, b) => getTimestamp(a.date) - getTimestamp(b.date));

    // Win/loss record for this season
    let wins = 0, losses = 0;
    filtered.forEach(g => {
        if (activeGameIds.has(String(g.game_id))) {
            Number(g.T_score) > Number(g.O_score) ? wins++ : losses++;
        }
    });

    const recordHtml = `
        <div class="game-record-badge">
            <span class="wins">${wins}W</span> – <span class="losses">${losses}L</span>
        </div>`;

    const advBtn = `
        <button class="adv-toggle-btn ${isAdvancedMode ? 'active' : ''}" onclick="toggleAdvancedMode()">
            <span>ADV</span>
        </button>`;

    const cards = filtered.map(g => {
        const isActive = activeGameIds.has(String(g.game_id));
        const isOpen   = openBoxScores.has(String(g.game_id));
        const pStats   = data.playersStats.filter(s => String(s.game_id) === String(g.game_id));
        const myTeamName = myTeamForGame(g.game_id);
        const myT      = data.teamStats.find(t => String(t.game_id) === String(g.game_id) && t['team name'] === myTeamName);
        const oppT     = data.teamStats.find(t => String(t.game_id) === String(g.game_id) && t['team name'] !== myTeamName);

        const cols = isAdvancedMode
            ? ['MIN','eFG%','TS%','AST/TO','ORB%','DRB%']
            : Object.keys(pStats[0] || {}).filter(k => !ALWAYS_HIDDEN.includes(k) && k !== 'starter');

        const teamTotal = { gp: 1 };
        pStats.forEach(s => {
            cols.forEach(c => { if (!isNaN(s[c])) teamTotal[c] = (teamTotal[c] || 0) + Number(s[c]); });
        });

        const fdIndex = cols.indexOf('FD');
        const myName  = myT ? myT['team name'] : myTeamName || 'הקבוצה שלי';
        const weWin = Number(g.T_score) > Number(g.O_score);

        return `
            <div class="game-card" data-card-id="${g.game_id}" style="opacity:${isActive ? 1 : 0.5}">
                <div class="game-card-top-wrapper">
                    <div class="game-header" onclick="toggleBoxScore('${g.game_id}')">
                        <div class="game-info">
                            <div class="team-row ${!weWin ? 'winner-opp' : ''}">
                                <span>${g.opponent}</span><span>${g.O_score}</span>
                            </div>
                            <div class="team-row ${weWin ? 'winner-us' : ''}">
                                <span>${myName}</span><span>${g.T_score}</span>
                            </div>
                        </div>
                        <div class="game-date-area">
                            <span>${g.date}</span>
                            ${stageBadge(g.stage)}
                        </div>
                    </div>
                    <label class="simple-switch">
                        <input type="checkbox" ${isActive ? 'checked' : ''}
                               onchange="handleGameToggle('${g.game_id}', this.checked, event)">
                        <span class="slider"></span>
                    </label>
                </div>

                <div class="box-score-container"
                     style="display:${isOpen ? 'block' : 'none'}; padding:20px; border-top:1px solid var(--border);">
                    <div class="table-wrapper">
                        <table class="box-table ${currentStatMode !== 'ADV' ? 'show-separators' : ''}">
                            <thead>
                                <tr>
                                    <th class="player-name-cell">שחקן</th>
                                    ${cols.map(c => `<th>${c}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${pStats.map(s => {
                                    const name = data.players[s.player_id]?.Name || '??';
                                    const label = Number(s.starter) ? name + '*' : name;
                                    const cells = cols.map(c =>
                                        `<td>${smartRound(isAdvancedMode ? calculateAdvanced(s)[c] : s[c])}</td>`
                                    ).join('');
                                    return `<tr><td class="player-name-cell">${label}</td>${cells}</tr>`;
                                }).join('')}
                            </tbody>
                            ${!isAdvancedMode ? `
                            <tfoot style="font-weight:800; background:#f8fafc;">
                                <tr>
                                    <td class="player-name-cell">סה"כ קבוצה</td>
                                    ${cols.map((c, idx) =>
                                        fdIndex !== -1 && idx > fdIndex
                                            ? '<td>-</td>'
                                            : `<td>${smartRound(getCellValue(teamTotal, c, 'TOT'))}</td>`
                                    ).join('')}
                                </tr>
                                ${oppT ? `
                                <tr style="color:#64748b; font-style:italic;">
                                    <td class="player-name-cell">סה"כ יריבה</td>
                                    ${cols.map((c, idx) => {
                                        if (fdIndex !== -1 && idx > fdIndex) return '<td>-</td>';
                                        const isPercent = c.includes('%') || ['2P%','3P%','FG%','FT%'].includes(c);
                                        const val = smartRound(oppT[c] || 0);
                                        return `<td>${isPercent ? val + '%' : val}</td>`;
                                    }).join('')}
                                </tr>` : ''}
                            </tfoot>` : ''}
                        </table>
                    </div>

                    <div style="margin-top:20px; display:flex; justify-content:center; border-top:1px dashed var(--border); padding-top:15px;">
                        <button class="adv-toggle-btn"
                                style="border-color:var(--accent); color:var(--accent);"
                                onclick="event.stopPropagation(); openRotationModal('${g.game_id}')">
                            📋 צפה במהלך המשחק ורוטציות
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div class="games-controls-row">${advBtn}${recordHtml}</div>
        ${cards}`;
}

/* =====================================================
   Players section
   ===================================================== */
function aggregatePlayerStats(statsRows) {
    const total = { gp: statsRows.length };
    statsRows.forEach(row => {
        Object.keys(row).forEach(k => {
            if (!isNaN(row[k]) && k !== 'player_id' && k !== 'game_id') {
                total[k] = (total[k] || 0) + Number(row[k]);
            }
        });
    });
    return total;
}

function populatePlayers() {
    const container = document.getElementById('players-container');
    if (!container) return;

    const filteredStats = data.playersStats.filter(s => activeGameIds.has(String(s.game_id)));
    if (!filteredStats.length) {
        container.innerHTML = "<p style='padding:20px;'>אין נתונים למשחקים שנבחרו.</p>";
        return;
    }

    const pids = [...new Set(filteredStats.map(s => s.player_id))];
    let summaries = pids.map(pid => {
        const rows = filteredStats.filter(s => s.player_id === pid);
        return { id: pid, total: aggregatePlayerStats(rows) };
    });

    if (sortConfig.tableId === 'players' && sortConfig.key) {
        summaries.sort((a, b) => {
            const vA = getCellValueForSort(a, sortConfig.key);
            const vB = getCellValueForSort(b, sortConfig.key);
            return sortConfig.direction === 'desc' ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
        });
    }

    const cols = currentStatMode === 'ADV'
        ? ['MIN','eFG%','TS%','AST/TO','ORB%','DRB%']
        : Object.keys(summaries[0].total).filter(k => !ALWAYS_HIDDEN.includes(k) && !['gp','player_id','starter'].includes(k));

    container.innerHTML = `
        <div class="table-header-row">
            <div class="mode-toggle-group">
                <button class="mode-btn ${currentStatMode === 'AVG' ? 'active' : ''}" onclick="setStatMode('AVG')">AVG</button>
                <button class="mode-btn ${currentStatMode === 'TOT' ? 'active' : ''}" onclick="setStatMode('TOT')">TOT</button>
                <button class="mode-btn ${currentStatMode === 'ADV' ? 'active' : ''}" onclick="setStatMode('ADV')">ADV</button>
            </div>
        </div>
        <div class="table-wrapper ${currentStatMode === 'ADV' ? 'width-fit' : ''}">
            <table class="box-table ${currentStatMode === 'ADV' ? 'adv-separators' : 'show-separators'}">
                <thead>
                    <tr>
                        <th class="player-name-cell" onclick="setSort('NAME','players',event)">שחקן</th>
                        ${cols.map(c => `<th onclick="setSort('${c}','players',event)">${c}</th>`).join('')}
                        <th onclick="setSort('gp','players',event)">GP</th>
                    </tr>
                </thead>
                <tbody>
                    ${summaries.map(p => `
                        <tr>
                            <td class="player-name-cell">${data.players[p.id]?.Name || '??'}</td>
                            ${cols.map(c => `<td>${smartRound(getCellValue(p.total, c, currentStatMode))}</td>`).join('')}
                            <td>${p.total.gp}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;

    applyTableSeparators();
}

/* =====================================================
   Teams section
   ===================================================== */
function populateTeams() {
    const container = document.getElementById('teams-container');
    if (!container) return;

    const filtered = data.teamStats.filter(t => activeGameIds.has(String(t.game_id)));
    if (!filtered.length) { container.innerHTML = ''; return; }

    const cols = Object.keys(filtered[0]).filter(k =>
        !ALWAYS_HIDDEN.includes(k) && !['team name','game_id','season','date'].includes(k)
    );

    // Separate my team rows from opponent rows using per-game name lookup
    const myRows  = filtered.filter(r => r['team name'] === myTeamForGame(r['game_id']));
    const oppRows = filtered.filter(r => r['team name'] !== myTeamForGame(r['game_id']));
    // Display name: use the most common of our team names this season
    const myTeamDisplayName = myRows.length > 0 ? myRows[myRows.length - 1]['team name'] : '';

    function sumRows(rows) {
        const acc = { gp: rows.length };
        rows.forEach(r => {
            cols.forEach(c => { if (!isNaN(r[c]) && r[c] !== '') acc[c] = (acc[c] || 0) + Number(r[c]); });
        });
        return acc;
    }

    const mySum  = sumRows(myRows);
    const oppSum = sumRows(oppRows);

    // For opponent row: only show MIN and PTS if they have real data; zero everything else
    const oppHasFullData = oppRows.some(r => r['2PA'] !== undefined && r['2PA'] !== '' && Number(r['2PA']) > 0);
    const PARTIAL_COLS   = new Set(['MIN','PTS']); // always show these even without full data

    function renderOppCell(c) {
        if (oppHasFullData || PARTIAL_COLS.has(c)) {
            return smartRound(getCellValue(oppSum, c, 'AVG'));
        }
        return '0';
    }

    container.innerHTML = `
        <h2 style="margin-bottom:20px;">השוואת קבוצות</h2>
        <div class="table-wrapper">
            <table class="box-table show-separators">
                <thead>
                    <tr>
                        <th class="player-name-cell">קבוצה</th>
                        ${cols.map(c => `<th>${c}</th>`).join('')}
                        <th>GP</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="player-name-cell">${myTeamDisplayName}</td>
                        ${cols.map(c => `<td>${smartRound(getCellValue(mySum, c, 'AVG'))}</td>`).join('')}
                        <td>${mySum.gp}</td>
                    </tr>
                    ${oppSum.gp > 0 ? `
                    <tr style="color:#64748b;">
                        <td class="player-name-cell">יריבה (ממוצע)</td>
                        ${cols.map(c => `<td>${renderOppCell(c)}</td>`).join('')}
                        <td>${oppSum.gp}</td>
                    </tr>` : ''}
                </tbody>
            </table>
        </div>`;

    applyTableSeparators();
}

/* =====================================================
   Player Profile section
   ===================================================== */
function populatePlayerSelect() {
    const s = document.getElementById('player-select');
    if (!s) return;
    const ps = Object.values(data.players).sort((a, b) => a.Name.localeCompare(b.Name, 'he'));
    s.innerHTML = '<option value="">בחר שחקן...</option>' +
        ps.map(p => `<option value="${p.player_id}">${p.Name}</option>`).join('');
}

function renderPlayerProfile() {
    const pid       = document.getElementById('player-select').value;
    const container = document.getElementById('profile-content');
    if (!pid) { container.innerHTML = ''; return; }

    const pStats       = data.playersStats.filter(s => String(s.player_id) === String(pid));
    const sortedSeasons = getSortedSeasons().reverse(); // newest first

    const seasons = sortedSeasons.filter(s =>
        pStats.some(st => {
            const game = data.games.find(g => String(g.game_id) === String(st.game_id));
            return game && game.season === s;
        })
    );

    const careerTotal = aggregatePlayerStats(pStats);
    careerTotal.player_id = pid;

    let summaries = seasons.map(s => {
        const sIds  = new Set(data.games.filter(g => g.season === s).map(g => String(g.game_id)));
        const stats = pStats.filter(st => sIds.has(String(st.game_id)));
        const total = aggregatePlayerStats(stats);
        total.player_id = pid;
        return { id: pid, total, season: s };
    });

    if (sortConfig.tableId === 'prof-career') {
        summaries.sort((a, b) => {
            const vA = getCellValueForSort(a, sortConfig.key);
            const vB = getCellValueForSort(b, sortConfig.key);
            return sortConfig.direction === 'desc' ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
        });
    }

    const sampleStat = data.playersStats[0] || {};
    const cols = currentStatMode === 'ADV'
        ? ['MIN','eFG%','TS%','AST/TO','ORB%','DRB%']
        : Object.keys(sampleStat).filter(k => !ALWAYS_HIDDEN.includes(k) && !['gp','player_id','starter'].includes(k));

    const modeToggle = `
        <div class="table-header-row">
            <div class="mode-toggle-group">
                <button class="mode-btn ${currentStatMode==='AVG'?'active':''}" onclick="setStatMode('AVG')">AVG</button>
                <button class="mode-btn ${currentStatMode==='TOT'?'active':''}" onclick="setStatMode('TOT')">TOT</button>
                <button class="mode-btn ${currentStatMode==='ADV'?'active':''}" onclick="setStatMode('ADV')">ADV</button>
            </div>
        </div>`;

    const careerTable = `
        <div class="career-summary-card" style="background:var(--bg); padding:20px; border-radius:12px; border:1px solid var(--border); margin-bottom:30px;">
            <h3 class="profile-table-title" style="margin-top:0;">ממוצעי קריירה</h3>
            <div class="table-wrapper ${currentStatMode === 'ADV' ? 'width-fit' : ''}">
                <table class="box-table ${currentStatMode === 'ADV' ? 'adv-separators' : 'show-separators'}">
                    <thead><tr>
                        <th>GP</th>
                        ${cols.map(c => `<th>${c}</th>`).join('')}
                    </tr></thead>
                    <tbody>
                        <tr style="font-size:1.1rem; font-weight:bold;">
                            <td>${careerTotal.gp}</td>
                            ${cols.map(c => `<td>${smartRound(getCellValue(careerTotal, c, currentStatMode))}</td>`).join('')}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>`;

    const seasonTable = `
        <h3 class="profile-table-title">פירוט לפי עונות</h3>
        <div class="table-wrapper ${currentStatMode === 'ADV' ? 'width-fit' : ''}">
            <table class="box-table ${currentStatMode === 'ADV' ? 'adv-separators' : 'show-separators'}">
                <thead><tr>
                    <th onclick="setSort('season','prof-career',event)">עונה</th>
                    ${cols.map(c => `<th onclick="setSort('${c}','prof-career',event)">${c}</th>`).join('')}
                    <th onclick="setSort('gp','prof-career',event)">GP</th>
                </tr></thead>
                <tbody>
                    ${summaries.map(r => `
                        <tr>
                            <td>${r.season}</td>
                            ${cols.map(c => `<td>${smartRound(getCellValue(r.total, c, currentStatMode))}</td>`).join('')}
                            <td>${r.total.gp}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;

    // Career highs (single-game bests) — exclude percentage columns
    const highCols = Object.keys(sampleStat).filter(k =>
        !ALWAYS_HIDDEN.includes(k) &&
        !['gp','player_id','starter','game_id','starter_count'].includes(k) &&
        (!k.includes('%') || k === 'USG%')
    );

    const careerHighs = {};
    highCols.forEach(c => {
        careerHighs[c] = Math.max(...pStats.map(st => Number(st[c]) || 0));
    });

    const highsRows = seasons.map(s => {
        const sIds       = new Set(data.games.filter(g => g.season === s).map(g => String(g.game_id)));
        const seasonGames = pStats.filter(st => sIds.has(String(st.game_id)));

        const cells = highCols.map(c => {
            let maxVal = -Infinity, maxGid = null;
            seasonGames.forEach(g => {
                const val = Number(g[c]) || 0;
                if (val > maxVal) { maxVal = val; maxGid = g.game_id; }
            });
            const isCareerHigh = maxVal > 0 && maxVal === careerHighs[c];
            const display = c === 'USG%' ? (maxVal < 0 ? 0 : maxVal).toFixed(1) : (maxVal <= 0 ? 0 : Math.round(maxVal));
            return `<td class="${isCareerHigh ? 'career-high' : ''} clickable-stat"
                        onclick="jumpToGame('${maxGid}','${s}')">${display}</td>`;
        }).join('');

        return `<tr><td>${s}</td>${cells}</tr>`;
    }).join('');

    const highsTable = `
        <h3 class="profile-table-title" style="margin-top:40px;">שיאי עונה (במשחק בודד)</h3>
        <div class="table-wrapper">
            <table class="box-table show-separators">
                <thead><tr>
                    <th>עונה</th>
                    ${highCols.map(c => `<th>${c}</th>`).join('')}
                </tr></thead>
                <tbody>${highsRows}</tbody>
            </table>
        </div>`;

    container.innerHTML = modeToggle + careerTable + seasonTable + highsTable;
    applyTableSeparators();
}

/* =====================================================
   Jump to game from player profile
   ===================================================== */
function jumpToGame(gid, s) {
    currentSeason = s;
    updateActiveGamesBySeason();
    renderSeasonFilters();
    goTo('games'); // goTo will call populateGames

    setTimeout(() => {
        if (!openBoxScores.has(String(gid))) toggleBoxScore(gid);
        const el = document.querySelector(`[data-card-id="${gid}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.outline = '2px solid var(--accent)';
            setTimeout(() => el.style.outline = 'none', 2000);
        }
    }, 300);
}

/* =====================================================
   Rotation Modal
   ===================================================== */
function openRotationModal(gameId) {
    const modal   = document.getElementById('rotation-modal');
    const content = document.getElementById('rotation-content');

    const gameData = data.rotations.find(r => String(r.game_id) === String(gameId));
    if (!gameData || !gameData.segments || !gameData.segments.length) {
        content.innerHTML = '<p style="padding:40px; text-align:center;">אין נתוני רוטציה למשחק זה</p>';
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        return;
    }

    const totalMins = Math.max(...gameData.segments.map(s => s.range[1]));
    let html = '<div class="rotation-outer-container"><div class="rotation-scroll-viewport" id="rotation-viewport"><div class="rotation-scroll-container">';

    let currentMin = 0;
    let sectionIdx = 1;

    while (currentMin < totalMins) {
        const isOT          = currentMin >= 40;
        const sectionDur    = isOT ? 5 : 10;
        const sectionEnd    = currentMin + sectionDur;
        const boxWidth      = isOT ? 250 : 500;
        const boxHeight     = 5 * 50 + 50;

        // Time axis ticks
        const ticks = Array.from({ length: sectionDur + 1 }, (_, i) => i)
            .filter(m => !(m === 0 && sectionIdx > 1))
            .map(m => {
                const pct = (m / sectionDur) * 100;
                return `
                    <div class="min-tick-num" style="left:${pct}%">${m}</div>
                    <div style="position:absolute;left:${pct}%;top:35px;height:${5*50+10}px;width:1px;background:#f1f5f9;z-index:0;"></div>`;
            }).join('');

        html += `<div class="quarter-box" style="width:${boxWidth}px;height:${boxHeight}px;">
                    <div style="position:relative;height:35px;border-bottom:4px solid #1e293b;margin-bottom:15px;">${ticks}</div>`;

        for (let posIdx = 0; posIdx < 5; posIdx++) {
            const rowTop    = 45 + posIdx * 50;
            const qSegments = gameData.segments.filter(seg => seg.range[0] < sectionEnd && seg.range[1] > currentMin);
            let currentBlock = null;

            qSegments.forEach((seg, idx) => {
                const playerName    = seg.players[posIdx] || '';
                const rawScore      = seg.score || '';
                const cleanScore    = rawScore.replace(/[^\d]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                const nextSeg       = qSegments[idx + 1];
                const isSameNext    = nextSeg && nextSeg.players[posIdx] === playerName;
                const isLast        = idx === qSegments.length - 1;

                if (!currentBlock) {
                    currentBlock = { start: Math.max(seg.range[0], currentMin), player: playerName };
                }

                if (!isSameNext || isLast) {
                    const sEnd       = Math.min(seg.range[1], sectionEnd);
                    const leftPct    = ((currentBlock.start - currentMin) / sectionDur) * 100;
                    const widthPct   = ((sEnd - currentBlock.start) / sectionDur) * 100;

                    if (widthPct > 0) {
                        const showName   = widthPct > 12;
                        const hoverText  = showName
                            ? `תוצאה: ${cleanScore}`
                            : `${currentBlock.player}\nתוצאה: ${cleanScore}`;

                        html += `
                            <div class="segment-block"
                                 style="left:${leftPct}%;width:${widthPct}%;top:${rowTop}px;height:42px;"
                                 data-hover-info="${hoverText}">
                                <span style="direction:rtl;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px;">
                                    ${showName ? currentBlock.player : ''}
                                </span>
                            </div>`;
                    }
                    currentBlock = null;
                }
            });
        }

        html += '</div>';
        currentMin = sectionEnd;
        sectionIdx++;
    }

    html += '</div></div></div>';
    content.innerHTML = html;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Reset scroll position
    requestAnimationFrame(() => {
        const vp = document.getElementById('rotation-viewport');
        if (vp) vp.scrollLeft = 0;
    });
}

function closeModal() {
    document.getElementById('rotation-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Close modal on backdrop click
window.addEventListener('click', event => {
    const modal = document.getElementById('rotation-modal');
    if (event.target === modal) closeModal();
});