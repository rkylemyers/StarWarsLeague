// Global State
let config = {};
let rawData = {};
let selectedYear = "";
let processedData = {}; // year -> teamsMap
let yearList = [];
let activeView = "dues"; // "dues" or "rollup"
let rollupFilter = "all"; // filter filter state for rollup view

// Canvas Warp Speed Variables
let canvas, ctx;
let stars = [];
const numStars = 200;
let warpSpeed = 0.5;
let targetWarpSpeed = 0.5;

// DOM Elements
let syncTimeLabel, potValue, totalPickupsValue, duesTbody, timelineChartElement, duesTableElement;
let auditModal, settingsModal;
let inputBuyIn, inputPickupCost, inputFreePickups, inputFirstSplit, inputSecondSplit;
let globalDuesList, teamAdjustmentsList, selectAdjTeam;
let inputGlobalDesc, inputGlobalAmount, btnAddGlobal;
let inputAdjDesc, inputAdjAmount, btnAddAdj;
let btnRecalculate, btnExportConfig;
let modalTeamTitle;

// Initial setup
document.addEventListener('DOMContentLoaded', async () => {
  // Bind elements to variables
  syncTimeLabel = document.getElementById('sync-time-label');
  potValue = document.getElementById('pot-value');
  totalPickupsValue = document.getElementById('total-pickups-value');
  duesTbody = document.getElementById('dues-tbody');
  timelineChartElement = document.getElementById('timeline-chart-element');
  duesTableElement = document.getElementById('dues-table-element');
  
  auditModal = document.getElementById('audit-modal');
  settingsModal = document.getElementById('settings-modal');

  inputBuyIn = document.getElementById('input-buyin');
  inputPickupCost = document.getElementById('input-pickup-cost');
  inputFreePickups = document.getElementById('input-free-pickups');
  inputFirstSplit = document.getElementById('input-first-split');
  inputSecondSplit = document.getElementById('input-second-split');
  globalDuesList = document.getElementById('global-dues-list');
  teamAdjustmentsList = document.getElementById('team-adjustments-list');
  selectAdjTeam = document.getElementById('select-adj-team');
  inputGlobalDesc = document.getElementById('input-global-desc');
  inputGlobalAmount = document.getElementById('input-global-amount');
  btnAddGlobal = document.getElementById('btn-add-global');
  inputAdjDesc = document.getElementById('input-adj-desc');
  inputAdjAmount = document.getElementById('input-adj-amount');
  btnAddAdj = document.getElementById('btn-add-adj');
  btnRecalculate = document.getElementById('btn-recalculate');
  btnExportConfig = document.getElementById('btn-export-config');
  modalTeamTitle = document.getElementById('modal-team-title');

  initSpaceBg();
  await loadData();
  setupEventListeners();
});

