let data = { games: [], players: {}, playersStats: [], teamStats: [] };
let activeGameIds = new Set(); 
let currentSeason = null;
let currentStatMode = 'AVG'; 
let isAdvancedMode = false;
let sortConfig = { key: null, direction: 'desc', tableId: null };
let openBoxScores = new Set(); 

const ALWAYS_HIDDEN = ['game_id', 'player_id', 'tech_Fouls', 'reg_FD', 'OFD', 'And1', 'team scored with', 'opp scored with', 'poss', 'ended person', 'ended poss', 'opt_DRB', 'opt_ORB', '%DRB', '%ORB', 'ORB%', 'DRB%', 'ORtg', 'DRtg'];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-games').onclick = () => goTo('games');
    document.getElementById('nav-players').onclick = () => goTo('players');
    document.getElementById('nav-teams').onclick = () => goTo('teams');
    document.getElementById('nav-player-profile').onclick = () => goTo('player-profile');
    loadData();
});

function toggleSidebar() { document.body.classList.toggle('sidebar-closed'); }

function goTo(id) {
    const pages = ['games', 'players', 'teams', 'player-profile'];
    pages.forEach(p => {
        const section = document.getElementById('sec-' + p);
        const btn = document.getElementById('nav-' + p);
        if (section) section.style.display = 'none';
        if (btn) btn.classList.remove('active');
    });

    document.getElementById('sec-' + id).style.display = 'block';
    document.getElementById('nav-' + id).classList.add('active');
    
    renderAll();
    // הצגת כפתורי עונות בכל דף חוץ מפרופיל אישי
    if (id !== 'player-profile') {
        renderSeasonFilters();
    }
}

async function loadData() {
    try {
        const [gs, pls, ps, ts] = await Promise.all([
            fetch('games.json').then(r => r.json()),
            fetch('players.json').then(r => r.json()),
            fetch('players_stats.json').then(r => r.json()),
            fetch('teams_stats.json').then(r => r.json())
        ]);
        const pMap = {}; pls.forEach(p => pMap[p.player_id] = p);
        data = { games: gs, players: pMap, playersStats: ps, teamStats: ts };
        
        const sortedSeasons = getSortedSeasons();
        if (sortedSeasons.length > 0) currentSeason = sortedSeasons[sortedSeasons.length - 1];
        
        updateActiveGamesBySeason();
        populatePlayerSelect();
        renderAll();
        renderSeasonFilters();
    } catch (e) { console.error("Load Error", e); }
}

function getTimestamp(d) { 
    if(!d) return 0;
    // הפורמט YYYY-MM-DD נתמך בצורה טבעית ע"י אובייקט Date
    return new Date(d).getTime();
}

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
    data.games.forEach(g => { if (String(g.season) === String(currentSeason)) activeGameIds.add(String(g.game_id)); });
}

function setStatMode(m) { 
    currentStatMode = m; 
    renderAll(); 
    if(document.getElementById('sec-player-profile').style.display === 'block') renderPlayerProfile(); 
}

function toggleAdvancedMode() { isAdvancedMode = !isAdvancedMode; renderAll(); }

function handleGameToggle(id, chk, e) {
    e.stopPropagation();
    chk ? activeGameIds.add(String(id)) : activeGameIds.delete(String(id));
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
        sortConfig.key = key; sortConfig.direction = 'desc'; sortConfig.tableId = tableId;
    }
    
    if(tableId === 'prof-career') {
        renderPlayerProfile();
    } else {
        renderAll();
    }
}

