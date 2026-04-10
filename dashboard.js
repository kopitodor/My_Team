let data = { games: [], players: {}, playersStats: [], teamStats: [] };
let activeGameIds = new Set(); 
let currentSeason = null;
let isAdvancedMode = false;
let sortConfig = { key: null, direction: 'desc', tableId: null };

const ALWAYS_HIDDEN = ['game_id', 'player_id', 'tech_Fouls', 'reg_FD', 'OFD', 'And1', 'team scored with', 'opp scored with', 'poss', 'ended poss', 'opt_DRB', 'opt_ORB', '%DRB', '%ORB', 'ORB%', 'DRB%'];

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

async function loadData() {
    try {
        const [gs, pls, ps, ts] = await Promise.all([
            fetch('games.json').then(r => r.json()),
            fetch('players.json').then(r => r.json()),
            fetch('players_stats.json').then(r => r.json()),
            fetch('teams_stats.json').then(r => r.json())
        ]);
        const pMap = {}; pls.forEach(p => pMap[p.player_id] = p);
        gs.sort((a,b) => new Date(a.date.split('.').reverse().join('-')) - new Date(b.date.split('.').reverse().join('-')));
        data = { games: gs, players: pMap, playersStats: ps, teamStats: ts };
        if (gs.length > 0) currentSeason = String(gs[gs.length - 1].season);
        updateActiveGamesBySeason();
        renderSeasonFilters();
        renderAll();
    } catch (e) { console.error(e); }
}

function toggleAdvancedMode() {
    isAdvancedMode = !isAdvancedMode;
    document.querySelectorAll('.adv-btn').forEach(b => b.classList.toggle('active', isAdvancedMode));
    renderAll();
}

function sortTable(key, tableId) {
    if (sortConfig.key === key && sortConfig.tableId === tableId) {
        sortConfig.direction = sortConfig.direction === 'desc' ? 'asc' : 'desc';
    } else {
        sortConfig.key = key; sortConfig.direction = 'desc'; sortConfig.tableId = tableId;
    }
    renderAll();
}

function calculateAdvanced(row, isSummary = false) {
    const s = {};
    if (isSummary && row.starterSum !== undefined) s['STRT'] = row.starterSum;

    const fga = (Number(row['2PA'])||0) + (Number(row['3PA'])||0);
    const fgm = (Number(row['2PM'])||0) + (Number(row['3PM'])||0);
    const pts = Number(row['PTS'])||0;
    const fta = Number(row['FTA'])||0;
    const ast = Number(row['AST'])||0;
    const tov = Number(row['TOV'])||0;
    const poss = Number(row['poss'])||0;

    let rawMin = isSummary ? (row['MIN'] / (row.gp || 1)) : Number(row['MIN']);
    s['MIN'] = Math.round(rawMin * 10) / 10;
    
    if (fga > 0) s['eFG%'] = (((fgm + (Number(row['3PM'])||0)*0.5)/fga)*100).toFixed(1) + "%";
    const tsDiv = 2 * (fga + 0.44 * fta);
    if (tsDiv > 0) s['TS%'] = ((pts / tsDiv) * 100).toFixed(1) + "%";
    s['AST/TO'] = tov > 0 ? (ast / tov).toFixed(2) : (ast > 0 ? ast.toFixed(2) : "0.00");

    if (poss > 0) {
        if (row['team scored with'] !== undefined) s['ORtg'] = ((Number(row['team scored with'])/poss)*100).toFixed(1);
        if (row['opp scored with'] !== undefined) s['DRtg'] = ((Number(row['opp scored with'])/poss)*100).toFixed(1);
    }

    const optORB = Number(row['opt_ORB']) || 0;
    const optDRB = Number(row['opt_DRB']) || 0;
    if (optORB > 0) s['ORB%'] = ((Number(row['ORB']) || 0) / optORB * 100).toFixed(1) + "%";
    if (optDRB > 0) s['DRB%'] = ((Number(row['DRB']) || 0) / optDRB * 100).toFixed(1) + "%";

    return s;
}

function getVal(row, key, isAdv, isSummary = false) {
    if (key === 'PLAYER_NAME') return data.players[row.player_id]?.Name || "";
    if (isSummary && key === 'STRT') return row.starterSum || 0;

    let val = isAdv ? calculateAdvanced(row, isSummary)[key] : row[key];
    
    if (isSummary && !isAdv && key !== 'gp' && key !== 'STRT') {
        val = (Number(row[key]) || 0) / (row.gp || 1);
    }

    if (String(val).includes('%')) return parseFloat(val);
    return Number(val) || 0;
}

function renderAll() {
    populateGames(); populatePlayers(); populateTeams();
}

