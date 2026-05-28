/* =====================================================
   State
   ===================================================== */
let data = { games: [], players: {}, playersStats: [], rotations: [], teamStats: [] };
let activeGameIds    = new Set();   // games in the current season (for games/players/teams views)
let disabledGameIds  = new Set();   // games explicitly toggled OFF by the user (persists across seasons)
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
    document.getElementById('nav-games').onclick          = () => goTo('games');
    document.getElementById('nav-players').onclick        = () => goTo('players');
    document.getElementById('nav-season-shotchart').onclick = () => goTo('season-shotchart');
    document.getElementById('nav-teams').onclick           = () => goTo('teams');
    document.getElementById('nav-player-profile').onclick  = () => goTo('player-profile');
    loadData();
});

function toggleSidebar() { document.body.classList.toggle('sidebar-closed'); }

/* =====================================================
   Navigation — only re-render the section we're going to
   ===================================================== */
function goTo(id) {
    if (currentSection === id) return; // already here — nothing to do
    currentSection = id;

    const pages = ['games','players','teams','player-profile','season-shotchart'];
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
        case 'season-shotchart': populateSeasonShotChart(); break;
    }
}

/* renderAll is still used after season/game-toggle changes that affect multiple views */
function renderAll() {
    populateGames();
    populatePlayers();
    populateTeams();
    populateSeasonShotChart();
    if (currentSection === 'player-profile') renderPlayerProfile();
    applyTableSeparators();
}

/* =====================================================
   Data Loading
   ===================================================== */