// ----------------------------------------------------
// 1. STAR WARS SPACE CANVAS BACKGROUND
// ----------------------------------------------------
function initSpaceBg() {
  canvas = document.getElementById('space-canvas');
  ctx = canvas.getContext('2d');
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Initialize stars
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: Math.random() * canvas.width - canvas.width / 2,
      y: Math.random() * canvas.height - canvas.height / 2,
      z: Math.random() * canvas.width,
      color: `hsl(${Math.random() * 50 + 180}, 100%, ${Math.random() * 40 + 60}%)`
    });
  }

  animateSpace();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function animateSpace() {
  ctx.fillStyle = `rgba(4, 6, 10, ${warpSpeed > 5 ? 0.15 : 0.4})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  warpSpeed += (targetWarpSpeed - warpSpeed) * 0.08;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    star.z -= warpSpeed;

    if (star.z <= 0) {
      star.x = Math.random() * canvas.width - cx;
      star.y = Math.random() * canvas.height - cy;
      star.z = canvas.width;
    }

    const px = (star.x / star.z) * cx + cx;
    const py = (star.y / star.z) * cy + cy;

    const alpha = Math.min(1, 1 - star.z / canvas.width);
    
    ctx.beginPath();
    ctx.strokeStyle = star.color;
    ctx.lineWidth = Math.min(3, (1 - star.z / canvas.width) * 3);

    if (warpSpeed > 2) {
      const prevZ = star.z + warpSpeed * 2.5;
      const prevX = (star.x / prevZ) * cx + cx;
      const prevY = (star.y / prevZ) * cy + cy;
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(px, py);
      ctx.stroke();
    } else {
      ctx.fillStyle = star.color;
      ctx.arc(px, py, Math.max(0.5, (1 - star.z / canvas.width) * 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(animateSpace);
}

function triggerHyperspaceJump() {
  targetWarpSpeed = 25;
  setTimeout(() => {
    targetWarpSpeed = 0.5;
  }, 450);
}

// ----------------------------------------------------
// 2. DATA PROCESSING & PARSING
// ----------------------------------------------------
async function loadData() {
  try {
    const configResp = await fetch('data/config.json');
    config = await configResp.json();

    const dataResp = await fetch('data/transactions_cache.json');
    rawData = await dataResp.json();

    if (rawData.synced_at) {
      const syncDate = new Date(rawData.synced_at);
      syncTimeLabel.textContent = `Synced: ${syncDate.toLocaleDateString()} ${syncDate.toLocaleTimeString()}`;
    }

    processTransactionsBySeason();
    buildYearTabs();
    recalculateAll();

  } catch (err) {
    console.error('Error loading config/data caches:', err);
    syncTimeLabel.textContent = 'Offline (No Cache)';
    syncTimeLabel.style.color = 'var(--accent-coral)';
  }
}

// May-to-May NFL season mapping
function getSeasonYear(timeEpochMilli) {
  const date = new Date(parseInt(timeEpochMilli));
  const month = date.getMonth(); // 0 = Jan, 4 = May, 8 = Sept
  const year = date.getFullYear();
  return month >= 4 ? year : year - 1;
}

// Groups transactions by season year
function processTransactionsBySeason() {
  processedData = {};

  if (!rawData || !rawData.items) return;

  rawData.items.forEach(item => {
    const year = getSeasonYear(item.timeEpochMilli);
    
    let teamName = "";
    let teamId = 0;
    if (item.transaction && item.transaction.team) {
      teamName = item.transaction.team.name;
      teamId = item.transaction.team.id;
    } else if (item.reserveChange && item.reserveChange.team) {
      teamName = item.reserveChange.team.name;
      teamId = item.reserveChange.team.id;
    }

    if (!teamName) return;

    if (!processedData[year]) {
      processedData[year] = {
        teams: {},
        totalPickups: 0
      };
    }

    const season = processedData[year];
    if (!season.teams[teamName]) {
      season.teams[teamName] = {
        id: teamId,
        name: teamName,
        claims: 0,
        adds: 0,
        trades: 0,
        drops: 0,
        reserves: 0,
        total: 0,
        pickups: 0,
        history: []
      };
    }

    const team = season.teams[teamName];
    team.history.push(item);

    if (item.transaction) {
      team.total++;
      let type = item.transaction.type || "";
      if (type === "") {
        type = "TRANSACTION_ADD"; // Default empty types to Free Agent additions
      }
      switch (type) {
        case "TRANSACTION_CLAIM":
          team.claims++;
          team.pickups++;
          season.totalPickups++;
          break;
        case "TRANSACTION_ADD":
          team.adds++;
          team.pickups++;
          season.totalPickups++;
          break;
        case "TRANSACTION_DROP":
          team.drops++;
          break;
        case "TRANSACTION_TRADE":
          team.trades++;
          break;
      }
    } else if (item.reserveChange) {
      team.total++;
      team.reserves++;
    }
  });

  // Calculate sorted year list based on standings keys in cache
  if (rawData.standings) {
    yearList = Object.keys(rawData.standings).map(Number).sort((a, b) => b - a);
  } else {
    yearList = Object.keys(processedData).map(Number).sort((a, b) => b - a);
  }

  if (yearList.length > 0) {
    selectedYear = yearList[0].toString(); // default to latest
  }
}

// ----------------------------------------------------
// 3. WEEKLY NFL WEEK CALCULATOR
// ----------------------------------------------------
function getNFLStartThursday(year) {
  let date = new Date(year, 8, 1);
  let day = date.getDay();
  let firstMonday;
  if (day === 1) {
    firstMonday = 1;
  } else if (day === 0) {
    firstMonday = 2;
  } else {
    firstMonday = 9 - day;
  }
  let startThursday = firstMonday + 3;
  return new Date(year, 8, startThursday);
}

function getNFLWeek(timeEpochMilli, seasonYear) {
  const startThursday = getNFLStartThursday(seasonYear);
  const startOfWeek1 = new Date(startThursday.getTime());
  startOfWeek1.setDate(startOfWeek1.getDate() - 2); // Tuesday morning before kickoff
  startOfWeek1.setHours(0, 0, 0, 0);

  const txDate = new Date(parseInt(timeEpochMilli));
  
  if (txDate < startOfWeek1) {
    return 1; // Group pre-season into Week 1
  }
  
  const diffMs = txDate.getTime() - startOfWeek1.getTime();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const weekNum = Math.floor(diffMs / oneWeekMs) + 1;
  
  return weekNum > 18 ? 19 : weekNum; // 19 represents Postseason
}

function getWeekName(weekInt) {
  if (weekInt === 19) return "Postseason";
  return `Week ${weekInt}`;
}

// Format player details as "+ Marvin Harrison Jr - WR - Ari"
function getPlayerDetailsFormatted(item) {
  if (!item.transaction || !item.transaction.player || !item.transaction.player.proPlayer) {
    return "—";
  }
  const p = item.transaction.player.proPlayer;
  let sign = "⇄";
  let type = item.transaction.type || "";
  if (type === "") {
    type = "TRANSACTION_ADD";
  }
  if (type === "TRANSACTION_CLAIM" || type === "TRANSACTION_ADD") {
    sign = "+";
  } else if (type === "TRANSACTION_DROP") {
    sign = "-";
  }
  return `${sign} ${p.nameFull} - ${p.position} - ${p.proTeamAbbreviation}`;
}

// Helper to return thematic lightsaber icons with optional text label beside it
function getActionLightsaberIcon(item, showLabel = true) {
  if (!item.transaction) return '—';
  
  let type = item.transaction.type || "";
  if (type === "") {
    type = "TRANSACTION_ADD";
  }
  
  let label = "Other";
  let svg = "";
  
  if (type === "TRANSACTION_CLAIM" || type === "TRANSACTION_ADD") {
    label = type === "TRANSACTION_CLAIM" ? "Claim" : "Add";
    svg = `<svg width="16" height="16" viewBox="0 0 16 16">
      <line x1="2" y1="8" x2="14" y2="8" stroke="#00ff66" stroke-width="2.5" stroke-linecap="round" style="filter: drop-shadow(0 0 3px #00ff66);"></line>
      <line x1="8" y1="2" x2="8" y2="14" stroke="#00f0ff" stroke-width="2.5" stroke-linecap="round" style="filter: drop-shadow(0 0 3px #00f0ff);"></line>
    </svg>`;
  } else if (type === "TRANSACTION_DROP") {
    label = "Drop";
    svg = `<svg width="16" height="16" viewBox="0 0 16 16">
      <line x1="2" y1="8" x2="14" y2="8" stroke="#ff1e27" stroke-width="3" stroke-linecap="round" style="filter: drop-shadow(0 0 3px #ff1e27);"></line>
    </svg>`;
  } else if (type === "TRANSACTION_TRADE") {
    label = "Trade";
    svg = `<svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M3,8 L13,8 M3,8 L6,5 M3,8 L6,11 M13,8 L10,5 M13,8 L10,11" fill="none" stroke="#a626ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 3px #a626ff);"></path>
    </svg>`;
  } else if (type === "TRANSACTION_IMPORT") {
    label = "Import";
    svg = `<svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M3,8 L13,8 M3,8 L6,5 M3,8 L6,11 M13,8 L10,5 M13,8 L10,11" fill="none" stroke="#a626ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 3px #a626ff);"></path>
    </svg>`;
  } else if (type === "TRANSACTION_DRAFT") {
    label = "Draft";
    svg = `<svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M3,8 L13,8 M3,8 L6,5 M3,8 L6,11 M13,8 L10,5 M13,8 L10,11" fill="none" stroke="#a626ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 3px #a626ff);"></path>
    </svg>`;
  }
  
  if (showLabel) {
    return `
      <div style="display: flex; align-items: center; gap: 0.5rem; justify-content: flex-start;">
        <span class="lightsaber-icon-wrapper">${svg}</span>
        <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${label}</span>
      </div>
    `;
  }
  
  return `<span class="lightsaber-icon-wrapper" title="${label}">${svg}</span>`;
}

// ----------------------------------------------------
// 4. CHART & LEADERBOARD RENDERING
// ----------------------------------------------------
function recalculateAll() {
  if (!selectedYear) return;

  const season = processedData[selectedYear] || { teams: {}, totalPickups: 0 };
  const standings = rawData.standings && rawData.standings[selectedYear];
  const teamList = [];

  // Build the master list of teams for this selected year from standings
  const seasonTeams = {};
  if (standings && standings.divisions) {
    standings.divisions.forEach(div => {
      div.teams.forEach(t => {
        seasonTeams[t.name] = {
          id: t.id,
          name: t.name,
          claims: 0,
          adds: 0,
          trades: 0,
          drops: 0,
          reserves: 0,
          total: 0,
          pickups: 0,
          history: []
        };
      });
    });
  }

  // Merge transaction data into the master team structures
  if (season && season.teams) {
    Object.entries(season.teams).forEach(([name, tData]) => {
      if (!seasonTeams[name]) {
        seasonTeams[name] = tData;
      } else {
        Object.assign(seasonTeams[name], {
          claims: tData.claims,
          adds: tData.adds,
          trades: tData.trades,
          drops: tData.drops,
          reserves: tData.reserves,
          total: tData.total,
          pickups: tData.pickups,
          history: tData.history
        });
        // Do not overwrite valid standings ID with 0 or undefined
        if (!seasonTeams[name].id && tData.id) {
          seasonTeams[name].id = tData.id;
        }
      }
    });
  }

  // Save the computed map back to processedData so details persist across clicks/years
  if (processedData[selectedYear]) {
    processedData[selectedYear].teams = seasonTeams;
  }

  // If both standings and transactions are missing, exit
  if (Object.keys(seasonTeams).length === 0) {
    duesTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No data available for season ' + selectedYear + '</td></tr>';
    return;
  }

  // Calculate Shared Global costs split equally
  const totalGlobalDuesSum = (config.globalDues || []).reduce((acc, curr) => acc + curr.amount, 0);
  const totalTeams = Object.keys(seasonTeams).length || 1;
  const sharedDuesPerTeam = totalGlobalDuesSum / totalTeams;

  // Process details per team
  Object.values(seasonTeams).forEach(team => {
    team.history.sort((a, b) => parseInt(a.timeEpochMilli) - parseInt(b.timeEpochMilli));
    team.weeklyPickups = Array(20).fill(0);

    let pickupIndex = 0;
    team.history.forEach(item => {
      const week = getNFLWeek(item.timeEpochMilli, selectedYear);
      item.nflWeek = week;
      item.isPickup = false;
      item.charge = 0.00;

      if (item.transaction) {
        let type = item.transaction.type || "";
        if (type === "") {
          type = "TRANSACTION_ADD";
        }
        if (type === "TRANSACTION_CLAIM" || type === "TRANSACTION_ADD") {
          item.isPickup = true;
          pickupIndex++;
          team.weeklyPickups[week]++;

          if (pickupIndex > config.freePickupsCount) {
            item.charge = config.pickupCost;
          }
        }
      }
    });

    team.pickupCount = pickupIndex;
    team.paidPickupsCount = Math.max(0, pickupIndex - config.freePickupsCount);
    team.pickupDues = team.paidPickupsCount * config.pickupCost;
    team.sharedDues = sharedDuesPerTeam;

    // Team specific dues
    team.specificDues = 0;
    if (config.teamDues && config.teamDues[team.name]) {
      config.teamDues[team.name].forEach(item => {
        team.specificDues += item.amount;
      });
    }

    // Adjustments
    team.adjustments = 0;
    if (config.teamAdjustments && config.teamAdjustments[team.name]) {
      config.teamAdjustments[team.name].forEach(item => {
        team.adjustments += item.amount;
      });
    }

    team.totalDue = config.buyInCost + team.pickupDues + team.sharedDues + team.specificDues + team.adjustments;
    teamList.push(team);
  });

  // Sort Leaderboard: Higher dues first
  teamList.sort((a, b) => b.totalDue - a.totalDue);

  // Update Summary numbers
  let grandTotalPot = teamList.reduce((acc, curr) => acc + curr.totalDue, 0);
  let grandTotalPickups = teamList.reduce((acc, curr) => acc + curr.pickupCount, 0);

  potValue.textContent = `$${grandTotalPot.toFixed(2)}`;
  totalPickupsValue.textContent = grandTotalPickups.toString();

  const firstPct = config.payouts.firstPlacePercent;
  const secondPct = config.payouts.secondPlacePercent;
  const champAmt = grandTotalPot * (firstPct / 100);
  const runnerAmt = grandTotalPot * (secondPct / 100);

  const payoutPills = document.getElementById('payout-pills');
  if (payoutPills) {
    payoutPills.innerHTML = `
      <div class="payout-row champ-text" style="font-size: 1.15rem; font-weight: 800;">$${champAmt.toFixed(2)}</div>
      <div class="payout-row runner-text" style="font-size: 0.85rem; font-weight: 600; opacity: 0.8; margin-top: 0.15rem;">$${runnerAmt.toFixed(2)}</div>
    `;
  }

  // Render Dues Leaderboard or Rollup View
  renderActiveView(teamList, standings);

  // Render Weekly Timeline Chart
  renderWeeklyChart(teamList);
}

function renderActiveView(teamList, standings) {
  renderTableHeader();
  const rollupFilterContainer = document.getElementById('rollup-filters-container');
  
  if (activeView === "rollup") {
    if (rollupFilterContainer) {
      rollupFilterContainer.style.display = "flex";
      buildRollupFilters();
    }
    renderRollupTable();
  } else {
    if (rollupFilterContainer) {
      rollupFilterContainer.style.display = "none";
    }
    renderDuesLeaderboardGrouped(teamList, standings);
  }
}

function renderTableHeader() {
  const thead = duesTableElement.querySelector('thead');
  if (activeView === 'rollup') {
    thead.innerHTML = `
      <tr>
        <th>NFL Week</th>
        <th>Timestamp</th>
        <th>Franchise</th>
        <th style="text-align: left; width: 180px;">Action</th>
        <th>Player Details</th>
        <th>Cost</th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th>Rank</th>
        <th>Franchise Name</th>
        <th>Pickups</th>
        <th>Total Due</th>
        <th>Weekly Trend</th>
        <th>Adjustments</th>
      </tr>
    `;
  }
}

// Render Dues Leaderboard grouped by Division
function renderDuesLeaderboardGrouped(teamList, standings) {
  duesTbody.innerHTML = '';

  if (standings && standings.divisions && standings.divisions.length > 0) {
    // Render grouped by divisions
    standings.divisions.forEach(division => {
      let divClass = "div-generic";
      if (division.name.toLowerCase().includes("jedi")) {
        divClass = "div-jedi";
      } else if (division.name.toLowerCase().includes("sith")) {
        divClass = "div-sith";
      } else if (division.name.toLowerCase().includes("first order") || division.name.toLowerCase().includes("order")) {
        divClass = "div-firstorder";
      }

      const headerTr = document.createElement('tr');
      headerTr.className = `division-header-row ${divClass}`;
      headerTr.innerHTML = `<td colspan="6"><span class="division-title">${division.name} Division</span></td>`;
      duesTbody.appendChild(headerTr);

      // Filter and sort teams in this division
      const divTeamIds = new Set(division.teams.map(t => t.id));
      const divTeams = teamList.filter(t => divTeamIds.has(t.id));

      const getRank = (name) => {
        const matched = division.teams.find(t => t.name === name);
        return matched && matched.recordOverall ? matched.recordOverall.rank : 99;
      };
      divTeams.sort((a, b) => getRank(a.name) - getRank(b.name));

      divTeams.forEach((team, index) => {
        renderTeamRow(team, getRank(team.name));
      });
    });
  } else {
    // Fallback: render flat list if standings are missing
    const headerTr = document.createElement('tr');
    headerTr.className = "division-header-row div-generic";
    headerTr.innerHTML = `<td colspan="6"><span class="division-title">All Franchises</span></td>`;
    duesTbody.appendChild(headerTr);

    teamList.forEach((team, index) => {
      renderTeamRow(team, index + 1);
    });
  }
}

// Render a single team row in leaderboard showing a column bar style chart sparkline
function renderTeamRow(team, rank) {
  const tr = document.createElement('tr');
  
  // Column bar style sparkline generation (19 values mapped inside 260x40 SVG)
  let sparklineSVG = '';
  if (team.weeklyPickups) {
    const maxVal = Math.max(...team.weeklyPickups, 1);
    const colWidth = 20; // twice as wide to show all weeks
    const gap = 6;      // twice as wide to show all weeks
    const totalW = 19 * (colWidth + gap) - gap; // 19 * 26 - 6 = 488px
    const paddingX = (520 - totalW) / 2;       // (520 - 488) / 2 = 16px
    
    const barsHTML = [];
    for (let w = 1; w <= 19; w++) {
      const val = team.weeklyPickups[w] || 0;
      const barHeight = val > 0 ? Math.max((val / maxVal) * 30, 6) : 2.5; // 2.5px placeholder for zero, min 6px for >= 1
      const x = paddingX + (w - 1) * (colWidth + gap);
      const y = 38 - barHeight;
      
      // Collect specific player pickups made during this week
      const weeklyPlayers = team.history
        .filter(item => item.nflWeek === w && item.isPickup)
        .map(item => {
          if (item.transaction && item.transaction.player && item.transaction.player.proPlayer) {
            const p = item.transaction.player.proPlayer;
            return `+ ${p.nameFull} - ${p.position} - ${p.proTeamAbbreviation}`;
          }
          return "";
        })
        .filter(Boolean);

      let tooltipText = `${getWeekName(w)}: ${val} pickups`;
      if (weeklyPlayers.length > 0) {
        tooltipText += `\n` + weeklyPlayers.join(`\n`);
      }
      
      const rectColor = val > 0 ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.12)';
      const shadowFilter = val > 0 ? 'filter: drop-shadow(0 0 2px var(--accent-cyan));' : '';
      
      barsHTML.push(`
        <g>
          <rect class="sparkbar-rect" x="${x}" y="${y}" width="${colWidth}" height="${barHeight}" fill="${rectColor}" rx="1.5" style="${shadowFilter} transition: all 0.2s;"></rect>
          <rect class="sparkbar-hover-area" x="${x}" y="2" width="${colWidth}" height="36" fill="transparent" style="cursor:pointer;" data-tooltip="${tooltipText.replace(/'/g, "&apos;").replace(/"/g, "&quot;")}" onmouseover="showChartTooltipFromData(event)" onmouseout="hideChartTooltip()"></rect>
        </g>
      `);
    }

    sparklineSVG = `
      <svg class="sparkline-svg" viewBox="0 0 520 40" width="100%" height="40">
        ${barsHTML.join('')}
      </svg>
    `;
  }

  const netAdjustments = team.adjustments + team.specificDues;
  const sign = netAdjustments >= 0 ? '+' : '';
  let adjClass = 'val-bold';
  if (netAdjustments < 0) adjClass += ' val-adjust-neg';
  else if (netAdjustments > 0) adjClass += ' val-adjust-pos';

  // Get current record from standings response
  let recordStr = "—";
  if (rawData.standings && rawData.standings[selectedYear]) {
    const divTeams = rawData.standings[selectedYear].divisions.flatMap(d => d.teams);
    const matched = divTeams.find(t => t.name === team.name);
    if (matched && matched.recordOverall) {
      recordStr = `${matched.recordOverall.wins}-${matched.recordOverall.losses}`;
      if (matched.recordOverall.ties > 0) {
        recordStr += `-${matched.recordOverall.ties}`;
      }
      recordStr = `(Rank #${matched.recordOverall.rank}, ${recordStr})`;
    }
  }

  // Get championships count
  let championshipsHTML = '';
  const stats = config.teamHistoricalStats && config.teamHistoricalStats[team.name];
  if (stats && stats.championships > 0) {
    championshipsHTML = ` <span style="cursor:help;" title="${stats.championships} championships">🏆 x${stats.championships}</span>`;
  }

  // Prepend Trophy for Rank 1 / Butt for Rank 12
  let trophyOrButt = '';
  if (rank === 1) {
    trophyOrButt = '<span style="font-size: 1.15rem; margin-right: 0.35rem; vertical-align: middle; cursor: help;" title="Champ!">🏆</span>';
  } else if (rank === 12) {
    trophyOrButt = '<span style="font-size: 1.15rem; margin-right: 0.35rem; vertical-align: middle; cursor: help;" title="🫱( ‿ * ‿ )🫲">🍑</span>';
  }

  tr.innerHTML = `
    <td><span class="val-bold">${rank}</span></td>
    <td>
      ${trophyOrButt}<span class="team-name-link" onclick="openAuditModal('${encodeURIComponent(team.name).replace(/'/g, "%27")}')">${team.name}</span>
      ${championshipsHTML}
      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem;">${recordStr}</div>
    </td>
    <td>
      <span class="val-bold">${team.paidPickupsCount}</span> 
      <span style="font-size:0.8rem; color:var(--text-muted);">(${team.pickupCount} total)</span>
      <div style="font-size:0.8rem; color:var(--text-secondary);">$${team.pickupDues.toFixed(2)}</div>
    </td>
    <td><span class="val-due">$${team.totalDue.toFixed(2)}</span></td>
    <td>${sparklineSVG}</td>
    <td><span class="${adjClass}">${sign}$${netAdjustments.toFixed(2)}</span></td>
  `;
  duesTbody.appendChild(tr);
}