function populateGames() {
    const container = document.getElementById('games-container');
    container.innerHTML = data.games.filter(g => String(g.season) === currentSeason).map(g => {
        const isActive = activeGameIds.has(String(g.game_id));
        let pStats = data.playersStats.filter(s => String(s.game_id) === String(g.game_id));
        const tRows = data.teamStats.filter(t => String(t.game_id) === String(g.game_id));
        const myT = tRows.find(t => t["team name"] !== g.opponent);
        const oppT = tRows.find(t => t["team name"] === g.opponent);

        if (sortConfig.tableId === String(g.game_id)) {
            pStats.sort((a,b) => {
                let vA = getVal(a, sortConfig.key, isAdvancedMode, false);
                let vB = getVal(b, sortConfig.key, isAdvancedMode, false);
                if (sortConfig.key === 'PLAYER_NAME') return sortConfig.direction === 'desc' ? vB.localeCompare(vA) : vA.localeCompare(vB);
                return sortConfig.direction === 'desc' ? (vB - vA) : (vA - vB);
            });
        }

        const cols = isAdvancedMode ? Object.keys(calculateAdvanced(pStats[0]||{}, false)) : 
                     Object.keys(pStats[0]||{}).filter(k => !ALWAYS_HIDDEN.includes(k) && k !== 'starter');

        const showStage = g.stage && !["עונה סדירה", "regular season", "Regular Season"].includes(g.stage);

        return `
            <div class="game-card ${!isActive ? 'disabled-game' : ''}" data-card-id="${g.game_id}">
                <div class="game-card-top-wrapper">
                    <div class="game-header" onclick="toggleBoxScore('${g.game_id}')">
                        <div class="game-info-main">
                            <div class="team-row ${Number(g.O_score) > Number(g.T_score) ? 'winner' : ''}"><span>${g.opponent}</span><span class="score">${g.O_score}</span></div>
                            <div class="team-row ${Number(g.T_score) > Number(g.O_score) ? 'winner' : ''}"><span>${myT ? myT["team name"] : 'הקבוצה שלי'}</span><span class="score">${g.T_score}</span></div>
                        </div>
                        <div class="game-info-meta">
                            <span>${g.date}</span>
                            ${showStage ? `<span class="stage-label">${g.stage}</span>` : ''}
                        </div>
                    </div>
                    <label class="simple-switch"><input type="checkbox" ${isActive ? 'checked' : ''} onchange="handleGameToggle('${g.game_id}', this.checked, event)"><span class="slider"></span></label>
                </div>
                <div id="box-${g.game_id}" class="box-score-container ${sortConfig.tableId === String(g.game_id) ? 'active' : ''}">
                    <table class="box-table">
                        <thead><tr><th class="player-name-cell" onclick="sortTable('PLAYER_NAME', '${g.game_id}')">שחקן</th>${cols.map(c => `<th onclick="sortTable('${c}', '${g.game_id}')">${c} ${sortConfig.key===c && sortConfig.tableId===String(g.game_id) ? (sortConfig.direction==='desc'?'▼':'▲'):''}</th>`).join('')}</tr></thead>
                        <tbody>${pStats.map(s => {
                            const row = isAdvancedMode ? calculateAdvanced(s, false) : s;
                            return `<tr><td class="player-name-cell">${data.players[s.player_id]?.Name || '???'}</td>${cols.map(c => `<td>${smartRound(row[c])}</td>`).join('')}</tr>`
                        }).join('')}</tbody>
                        <tfoot style="${isAdvancedMode ? 'display:none' : ''}">
                            ${myT ? `<tr><td class="player-name-cell">${myT["team name"]}</td>${cols.map(c => `<td>${smartRound(myT[c])}</td>`).join('')}</tr>` : ''}
                            ${oppT ? `<tr><td class="player-name-cell">${oppT["team name"]}</td>${cols.map(c => `<td>${smartRound(oppT[c])}</td>`).join('')}</tr>` : ''}
                        </tfoot>
                    </table>
                </div>
            </div>`;
    }).join('');
}