async function loadData() {
    try {
        const [gs, pls, ps, rots, sc, ts] = await Promise.all([
            fetch('games.json').then(r => r.json()),
            fetch('players.json').then(r => r.json()),
            fetch('players_stats.json').then(r => r.json()),
            fetch('rotations.json').then(r => r.json()).catch(() => []),
            fetch('shot_charts.json').then(r => r.json()).catch(() => []),
            fetch('teams_stats.json').then(r => r.json()),
        ]);

        const pMap = {};
        pls.forEach(p => pMap[p.player_id] = p);
        data = { games: gs, players: pMap, playersStats: ps, rotations: rots, teamStats: ts, shotCharts: Array.isArray(sc) ? sc : [sc] };

        // Build a quick lookup: game_id -> shot chart data
        data.shotChartByGame = {};
        data.shotCharts.forEach(sc => { data.shotChartByGame[String(sc.game_id)] = sc; });

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
        if (String(g.season) === String(currentSeason) && !disabledGameIds.has(String(g.game_id)))
            activeGameIds.add(String(g.game_id));
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
    if (chk) { disabledGameIds.delete(String(id)); activeGameIds.add(String(id)); }
    else      { disabledGameIds.add(String(id));    activeGameIds.delete(String(id)); }
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
                    <div class="share-target">
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
                    </div><!-- /.table-wrapper -->
                    </div><!-- /.share-target -->

                    <div style="margin-top:20px; display:flex; justify-content:center; gap:12px; border-top:1px dashed var(--border); padding-top:15px;">
                        ${rotationBtn(g.game_id)}
                        ${shotChartBtn(g.game_id)}
                        <button class="share-btn" onclick="shareBoxScore('${g.game_id}', this)" title="שתף תוצאה">📷 שתף</button>
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
        </div>
        <div class="share-btn-row">
            <button class="share-btn" onclick="shareElement(this.closest('#players-container').querySelector('.table-wrapper'), 'players.png', this)">📷 שתף</button>
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
        </div>
        <div class="share-btn-row">
            <button class="share-btn" onclick="shareElement(this.closest('#teams-container').querySelector('.table-wrapper'), 'teams.png', this)">📷 שתף</button>
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
            <div id="career-table-wrap" class="table-wrapper ${currentStatMode === 'ADV' ? 'width-fit' : ''}">
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
            <div class="share-btn-row">
                <button class="share-btn" onclick="shareElement(document.getElementById('career-table-wrap'), 'career.png', this)">📷 שתף</button>
            </div>
        </div>`;

    const seasonTable = `
        <h3 class="profile-table-title">פירוט לפי עונות</h3>
        <div id="seasons-table-wrap" class="table-wrapper ${currentStatMode === 'ADV' ? 'width-fit' : ''}">
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
        </div>
        <div class="share-btn-row">
            <button class="share-btn" onclick="shareElement(document.getElementById('seasons-table-wrap'), 'seasons.png', this)">📷 שתף</button>
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
        <div id="highs-table-wrap" class="table-wrapper">
            <table class="box-table show-separators">
                <thead><tr>
                    <th>עונה</th>
                    ${highCols.map(c => `<th>${c}</th>`).join('')}
                </tr></thead>
                <tbody>${highsRows}</tbody>
            </table>
        </div>
        <div class="share-btn-row">
            <button class="share-btn" onclick="shareElement(document.getElementById('highs-table-wrap'), 'highs.png', this)">📷 שתף</button>
        </div>`;

    container.innerHTML = modeToggle + careerTable + seasonTable + highsTable;
    applyTableSeparators();

    // Append shot chart section below
    renderProfileShotChart(pid, seasons);
}

/* =====================================================
   Player Profile Shot Chart
   ===================================================== */
function renderProfileShotChart(pid, seasons) {
    const container = document.getElementById('profile-content');
    if (!container) return;

    // Only include seasons that have shot chart data for this player
    const validSeasons = seasons.filter(s => {
        const sIds = new Set(data.games.filter(g => g.season === s).map(g => String(g.game_id)));
        return [...sIds].some(gid => {
            const sc = data.shotChartByGame[gid];
            if (!sc) return false;
            // Check if this player appears in this game's shot chart
            const pid_str = String(pid);
            return Object.values(sc.player_mapping).some(p => String(p) === pid_str);
        });
    });

    if (validSeasons.length === 0) {
        // No shot chart data for this player — show message at bottom of profile
        const noDataEl = document.createElement('div');
        noDataEl.style.cssText = 'margin-top:40px; padding:20px; text-align:center; color:#94a3b8; font-size:1rem; font-weight:600;';
        noDataEl.textContent = 'מפת זריקות - המידע לא זמין';
        container.appendChild(noDataEl);
        return;
    }

    // Init active seasons: all on by default, reset when player changes
    const allSeasonsSet = new Set(validSeasons);
    // Prune invalid seasons from existing selection
    const stillValid = [...scProfileActiveSeasons].filter(s => allSeasonsSet.has(s));
    scProfileActiveSeasons = stillValid.length > 0 ? new Set(stillValid) : new Set(validSeasons);

    // Build the section HTML and append it
    const scSection = document.createElement('div');
    scSection.id = 'profile-sc-section';
    scSection.style.cssText = 'margin-top:40px;';

    const seasonBtns = validSeasons.map(s => `
        <div class="season-pill ${scProfileActiveSeasons.has(s) ? 'active' : ''}"
             id="psc-pill-${s.replace(/\//g,'-')}"
             onclick="pscToggleSeason('${s}')">${s}</div>
    `).join('');

    scSection.innerHTML = `
        <h3 class="profile-table-title" style="margin-bottom:20px;">מפת זריקות אישית</h3>
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px; padding:10px 0;">
            <div class="season-pill ${scProfileActiveSeasons.size === allSeasonsSet.size ? 'active' : ''}"
                 id="psc-pill-all" onclick="pscToggleAll()">כולם</div>
            ${seasonBtns}
        </div>
        <div class="psc-layout" id="psc-layout">
            <div class="ssc-court" style="position:relative;">
                ${buildCourtSVG('psc-half-court')}
                <div class="sc-badges" id="psc-badges"></div>
            </div>
        </div>
        <div class="share-btn-row">
            <button class="share-btn" onclick="shareShotChart('psc-half-court','psc-badges','shotchart_profile.png',this)">📷 שתף</button>
        </div>`;

    container.appendChild(scSection);

    // Store data for toggle functions
    window._pscPid     = String(pid);
    window._pscSeasons = validSeasons;

    requestAnimationFrame(() => requestAnimationFrame(() => pscUpdateCourt()));
}

function pscBuildUnifiedSc() {
    const pid     = window._pscPid;
    const seasons = window._pscSeasons;
    if (!pid || !seasons) return null;

    const ZONES = ['right_corner_3','right_corner_mid','right_45_3','right_45_mid',
                   'right_floater','layup','left_floater','front_floater',
                   'free_throw_line','top_of_the_key','left_45_3','left_corner_mid',
                   'left_45_mid','left_corner_3'];

    const mergedShots = {};
    ZONES.forEach(zone => mergedShots[zone] = '');

    // Fixed char for this single player
    const MY_CHAR = 'A';

    seasons.forEach(s => {
        if (!scProfileActiveSeasons.has(s)) return;
        const sIds = new Set(data.games.filter(g => g.season === s).map(g => String(g.game_id)));
        sIds.forEach(gid => {
            if (disabledGameIds.has(gid)) return;
            const sc = data.shotChartByGame[gid];
            if (!sc) return;
            // Find the char used for this player in this game
            const charForPlayer = Object.entries(sc.player_mapping)
                .find(([, p]) => String(p) === pid)?.[0];
            if (!charForPlayer) return;

            ZONES.forEach(zone => {
                const shots = sc.shots_data[zone];
                if (!shots || shots === '0') return;
                for (const ch of shots) {
                    if (ch.toUpperCase() === charForPlayer.toUpperCase()) {
                        // Preserve make/miss case, remap to MY_CHAR
                        mergedShots[zone] += (ch === ch.toUpperCase()) ? MY_CHAR : MY_CHAR.toLowerCase();
                    }
                }
            });
        });
    });

    return { player_mapping: { [MY_CHAR]: pid }, shots_data: mergedShots };
}

function pscUpdateCourt() {
    const svg = document.getElementById('psc-half-court');
    if (!svg) return;

    svg.querySelectorAll('.sc-label').forEach(l => l.remove());

    const sc = pscBuildUnifiedSc();
    if (!sc) return;

    // Use a local active-set of just our one char so scCalcZone works
    const saved = scActivePlayers;
    scActivePlayers = new Set(['A']);

    Object.entries(sc.shots_data).forEach(([rawZone, shotString]) => {
        const zoneId = 'sc_' + rawZone;
        const el = svg.querySelector('#' + zoneId);
        if (!el) return;

        const { made, total, pct } = scCalcZone(shotString);
        el.style.fill = total === 0 ? SC_CONFIG.emptyColor : scGetColor(zoneId, pct);

        const bbox = el.getBBox();
        const { x, y } = scLabelPos(rawZone, bbox);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'sc-label');
        label.setAttribute('x', x);
        label.setAttribute('y', y);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('transform', `rotate(90, ${x}, ${y})`);
        if (scIsCornerZone(rawZone)) {
            label.innerHTML = `<tspan x="${x}">${made}/${total}</tspan><tspan dx="60">${pct}%</tspan>`;
        } else {
            label.innerHTML = `<tspan x="${x}" dy="-50">${made}/${total}</tspan><tspan x="${x}" dy="130">${pct}%</tspan>`;
        }
        svg.appendChild(label);
    });

    // Badges
    const badgesEl = document.getElementById('psc-badges');
    if (badgesEl) {
        badgesEl.innerHTML = Object.entries(SC_SUMMARY_GROUPS).map(([label, zones]) => {
            let made = 0, total = 0;
            zones.forEach(zoneId => {
                const rawZone = zoneId.replace('sc_', '');
                const { made: m, total: t } = scCalcZone(sc.shots_data[rawZone]);
                made += m; total += t;
            });
            const pct = total > 0 ? Math.round(made / total * 100) : 0;
            return `<div class="sc-badge sc-badge-sm">
                <span class="sc-badge-label">${label}</span>
                <span class="sc-badge-stats">${made}/${total}</span>
                <span class="sc-badge-pct">${pct}%</span>
            </div>`;
        }).join('');

        requestAnimationFrame(() => {
            const svgEl   = document.getElementById('psc-half-court');
            if (!svgEl) return;
            const svgRect  = svgEl.getBoundingClientRect();
            const areaRect = badgesEl.parentElement.getBoundingClientRect();
            const isLandscapeMobile = window.innerWidth <= 768 && window.innerWidth > window.innerHeight;
            const isPortraitMobile  = window.innerWidth <= 768 && window.innerWidth <= window.innerHeight;
            if (isLandscapeMobile) {
                badgesEl.style.top   = (svgRect.top - areaRect.top) + 'px';
                badgesEl.style.left  = (svgRect.right - areaRect.left - window.innerWidth * 0.08) + 'px';
                badgesEl.style.right = 'auto';
            } else {
                badgesEl.style.top   = (svgRect.top - areaRect.top + 8) + 'px';
                badgesEl.style.right = Math.max(0, areaRect.right - svgRect.right) + 'px';
                badgesEl.style.left  = 'auto';
            }
        });
    }

    scActivePlayers = saved;
}

function pscToggleSeason(s) {
    if (scProfileActiveSeasons.has(s)) scProfileActiveSeasons.delete(s);
    else scProfileActiveSeasons.add(s);
    pscRenderPills();
    pscUpdateCourt();
}

function pscToggleAll() {
    const all = window._pscSeasons || [];
    if (scProfileActiveSeasons.size === all.length) scProfileActiveSeasons.clear();
    else all.forEach(s => scProfileActiveSeasons.add(s));
    pscRenderPills();
    pscUpdateCourt();
}

function pscRenderPills() {
    const all = window._pscSeasons || [];
    const allOn = scProfileActiveSeasons.size === all.length;
    const allPill = document.getElementById('psc-pill-all');
    if (allPill) allPill.classList.toggle('active', allOn);
    all.forEach(s => {
        const pill = document.getElementById('psc-pill-' + s.replace(/\//g,'-'));
        if (pill) pill.classList.toggle('active', scProfileActiveSeasons.has(s));
    });
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

    // Inject share button into modal header area
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn && !modal.querySelector('.rotation-share-btn')) {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'rotation-share-btn share-btn';
        shareBtn.textContent = '📷';
        shareBtn.title = 'שתף רוטציה';
        shareBtn.onclick = function() { shareRotation(this); };
        closeBtn.insertAdjacentElement('afterend', shareBtn);
    }

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Reset scroll position
    requestAnimationFrame(() => {
        const vp = document.getElementById('rotation-viewport');
        if (vp) vp.scrollLeft = 0;
    });
}

function closeModal() {
    const modal = document.getElementById('rotation-modal');
    modal.style.display = 'none';
    modal.querySelector('.modal-content').classList.remove('sc-mode');
    modal.querySelector('.modal-content').style.height = 'auto';
    document.body.style.overflow = 'auto';
}

// Close modal on backdrop click
window.addEventListener('click', event => {
    const modal = document.getElementById('rotation-modal');
    if (event.target === modal) closeModal();
});

/* =====================================================
   Shot Chart Modal
   ===================================================== */

const SC_CONFIG = {
    emptyColor: '#2a2a2a',
    // For each category: red=best, grey=neutral band, blue=worst
    // red:   >= redMin  → full red, interpolate red→grey between redMin and greyTop
    // grey:  greyTop to greyBot → grey
    // blue:  greyBot down to blueMax → interpolate grey→blue, below blueMax → full blue
    thresholds: {
        threePoint: { redMin: 44, greyTop: 30, greyBot: 28, blueMax: 18 },
        midRange:   { redMin: 57, greyTop: 35, greyBot: 30, blueMax: 20 },
        floater:    { redMin: 62, greyTop: 45, greyBot: 42, blueMax: 18 },
        layup:      { redMin: 68, greyTop: 52, greyBot: 50, blueMax: 35 },
    },
    colors: { red: '#c0392b', grey: '#6a6a6a', blue: '#1a3aaa' }
};

const SC_SUMMARY_GROUPS = {
    'CLOSE': ['sc_layup','sc_left_floater','sc_right_floater','sc_front_floater'],
    'MID':   ['sc_right_corner_mid','sc_left_corner_mid','sc_right_45_mid','sc_left_45_mid','sc_free_throw_line'],
    '2PT':   ['sc_layup','sc_left_floater','sc_right_floater','sc_front_floater','sc_right_corner_mid','sc_left_corner_mid','sc_right_45_mid','sc_left_45_mid','sc_free_throw_line'],
    '3PT':   ['sc_right_corner_3','sc_left_corner_3','sc_right_45_3','sc_left_45_3','sc_top_of_the_key'],
};

// Per-modal state
let scActivePlayers = new Set();

// Season shot chart state (separate from per-game modal)
let scSeasonActivePlayers = new Set();

// Player profile shot chart state
let scProfileActiveSeasons = new Set();

/* =====================================================
   Season Shot Chart Page
   ===================================================== */
function populateSeasonShotChart() {
    const container = document.getElementById('season-sc-container');
    if (!container) return;

    // Get all active game IDs for this season
    const seasonGameIds = data.games
        .filter(g => String(g.season) === String(currentSeason) && activeGameIds.has(String(g.game_id)))
        .map(g => String(g.game_id));

    // Collect all shot charts for active season games
    const seasonCharts = seasonGameIds
        .map(id => data.shotChartByGame[id])
        .filter(Boolean);

    // Update nav button appearance based on data availability
    const navBtn = document.getElementById('nav-season-shotchart');
    const noData = !data.shotChartByGame || Object.keys(data.shotChartByGame).length === 0;
    if (navBtn) {
        navBtn.style.opacity    = noData ? '0.45' : '';
        navBtn.style.cursor     = noData ? 'default' : '';
        navBtn.style.pointerEvents = noData ? 'none' : '';
    }

    if (seasonCharts.length === 0) {
        container.innerHTML = '<p style="padding:40px; text-align:center; color:#94a3b8;">מפת זריקות - המידע לא זמין</p>';
        return;
    }

    // Build unified player list: player_id -> name, from all season players stats
    const seasonPlayerIds = new Set(
        data.playersStats
            .filter(s => seasonGameIds.includes(String(s.game_id)))
            .map(s => String(s.player_id))
    );

    // Build a merged shots_data by zone, keyed by player_id (not char)
    // Each zone value becomes a string of player_id chars we invent
    // Strategy: assign each player_id a unique single char key
    const playerIdList = [...seasonPlayerIds];
    const pidToChar = {};
    playerIdList.forEach((pid, i) => {
        // Use base-36 chars starting from 'A'
        pidToChar[pid] = String.fromCharCode(65 + i); // A, B, C...
    });

    // Merge all zones across all season charts
    const ZONES = ['right_corner_3','right_corner_mid','right_45_3','right_45_mid',
                   'right_floater','layup','left_floater','front_floater',
                   'free_throw_line','top_of_the_key','left_45_3','left_corner_mid',
                   'left_45_mid','left_corner_3'];

    const mergedShots = {};
    ZONES.forEach(zone => mergedShots[zone] = '');

    seasonCharts.forEach(sc => {
        // Build char->player_id for this game
        const charToPid = {};
        Object.entries(sc.player_mapping).forEach(([char, pid]) => {
            charToPid[char.toUpperCase()] = String(pid);
        });

        ZONES.forEach(zone => {
            const shots = sc.shots_data[zone];
            if (!shots || shots === '0') return;
            for (const ch of shots) {
                const pid = charToPid[ch.toUpperCase()];
                if (!pid || !seasonPlayerIds.has(pid)) continue;
                const myChar = pidToChar[pid];
                // Preserve case: uppercase = make, lowercase = miss
                mergedShots[zone] += (ch === ch.toUpperCase()) ? myChar : myChar.toLowerCase();
            }
        });
    });

    // Build the unified sc object for rendering
    const unifiedSc = {
        player_mapping: {},
        shots_data: mergedShots
    };
    playerIdList.forEach(pid => {
        unifiedSc.player_mapping[pidToChar[pid]] = pid;
    });

    // Init season active players (all on by default, persist across re-renders)
    const allChars = new Set(playerIdList.map(pid => pidToChar[pid]));
    // Keep existing selection if still valid, else reset to all
    const validExisting = [...scSeasonActivePlayers].filter(c => allChars.has(c));
    scSeasonActivePlayers = validExisting.length > 0 ? new Set(validExisting) : new Set(allChars);

    // Build player buttons
    const playerBtns = playerIdList.map(pid => {
        const char = pidToChar[pid];
        const name = data.players[pid]?.Name || `#${pid}`;
        return `<button id="ssc-btn-${char}" class="sc-player-btn ${scSeasonActivePlayers.has(char) ? 'sc-btn-on' : ''}"
                    onclick="sscTogglePlayer('${char}')">${name}</button>`;
    }).join('');

    container.innerHTML = `
        <div id="ssc-layout-wrap">
            <div class="ssc-layout">
                <div class="ssc-court">
                    ${buildCourtSVG('ssc-half-court')}
                    <div class="sc-badges" id="ssc-badges"></div>
                </div>
                <div class="ssc-panel">
                    <button id="ssc-btn-all" class="sc-player-btn sc-all-btn ${scSeasonActivePlayers.size === allChars.size ? 'sc-btn-on' : ''}"
                            onclick="sscToggleAll()">כולם</button>
                    ${playerBtns}
                </div>
            </div>
        </div>
        <div class="share-btn-row">
            <button class="share-btn" onclick="shareShotChart('ssc-half-court','ssc-badges','shotchart_season.png',this)">📷 שתף</button>
        </div>`;

    // Store unified sc on window for toggle functions to access
    window._sscData = unifiedSc;
    // Use double rAF to ensure SVG is painted before getBBox() is called
    requestAnimationFrame(() => requestAnimationFrame(() => sscUpdateCourt()));
}