// ----------------------------------------------------
// 5. ROLLUP VIEW RENDERING
// ----------------------------------------------------
function buildRollupFilters() {
  const container = document.getElementById('rollup-filter-buttons');
  if (!container) return;
  
  container.innerHTML = `
    <button class="filter-chip ${rollupFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
    <span class="filter-separator">|</span>
    <button class="filter-chip ${rollupFilter === 'Additions' ? 'active' : ''}" data-filter="Additions">Additions</button>
    <button class="filter-chip ${rollupFilter === 'Drops' ? 'active' : ''}" data-filter="Drops">Drops</button>
    <button class="filter-chip ${rollupFilter === 'Imports' ? 'active' : ''}" data-filter="Imports">Imports</button>
    <span class="filter-separator">|</span>
    <button class="filter-chip ${rollupFilter === 'Claims' ? 'active' : ''}" data-filter="Claims">Claims</button>
    <button class="filter-chip ${rollupFilter === 'Adds' ? 'active' : ''}" data-filter="Adds">Adds</button>
    <button class="filter-chip ${rollupFilter === 'Trades' ? 'active' : ''}" data-filter="Trades">Trades</button>
  `;
  
  // Bind click handlers to rebuild rollup on filter selection
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      rollupFilter = e.target.getAttribute('data-filter');
      buildRollupFilters();
      renderRollupTable();
    });
  });
}