function calculateAdvanced(row, isSum = false) {
    const gp = isSum ? (row.gp || 1) : 1;
    const fga = (Number(row['2PA'])||0) + (Number(row['3PA'])||0);
    const fgm = (Number(row['2PM'])||0) + (Number(row['3PM'])||0);
    const pts = Number(row['PTS'])||0;
    const fta = Number(row['FTA'])||0;
    const ast = Number(row['AST'])||0;
    const tov = Number(row['TOV'])||0;
    const s = {};
    s['MIN'] = isSum ? (row['MIN'] / gp) : Number(row['MIN']);
    s['eFG%'] = fga > 0 ? (((fgm + (Number(row['3PM'])||0)*0.5)/fga)*100).toFixed(1) + "%" : "0.0%";
    const tsDiv = 2 * (fga + 0.44 * fta);
    s['TS%'] = tsDiv > 0 ? ((pts / tsDiv) * 100).toFixed(1) + "%" : "0.0%";
    s['AST/TO'] = tov > 0 ? (ast / tov).toFixed(2) : (ast > 0 ? ast.toFixed(2) : "0.00");
    s['ORB%'] = isSum ? (Number(row['ORB%'])/gp).toFixed(1) + "%" : (Number(row['ORB%'])||0).toFixed(1) + "%";
    s['DRB%'] = isSum ? (Number(row['DRB%'])/gp).toFixed(1) + "%" : (Number(row['DRB%'])||0).toFixed(1) + "%";
    return s;
}

function smartRound(v) {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'string' && v.includes('%')) return v;
    let n = Number(v);
    return isNaN(n) ? v : (Number.isInteger(n) ? n : Math.round(n * 10) / 10);
}

function getCellValue(row, col, mode) {
    if (mode === 'TOT') {
        if (col === '2P%') return (row['2PA'] > 0 ? (row['2PM'] / row['2PA'] * 100).toFixed(1) + "%" : "0.0%");
        if (col === '3P%') return (row['3PA'] > 0 ? (row['3PM'] / row['3PA'] * 100).toFixed(1) + "%" : "0.0%");
        if (col === 'FG%') { const fga = (row['2PA'] || 0) + (row['3PA'] || 0); const fgm = (row['2PM'] || 0) + (row['3PM'] || 0); return (fga > 0 ? (fgm / fga * 100).toFixed(1) + "%" : "0.0%"); }
        if (col === 'FT%') return (row['FTA'] > 0 ? (row['FTM'] / row['FTA'] * 100).toFixed(1) + "%" : "0.0%");
        if (col === 'USG%') return (row['USG%'] / (row.gp || 1)).toFixed(1) + "%";
        if (col === 'PIR') return (row['PIR'] / (row.gp || 1)).toFixed(1);
        return row[col];
    }
    const val = row[col] / (row.gp || 1);
    return col.includes('%') ? val.toFixed(1) + "%" : val;
}

function getCellValueForSort(p, col) {
    if (col === 'NAME') return data.players[p.id]?.Name || "";
    if (col === 'gp') return p.total.gp;
    if (col === 'season') return p.season;
    if (currentStatMode === 'ADV') {
        const adv = calculateAdvanced(p.total, true);
        return parseFloat(adv[col]) || 0;
    }
    const val = getCellValue(p.total, col, currentStatMode);
    return typeof val === 'string' ? parseFloat(val) : val;
}

function renderAll() { 
    populateGames(); 
    populatePlayers(); 
    populateTeams(); 
}