function sscTogglePlayer(char) {
    if (scSeasonActivePlayers.has(char)) scSeasonActivePlayers.delete(char);
    else scSeasonActivePlayers.add(char);
    sscRenderButtons();
    sscUpdateCourt();
}

function sscToggleAll() {
    const allChars = Object.keys(window._sscData.player_mapping);
    if (scSeasonActivePlayers.size === allChars.length) scSeasonActivePlayers.clear();
    else allChars.forEach(c => scSeasonActivePlayers.add(c));
    sscRenderButtons();
    sscUpdateCourt();
}

function sscRenderButtons() {
    const allChars = Object.keys(window._sscData.player_mapping);
    const allOn = scSeasonActivePlayers.size === allChars.length;
    const allBtn = document.getElementById('ssc-btn-all');
    if (allBtn) allBtn.classList.toggle('sc-btn-on', allOn);
    allChars.forEach(char => {
        const btn = document.getElementById('ssc-btn-' + char);
        if (btn) btn.classList.toggle('sc-btn-on', scSeasonActivePlayers.has(char));
    });
}

function sscUpdateCourt() {
    const sc = window._sscData;
    if (!sc) return;
    const svg = document.getElementById('ssc-half-court');
    if (!svg) return;

    svg.querySelectorAll('.sc-label').forEach(l => l.remove());

    // Temporarily swap scActivePlayers so scCalcZone works
    const saved = scActivePlayers;
    scActivePlayers = scSeasonActivePlayers;

    Object.entries(sc.shots_data).forEach(([rawZone, shotString]) => {
        const zoneId = 'sc_' + rawZone;
        const zoneEl = svg.querySelector('#' + zoneId);
        if (!zoneEl) return;

        const { made, total, pct } = scCalcZone(shotString);
        zoneEl.style.fill = total === 0 ? SC_CONFIG.emptyColor : scGetColor(zoneId, pct);

        const bbox = zoneEl.getBBox();
        const { x, y } = scLabelPos(rawZone, bbox);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'sc-label');
        label.setAttribute('x', x);
        label.setAttribute('y', y);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('transform', `rotate(90, ${x}, ${y})`);
        if (scIsCornerZone(rawZone)) {
            label.innerHTML = `<tspan x="${x}">${made}/${total}</tspan><tspan dx="60">${pct}%</tspan>`;
        } else {
            label.innerHTML = `<tspan x="${x}" dy="-50">${made}/${total}</tspan><tspan x="${x}" dy="130">${pct}%</tspan>`;
        }
        svg.appendChild(label);
    });

    // Badges
    const badgesEl = document.getElementById('ssc-badges');
    if (badgesEl) {
        badgesEl.innerHTML = Object.entries(SC_SUMMARY_GROUPS).map(([label, zones]) => {
            let made = 0, total = 0;
            zones.forEach(zoneId => {
                const rawZone = zoneId.replace('sc_', '');
                const { made: m, total: t } = scCalcZone(sc.shots_data[rawZone]);
                made += m; total += t;
            });
            const pct = total > 0 ? Math.round(made / total * 100) : 0;
            return `<div class="sc-badge">
                <span class="sc-badge-label">${label}</span>
                <span class="sc-badge-stats">${made}/${total}</span>
                <span class="sc-badge-pct">${pct}%</span>
            </div>`;
        }).join('');

        // Align badge column with SVG's right edge
        requestAnimationFrame(() => {
            const svgRect  = svg.getBoundingClientRect();
            const areaRect = badgesEl.parentElement.getBoundingClientRect();
            const isLandscapeMobile = window.innerWidth <= 768 && window.innerWidth > window.innerHeight;
            badgesEl.style.top = (svgRect.top - areaRect.top + 12) + 'px';
            if (isLandscapeMobile) {
                badgesEl.style.left  = (svgRect.right - areaRect.left - window.innerWidth * 0.08) + 'px';
                badgesEl.style.right = 'auto';
            } else {
                badgesEl.style.right = Math.max(0, areaRect.right - svgRect.right) + 'px';
                badgesEl.style.left  = 'auto';
            }
        });
    }

    scActivePlayers = saved;
}

/* Shared label x/y positioning — call after getBBox(). */
function scLabelPos(rawZone, bbox) {
    let x = bbox.x + bbox.width  / 2;
    let y = bbox.y + bbox.height / 2;

    // Push corner_3 labels to their respective edges
    if (rawZone === 'right_corner_3') x = bbox.x + bbox.width * 0.75;
    if (rawZone === 'left_corner_3')  x = bbox.x + bbox.width * 0.30;
    if (rawZone === 'right_corner_3') y = bbox.y + bbox.height * 0.65;
    if (rawZone === 'left_corner_3')  y = bbox.y + bbox.height * 0.65;

    // Push right_corner_mis and right_floater labels up a little
    if (rawZone === 'right_corner_mid') x = bbox.x + bbox.width * 0.60;
    if (rawZone === 'right_floater')  x = bbox.x + bbox.width * 0.60;

    // Push corner_mids a little to the left 
    if (rawZone === 'right_corner_mid') y = bbox.y + bbox.height * 0.42;
    if (rawZone === 'left_corner_mid')  y = bbox.y + bbox.height * 0.42;

    // 3pt and top-of-key zones: shift y up (toward basket in rotated view)
    if (rawZone.includes('3') || rawZone === 'top_of_the_key') y -= 180;

    return { x, y };
}

/* Corner_3 zones: single line "x/y  pct%" */
function scIsCornerZone(rawZone) {
    return rawZone === 'left_corner_3' || rawZone === 'right_corner_3';
}

function scGetCategory(zoneId) {
    if (zoneId.includes('3') || zoneId === 'sc_top_of_the_key') return 'threePoint';
    if (zoneId.includes('floater')) return 'floater';
    if (zoneId.includes('layup'))   return 'layup';
    return 'midRange';
}

function scGetColor(zoneId, pct) {
    const t = SC_CONFIG.thresholds[scGetCategory(zoneId)];
    const { red, grey, blue } = SC_CONFIG.colors;

    if (pct >= t.redMin)  return red;
    if (pct >= t.greyTop) return scLerpColor(grey, red,  (pct - t.greyTop) / (t.redMin  - t.greyTop));
    if (pct >= t.greyBot) return grey;
    if (pct >= t.blueMax) return scLerpColor(blue, grey, (pct - t.blueMax) / (t.greyBot - t.blueMax));
    return blue;
}