function renderRollupTable() {
  duesTbody.innerHTML = '';
  const allTx = [];

  const season = processedData[selectedYear];
  if (season && season.teams) {
    Object.values(season.teams).forEach(team => {
      team.history.forEach(item => {
        if (item.transaction) {
          // Clone item to attach teamName safely
          const txItem = { ...item, teamName: team.name };
          allTx.push(txItem);
        }
      });
    });
  }

  // Filter rollup list
  const filteredTx = allTx.filter(item => {
    if (rollupFilter === 'all') return true;
    if (!item.transaction) return false;

    let type = item.transaction.type || "";
    if (type === "") {
      type = "TRANSACTION_ADD";
    }

    // Chunk 2: Groupings
    if (rollupFilter === 'Additions') return type === 'TRANSACTION_CLAIM' || type === 'TRANSACTION_ADD';
    if (rollupFilter === 'Drops') return type === 'TRANSACTION_DROP';
    if (rollupFilter === 'Imports') return type === 'TRANSACTION_IMPORT';

    // Chunk 3: Specific Actions
    if (rollupFilter === 'Claims') return type === 'TRANSACTION_CLAIM';
    if (rollupFilter === 'Adds') return type === 'TRANSACTION_ADD';
    if (rollupFilter === 'Trades') return type === 'TRANSACTION_TRADE';
    
    return false;
  });

  // Real-time search query matching
  const searchInput = document.getElementById('rollup-search-input');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  
  const searchedTx = filteredTx.filter(item => {
    if (!query) return true;
    
    const teamName = (item.teamName || "").toLowerCase();
    const weekVal = item.nflWeek || 1;
    const weekName = getWeekName(weekVal).toLowerCase(); // e.g. "week 17"
    const weekNumStr = weekVal.toString();
    
    let dateFinal = "";
    if (item.timeEpochMilli) {
      const d = new Date(parseInt(item.timeEpochMilli));
      const dateLongStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toLowerCase();
      const dateShortStr = d.toLocaleDateString().toLowerCase();
      dateFinal = `${dateShortStr} ${dateLongStr} ${d.toLocaleTimeString()}`.toLowerCase();
    }
    
    let actionLabel = "other";
    let type = item.transaction.type || "";
    if (type === "") type = "TRANSACTION_ADD";
    if (type === "TRANSACTION_CLAIM" || type === "TRANSACTION_ADD") {
      actionLabel = type === "TRANSACTION_CLAIM" ? "claim" : "add";
    } else if (type === "TRANSACTION_DROP") {
      actionLabel = "drop";
    } else if (type === "TRANSACTION_TRADE") {
      actionLabel = "trade";
    } else if (type === "TRANSACTION_IMPORT") {
      actionLabel = "import";
    } else if (type === "TRANSACTION_DRAFT") {
      actionLabel = "draft";
    }

    let playerDetails = "";
    if (item.transaction.player && item.transaction.player.proPlayer) {
      const p = item.transaction.player.proPlayer;
      playerDetails = `${p.nameFull} ${p.position} ${p.proTeamAbbreviation}`.toLowerCase();
    }

    return (
      teamName.includes(query) ||
      weekName.includes(query) ||
      weekNumStr === query ||
      dateFinal.includes(query) ||
      actionLabel.includes(query) ||
      playerDetails.includes(query)
    );
  });

  // Sort descending by timestamp (newest first)
  searchedTx.sort((a, b) => parseInt(b.timeEpochMilli) - parseInt(a.timeEpochMilli));

  if (searchedTx.length === 0) {
    duesTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No transaction rollup logs found for this search</td></tr>';
    return;
  }

  // Alternating week background colors
  let currentWeekVal = null;
  let weekColorToggle = false;

  searchedTx.forEach(item => {
    const tr = document.createElement('tr');
    const week = item.nflWeek || 1;

    if (currentWeekVal === null) {
      currentWeekVal = week;
      weekColorToggle = true;
    } else if (currentWeekVal !== week) {
      currentWeekVal = week;
      weekColorToggle = !weekColorToggle;
    }

    tr.className = weekColorToggle ? 'week-bg-color-a' : 'week-bg-color-b';

    let dateStr = "—";
    if (item.timeEpochMilli) {
      const d = new Date(parseInt(item.timeEpochMilli));
      dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    let pDetails = "—";
    if (item.transaction.player && item.transaction.player.proPlayer) {
      const p = item.transaction.player.proPlayer;
      pDetails = `${p.nameFull} (${p.position}, ${p.proTeamAbbreviation})`;
    }

    let costLabel = "—";
    let costClass = "";
    if (item.isPickup) {
      if (item.charge > 0) {
        costLabel = `$${item.charge.toFixed(2)}`;
        costClass = "val-bold";
      } else {
        costLabel = "FREE (Initial)";
        costClass = "audit-charge-free";
      }
    }

    tr.innerHTML = `
      <td style="font-family:var(--font-code); font-weight:700; color:var(--text-primary);">${getWeekName(week)}</td>
      <td style="color:var(--text-secondary);">${dateStr}</td>
      <td>
        <span class="team-name-link" onclick="openAuditModal('${encodeURIComponent(item.teamName).replace(/'/g, "%27")}')">${item.teamName}</span>
      </td>
      <td style="text-align:left;">${getActionLightsaberIcon(item, true)}</td>
      <td style="font-weight:600;">${pDetails}</td>
      <td><span class="${costClass}">${costLabel}</span></td>
    `;
    duesTbody.appendChild(tr);
  });
}

// Render Weekly Timeline SVG Bar Chart
function renderWeeklyChart(teamList) {
  const weeklyPickups = Array(20).fill(0);
  teamList.forEach(t => {
    if (t.weeklyPickups) {
      for (let w = 1; w <= 19; w++) {
        weeklyPickups[w] += t.weeklyPickups[w] || 0;
      }
    }
  });

  const maxVal = Math.max(...weeklyPickups, 1);
  
  let svgContent = `
    <svg width="100%" height="100%" viewBox="0 0 760 130" preserveAspectRatio="none">
      <defs>
        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-cyan)" />
          <stop offset="50%" stop-color="var(--accent-purple)" />
          <stop offset="100%" stop-color="var(--accent-coral)" />
        </linearGradient>
      </defs>
      <line class="chart-grid-line" x1="40" y1="15" x2="740" y2="15"></line>
      <line class="chart-grid-line" x1="40" y1="55" x2="740" y2="55"></line>
      <line class="chart-grid-line" x1="40" y1="95" x2="740" y2="95"></line>
  `;

  svgContent += `
    <text class="chart-text" x="10" y="20">${maxVal}</text>
    <text class="chart-text" x="10" y="60">${Math.floor(maxVal/2)}</text>
    <text class="chart-text" x="10" y="100">0</text>
  `;

  const paddingX = 40;
  const colWidth = 28;
  const gap = 8;

  for (let w = 1; w <= 19; w++) {
    const val = weeklyPickups[w] || 0;
    const barHeight = val > 0 ? (val / maxVal) * 85 : 0;
    const x = paddingX + (w - 1) * (colWidth + gap);
    const y = 95 - barHeight;

    let weekAdditionsSum = 0;
    teamList.forEach(t => {
      let preWeekPickups = 0;
      for (let p = 1; p < w; p++) {
        preWeekPickups += t.weeklyPickups[p] || 0;
      }
      for (let k = 0; k < (t.weeklyPickups[w] || 0); k++) {
        const totalIdx = preWeekPickups + k + 1;
        if (totalIdx > config.freePickupsCount) {
          weekAdditionsSum += config.pickupCost;
        }
      }
    });

    const weekLabel = w === 19 ? 'Post' : `W${w}`;
    const tooltipText = `${getWeekName(w)}: ${val} Pickups (+$${weekAdditionsSum.toFixed(2)})`;

    svgContent += `
      <g class="chart-bar-group" onmouseover="showChartTooltip(event, '${tooltipText}')" onmouseout="hideChartTooltip()">
        <rect class="chart-hover-area" x="${x}" y="10" width="${colWidth}" height="100" fill="transparent" style="cursor:pointer;"></rect>
        ${val > 0 ? `<rect class="chart-bar-rect" x="${x}" y="${y}" width="${colWidth}" height="${barHeight}"></rect>` : ''}
        <text class="chart-text-week" x="${x + colWidth/2}" y="115">${weekLabel}</text>
      </g>
    `;
  }

  svgContent += `</svg>`;
  timelineChartElement.innerHTML = svgContent;
}

// ----------------------------------------------------
// 6. INTERACTIVE TIMELINE TOOLTIPS
// ----------------------------------------------------
let chartTooltipEl;
window.showChartTooltip = function(event, text) {
  if (!chartTooltipEl) {
    chartTooltipEl = document.createElement('div');
    chartTooltipEl.className = 'chart-tooltip';
    document.body.appendChild(chartTooltipEl);
  }
  chartTooltipEl.innerHTML = text.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
  chartTooltipEl.style.display = 'block';
  chartTooltipEl.style.left = (event.pageX + 10) + 'px';
  chartTooltipEl.style.top = (event.pageY - 30) + 'px';
};

window.showChartTooltipFromData = function(event) {
  const target = event.currentTarget;
  const tooltipText = target.getAttribute('data-tooltip') || "";
  showChartTooltip(event, tooltipText);
};

window.hideChartTooltip = function() {
  if (chartTooltipEl) {
    chartTooltipEl.style.display = 'none';
  }
};

// ----------------------------------------------------
// 7. YEAR TABS GENERATOR (DYNAMIC)
// ----------------------------------------------------
function buildYearTabs() {
  const yearSelectorContainer = document.getElementById('year-selector-container');
  const viewSelectorContainer = document.getElementById('view-selector-container');
  
  if (!yearSelectorContainer || !viewSelectorContainer) return;
  
  yearSelectorContainer.innerHTML = '';
  viewSelectorContainer.innerHTML = '';

  if (yearList.length === 0) return;

  // Render year selectors into yearSelectorContainer
  const mainTabs = yearList.slice(0, 3);
  mainTabs.forEach(year => {
    const btn = document.createElement('button');
    btn.className = `year-tab-btn ${year.toString() === selectedYear ? 'active' : ''}`;
    btn.textContent = year.toString() === yearList[0].toString() ? `${year} (Current)` : year.toString();
    btn.addEventListener('click', () => {
      selectYearTab(year.toString());
    });
    yearSelectorContainer.appendChild(btn);
  });

  // Older years are grouped into a dropdown tab
  const olderTabs = yearList.slice(3);
  if (olderTabs.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = "year-dropdown-wrap";
    wrap.id = "older-years-dropdown";

    const btn = document.createElement('button');
    const isOlderSelected = olderTabs.map(String).includes(selectedYear);
    btn.className = `year-tab-btn ${isOlderSelected ? 'active' : ''}`;
    btn.innerHTML = `${isOlderSelected ? selectedYear : 'Older Seasons'} ▾`;

    const menu = document.createElement('div');
    menu.className = "year-dropdown-menu";

    olderTabs.forEach(year => {
      const item = document.createElement('button');
      item.className = `year-dropdown-item ${year.toString() === selectedYear ? 'active' : ''}`;
      item.textContent = year.toString();
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.classList.remove('active');
        selectYearTab(year.toString());
      });
      menu.appendChild(item);
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      wrap.classList.remove('active');
    });

    yearSelectorContainer.appendChild(wrap);
  }

  // Render view selectors (Dues / Rollup View) into viewSelectorContainer
  const duesBtn = document.createElement('button');
  duesBtn.className = `year-tab-btn ${activeView === 'dues' ? 'active' : ''}`;
  duesBtn.textContent = "Dues";
  duesBtn.addEventListener('click', () => {
    activeView = "dues";
    buildYearTabs();
    recalculateAll();
  });
  viewSelectorContainer.appendChild(duesBtn);

  const rollupBtn = document.createElement('button');
  rollupBtn.className = `year-tab-btn ${activeView === 'rollup' ? 'active' : ''}`;
  rollupBtn.textContent = "Rollup View";
  rollupBtn.addEventListener('click', () => {
    activeView = "rollup";
    buildYearTabs();
    recalculateAll();
  });
  viewSelectorContainer.appendChild(rollupBtn);
}

