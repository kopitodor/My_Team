let data = { games: [], players: {}, playersStats: [], teamStats: [] };
let activeGameIds = new Set(); 
let currentSeason = null;
let isAdvancedMode = false;
let sortConfig = { key: null, direction: 'desc', tableId: null };
let openBoxScores = new Set(); 

const ALWAYS_HIDDEN = [
    'game_id', 'player_id', 'tech_Fouls', 'reg_FD', 'OFD', 'And1', 
    'team scored with', 'opp scored with', 'poss', 'ended poss', 
    'opt_DRB', 'opt_ORB', '%DRB', '%ORB', 'ORB%', 'DRB%', 'ORtg', 'DRtg'
];

document.addEventListener('DOMContentLoaded', () => {
    const goTo = (id) => {
        ['games', 'players', 'teams'].forEach(k => {
            document.getElementById('sec-' + k).style.display = 'none';
            document.getElementById('nav-' + k).classList.remove('active');
        });
        document.getElementById('sec-' + id).style.display = 'block';
        document.getElementById('nav-' + id).classList.add('active');
        renderAll();
    };
    document.getElementById('nav-games').onclick = () => goTo('games');
    document.getElementById('nav-players').onclick = () => goTo('players');
    document.getElementById('nav-teams').onclick = () => goTo('teams');
    loadData();
});

function toggleSidebar() { document.body.classList.toggle('sidebar-closed'); }

async function loadData() {
    try {
        const [gs, pls, ps, ts] = await Promise.all([
            fetch('games.json').then(r => r.json()),
            fetch('players.json').then(r => r.json()),
            fetch('players_stats.json').then(r => r.json()),
            fetch('teams_stats.json').then(r => r.json())
        ]);
        
        const pMap = {}; 
        pls.forEach(p => pMap[p.player_id] = p);
        
        data = { games: gs, players: pMap, playersStats: ps, teamStats: ts };
        
        const seasons = getSortedSeasons();
        if (seasons.length > 0) {
            // בחירת העונה הכרונולוגית האחרונה כברירת מחדל
            currentSeason = seasons[seasons.length - 1];
        }
        
        updateActiveGamesBySeason();
        renderSeasonFilters();
        renderAll();
    } catch (e) { console.error("Load Error", e); }
}

// פונקציית עזר להמרת dd/mm/yyyy לערך מספרי להשוואה
function getTimestamp(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 0;
    return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
}

/**
 * המיון המבוקש:
 * 1. מוצאים לכל עונה את המשחק המוקדם ביותר שלה.
 * 2. מסדרים את העונות מהמוקדמת ביותר למאוחרת ביותר.
 */
function getSortedSeasons() {
    const minDates = {};
    
    data.games.forEach(g => {
        const ts = getTimestamp(g.date);
        if (!minDates[g.season] || ts < minDates[g.season]) {
            minDates[g.season] = ts;
        }
    });

    return Object.keys(minDates).sort((a, b) => minDates[a] - minDates[b]);
}

function renderSeasonFilters() {
    const container = document.getElementById('season-checkboxes');
    const seasons = getSortedSeasons();
    container.innerHTML = seasons.map(s => `
        <div class="season-pill ${String(s) === String(currentSeason) ? 'active' : ''}" onclick="selectSeason('${s}')">${s}</div>
    `).join('');
}

function selectSeason(s) { 
    currentSeason = s; 
    openBoxScores.clear(); 
    updateActiveGamesBySeason(); 
    renderSeasonFilters(); 
    renderAll(); 
}

function updateActiveGamesBySeason() {
    activeGameIds.clear();
    data.games.forEach(g => { 
        if (String(g.season) === String(currentSeason)) activeGameIds.add(String(g.game_id)); 
    });
}

function handleGameToggle(id, chk, e) {
    e.stopPropagation();
    chk ? activeGameIds.add(String(id)) : activeGameIds.delete(String(id));
    document.querySelector(`[data-card-id="${id}"]`).style.opacity = chk ? "1" : "0.5";
    populatePlayers(); populateTeams();
}

function toggleAdvancedMode() {
    isAdvancedMode = !isAdvancedMode;
    document.querySelectorAll('.adv-toggle-btn').forEach(b => b.classList.toggle('active', isAdvancedMode));
    renderAll();
}

function toggleBoxScore(id) {
    if (openBoxScores.has(String(id))) openBoxScores.delete(String(id));
    else openBoxScores.add(String(id));
    renderAll();
}

function setSort(key, tableId, e) {
    if (e) e.stopPropagation(); 
    if (sortConfig.key === key && sortConfig.tableId === tableId) {
        sortConfig.direction = sortConfig.direction === 'desc' ? 'asc' : 'desc';
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'desc';
        sortConfig.tableId = tableId;
    }
    renderAll();
}