function populateGames() {
    const container = document.getElementById('games-container');
    if(!container) return;
    const filtered = data.games.filter(g => String(g.season) === String(currentSeason)).sort((a,b) => getTimestamp(a.date) - getTimestamp(b.date));
    
    container.innerHTML = `
        <div class="games-controls-row">
            <button class="adv-toggle-btn ${isAdvancedMode ? 'active' : ''}" onclick="toggleAdvancedMode()"><span class="dot"></span> ADV</button>
        </div>` + filtered.map(g => {
        const isActive = activeGameIds.has(String(g.game_id));
        const isOpen = openBoxScores.has(String(g.game_id));
        const stage = g.stage || "";
        const stageClass = stage.includes("גמר") ? "stage-orange" : (stage.includes("גביע") ? "stage-blue" : "");
        const stageHTML = stage && stage !== "עונה סדירה" ? `<span class="stage-badge ${stageClass}">${stage}</span>` : "";
        
        const pStats = data.playersStats.filter(s => String(s.game_id) === String(g.game_id));
        const myT = data.teamStats.find(t => String(t.game_id) === String(g.game_id) && t["team name"] !== g.opponent);
        const cols = isAdvancedMode ? ['MIN', 'eFG%', 'TS%', 'AST/TO', 'ORB%', 'DRB%'] : Object.keys(pStats[0]||{}).filter(k => !ALWAYS_HIDDEN.includes(k) && k !== 'starter');

        return `
            <div class="game-card" data-card-id="${g.game_id}" style="opacity: ${isActive ? 1 : 0.5}">
                <div class="game-card-top-wrapper">
                    <div class="game-header" onclick="toggleBoxScore('${g.game_id}')">
                        <div class="game-info">
                            <div class="team-row ${Number(g.O_score) > Number(g.T_score) ? 'winner' : ''}"><span>${g.opponent}</span><span>${g.O_score}</span></div>
                            <div class="team-row ${Number(g.T_score) > Number(g.O_score) ? 'winner' : ''}"><span>${myT ? myT["team name"] : 'הקבוצה שלי'}</span><span>${g.T_score}</span></div>
                        </div>
                        <div class="game-date-area"><span>${g.date}</span>${stageHTML}</div>
                    </div>
                    <label class="simple-switch"><input type="checkbox" ${isActive ? 'checked' : ''} onchange="handleGameToggle('${g.game_id}', this.checked, event)"><span class="slider"></span></label>
                </div>
                <div class="box-score-container" style="display: ${isOpen ? 'block' : 'none'}; padding: 20px; border-top: 1px solid var(--border);">
                    <div class="table-wrapper"><table class="box-table">
                        <thead><tr><th class="player-name-cell">שחקן</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
                        <tbody>${pStats.map(s => `<tr><td class="player-name-cell">${Number(s.starter) ? (data.players[s.player_id]?.Name||'??') + '*' : (data.players[s.player_id]?.Name||'??')}</td>${cols.map(c => `<td>${smartRound(isAdvancedMode ? calculateAdvanced(s)[c] : s[c])}</td>`).join('')}</tr>`).join('')}</tbody>
                    </table></div>
                </div>
            </div>`;
    }).join('');
}

function populatePlayers() {
    const container = document.getElementById('players-container');
    if(!container) return;
    const filteredStats = data.playersStats.filter(s => activeGameIds.has(String(s.game_id)));
    if(!filteredStats.length) { container.innerHTML = "<p>אין נתונים למשחקים שנבחרו</p>"; return; }
    
    const pids = [...new Set(filteredStats.map(s => s.player_id))];
    let summaries = pids.map(pid => {
        const ps = filteredStats.filter(s => s.player_id === pid);
        const total = { gp: ps.length, player_id: pid };
        ps.forEach(row => { Object.keys(row).forEach(k => { if(!isNaN(row[k])) total[k] = (total[k]||0) + Number(row[k]); }); });
        return { id: pid, total };
    });

    if (sortConfig.tableId === 'players') {
        summaries.sort((a,b) => {
            const vA = getCellValueForSort(a, sortConfig.key), vB = getCellValueForSort(b, sortConfig.key);
            return sortConfig.direction === 'desc' ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
        });
    }

    const cols = currentStatMode === 'ADV' ? ['MIN', 'eFG%', 'TS%', 'AST/TO', 'ORB%', 'DRB%'] : Object.keys(summaries[0].total).filter(k => !ALWAYS_HIDDEN.includes(k) && !['gp','player_id','starter'].includes(k));

    container.innerHTML = `
<div class="table-header-row">
            <div class="mode-toggle-group">
                <button class="mode-btn ${currentStatMode==='AVG'?'active':''}" onclick="setStatMode('AVG')">AVG</button>
                <button class="mode-btn ${currentStatMode==='TOT'?'active':''}" onclick="setStatMode('TOT')">TOT</button>
                <button class="mode-btn ${currentStatMode==='ADV'?'active':''}" onclick="setStatMode('ADV')">ADV</button>
            </div>
        </div>
        <div class="table-wrapper"><table class="box-table">
            <thead><tr><th class="player-name-cell" onclick="setSort('NAME','players',event)">שחקן</th>${cols.map(c => `<th onclick="setSort('${c}','players',event)">${c}</th>`).join('')}<th onclick="setSort('gp','players',event)">GP</th></tr></thead>
            <tbody>${summaries.map(p => `<tr><td class="player-name-cell">${data.players[p.id]?.Name||'??'}</td>${cols.map(c => `<td>${smartRound(currentStatMode==='ADV'?calculateAdvanced(p.total,true)[c]:getCellValue(p.total,c,currentStatMode))}</td>`).join('')}<td>${p.total.gp}</td></tr>`).join('')}</tbody>
        </table></div>`;
}