function selectYearTab(year) {
  if (selectedYear === year) return;
  selectedYear = year;
  
  triggerHyperspaceJump();
  buildYearTabs();
  recalculateAll();
}

// ----------------------------------------------------
// 8. TEAM AUDIT LOG & MODAL
// ----------------------------------------------------
let currentAuditTeam = "";
let currentAuditFilter = "all";

window.openAuditModal = function(encodedTeamName) {
  const teamName = decodeURIComponent(encodedTeamName);
  currentAuditTeam = teamName;
  currentAuditFilter = "all";

  document.querySelectorAll('#audit-filter-buttons button').forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('data-filter') === 'all') b.classList.add('active');
  });

  populateAuditData();
  auditModal.classList.add('active');
};

function populateAuditData() {
  const standings = rawData.standings && rawData.standings[selectedYear];
  
  // Find team details
  let team = null;
  const season = processedData[selectedYear];
  if (season && season.teams[currentAuditTeam]) {
    team = season.teams[currentAuditTeam];
  } else if (standings) {
    // If team has no transactions, create placeholder from standings list
    const divTeams = standings.divisions.flatMap(d => d.teams);
    const matched = divTeams.find(t => t.name === currentAuditTeam);
    if (matched) {
      team = {
        id: matched.id,
        name: matched.name,
        claims: 0,
        adds: 0,
        trades: 0,
        drops: 0,
        reserves: 0,
        total: 0,
        pickups: 0,
        paidPickupsCount: 0,
        pickupDues: 0,
        sharedDues: (config.globalDues || []).reduce((acc, curr) => acc + curr.amount, 0) / divTeams.length,
        specificDues: 0,
        adjustments: 0,
        totalDue: config.buyInCost + ((config.globalDues || []).reduce((acc, curr) => acc + curr.amount, 0) / divTeams.length),
        history: []
      };
      
      // Merge specific dues/adjustments
      if (config.teamDues && config.teamDues[team.name]) {
        config.teamDues[team.name].forEach(item => team.totalDue += item.amount);
      }
      if (config.teamAdjustments && config.teamAdjustments[team.name]) {
        config.teamAdjustments[team.name].forEach(item => {
          team.adjustments += item.amount;
          team.totalDue += item.amount;
        });
      }
    }
  }

  if (!team) return;

  modalTeamTitle.textContent = team.name;

  // Standings Record (Current Year)
  let recordStr = "Record: —";
  if (standings) {
    const divTeams = standings.divisions.flatMap(d => d.teams);
    const matched = divTeams.find(t => t.name === team.name);
    if (matched && matched.recordOverall) {
      recordStr = `Record: ${matched.recordOverall.wins}-${matched.recordOverall.losses} (Rank #${matched.recordOverall.rank})`;
    }
  }
  document.getElementById('modal-team-record-year').textContent = `${selectedYear} ${recordStr}`;

  // All-Time Record & Championships finish totals
  let totalWins = 0, totalLosses = 0, totalTies = 0;
  const hist = config.teamHistoricalStats && config.teamHistoricalStats[team.name];
  if (hist) {
    totalWins = hist.wins || 0;
    totalLosses = hist.losses || 0;
    totalTies = hist.ties || 0;
  }

  // Get owner info for current audit team to track name changes
  let currentOwnerIds = new Set();
  let currentOwnerNames = new Set();
  
  if (rawData.standings && rawData.standings[selectedYear]) {
    const allDivTeams = rawData.standings[selectedYear].divisions.flatMap(d => d.teams);
    const matched = allDivTeams.find(t => t.name === team.name);
    if (matched && matched.owners) {
      matched.owners.forEach(ow => {
        if (ow.id) currentOwnerIds.add(ow.id);
        if (ow.displayName) currentOwnerNames.add(ow.displayName.toLowerCase());
      });
    }
  }

  // Count finishes where standing rank was 1 (championships) dynamically in cache
  let standingsChampionships = 0;
  if (rawData.standings) {
    Object.values(rawData.standings).forEach(std => {
      const allDivTeams = std.divisions.flatMap(d => d.teams);
      
      // Match current team by owner ID or name to add wins/losses for all-time record
      const matched = allDivTeams.find(t => {
        if (t.owners) {
          return t.owners.some(ow => 
            (ow.id && currentOwnerIds.has(ow.id)) || 
            (ow.displayName && currentOwnerNames.has(ow.displayName.toLowerCase()))
          );
        }
        return t.name === team.name;
      });

      if (matched && matched.recordOverall) {
        totalWins += matched.recordOverall.wins;
        totalLosses += matched.recordOverall.losses;
        totalTies += matched.recordOverall.ties;
      }

      // Check champion of the season (Rank 1)
      if (std.season < 2026) {
        const champTeam = allDivTeams.find(t => t.recordOverall && t.recordOverall.rank === 1);
        if (champTeam) {
          let isOwnerMatch = false;
          if (champTeam.owners) {
            isOwnerMatch = champTeam.owners.some(ow => 
              (ow.id && currentOwnerIds.has(ow.id)) || 
              (ow.displayName && currentOwnerNames.has(ow.displayName.toLowerCase()))
            );
          }
          if (!isOwnerMatch && currentOwnerIds.size === 0 && champTeam.name === team.name) {
            isOwnerMatch = true;
          }
          if (isOwnerMatch) {
            standingsChampionships++;
          }
        }
      }
    });
  }

  const finalChampionshipsCount = (hist ? (hist.championships || 0) : 0) + standingsChampionships;
  if (finalChampionshipsCount > 0) {
    document.getElementById('modal-championships-badge').textContent = `🏆 ${finalChampionshipsCount} Championships`;
    document.getElementById('modal-championships-badge').style.display = 'inline-block';
  } else {
    document.getElementById('modal-championships-badge').style.display = 'none';
  }

  document.getElementById('modal-team-record-alltime').textContent = `All-Time Record: ${totalWins}-${totalLosses}-${totalTies}`;

  // Money breakdown cards
  document.getElementById('audit-buy-in').textContent = `$${(config.buyInCost || 0).toFixed(2)}`;
  document.getElementById('audit-waiver-cost').textContent = `$${(team.pickupDues || 0).toFixed(2)}`;
  document.getElementById('audit-shared-cost').textContent = `$${(team.sharedDues || 0).toFixed(2)}`;
  
  const netAdj = (team.adjustments || 0) + (team.specificDues || 0);
  const adjEl = document.getElementById('audit-adj-cost');
  adjEl.textContent = `${netAdj >= 0 ? '+' : ''}$${netAdj.toFixed(2)}`;
  if (netAdj < 0) {
    adjEl.style.color = 'var(--accent-green)';
  } else if (netAdj > 0) {
    adjEl.style.color = 'var(--accent-coral)';
  } else {
    adjEl.style.color = 'var(--text-primary)';
  }

  document.getElementById('audit-total-due').textContent = `$${(team.totalDue || 0).toFixed(2)}`;

  // Populate chronological history log (newest first)
  const auditTbody = document.getElementById('audit-tbody');
  auditTbody.innerHTML = '';

  const filteredHistory = team.history.filter(item => {
    if (currentAuditFilter === 'all') return true;
    if (!item.transaction) return false; // Exclude reserves from filter chips

    let type = item.transaction.type || "";
    if (type === "") {
      type = "TRANSACTION_ADD";
    }

    // Chunk 2: Groupings
    if (currentAuditFilter === 'Additions') return type === 'TRANSACTION_CLAIM' || type === 'TRANSACTION_ADD';
    if (currentAuditFilter === 'Drops') return type === 'TRANSACTION_DROP';
    if (currentAuditFilter === 'Imports') return type === 'TRANSACTION_IMPORT';

    // Chunk 3: Specific Actions
    if (currentAuditFilter === 'Claims') return type === 'TRANSACTION_CLAIM';
    if (currentAuditFilter === 'Adds') return type === 'TRANSACTION_ADD';
    if (currentAuditFilter === 'Trades') return type === 'TRANSACTION_TRADE';
    
    return false;
  });

  const descHistory = [...filteredHistory].reverse();

  if (descHistory.length === 0) {
    auditTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching transaction items found</td></tr>';
    return;
  }

  // Alternating week background colors
  let currentWeekVal = null;
  let weekColorToggle = false;

  descHistory.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    const week = item.nflWeek || 1;
    if (currentWeekVal === null) {
      currentWeekVal = week;
      weekColorToggle = true;
    } else if (currentWeekVal !== week) {
      currentWeekVal = week;
      weekColorToggle = !weekColorToggle;
    }

    tr.className = weekColorToggle ? 'week-bg-color-a' : 'week-bg-color-b';

    let dateStr = "Unknown";
    if (item.timeEpochMilli) {
      const d = new Date(parseInt(item.timeEpochMilli));
      dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    let pDetails = "—";
    let costLabel = "—";
    let costClass = "";

    if (item.transaction) {
      if (item.transaction.player && item.transaction.player.proPlayer) {
        const p = item.transaction.player.proPlayer;
        pDetails = `${p.nameFull} (${p.position}, ${p.proTeamAbbreviation})`;
      }

      let type = item.transaction.type || "";
      if (type === "") {
        type = "TRANSACTION_ADD";
      }
      if (type === 'TRANSACTION_CLAIM' || type === 'TRANSACTION_ADD') {
        if (item.charge > 0) {
          costLabel = `$${item.charge.toFixed(2)}`;
          costClass = "val-bold";
        } else {
          costLabel = "FREE (Initial)";
          costClass = "audit-charge-free";
        }
      }
    }

    tr.innerHTML = `
      <td>${descHistory.length - index}</td>
      <td style="font-family:var(--font-code); font-weight:700; color:var(--text-primary);">${getWeekName(week)}</td>
      <td style="color:var(--text-secondary);">${dateStr}</td>
      <td style="text-align: left;">${getActionLightsaberIcon(item, true)}</td>
      <td style="font-weight:600;">${pDetails}</td>
      <td><span class="${costClass}">${costLabel}</span></td>
    `;
    auditTbody.appendChild(tr);
  });
}