function scLerpColor(a, b, t) {
    // t=0 → color a, t=1 → color b
    const hex = c => [
        parseInt(c.slice(1,3),16),
        parseInt(c.slice(3,5),16),
        parseInt(c.slice(5,7),16)
    ];
    const [ar,ag,ab] = hex(a);
    const [br,bg,bb] = hex(b);
    const r = Math.round(ar + (br-ar)*t);
    const g = Math.round(ag + (bg-ag)*t);
    const bl = Math.round(ab + (bb-ab)*t);
    return `rgb(${r},${g},${bl})`;
}

function scCalcZone(shotString) {
    let made = 0, total = 0;
    if (shotString && shotString !== '0') {
        for (const ch of shotString) {
            if (scActivePlayers.has(ch.toUpperCase())) {
                total++;
                if (ch === ch.toUpperCase()) made++;
            }
        }
    }
    return { made, total, pct: total > 0 ? Math.round(made / total * 100) : 0 };
}

function scUpdateCourt(sc) {
    const svg = document.getElementById('sc-half-court');
    if (!svg) return;

    // Remove old labels
    svg.querySelectorAll('.sc-label').forEach(l => l.remove());

    Object.entries(sc.shots_data).forEach(([rawZone, shotString]) => {
        const zoneId = 'sc_' + rawZone;
        const el = svg.querySelector('#' + zoneId);
        if (!el) return;

        const { made, total, pct } = scCalcZone(shotString);
        el.style.fill = total === 0 ? SC_CONFIG.emptyColor : scGetColor(zoneId, pct);

        // Label
        const bbox = el.getBBox();
        const { x, y } = scLabelPos(rawZone, bbox);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'sc-label');
        label.setAttribute('x', x);
        label.setAttribute('y', y);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('transform', `rotate(90, ${x}, ${y})`);
        if (scIsCornerZone(rawZone)) {
            label.innerHTML = `<tspan x="${x}">${made}/${total}</tspan><tspan dx="60">${pct}%</tspan>`;
        } else {
            label.innerHTML = `<tspan x="${x}" dy="-50">${made}/${total}</tspan><tspan x="${x}" dy="130">${pct}%</tspan>`;
        }
        svg.appendChild(label);
    });

    // Summary badges — position relative to SVG's actual rendered top-right corner
    const badgesEl = document.getElementById('sc-badges');
    if (!badgesEl) return;
    badgesEl.innerHTML = Object.entries(SC_SUMMARY_GROUPS).map(([label, zones]) => {
        let made = 0, total = 0;
        zones.forEach(zoneId => {
            const rawZone = zoneId.replace('sc_', '');
            const { made: m, total: t } = scCalcZone(sc.shots_data[rawZone]);
            made += m; total += t;
        });
        const pct = total > 0 ? Math.round(made / total * 100) : 0;
        return `<div class="sc-badge">
            <span class="sc-badge-label">${label}</span>
            <span class="sc-badge-stats">${made}/${total}</span>
            <span class="sc-badge-pct">${pct}%</span>
        </div>`;
    }).join('');

    // Align badge column with SVG's right edge
    requestAnimationFrame(() => {
        const svgRect  = svg.getBoundingClientRect();
        const areaRect = badgesEl.parentElement.getBoundingClientRect();
        const isLandscapeMobile = window.innerWidth <= 768 && window.innerWidth > window.innerHeight;
        badgesEl.style.top = (svgRect.top - areaRect.top + 12) + 'px';
        if (isLandscapeMobile) {
            badgesEl.style.left  = (svgRect.right - areaRect.left - window.innerWidth * 0.1) + 'px';
            badgesEl.style.right = 'auto';
        } else {
            badgesEl.style.right = Math.max(0, areaRect.right - svgRect.right) + 'px';
            badgesEl.style.left  = 'auto';
        }
    });
}

function scTogglePlayer(char, sc) {
    if (scActivePlayers.has(char)) scActivePlayers.delete(char);
    else scActivePlayers.add(char);
    scRenderButtons(sc);
    scUpdateCourt(sc);
}

function scToggleAll(sc) {
    const allChars = Object.keys(sc.player_mapping);
    if (scActivePlayers.size === allChars.length) scActivePlayers.clear();
    else allChars.forEach(c => scActivePlayers.add(c));
    scRenderButtons(sc);
    scUpdateCourt(sc);
}

function scRenderButtons(sc) {
    const allChars = Object.keys(sc.player_mapping);
    const allOn = scActivePlayers.size === allChars.length;
    const allBtn = document.getElementById('sc-btn-all');
    if (allBtn) allBtn.classList.toggle('sc-btn-on', allOn);
    allChars.forEach(char => {
        const btn = document.getElementById('sc-btn-' + char);
        if (btn) btn.classList.toggle('sc-btn-on', scActivePlayers.has(char));
    });
}

function rotationBtn(gameId) {
    const hasData = data.rotations && data.rotations.some(r => String(r.game_id) === String(gameId));
    if (hasData) {
        return `<button class="adv-toggle-btn" style="border-color:var(--accent);color:var(--accent);"
                    onclick="event.stopPropagation();openRotationModal('${gameId}')">רוטציות</button>`;
    }
    return `<button class="adv-toggle-btn" style="border-color:#94a3b8;color:#94a3b8;cursor:default;" disabled>רוטציות - המידע לא זמין</button>`;
}

function shotChartBtn(gameId) {
    const hasData = data.shotChartByGame && data.shotChartByGame[String(gameId)];
    if (hasData) {
        return `<button class="adv-toggle-btn" style="border-color:#f97316;color:#f97316;"
                    onclick="event.stopPropagation();openShotChartModal('${gameId}')">מפת זריקות</button>`;
    }
    return `<button class="adv-toggle-btn" style="border-color:#94a3b8;color:#94a3b8;cursor:default;" disabled>מפת זריקות - המידע לא זמין</button>`;
}