function populatePlayerSelect() {
    const s = document.getElementById('player-select');
    if(!s) return;
    const ps = Object.values(data.players).sort((a,b) => a.Name.localeCompare(b.Name));
    s.innerHTML = '<option value="">בחר שחקן...</option>' + ps.map(p => `<option value="${p.player_id}">${p.Name}</option>`).join('');
}

function renderPlayerProfile() {
    const pid = document.getElementById('player-select').value;
    const container = document.getElementById('profile-content');
    if(!pid) { container.innerHTML = ""; return; }

    const pStats = data.playersStats.filter(s => String(s.player_id) === String(pid));
    const seasons = getSortedSeasons().reverse().filter(s => 
        pStats.some(st => {
            const game = data.games.find(g => String(g.game_id) === String(st.game_id));
            return game && game.season === s;
        })
    );

    let summaries = seasons.map(s => {
        const sIds = new Set(data.games.filter(g => g.season === s).map(g => String(g.game_id)));
        const stats = pStats.filter(st => sIds.has(String(st.game_id)));
        const total = { gp: stats.length, player_id: pid };
        stats.forEach(row => {
            Object.keys(row).forEach(k => { if(!isNaN(row[k])) total[k] = (total[k]||0) + Number(row[k]); });
        });
        return { id: pid, total, season: s };
    });

    if (sortConfig.tableId === 'prof-career') {
        summaries.sort((a,b) => {
            const vA = getCellValueForSort(a, sortConfig.key);
            const vB = getCellValueForSort(b, sortConfig.key);
            return sortConfig.direction === 'desc' ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
        });
    }

    // עמודות זהות לממוצעי שחקנים
    const sampleStat = data.playersStats[0] || {};
    const cols = currentStatMode === 'ADV' ? 
        ['MIN', 'eFG%', 'TS%', 'AST/TO', 'ORB%', 'DRB%'] : 
        Object.keys(sampleStat).filter(k => !ALWAYS_HIDDEN.includes(k) && !['gp','player_id','starter'].includes(k));

    let html = `
        <div class="table-header-row">
            <div class="mode-toggle-group">
                <button class="mode-btn ${currentStatMode==='AVG'?'active':''}" onclick="setStatMode('AVG')">AVG</button>
                <button class="mode-btn ${currentStatMode==='TOT'?'active':''}" onclick="setStatMode('TOT')">TOT</button>
                <button class="mode-btn ${currentStatMode==='ADV'?'active':''}" onclick="setStatMode('ADV')">ADV</button>
            </div>
        </div>
        <h3 class="profile-table-title">סיכום עונתי</h3>
        <div class="table-wrapper"><table class="box-table">
            <thead>
                <tr>
                    <th onclick="setSort('season','prof-career',event)">עונה</th>
                    ${cols.map(c => `<th onclick="setSort('${c}','prof-career',event)">${c}</th>`).join('')}
                    <th onclick="setSort('gp','prof-career',event)">GP</th>
                </tr>
            </thead>
            <tbody>
                ${summaries.map(r => `
                    <tr>
                        <td>${r.season}</td>
                        ${cols.map(c => `<td>${smartRound(currentStatMode==='ADV'?calculateAdvanced(r.total,true)[c]:getCellValue(r.total,c,currentStatMode))}</td>`).join('')}
                        <td>${r.total.gp}</td>
                    </tr>
                `).join('')}
            </tbody>
</table></div>`;

// הגדרה קבועה של עמודות לשיאים - לא משתמשים ב-cols של הכפתורים!
    const highColsStatic = Object.keys(sampleStat).filter(k => {
        return !ALWAYS_HIDDEN.includes(k) && 
               !['gp','player_id','starter','game_id','starter_count'].includes(k) && 
               (!k.includes('%') || k === 'USG%');
    });

    // חישוב שיא קריירה אבסולוטי לצורך הצבע הכתום
    const careerHighs = {};
    highColsStatic.forEach(c => {
        careerHighs[c] = Math.max(...pStats.map(st => Number(st[c]) || 0));
    });

    html += `<h3 class="profile-table-title">שיאי עונה (במשחק בודד)</h3>
        <div class="table-wrapper"><table class="box-table">
            <thead><tr><th>עונה</th>${highColsStatic.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>
                ${seasons.map(s => {
                    const sIds = new Set(data.games.filter(g => g.season === s).map(g => String(g.game_id)));
                    const seasonGames = pStats.filter(st => sIds.has(String(st.game_id)));
                    
                    return `<tr><td>${s}</td>` + highColsStatic.map(c => {
                        let maxVal = -1;
                        let maxGid = null;
                        
                        seasonGames.forEach(g => {
                            const val = Number(g[c]) || 0;
                            if(val > maxVal) {
                                maxVal = val;
                                maxGid = g.game_id;
                            }
                        });

                        const isCareerHigh = maxVal === careerHighs[c] && maxVal > 0;
                        const classText = isCareerHigh ? 'career-high' : '';
                        const display = (c === 'USG%') ? maxVal.toFixed(1) : (maxVal < 0 ? 0 : Math.round(maxVal));

                        return `<td class="${classText} clickable-stat" onclick="jumpToGame('${maxGid}','${s}')">
                            ${display}
                        </td>`;
                    }).join('') + `</tr>`;
                }).join('')}
            </tbody>
        </table></div>`;
    
    container.innerHTML = html;
}