function calculateAdvanced(row, isSum = false) {
    const s = {};
    const fga = (Number(row['2PA'])||0) + (Number(row['3PA'])||0);
    const fgm = (Number(row['2PM'])||0) + (Number(row['3PM'])||0);
    const pts = Number(row['PTS'])||0;
    const fta = Number(row['FTA'])||0;
    const ast = Number(row['AST'])||0;
    const tov = Number(row['TOV'])||0;

    s['MIN'] = isSum ? (row['MIN'] / row.gp) : Number(row['MIN']);
    if (fga > 0) s['eFG%'] = (((fgm + (Number(row['3PM'])||0)*0.5)/fga)*100).toFixed(1) + "%";
    const tsDiv = 2 * (fga + 0.44 * fta);
    if (tsDiv > 0) s['TS%'] = ((pts / tsDiv) * 100).toFixed(1) + "%";
    s['AST/TO'] = tov > 0 ? (ast / tov).toFixed(2) : (ast > 0 ? ast.toFixed(2) : "0.00");
    
    s['ORB%'] = isSum ? (Number(row['ORB%'])/row.gp).toFixed(1) + "%" : (Number(row['ORB%'])||0).toFixed(1) + "%";
    s['DRB%'] = isSum ? (Number(row['DRB%'])/row.gp).toFixed(1) + "%" : (Number(row['DRB%'])||0).toFixed(1) + "%";

    return s;
}

function getSortValue(row, key, type) {
    if (key === 'NAME') {
        if (type === 'team') return row.name;
        return data.players[row.player_id || row.id]?.Name || "";
    }
    let val;
    if (isAdvancedMode && type !== 'team') {
        const adv = calculateAdvanced(row.total || row, !!row.total);
        val = key === 'starter' ? (row.total ? row.total.starter : row.starter) : adv[key];
    } else {
        val = (row.total ? row.total[key] : row[key]);
        if (row.total && !['gp', 'starter'].includes(key)) val = val / row.total.gp;
    }
    if (typeof val === 'string' && val.includes('%')) return parseFloat(val);
    return Number(val) || 0;
}

function smartRound(v) {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'string' && v.includes('%')) return v;
    let n = Number(v);
    if (isNaN(n)) return v;
    return Number.isInteger(n) ? n : Math.round(n * 10) / 10;
}

function renderAll() { populateGames(); populatePlayers(); populateTeams(); }