function buildCourtSVG(svgId) {
    return `<svg viewBox="0 0 2189 1827" id="${svgId}" class="sc-court-svg"><rect width="2189" height="1827" fill="#2a2a2a"/>
                        <path id="sc_right_corner_3" d="m 2092.4471,23.138504 c -14.5423,1.899869 -31.652,-3.083595 -45.0778,3.53923 -3.4087,94.818846 -2.3655,190.228116 -3.5537,285.274166 -0.5066,79.91681 -1.0131,159.83361 -1.5197,239.75045 -33.1041,65.94006 -73.6528,127.6408 -115.5677,188.17883 -8.2524,8.22354 8.0984,11.23571 11.9542,16.08183 74.9612,48.85515 149.3561,98.81413 226.4864,144.18112 9.872,7.544 4.5391,-10.64997 6.0723,-15.23835 3.0857,-287.08578 3.0738,-574.19435 4.4483,-861.291494 -27.3162,-1.152932 -55.5797,-0.195669 -83.2423,-0.475782 z" />
                        <path id="sc_right_corner_mid" d="m 1642.9163,23.609431 c -1.5519,105.327399 0.5034,210.767129 -3.8402,316.020699 -7.8143,51.23243 -26.1916,101.10849 -51.8873,146.10335 -6.6901,11.47947 -14.0872,23.07116 -18.9653,35.21785 109.1183,71.27907 219.1635,141.18578 329.3766,210.75168 5.7068,3.46834 13.801,9.68698 17.8467,0.42724 47.554,-57.62706 85.5435,-122.70393 117.1829,-190.24454 -0.8924,-172.85445 -0.4586,-346.26181 -2.1847,-518.77148 -129.1074,0.330099 -258.7609,-0.659852 -387.5287,0.495201 z" />
                        <path id="sc_right_45_3" d="m 1913.4999,757.63795 c -17.8027,9.64308 -29.5763,28.32779 -44.5268,41.82776 -83.3863,85.93722 -180.9143,158.16153 -288.7248,210.52659 -49.4174,25.2904 -101.7916,43.7786 -153.8027,62.7002 -14.7778,4.9839 -2.0782,21.879 -0.4564,31.3676 79.8545,218.0141 159.9227,435.9515 240.7453,653.5923 5.4545,13.6409 10.4037,27.7176 16.3223,41.0192 113.7266,3.8101 227.6131,1.6309 341.4021,2.0929 50.2951,-0.5743 101.1499,0.698 151.0412,-3.127 -0.1588,-292.3097 0.317,-584.7842 -0.2379,-876.99107 -85.2974,-53.01784 -168.5996,-109.33654 -254.7324,-160.95 -2.2135,-0.98736 -4.5354,-2.17988 -7.0299,-2.05848 z" />
                        <path id="sc_right_45_mid" d="m 1563.5726,530.97187 c -19.4668,13.50492 -32.3943,34.96148 -50.3631,50.51788 -57.2266,59.36564 -129.2589,102.51687 -206.2437,131.02801 -5.8944,3.95276 -16.8865,5.06662 -19.759,11.94173 37.8204,111.37442 79.7874,221.36248 121.1348,331.45931 5.8945,14.4712 23.676,2.8333 33.8107,0.9787 105.7156,-36.951 207.2489,-87.20761 296.8552,-154.81083 55.4405,-41.15734 103.1752,-91.63258 151.4996,-140.67646 5.2452,-4.45269 13.5066,-14.13292 3.9131,-18.97299 -109.1856,-71.22353 -219.0819,-141.51588 -329.2844,-211.1692 -0.4527,-0.30971 -1.028,-0.44591 -1.5632,-0.29615 z" />
                        <path id="sc_right_floater" d="m 1287.8622,23.609431 c -2.0524,78.071809 0.2046,156.459789 -5.2094,234.331979 -5.7857,42.6291 -39.1918,73.36013 -66.9929,102.80759 74.4553,87.55581 147.3386,176.50672 222.9375,263.05363 7.5037,11.08556 17.7917,-4.91202 24.6956,-8.76824 52.5472,-46.63388 102.0865,-99.36498 130.2048,-164.7471 18.144,-40.41369 32.5108,-83.32537 38.496,-127.13941 0.3275,-99.94236 2.0028,-200.43394 1.4895,-300.03365 -115.1379,0.330813 -230.8227,-0.659669 -345.6211,0.495201 z" />
                        <path id="sc_layup" d="m 1095.8747,23.721094 c -60.8897,0.54295 -122.3248,-0.233552 -182.87476,1.131194 -0.40642,75.445932 -0.90914,150.899922 -1.26227,226.340792 16.53341,49.94067 49.95846,97.56089 100.87783,116.49942 39.8063,19.91298 85.8986,18.88109 128.9439,13.44227 40.45,-11.06061 79.0265,-32.1211 105.2299,-65.58192 13.0966,-16.75448 22.5451,-36.82501 30.0001,-56.2714 0.3166,-78.66502 1.9864,-157.87898 1.4649,-236.201204 -60.7932,0.213616 -121.5864,0.427232 -182.3796,0.640848 z" />
                        <path id="sc_left_floater" d="m 576.93331,23.580301 c -5.52578,90.999189 -3.0492,182.358559 0.35269,273.400709 2.90171,95.15225 44.24197,186.2204 106.43108,257.2993 21.43432,24.14302 43.53777,49.15077 70.97394,66.40061 18.73945,-14.17548 30.75757,-36.18246 47.21503,-53.00321 C 860.18555,498.61733 919.45033,429.76066 976.69153,360.21982 945.17757,331.33952 912.82162,297.71117 906.8148,253.4409 903.07129,176.87256 907.53801,99.380567 901.5375,23.11423 793.39862,23.425936 684.76661,22.493565 576.93331,23.580301 Z" />
                        <path id="sc_front_floater" d="m 1202.7216,369.34219 c -30.3315,7.39291 -58.2926,26.78123 -90.4518,22.72512 -27.9368,-1.07928 -57.0085,4.35871 -82.7522,-9.31591 -14.2022,-3.26599 -28.1565,-13.15759 -42.70845,-12.74894 -27.3605,20.25744 -46.19528,50.02708 -69.10555,74.91332 -50.64399,61.34642 -104.19746,120.57384 -152.52598,183.67379 7.17772,12.55101 24.31296,16.56589 35.44072,25.1068 67.11643,41.20795 142.53475,68.22095 220.67036,78.35133 51.8478,7.8391 104.8992,5.96256 156.935,0.971 76.4755,-11.33941 153.0952,-31.92627 219.0373,-73.53523 10.62,-8.18315 26.6092,-11.93447 34.0395,-23.42219 -7.0888,-18.93128 -24.9196,-32.46402 -36.4749,-48.85012 -60.6069,-70.53416 -118.6124,-143.4245 -181.6708,-211.78091 -2.9899,-2.4642 -6.1279,-6.51098 -10.4332,-6.08806 z" />
                        <path id="sc_free_throw_line" d="m 920.69983,722.98359 c -7.95413,7.80531 -9.20861,22.4203 -14.65062,32.43611 -36.66666,99.38604 -75.08188,198.22203 -109.04656,298.5614 -5.41923,11.4642 15.05523,9.0827 21.88485,13.4099 74.84711,18.8089 151.48445,31.9723 228.534,36.7753 94.3947,2.5231 189.6383,1.8265 282.362,-18.216 23.2357,-5.5601 48.1902,-8.667 70.164,-17.132 -39.3414,-114.50692 -82.5238,-227.94243 -123.7031,-341.66434 -28.4996,-0.0976 -56.4857,10.32322 -84.9536,13.01313 -56.0959,6.83863 -113.2879,6.82369 -169.5158,1.38547 -34.10493,-3.75695 -66.97424,-15.17975 -101.07517,-18.56897 z" />
                        <path id="sc_top_of_the_key" d="m 791.25821,1070.401 c -23.49949,50.8739 -39.58557,104.9498 -60.05593,157.1142 -69.12391,189.5854 -141.62899,377.9552 -209.30423,568.0541 -0.69082,6.2895 12.44543,0.695 15.96294,2.9858 281.02728,3.3951 562.09471,1.3959 843.13781,1.3933 95.4043,-0.762 191.3171,0.5484 286.4106,-2.0633 -6.8301,-33.5054 -22.1394,-65.3011 -32.8109,-97.8882 -75.8712,-204.8604 -150.6099,-410.1812 -227.3104,-614.7107 -2.722,-10.0309 -15.6031,-0.018 -22.3112,-0.857 -85.1835,19.3398 -172.3161,32.8887 -259.919,29.7721 -78.382,-0.2883 -157.04668,-4.0811 -233.85165,-20.7249 -33.62165,-6.208 -66.8162,-15.5954 -99.94804,-23.0754 z" />
                        <path id="sc_left_45_3" d="m 277.67176,756.43878 c -50.67782,27.68307 -97.21213,62.69947 -146.76881,92.45482 -37.643939,23.91321 -75.500642,47.71936 -112.760149,72.09267 -4.660037,82.18303 -1.837965,164.64333 -3.103515,246.93523 -0.211721,211.0992 -1.088358,422.7489 -0.125,633.5028 164.396684,-0.6418 329.066414,-0.4167 493.292904,-1.5924 84.29726,-225.6069 167.30759,-451.6912 251.05193,-677.4975 5.63879,-18.423 15.01652,-36.557 17.57999,-55.526 -54.288,-20.5497 -110.07096,-37.9408 -162.26129,-63.8881 C 495.12759,946.31404 386.33377,867.84601 295.29995,772.00848 c -5.90852,-4.8354 -10.9141,-12.13429 -17.62819,-15.5697 z" />
                        <path id="sc_left_corner_mid" d="m 158.58566,23.614286 c 0.0357,174.096604 -0.0711,348.210014 0.0534,522.296144 31.2174,63.85766 66.78788,126.46271 112.80385,180.88911 5.13112,3.91627 10.38912,15.62826 17.6913,7.85526 112.17828,-69.54072 223.31441,-140.81982 333.80292,-212.98803 12.9011,-5.65709 13.89154,-15.18257 4.60304,-25.89029 -25.05254,-47.9357 -48.16238,-97.54099 -56.82631,-151.39225 -9.08051,-38.61433 -2.95952,-78.87749 -5.08803,-118.24587 -0.70092,-67.6063 -0.0886,-135.766392 -1.62114,-203.02413 -135.06956,0.333872 -270.69462,-0.666171 -405.41903,0.500056 z" />
                        <path id="sc_left_45_mid" d="m 639.9549,523.77204 c -107.18018,65.89689 -212.18991,135.62266 -318.41902,203.1586 -8.85766,7.78088 -23.54118,12.64027 -28.56144,23.40552 32.40542,41.89782 72.9597,77.12034 113.51267,111.02695 102.04158,83.83494 221.69256,143.66459 346.21571,186.28059 9.68743,2.3313 26.21999,14.4758 33.1907,1.1627 C 827.21211,942.27776 865.89954,834.609 905.3486,727.33845 911.26102,717.2817 900.34468,711.84587 892.38271,709.30735 810.81298,677.44958 735.39701,628.45515 677.41387,562.31208 664.65134,550.35295 655.64597,531.819 639.9549,523.77204 Z" />
                        <path id="sc_left_corner_3" d="m 17.642745,23.580301 c -4.658107,83.074399 -1.771857,166.416329 -2.99764,249.595769 0.192763,205.6733 -1.522926,411.37458 1.249873,617.03008 1.626959,4.86099 -1.85017,15.185 3.422712,17.70099 83.45402,-51.55224 166.21829,-104.38921 248.11991,-158.37204 7.97661,-4.87289 -5.5813,-13.01579 -6.88426,-18.54092 C 216.58413,673.42909 179.18321,611.24525 147.1572,546.30855 146.82295,371.97983 147.82359,197.09822 146.65714,23.11423 103.71614,23.425579 60.277184,22.492952 17.642745,23.580301 Z" />
                        <g style="fill:#ffffff; pointer-events:none;">
                        <path d="m 617.65172,476.16055 c 3.85297,9.71608 9.99543,18.61219 14.85932,27.92827 2.84296,5.53676 -0.28952,11.86966 -5.23664,14.92301 -69.01282,44.41723 -137.67958,89.39426 -207.06924,133.23932 -20.58819,13.26544 -41.67445,26.0383 -62.00911,39.51884 0.55923,3.52321 -1.08376,8.87436 0.77276,11.35218 91.45475,-58.72483 182.43401,-118.21977 274.80186,-175.49819 2.75405,-1.21833 5.84633,-5.06307 8.90087,-2.26308 14.88113,10.78132 24.51275,26.97517 37.31528,39.94559 31.93251,35.18995 68.44181,66.21091 108.63559,91.58823 33.92816,21.7641 70.41525,39.21399 107.77057,54.21478 4.84842,2.18125 11.88204,5.87106 9.94052,12.32941 -26.91113,75.9364 -55.15992,151.39071 -83.18017,226.92442 -12.34593,32.28646 -23.84712,64.91827 -37.17708,96.81577 -1.38679,3.5915 -3.72645,7.4769 -8.09044,7.415 -9.59927,0.5874 -18.20198,-5.2847 -27.26616,-7.7621 C 626.94894,1004.1574 507.81586,944.56446 406.43898,861.1015 390.17929,847.77946 374.40686,833.69233 358.5244,820.05491 c -0.71839,4.18127 -0.0298,9.21684 0.20805,13.60819 62.48059,55.20436 130.99614,103.63653 204.46554,143.10849 42.79038,23.03605 86.81013,43.93791 132.56253,60.43601 26.15715,10.0002 52.8017,18.7617 78.80781,29.1123 3.64386,1.304 0.65859,5.8674 0.6112,8.4805 -6.35167,23.6173 -16.11254,46.2461 -24.20504,69.3316 -25.3083,68.7217 -50.91624,137.3373 -76.02827,206.1284 3.00732,1.276 7.82227,0.305 11.20499,-0.088 26.63885,-72.6317 53.81286,-145.0839 80.03847,-217.8589 7.70253,-20.782 15.71565,-41.8529 25.19534,-61.663 43.22785,10.0627 86.24089,21.2798 130.04793,28.677 78.67735,14.0679 158.90615,15.144 238.60585,15.0753 65.8655,-0.1614 131.2326,-10.4582 195.6447,-23.4753 15.0216,-2.7345 29.8071,-6.7044 44.7878,-9.5264 2.6253,-0.4427 5.8733,0.1984 6.2217,3.384 17.4716,44.5674 33.5421,89.6955 50.4119,134.5038 16.2368,43.7291 32.4145,87.4799 48.5521,131.2458 2.6381,-0.2446 11.1293,2.3203 10.1976,-1.7061 -31.481,-86.2758 -63.4737,-172.3701 -94.5532,-258.7897 -1.8439,-4.8732 -3.4725,-12.4017 2.0385,-15.6053 30.8564,-12.3642 62.5209,-22.8616 93.2731,-35.5905 37.5814,-14.9257 73.5471,-33.5563 109.2504,-52.44992 74.1408,-41.08153 143.0362,-91.65498 204.9493,-149.43271 -0.1041,-4.86894 0.3716,-9.87381 -0.086,-14.65976 -6.5372,4.93524 -12.4089,11.69515 -18.707,17.32035 -85.2427,82.20222 -188.6873,143.61644 -297.423,189.37954 -29.6802,12.1712 -59.607,24.1838 -90.4406,33.0259 -5.4986,1.8451 -13.6187,0.8305 -15.2188,-5.8167 -37.3576,-97.47793 -73.9797,-195.2616 -108.5166,-293.77532 -4.4423,-12.69637 -8.7865,-25.42687 -13.1283,-38.158 4.4805,-6.45891 12.9415,-8.01048 19.5539,-11.43003 38.7895,-15.02153 76.6433,-32.73803 111.8174,-55.04416 41.7055,-25.85251 78.92,-58.46774 112.1623,-94.43758 10.1485,-10.97052 19.7661,-22.70505 31.8994,-31.5503 2.5914,-1.47054 4.8468,2.37141 7.2976,3.03361 87.2569,54.42979 173.7307,110.13589 260.1404,165.9117 1.8898,-2.33776 0.1789,-7.62186 0.7714,-11.00261 -28.0467,-18.46377 -56.8547,-36.20573 -85.1535,-54.45613 -58.7034,-37.60541 -117.5539,-75.05932 -175.7008,-113.47578 -3.2503,-1.35589 0.401,-4.74712 0.8425,-6.82095 6.2705,-12.92014 14.392,-24.93126 20.6775,-37.78535 -1.1548,-2.47819 -5.2457,-0.68694 -7.402,-1.26953 -5.0067,-1.30477 -5.2902,5.41186 -7.8097,8.22719 -29.7762,51.23722 -71.722,94.19408 -115.975,133.07062 -5.2467,3.63979 -9.8343,10.34371 -16.8446,10.02692 -5.0632,-1.32326 -7.1333,-7.24684 -10.9277,-10.36451 -40.3031,-46.52731 -80.092,-93.50098 -119.5764,-140.72528 -3.5993,0.0735 -8.6983,-1.05865 -11.6154,0.42884 31.9469,37.82733 63.7911,75.76596 95.6421,113.6809 11.8374,14.89186 26.3772,27.95422 34.3412,45.56814 -8.0317,11.10255 -21.9235,15.08819 -32.8575,22.58001 -48.0335,31.03338 -102.9083,49.9237 -158.3354,62.87989 -37.236,8.57604 -75.1602,14.50623 -113.4483,14.83946 -33.9105,0.24672 -68.073,1.64385 -101.6709,-3.74373 -71.08226,-9.16065 -140.5622,-31.35066 -203.09456,-66.492 -15.10816,-8.21169 -29.4851,-17.66719 -44.60435,-25.85875 -4.53892,-2.81922 -9.27586,-6.41676 -11.68053,-11.28991 14.01008,-19.98034 30.06039,-38.50907 45.4191,-57.48088 26.49915,-31.81099 53.53752,-63.34647 80.15975,-94.9577 -3.60058,-0.81213 -8.07682,-0.34932 -11.89282,-0.21229 -29.97766,35.56194 -60.25318,70.87758 -90.29052,106.38389 -10.60618,12.60668 -20.28445,26.38058 -33.07905,36.85659 -3.08625,1.73453 -5.86719,-2.41051 -8.51306,-3.50204 -27.19098,-19.72137 -49.69768,-45.08273 -71.29397,-70.61579 -17.87999,-21.57859 -33.75806,-44.74445 -47.67684,-69.05472 -3.44495,-0.42788 -7.4536,-0.36442 -10.92193,-0.034 z m 305.01019,247.18637 c 34.24001,4.06183 67.33719,14.83222 101.66449,18.45663 40.0763,4.37093 80.5226,4.06241 120.7571,2.56102 32.659,-1.29611 65.0148,-6.39753 96.9434,-13.16339 11.2385,-1.82906 22.7851,-4.54019 34.1874,-3.11581 9.0418,23.3078 17.2962,47.10421 26.073,70.58394 32.1932,88.14637 65.2406,176.002 95.5355,264.81959 0.3332,2.114 3.0727,5.9532 -0.7016,6.2815 -26.0559,8.3942 -53.1976,12.7501 -79.9004,18.5662 -46.6357,9.1996 -94.1277,13.7179 -141.6103,15.5784 -42.2564,0.5987 -84.5461,1.2938 -126.7937,-0.012 -75.3325,-4.1352 -149.97638,-17.2162 -223.21247,-34.9765 -8.27137,-2.6167 -16.76522,-4.3762 -25.09906,-6.7552 -3.43473,-0.6494 -4.7651,-4.2483 -3.39533,-7.2521 9.88211,-31.1741 21.34523,-61.84024 32.2904,-92.65541 28.1055,-77.09498 56.94939,-154.04728 85.95151,-230.72971 1.65582,-3.03398 3.18221,-8.08715 7.31006,-8.18756 z M -517.95945,-43.650794 c 0,638.095234 0,1276.190494 0,1914.285694 67.47771,1.1648 135.85144,0.1664 203.67374,0.4992 1006.8783,0 2013.75671,0 3020.63491,0 1.1648,-67.4778 0.1664,-135.8516 0.4992,-203.6738 0,-570.3703 0,-1140.74073 0,-1711.111094 -67.4778,-1.164739 -135.8516,-0.166303 -203.6738,-0.499132 -1006.8783,0 -2013.75662,0 -3020.63492,0 z M 1278.1343,141.58606 c -0.7973,39.98213 0.056,80.3157 -1.7703,120.0787 -14.57,39.059 -40.5102,74.78821 -77.2719,95.46941 -28.121,16.99264 -60.2705,27.92708 -93.3997,26.89569 -30.6164,1.53136 -61.7862,-1.66599 -89.9422,-14.39916 -38.61252,-14.68097 -69.65334,-45.0483 -88.42506,-81.46105 -6.12579,-13.1247 -14.35976,-26.32398 -16.14338,-40.65276 0.86175,-74.05913 0.40356,-148.155271 2.70092,-222.185169 121.77562,-2.106504 243.59082,-1.340142 365.38322,-1.965526 -0.3772,39.406622 -0.7545,78.813245 -1.1316,118.219865 z M 739.43762,23.90563 c 54.1584,0.134341 108.31681,0.268684 162.47521,0.403026 4.95696,77.295444 2.09876,154.894674 6.52592,232.201754 3.58017,34.83132 28.65398,62.39421 51.67592,86.72015 3.46738,7.05711 20.68023,13.57639 13.882,21.03519 -30.13426,36.89842 -61.87626,72.63369 -91.35157,109.9685 2.16434,3.94242 9.44628,0.18005 11.56684,-2.75917 30.86957,-32.62881 55.38877,-71.47224 90.46996,-99.9411 10.3108,-4.56079 21.4003,3.70665 31.4268,6.06332 18.1163,7.69808 37.0705,14.84345 57.1427,13.27881 29.6343,-1.31262 60.9803,4.64772 88.9978,-7.96219 14.1122,-4.37792 27.8394,-12.17486 42.6832,-13.19046 12.0605,5.22121 18.5113,18.46695 28,27.02213 23.2862,25.09071 44.2771,52.30593 68.1651,76.79422 1.3814,3.30808 11.6395,3.2397 7.4808,-1.29279 -30.7502,-37.5285 -62.2962,-74.40062 -93.4834,-111.56683 26.9927,-29.03622 59.5286,-58.80086 66.093,-99.91009 7.964,-78.83702 2.6707,-158.24233 7.084,-237.255095 115.3843,0 230.7684,0 346.1527,0 -1.134,97.448535 -0.091,194.943015 -2.9333,292.360095 -2.1486,44.11757 -17.7437,86.39403 -34.3869,126.86423 -4.335,11.10551 -11.1015,22.22251 -14.2174,33.15662 11.0513,3.17291 13.8668,-10.01863 17.947,-16.99528 16.9606,-36.68743 31.2703,-75.34732 36.552,-115.58634 6.1738,-87.66316 3.517,-175.65649 4.5627,-263.46872 0.6692,-18.756623 -0.8103,-37.710604 1.7486,-56.330605 129.0095,0 258.0192,0 387.0287,0 0.9781,173.235565 2.315,346.471505 2.1081,519.711055 -33.2584,66.96065 -69.6157,133.37429 -118.5917,190.27159 -7.7,8.34049 -17.4537,-3.27024 -24.5732,-6.44295 -19.3078,-11.53392 -37.9597,-24.68826 -57.3744,-35.75076 -4.3361,6.20112 3.6447,12.41179 8.4884,15.28708 19.2147,14.11995 41.053,25.0336 58.6401,41.17374 -1.6687,10.02653 -12.355,16.06097 -18.1703,23.75673 -15.9827,17.46113 -34.643,32.69414 -48.8993,51.61529 -1.9989,4.14174 -1.2205,16.42346 3.8917,8.20651 24.6251,-23.63364 46.8373,-50.04416 73.4706,-71.46605 8.6402,-6.20164 16.9627,4.85824 24.6465,7.78149 81.2394,49.67773 160.8129,102.0273 241.3288,152.87389 0,292.59568 0,585.19138 0,877.78708 -90.425,3.29 -180.9535,1.5586 -271.4223,2.0924 -70.4134,-0.4335 -140.8819,0.5487 -211.2598,-1.5181 -11.3273,2.5317 -13.6705,-7.0745 -16.704,-15.7497 -52.8157,-139.0957 -103.076,-279.1574 -155.5231,-418.385 -1.918,-5.1126 -6.0594,-17.5153 -13.1618,-12.2853 17.5705,51.7785 37.643,103.0093 56.2421,154.5483 32.1695,88.2526 65.6939,176.0429 96.8135,264.6575 2.4314,8.854 5.8552,17.6589 6.3938,26.86 -218.2456,1.737 -436.5137,0.8327 -654.7681,0.9365 -163.23938,-0.4061 -326.49563,0.1096 -489.72285,-1.6247 5.29342,-24.2718 15.94428,-47.3314 23.66173,-70.9835 45.14825,-125.3029 92.80849,-249.8075 138.33293,-374.9119 -6.10312,-3.7751 -10.73306,2.9466 -12.09771,8.3232 -36.69408,94.3931 -70.57586,189.8771 -106.25246,284.666 -19.23168,51.7879 -38.48957,103.5662 -57.73489,155.349 -164.62298,-0.1295 -329.24208,1.2343 -493.86162,2.1083 0.797238,-290.7836 0.307619,-581.576 2.52046,-872.35248 -1.99946,-10.30911 7.110127,-13.85124 14.442572,-18.39079 71.363648,-45.3383 142.612348,-90.87133 213.712338,-136.59754 10.78193,-6.11864 21.03782,-13.96454 32.69579,-18.16084 22.73127,18.4043 41.93981,41.1367 64.0067,60.47557 4.79841,2.63194 8.7949,11.30236 14.71354,10.57478 2.9869,-9.08605 -8.539,-15.00457 -12.9045,-21.3898 -17.15334,-18.13716 -35.81974,-35.37616 -50.34265,-55.67184 2.48165,-9.40866 13.97588,-13.27374 20.77062,-19.25178 13.86603,-10.41458 30.62508,-17.57606 42.64703,-30.17468 2.6444,-4.0794 -1.01217,-10.6184 -5.37263,-5.08433 -22.98946,13.16982 -44.47903,29.66611 -68.65079,40.38628 -13.57069,-8.24403 -21.86992,-23.34938 -32.02505,-35.28336 -36.75029,-48.31862 -65.62948,-101.91924 -93.19818,-155.83457 0,-174.0441 0,-348.08821 0,-522.132315 135.64713,0 271.29424,0 406.94135,0 0.74605,101.699485 1.27799,203.481215 2.91683,305.123265 8.78,50.31394 25.3003,99.2981 49.42073,144.3156 2.26609,4.73754 14.53624,4.38172 8.23898,-2.06441 -27.827,-53.60916 -46.12816,-112.65181 -47.88433,-173.26732 -3.73754,-80.25271 -2.96443,-160.66636 -2.25456,-240.983597 0.0886,-11.074556 1.02631,-22.109381 1.93835,-33.139038 54.15943,0.135374 108.31886,0.270749 162.47829,0.406125 z M 82.61098,23.515005 c 21.50299,0 43.00596,0 64.50894,0 0.0372,174.159705 -0.0744,348.337025 0.0558,522.485745 33.75724,67.1765 73.2411,131.4266 118.56089,191.42174 3.11902,4.05061 7.31043,10.96235 0.002,13.19284 -80.79617,54.10584 -162.8995,106.34007 -245.894245,157.00496 -5.774968,0.63576 -2.173968,-9.02605 -3.345111,-11.92956 C 15.129111,616.32127 15.354159,336.94162 16.390143,57.570973 17.064048,46.246825 15.283302,34.628437 18.009048,23.515005 c 21.533984,0 43.067968,0 64.601932,0 z m 2093.08032,0 c -0.2453,279.595295 -1.5757,559.193725 -4.0737,838.777285 -1.2208,12.97557 0.9127,27.03106 -2.7652,39.40973 -19.5746,-8.13843 -36.7207,-21.96234 -55.2207,-32.44561 -61.8301,-39.07679 -123.7622,-78.11712 -183.9722,-119.64703 -3.966,-2.34073 -8.5043,-6.95882 -2.7166,-10.74386 41.0925,-60.39063 81.352,-121.568 114.8292,-186.58068 1.5889,-175.32235 1.6493,-350.66814 5.1246,-525.967256 14.6668,-4.293844 30.6428,-1.492798 45.7806,-2.699243 27.6706,-0.199643 55.3429,-0.06282 83.014,-0.103336 z" />
                    </g>
                    </svg>`;
}