function closeAuditModal() {
  auditModal.classList.remove('active');
}

// ----------------------------------------------------
// 9. ADMIN SETTINGS OVERLAYS
// ----------------------------------------------------
function openSettingsModal() {
  inputBuyIn.value = config.buyInCost;
  inputPickupCost.value = config.pickupCost;
  inputFreePickups.value = config.freePickupsCount;
  inputFirstSplit.value = config.payouts.firstPlacePercent;
  inputSecondSplit.value = config.payouts.secondPlacePercent;

  renderGlobalDuesList();
  renderTeamAdjustmentsList();
  populateTeamSelector();
  
  settingsModal.classList.add('active');
}

function closeSettingsModal() {
  settingsModal.classList.remove('active');
}

function populateTeamSelector() {
  selectAdjTeam.innerHTML = '';
  const allTeamNamesSet = new Set();
  Object.values(rawData.standings || {}).forEach(std => {
    std.divisions.flatMap(d => d.teams).forEach(t => allTeamNamesSet.add(t.name));
  });
  Object.values(processedData).forEach(season => {
    Object.keys(season.teams).forEach(name => allTeamNamesSet.add(name));
  });

  const sortedNames = Array.from(allTeamNamesSet).sort();
  sortedNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectAdjTeam.appendChild(opt);
  });
  
  loadSelectedTeamStats();
}