function populatePlayers() {
    const container = document.getElementById('players-container');
    const filteredStats = data.playersStats.filter(s => activeGameIds.has(String(s.game_id)));
    if (!filteredStats.length) return;
    const pids = [...new Set(filteredStats.map(s => String(s.player_id)))];
    let summaries = pids.map(pid => {
        const ps = filteredStats.filter(s => String(s.player_id) === pid);
        const total = { gp: ps.length, starterSum: ps.reduce((a,b) => a + (b.starter ? 1 : 0), 0), player_id: pid };
        Object.keys(ps[0]).forEach(k => { if(!isNaN(ps[0][k])) total[k] = ps.reduce((a,b)=>a+(Number(b[k])||0), 0); });
        return { id: pid, total };
    });

    if (sortConfig.tableId === 'players-total') {
        summaries.sort((a,b) => {
            if (sortConfig.key === 'PLAYER_NAME') return sortConfig.direction === 'desc' ? (data.players[b.id]?.Name||"").localeCompare(data.players[a.id]?.Name||"") : (data.players[a.id]?.Name||"").localeCompare(data.players[b.id]?.Name||"");
            let vA = getVal(a.total, sortConfig.key, isAdvancedMode, true);
            let vB = getVal(b.total, sortConfig.key, isAdvancedMode, true);
            return sortConfig.direction === 'desc' ? (vB - vA) : (vA - vB);
        });
    }

    const first = summaries[0].total;
    const cols = isAdvancedMode ? Object.keys(calculateAdvanced(first, true)) : 
                 Object.keys(first).filter(k => !ALWAYS_HIDDEN.includes(k) && !['gp','starter','starterSum','2P%','3P%','FT%'].includes(k));

    container.innerHTML = `<table class="box-table"><thead><tr><th class="player-name-cell" onclick="sortTable('PLAYER_NAME', 'players-total')">שחקן</th>${cols.map(c => `<th onclick="sortTable('${c}', 'players-total')">${c} ${sortConfig.key===c && sortConfig.tableId==='players-total' ? (sortConfig.direction==='desc'?'▼':'▲'):''}</th>`).join('')}<th onclick="sortTable('gp', 'players-total')">GP</th></tr></thead>
        <tbody>${summaries.map(p => {
            const row = isAdvancedMode ? calculateAdvanced(p.total, true) : p.total;
            return `<tr><td class="player-name-cell">${data.players[p.id]?.Name}</td>${cols.map(c => `<td>${isAdvancedMode ? row[c] : smartRound(row[c]/p.total.gp)}</td>`).join('')}<td>${p.total.gp}</td></tr>`;
        }).join('')}</tbody></table>`;
}

function populateTeams() {
    const container = document.getElementById('teams-container');
    const filteredTeams = data.teamStats.filter(t => activeGameIds.has(String(t.game_id)));
    if (!filteredTeams.length) return;
    const names = [...new Set(filteredTeams.map(t => t["team name"]))];
    let summaries = names.map(n => {
        const rows = filteredTeams.filter(t => t["team name"] === n);
        const total = { gp: rows.length };
        Object.keys(rows[0]).forEach(k => { if(!isNaN(rows[0][k])) total[k] = rows.reduce((a,b)=>a+(Number(b[k])||0), 0); });
        return { name: n, total };
    });
    if (sortConfig.tableId === 'teams-total') summaries.sort((a,b) => sortConfig.direction === 'desc' ? (b.total[sortConfig.key]||0) - (a.total[sortConfig.key]||0) : (a.total[sortConfig.key]||0) - (b.total[sortConfig.key]||0));
    const cols = Object.keys(filteredTeams[0]).filter(k => !ALWAYS_HIDDEN.includes(k) && !['team name','game_id','season','date','2P%','3P%','FT%'].includes(k));
    container.innerHTML = `<table class="box-table"><thead><tr><th class="player-name-cell">קבוצה</th>${cols.map(c => `<th onclick="sortTable('${c}', 'teams-total')">${c}</th>`).join('')}<th>GP</th></tr></thead>
        <tbody>${summaries.map(s => `<tr><td class="player-name-cell">${s.name}</td>${cols.map(c => `<td>${smartRound(s.total[c]/s.total.gp)}</td>`).join('')}<td>${s.total.gp}</td></tr>`).join('')}</tbody></table>`;
}

function updateActiveGamesBySeason() { activeGameIds.clear(); data.games.forEach(g => { if (String(g.season) === currentSeason) activeGameIds.add(String(g.game_id)); }); }
function handleGameToggle(id, chk, e) { e.stopPropagation(); chk ? activeGameIds.add(String(id)) : activeGameIds.delete(String(id)); renderAll(); }
function selectSeason(s) { currentSeason = String(s); updateActiveGamesBySeason(); renderSeasonFilters(); renderAll(); }
function renderSeasonFilters() { const c = document.getElementById('season-checkboxes'); const ss = [...new Set(data.games.map(g => String(g.season)))].sort().reverse(); c.innerHTML = ss.map(s => `<div class="season-pill ${s===currentSeason?'active':''}" onclick="selectSeason('${s}')">עונת ${s}</div>`).join(''); }
function toggleBoxScore(id) { document.getElementById(`box-${id}`).classList.toggle('active'); }
function smartRound(v) { if (v === null || v === undefined) return '-'; let n = Number(v); if (isNaN(n)) return v; return Math.round(n * 10) / 10; }