function openShotChartModal(gameId) {
    const sc = data.shotChartByGame[String(gameId)];
    if (!sc) {
        console.error('No shot chart data for game', gameId, '— check that shot_charts.json loaded correctly.');
        alert('אין נתוני מפת זריקות למשחק זה. ודא שהקובץ shot_charts.json נמצא בתיקייה.');
        return;
    }

    const boxScorePlayerIds = new Set(
        data.playersStats
            .filter(s => String(s.game_id) === String(gameId))
            .map(s => String(s.player_id))
    );

    scActivePlayers = new Set(
        Object.entries(sc.player_mapping)
            .filter(([char, playerId]) => boxScorePlayerIds.has(String(playerId)))
            .map(([char]) => char)
    );

    const modal   = document.getElementById('shot-chart-modal');
    const content = document.getElementById('shot-chart-content');

    const game = data.games.find(g => String(g.game_id) === String(gameId));
    const gameTitle = game ? `${game.opponent}  ${game.T_score}–${game.O_score}  (${game.date})` : '';

    // Only show players who appear in the box score for this game
    const playerBtns = Object.entries(sc.player_mapping)
        .filter(([char, playerId]) => boxScorePlayerIds.has(String(playerId)))
        .map(([char, playerId]) => {
            const name = data.players[playerId]?.Name || `#${playerId}`;
            return `<button id="sc-btn-${char}" class="sc-player-btn sc-btn-on"
                        onclick="scTogglePlayer('${char}', data.shotChartByGame['${gameId}'])">${name}</button>`;
        }).join('');

    content.innerHTML = `
        <div class="sc-modal-inner">
            <div class="sc-body">
                <div class="sc-court-area">
                    ${buildCourtSVG('sc-half-court')}
                    <div class="sc-badges" id="sc-badges"></div>
                </div>
                <div class="sc-player-panel">
                    <button id="sc-btn-all" class="sc-player-btn sc-all-btn sc-btn-on"
                            onclick="scToggleAll(data.shotChartByGame['${gameId}'])">כולם</button>
                    ${playerBtns}
                </div>
            </div>
        </div>`;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Inject share button next to close button
    requestAnimationFrame(() => {
        const closeBtn = modal.querySelector('.sc-modal-close');
        if (closeBtn && !modal.querySelector('.sc-share-btn')) {
            const shareBtn = document.createElement('button');
            shareBtn.className = 'sc-share-btn share-btn';
            shareBtn.textContent = '📷';
            shareBtn.title = 'שתף מפת זריקות';
            shareBtn.onclick = function() {
                shareShotChart('sc-half-court', 'sc-badges', `shotchart_game_${gameId}.png`, this);
            };
            closeBtn.insertAdjacentElement('afterend', shareBtn);
        }
    });

    requestAnimationFrame(() => {
        scUpdateCourt(sc);
        const panel = modal.querySelector('.sc-player-panel');
        if (panel) {
            // Portrait: horizontal scroll — bring כולם into view on the right
            // Landscape: vertical scroll — ensure we start at the top
            if (window.innerWidth > window.innerHeight) {
                panel.scrollTop = 0;
            } else {
                panel.scrollLeft = panel.scrollWidth;
            }
        }
    });
}