function loadSelectedTeamStats() {
  const team = selectAdjTeam.value;
  if (!team) return;

  const stats = config.teamHistoricalStats && config.teamHistoricalStats[team] || { championships: 0, wins: 0, losses: 0, ties: 0 };
  document.getElementById('input-stats-champs').value = stats.championships || 0;
  document.getElementById('input-stats-wins').value = stats.wins || 0;
  document.getElementById('input-stats-losses').value = stats.losses || 0;
}

function renderGlobalDuesList() {
  globalDuesList.innerHTML = '';
  if (!config.globalDues) config.globalDues = [];

  config.globalDues.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${item.description}</span>
      <div>
        <span class="item-val">$${item.amount.toFixed(2)}</span>
        <button class="delete-item" onclick="deleteGlobalDue(${index})">&times;</button>
      </div>
    `;
    globalDuesList.appendChild(li);
  });
}

function renderTeamAdjustmentsList() {
  teamAdjustmentsList.innerHTML = '';
  if (!config.teamAdjustments) config.teamAdjustments = {};

  Object.entries(config.teamAdjustments).forEach(([teamName, list]) => {
    list.forEach((item, index) => {
      const li = document.createElement('li');
      const sign = item.amount >= 0 ? '+' : '';
      li.innerHTML = `
        <span><strong>${teamName}</strong>: ${item.description}</span>
        <div>
          <span class="item-val ${item.amount < 0 ? 'val-adjust-neg' : 'val-adjust-pos'}">${sign}$${item.amount.toFixed(2)}</span>
          <button class="delete-item" onclick="deleteTeamAdjustment('${teamName}', ${index})">&times;</button>
        </div>
      `;
      teamAdjustmentsList.appendChild(li);
    });
  });
}

window.deleteGlobalDue = function(index) {
  config.globalDues.splice(index, 1);
  renderGlobalDuesList();
};

window.deleteTeamAdjustment = function(teamName, index) {
  config.teamAdjustments[teamName].splice(index, 1);
  if (config.teamAdjustments[teamName].length === 0) {
    delete config.teamAdjustments[teamName];
  }
  renderTeamAdjustmentsList();
};

// ----------------------------------------------------
// 10. LISTENERS SETUP
// ----------------------------------------------------
function setupEventListeners() {
  document.getElementById('btn-open-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-close-settings').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-modal-overlay').addEventListener('click', closeSettingsModal);

  document.getElementById('btn-close-modal').addEventListener('click', closeAuditModal);
  document.getElementById('modal-overlay').addEventListener('click', closeAuditModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAuditModal();
      closeSettingsModal();
    }
  });

  const subTabs = [
    { buttonId: 'sub-tab-adjust', panelId: 'sub-panel-adjust' },
    { buttonId: 'sub-tab-stats', panelId: 'sub-panel-stats' }
  ];
  subTabs.forEach(st => {
    document.getElementById(st.buttonId).addEventListener('click', (e) => {
      subTabs.forEach(tab => {
        document.getElementById(tab.buttonId).classList.remove('active');
        document.getElementById(tab.panelId).classList.remove('active');
      });
      e.target.classList.add('active');
      document.getElementById(st.panelId).classList.add('active');
    });
  });

  selectAdjTeam.addEventListener('change', loadSelectedTeamStats);

  // Save Stats button
  document.getElementById('btn-save-stats').addEventListener('click', () => {
    const team = selectAdjTeam.value;
    if (!team) return;

    if (!config.teamHistoricalStats) config.teamHistoricalStats = {};
    config.teamHistoricalStats[team] = {
      championships: parseInt(document.getElementById('input-stats-champs').value) || 0,
      wins: parseInt(document.getElementById('input-stats-wins').value) || 0,
      losses: parseInt(document.getElementById('input-stats-losses').value) || 0,
      ties: 0
    };
    alert(`Saved historical stats for ${team}!`);
  });

  btnAddGlobal.addEventListener('click', () => {
    const desc = inputGlobalDesc.value.trim();
    const amount = parseFloat(inputGlobalAmount.value);
    if (desc && !isNaN(amount) && amount >= 0) {
      if (!config.globalDues) config.globalDues = [];
      config.globalDues.push({ description: desc, amount: amount });
      inputGlobalDesc.value = '';
      inputGlobalAmount.value = '';
      renderGlobalDuesList();
    }
  });

  btnAddAdj.addEventListener('click', () => {
    const team = selectAdjTeam.value;
    const desc = inputAdjDesc.value.trim();
    const amount = parseFloat(inputAdjAmount.value);
    if (team && desc && !isNaN(amount)) {
      if (!config.teamAdjustments) config.teamAdjustments = {};
      if (!config.teamAdjustments[team]) config.teamAdjustments[team] = [];
      config.teamAdjustments[team].push({ description: desc, amount: amount });
      inputAdjDesc.value = '';
      inputAdjAmount.value = '';
      renderTeamAdjustmentsList();
    }
  });

  btnRecalculate.addEventListener('click', () => {
    recalculateAll();
    closeSettingsModal();
  });

  btnExportConfig.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href",     dataStr     );
    dlAnchorElem.setAttribute("download", "config.json");
    dlAnchorElem.click();
  });

  document.querySelectorAll('#audit-filter-buttons button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#audit-filter-buttons button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentAuditFilter = e.target.getAttribute('data-filter');
      populateAuditData();
    });
  });

  const searchInput = document.getElementById('rollup-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderRollupTable();
    });
  }
}