function jumpToGame(gid, s) {
    currentSeason = s; updateActiveGamesBySeason(); renderSeasonFilters();
    goTo('games');
    setTimeout(() => {
        if(!openBoxScores.has(String(gid))) toggleBoxScore(gid);
        const el = document.querySelector(`[data-card-id="${gid}"]`);
        if(el) { el.scrollIntoView({behavior:'smooth', block:'center'}); el.style.outline = "2px solid var(--accent)"; setTimeout(()=>el.style.outline="none",2000); }
    }, 400);
}

function populateTeams() {
    const container = document.getElementById('teams-container');
    if(!container) return;
    const filtered = data.teamStats.filter(t => activeGameIds.has(String(t.game_id)));
    if(!filtered.length) { container.innerHTML = ""; return; }
    
    const names = [...new Set(filtered.map(t => t["team name"]))];
    const myTeam = names.reduce((a, b) => filtered.filter(x=>x["team name"]===a).length > filtered.filter(x=>x["team name"]===b).length ? a : b);
    
    let mySum = { name: myTeam, gp: 0 }, oppSum = { name: "יריבה (ממוצע)", gp: 0 };
    const cols = Object.keys(filtered[0]).filter(k => !ALWAYS_HIDDEN.includes(k) && !['team name','game_id','season','date'].includes(k));

    filtered.forEach(r => {
        const target = r["team name"] === myTeam ? mySum : oppSum;
        target.gp++;
        cols.forEach(c => { if(!isNaN(r[c])) target[c] = (target[c]||0) + Number(r[c]); });
    });

    container.innerHTML = `<h2 style="margin-bottom:20px;">השוואת קבוצות</h2><div class="table-wrapper"><table class="box-table">
        <thead><tr><th class="player-name-cell">קבוצה</th>${cols.map(c => `<th>${c}</th>`).join('')}<th>GP</th></tr></thead>
        <tbody>${[mySum, oppSum].filter(s => s.gp > 0).map(s => `<tr><td class="player-name-cell">${s.name}</td>${cols.map(c => `<td>${smartRound(s[c]/s.gp)}${c.includes('%')?'%':''}</td>`).join('')}<td>${s.gp}</td></tr>`).join('')}</tbody>
    </table></div>`;
}