function closeShotChartModal() {
    const modal = document.getElementById('shot-chart-modal');
    modal.classList.remove('open');
    document.body.style.overflow = '';

    // Also close on backdrop click
    modal.onclick = null;
}

/* =====================================================
   Share / Screenshot helpers
   ===================================================== */
function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
        if (window.html2canvas) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload  = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

/* -------------------------------------------------------
   Shot-chart share: read live SVG state → draw to canvas
   ------------------------------------------------------- */
async function shareShotChart(svgId, badgesId, filename, activeBtn) {
    if (activeBtn) { activeBtn.textContent = '...'; activeBtn.disabled = true; }

    try {
        const svg    = document.getElementById(svgId);
        const badges = document.getElementById(badgesId);
        if (!svg || !badges) throw new Error('elements not found');

        // -- 1. Serialise the live SVG with inlined styles so CSS classes render in the blob
        const svgClone = svg.cloneNode(true);
        svgClone.style.transform = 'none';
        svgClone.style.transformOrigin = '';

        // Inline .sc-label styles so they survive serialisation (CSS classes don't travel with blobs)
        // Also strip the rotate(90) transform that's for screen display — we rotate the whole canvas instead
        svgClone.querySelectorAll('.sc-label').forEach(el => {
            el.setAttribute('font-size', '90');
            el.setAttribute('font-weight', '900');
            el.setAttribute('fill', 'white');
            el.setAttribute('stroke', 'black');
            el.setAttribute('stroke-width', '12');
            el.setAttribute('stroke-linejoin', 'round');
            el.setAttribute('paint-order', 'stroke fill');
            el.style.fontFamily = 'Arial, sans-serif';
            // Keep rotate(90) — canvas is rotated -90° so net result is labels read correctly rotated 90° to the right
        });

        // The SVG natural coords are 2189 wide × 1827 tall (baseline on the RIGHT in SVG space)
        // We want baseline on the LEFT → rotate 90° clockwise when drawing on canvas
        // After 90° CW rotation: drawn width = SVG_H, drawn height = SVG_W
        const SVG_W = 2189, SVG_H = 1827;
        svgClone.setAttribute('width',   SVG_W);
        svgClone.setAttribute('height',  SVG_H);
        svgClone.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);

        const serialised = new XMLSerializer().serializeToString(svgClone);
        const svgBlob    = new Blob([serialised], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl     = URL.createObjectURL(svgBlob);

        // -- 2. Collect badge data from live DOM
        const badgeData = [];
        badges.querySelectorAll('.sc-badge, .sc-badge-sm').forEach(b => {
            badgeData.push({
                label: b.querySelector('.sc-badge-label')?.textContent?.trim() || '',
                stats: b.querySelector('.sc-badge-stats')?.textContent?.trim() || '',
                pct:   b.querySelector('.sc-badge-pct')?.textContent?.trim()   || '',
            });
        });

        // -- 3. Canvas layout
        // After 90° CW rotation the court occupies: width=SVG_H*SCALE, height=SVG_W*SCALE
        const SCALE     = 0.35;
        const courtW    = Math.round(SVG_H * SCALE);   // rotated: H becomes width
        const courtH    = Math.round(SVG_W * SCALE);   // rotated: W becomes height
        const PAD       = 20;
        const BADGE_W   = 170;
        const BADGE_H   = 76;
        const BADGE_GAP = 14;
        const totalBadgeH = badgeData.length * (BADGE_H + BADGE_GAP) - BADGE_GAP;
        const canvasW   = courtW + BADGE_W + PAD * 3;
        const canvasH   = Math.max(courtH, totalBadgeH) + PAD * 2;

        const canvas  = document.createElement('canvas');
        canvas.width  = canvasW * 2;
        canvas.height = canvasH * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);

        // Background
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // -- 4. Draw SVG rotated 90° clockwise onto canvas
        // 90° CW: translate to (courtW, 0), rotate π/2, draw at origin
        await new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => {
                ctx.save();
                // Rotate -90° (CCW): translate to (0, courtH), rotate -π/2
                // This puts the SVG's right edge (baseline) on the left of the canvas
                ctx.translate(PAD, PAD + courtH);
                ctx.rotate(-Math.PI / 2);
                ctx.drawImage(img, 0, 0, SVG_W * SCALE, SVG_H * SCALE);
                ctx.restore();
                URL.revokeObjectURL(svgUrl);
                res();
            };
            img.onerror = rej;
            img.src = svgUrl;
        });

        // -- 5. Draw badge panel to the right of the court
        const panelX = PAD + courtW + PAD;
        const startY = PAD + Math.max(0, (canvasH - PAD * 2 - totalBadgeH) / 2);

        badgeData.forEach((b, i) => {
            const bx = panelX;
            const by = startY + i * (BADGE_H + BADGE_GAP);

            // Badge background
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.roundRect(bx, by, BADGE_W, BADGE_H, 8);
            ctx.fill();

            // Label (small caps style)
            ctx.fillStyle = '#94a3b8';
            ctx.font = `700 11px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.letterSpacing = '1px';
            ctx.fillText(b.label, bx + BADGE_W / 2, by + 20);

            // Stats (large)
            ctx.fillStyle = '#ffffff';
            ctx.font = `800 24px Arial, sans-serif`;
            ctx.fillText(b.stats, bx + BADGE_W / 2, by + 46);

            // Pct
            ctx.fillStyle = '#cbd5e1';
            ctx.font = `700 15px Arial, sans-serif`;
            ctx.letterSpacing = '0px';
            ctx.fillText(b.pct, bx + BADGE_W / 2, by + 66);
        });

        // -- 6. Share / download
        canvas.toBlob(async blob => {
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: filename });
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = filename;
                a.click();
                URL.revokeObjectURL(a.href);
            }
            if (activeBtn) { activeBtn.textContent = '📷 שתף'; activeBtn.disabled = false; }
        }, 'image/png');

    } catch(e) {
        console.error('shareShotChart failed', e);
        if (activeBtn) { activeBtn.textContent = '📷 שתף'; activeBtn.disabled = false; }
    }
}

async function shareElement(el, filename, activeBtn) {
    if (activeBtn) { activeBtn.textContent = '...'; activeBtn.disabled = true; }

    try {
        await loadHtml2Canvas();

        // Measure full content size before cloning
        const fullW = el.scrollWidth;
        const fullH = el.scrollHeight;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed;
            top: -99999px;
            left: -99999px;
            width: ${fullW}px;
            background: #ffffff;
            padding: 16px;
            z-index: -1;
            direction: rtl;
            box-sizing: content-box;
        `;
        const clone = el.cloneNode(true);
        clone.style.overflow  = 'visible';
        clone.style.overflowX = 'visible';
        clone.style.overflowY = 'visible';
        clone.style.maxHeight = 'none';
        clone.style.maxWidth  = 'none';
        clone.style.height    = 'auto';
        clone.style.width     = fullW + 'px';

        // Fix all inner scrollable elements (e.g. table-wrapper overflow-x:auto)
        clone.querySelectorAll('*').forEach(node => {
            const cs = window.getComputedStyle(node);
            if (cs.overflow === 'auto' || cs.overflow === 'scroll' ||
                cs.overflowX === 'auto' || cs.overflowX === 'scroll' ||
                cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
                node.style.overflow  = 'visible';
                node.style.overflowX = 'visible';
                node.style.overflowY = 'visible';
                // Expand to full scroll size
                if (node.scrollWidth > node.clientWidth)  node.style.width  = node.scrollWidth  + 'px';
                if (node.scrollHeight > node.clientHeight) node.style.height = node.scrollHeight + 'px';
            }
        });

        // Counter-rotate any court SVGs so they appear upright in the image
        clone.querySelectorAll('.sc-court-svg').forEach(svg => {
            svg.style.transform       = 'none';
            svg.style.transformOrigin = '';
        });

        wrapper.appendChild(clone);
        document.body.appendChild(wrapper);

        // Let the browser lay out the clone before measuring
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const canvas = await html2canvas(wrapper, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            logging: false,
            width:  wrapper.scrollWidth,
            height: wrapper.scrollHeight,
            windowWidth:  wrapper.scrollWidth,
            windowHeight: wrapper.scrollHeight,
        });

        document.body.removeChild(wrapper);

        canvas.toBlob(async blob => {
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: filename });
            } else {
                const a = document.createElement('a');
                a.href  = URL.createObjectURL(blob);
                a.download = filename;
                a.click();
                URL.revokeObjectURL(a.href);
            }
            if (activeBtn) { activeBtn.textContent = '📷 שתף'; activeBtn.disabled = false; }
        }, 'image/png');
    } catch(e) {
        console.error('share failed', e);
        if (activeBtn) { activeBtn.textContent = '📷 שתף'; activeBtn.disabled = false; }
    }
}

function shareBoxScore(gameId, btn) {
    const card = document.querySelector(`.game-card[data-card-id="${gameId}"]`);
    if (!card) return;
    const target = card.querySelector('.share-target');
    if (!target) return;
    const game = data.games.find(g => String(g.game_id) === String(gameId));
    const name = game ? `${game.opponent}_${game.date}` : `game_${gameId}`;
    shareElement(target, `boxscore_${name}.png`, btn);
}

function shareRotation(btn) {
    const content = document.getElementById('rotation-content');
    if (!content) return;
    shareElement(content, `rotation.png`, btn);
}