function populateGames() {
    const container = document.getElementById('games-container');
    const filtered = data.games.filter(g => String(g.season) === String(currentSeason));
    
    // מיון המשחקים בתוך העונה כרונולוגית (ישן לחדש)
    filtered.sort((a,b) => getTimestamp(a.date) - getTimestamp(b.date));

    const countEl = document.getElementById('game-count');
    if (countEl) countEl.innerText = `${filtered.length} משחקים`;
    
    container.innerHTML = filtered.map(g => {
        const isActive = activeGameIds.has(String(g.game_id));
        const isBoxOpen = openBoxScores.has(String(g.game_id));
        let pStats = data.playersStats.filter(s => String(s.game_id) === String(g.game_id));
        const tRows = data.teamStats.filter(t => String(t.game_id) === String(g.game_id));
        const myT = tRows.find(t => t["team name"] !== g.opponent);

        if (sortConfig.tableId === String(g.game_id)) {
            pStats.sort((a, b) => {
                const vA = getSortValue(a, sortConfig.key, 'player');
                const vB = getSortValue(b, sortConfig.key, 'player');
                return sortConfig.direction === 'desc' ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
            });
        }

        const cols = isAdvancedMode ? Object.keys(calculateAdvanced(pStats[0]||{})) : 
                     Object.keys(pStats[0]||{}).filter(k => !ALWAYS_HIDDEN.includes(k) && k !== 'starter');

        return `
            <div class="game-card" data-card-id="${g.game_id}" style="opacity: ${isActive ? 1 : 0.5}">
                <div class="game-card-top-wrapper ${isBoxOpen ? 'has-open-box' : ''}">
                    <div class="game-header" onclick="toggleBoxScore('${g.game_id}')">
                        <div class="game-info">
                            <div class="team-row ${Number(g.O_score) > Number(g.T_score) ? 'winner' : ''}"><span>${g.opponent}</span><span class="score">${g.O_score}</span></div>
                            <div class="team-row ${Number(g.T_score) > Number(g.O_score) ? 'winner' : ''}"><span>${myT ? myT["team name"] : 'הקבוצה שלי'}</span><span class="score">${g.T_score}</span></div>
                        </div>
                        <div style="font-size:0.85rem; color:#64748b">${g.date}</div>
                    </div>
                    <label class="simple-switch"><input type="checkbox" ${isActive ? 'checked' : ''} onchange="handleGameToggle('${g.game_id}', this.checked, event)"><span class="slider"></span></label>
                </div>
                <div id="box-${g.game_id}" class="box-score-container ${isBoxOpen ? 'active' : ''}">
                    <div class="table-wrapper">
                        <table class="box-table">
                            <thead><tr><th class="player-name-cell" onclick="setSort('NAME', '${g.game_id}', event)">שחקן</th>${cols.map(c => `<th onclick="setSort('${c}', '${g.game_id}', event)">${c}</th>`).join('')}</tr></thead>
                            <tbody>${pStats.map(s => {
                                const pName = data.players[s.player_id]?.Name || '???';
                                const displayName = Number(s.starter) === 1 ? pName + '*' : pName;
                                return `<tr><td class="player-name-cell">${displayName}</td>${cols.map(c => `<td>${smartRound(isAdvancedMode ? calculateAdvanced(s)[c] : s[c])}</td>`).join('')}</tr>`;
                            }).join('')}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function populatePlayers() {
    const container = document.getElementById('players-container');
    const filteredStats = data.playersStats.filter(s => activeGameIds.has(String(s.game_id)));
    if (!filteredStats.length) { container.innerHTML = "<p style='padding:20px'>אין נתונים</p>"; return; }
    
    const pids = [...new Set(filteredStats.map(s => s.player_id))];
    let summaries = pids.map(pid => {
        const ps = filteredStats.filter(s => s.player_id === pid);
        const total = { gp: ps.length, player_id: pid, starter: 0 };
        
        ps.forEach(row => {
            Object.keys(row).forEach(k => {
                if (!isNaN(row[k])) {
                    if (total[k] === undefined) total[k] = 0;
                    total[k] += Number(row[k]);
                }
            });
        });
        return { id: pid, total };
    });

    if (sortConfig.tableId === 'players') {
        summaries.sort((a, b) => {
            const vA = getSortValue(a, sortConfig.key, 'player');
            const vB = getSortValue(b, sortConfig.key, 'player');
            return sortConfig.direction === 'desc' ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
        });
    }

    let cols;
    if (isAdvancedMode) {
        cols = ['starter', ...Object.keys(calculateAdvanced(summaries[0].total, true))];
    } else {
        cols = Object.keys(summaries[0].total).filter(k => !ALWAYS_HIDDEN.includes(k) && !['gp','player_id','starter'].includes(k));
    }

    container.innerHTML = `<table class="box-table">
        <thead><tr><th class="player-name-cell" onclick="setSort('NAME', 'players', event)">שחקן</th>${cols.map(c => `<th onclick="setSort('${c}', 'players', event)">${c}</th>`).join('')}<th onclick="setSort('gp', 'players', event)">GP</th></tr></thead>
        <tbody>${summaries.map(p => `<tr>
            <td class="player-name-cell">${data.players[p.id]?.Name}</td>
            ${cols.map(c => {
                if (c === 'starter') return `<td>${p.total.starter}</td>`;
                const val = isAdvancedMode ? calculateAdvanced(p.total, true)[c] : p.total[c]/p.total.gp;
                return `<td>${smartRound(val)}</td>`;
            }).join('')}
            <td>${p.total.gp}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

function populateTeams() {
    const container = document.getElementById('teams-container');
    const filteredTeams = data.teamStats.filter(t => activeGameIds.has(String(t.game_id)));
    if (!filteredTeams.length) return;
    
    const names = [...new Set(filteredTeams.map(t => t["team name"]))];
    let summaries = names.map(n => {
        const rows = filteredTeams.filter(t => t["team name"] === n);
        const total = { gp: rows.length };
        rows.forEach(row => {
            Object.keys(row).forEach(k => {
                if (!isNaN(row[k])) {
                    if (total[k] === undefined) total[k] = 0;
                    total[k] += Number(row[k]);
                }
            });
        });
        return { name: n, total };
    });

    if (sortConfig.tableId === 'teams') {
        summaries.sort((a, b) => {
            const vA = getSortValue(a, sortConfig.key, 'team');
            const vB = getSortValue(b, sortConfig.key, 'team');
            return sortConfig.direction === 'desc' ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
        });
    }

    const cols = Object.keys(filteredTeams[0]).filter(k => !ALWAYS_HIDDEN.includes(k) && !['team name','game_id','season','date'].includes(k));
    container.innerHTML = `<table class="box-table">
        <thead><tr><th class="player-name-cell" onclick="setSort('NAME', 'teams', event)">קבוצה</th>${cols.map(c => `<th onclick="setSort('${c}', 'teams', event)">${c}</th>`).join('')}<th onclick="setSort('gp', 'teams', event)">GP</th></tr></thead>
        <tbody>${summaries.map(s => `<tr><td class="player-name-cell">${s.name}</td>${cols.map(c => `<td>${smartRound(s.total[c]/s.total.gp)}</td>`).join('')}<td>${s.total.gp}</td></tr>`).join('')}</tbody>
    </table>`;
}