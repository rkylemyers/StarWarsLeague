// Global State
let config = {};
let rawData = {};
let selectedYear = "";
let processedData = {}; // year -> teamsMap
let yearList = [];

// Canvas Warp Speed Variables
let canvas, ctx;
let stars = [];
const numStars = 200;
let warpSpeed = 0.5;
let targetWarpSpeed = 0.5;

// DOM Elements
const syncTimeLabel = document.getElementById('sync-time-label');
const potValue = document.getElementById('pot-value');
const payoutSplitInfo = document.getElementById('payout-split-info');
const totalPickupsValue = document.getElementById('total-pickups-value');
const duesTbody = document.getElementById('dues-tbody');
const yearTabsContainer = document.getElementById('year-tabs-container');
const timelineChartElement = document.getElementById('timeline-chart-element');

// Modals
const auditModal = document.getElementById('audit-modal');
const settingsModal = document.getElementById('settings-modal');

// Initial setup
document.addEventListener('DOMContentLoaded', async () => {
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
      color: `hsl(${Math.random() * 50 + 180}, 100%, ${Math.random() * 40 + 60}%)` // HSL ice-blue/white twinkle
    });
  }

  animateSpace();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function animateSpace() {
  // Clear with semi-transparent background to create star trails during hyperspace jump
  ctx.fillStyle = `rgba(4, 6, 10, ${warpSpeed > 5 ? 0.15 : 0.4})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Transition speed smoothly
  warpSpeed += (targetWarpSpeed - warpSpeed) * 0.08;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    
    // Move star closer
    star.z -= warpSpeed;

    // Reset star if it moves past screen
    if (star.z <= 0) {
      star.x = Math.random() * canvas.width - cx;
      star.y = Math.random() * canvas.height - cy;
      star.z = canvas.width;
    }

    // Perspective calculation
    const px = (star.x / star.z) * cx + cx;
    const py = (star.y / star.z) * cy + cy;

    // Fade stars in as they get closer
    const alpha = Math.min(1, 1 - star.z / canvas.width);
    
    // Draw star
    ctx.beginPath();
    ctx.strokeStyle = star.color;
    ctx.lineWidth = Math.min(3, (1 - star.z / canvas.width) * 3);

    // If warp speed is high, draw star trails (warp lines)
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

// Trigger hyperspace jump animation
function triggerHyperspaceJump() {
  targetWarpSpeed = 25; // Accelerate!
  setTimeout(() => {
    targetWarpSpeed = 0.5; // Decelerate back to normal drift
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
    const year = getSeasonYear(item.TimeEpochMilli);
    
    // Establish team structure
    let teamName = "";
    if (item.transaction && item.transaction.team) {
      teamName = item.transaction.team.name;
    } else if (item.reserveChange && item.reserveChange.team) {
      teamName = item.reserveChange.team.name;
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
      const type = item.transaction.type || "TRANSACTION_ADD";
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

  // Calculate sorted year list
  yearList = Object.keys(processedData).map(Number).sort((a, b) => b - a);
  if (yearList.length > 0) {
    selectedYear = yearList[0].toString(); // default to latest
  }
}

// ----------------------------------------------------
// 3. WEEKLY NFL CALCULATOR
// ----------------------------------------------------
function getNFLStartThursday(year) {
  let date = new Date(year, 8, 1); // Sept 1st
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

// ----------------------------------------------------
// 4. CHART & LEADERBOARD RENDERING
// ----------------------------------------------------
function recalculateAll() {
  if (!selectedYear) return;

  const season = processedData[selectedYear];
  if (!season) return;

  // Initialize elements
  const teamsMap = season.teams;
  const teamList = [];

  // Shared Global costs split equally
  const totalGlobalDuesSum = (config.globalDues || []).reduce((acc, curr) => acc + curr.amount, 0);
  const totalTeams = Object.keys(teamsMap).length || 1;
  const sharedDuesPerTeam = totalGlobalDuesSum / totalTeams;

  // Sort franchise transactions chronologically ascending to flag free waiver limits
  Object.values(teamsMap).forEach(team => {
    team.history.sort((a, b) => parseInt(a.timeEpochMilli) - parseInt(b.timeEpochMilli));

    // Reset weekly counts
    team.weeklyPickups = Array(20).fill(0); // 1-indexed for weeks 1-19

    let pickupIndex = 0;
    team.history.forEach(item => {
      const week = getNFLWeek(item.TimeEpochMilli, selectedYear);
      item.nflWeek = week;
      item.isPickup = false;
      item.charge = 0.00;

      if (item.transaction) {
        const type = item.transaction.type || "TRANSACTION_ADD";
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

    // Final dues sum
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
  payoutSplitInfo.textContent = `Champion Split: ${firstPct}% / ${secondPct}%`;

  // Render Dues Leaderboard
  renderDuesLeaderboard(teamList);

  // Render Weekly Timeline Chart
  renderWeeklyChart(teamList);
}

// Render Dues Leaderboard Table
function renderDuesLeaderboard(teamList) {
  duesTbody.innerHTML = '';

  teamList.forEach((team, index) => {
    const tr = document.createElement('tr');
    
    // Sparkline points generation (19 values mapped inside 100x20 SVG)
    let sparklineSVG = '';
    if (team.weeklyPickups) {
      const maxVal = Math.max(...team.weeklyPickups, 1);
      const points = [];
      for (let w = 1; w <= 19; w++) {
        const val = team.weeklyPickups[w] || 0;
        // x: 0 to 90, y: 18 to 2 (invert y axis)
        const x = ((w - 1) / 18) * 90 + 5;
        const y = 18 - (val / maxVal) * 16;
        points.push(`${x},${y}`);
      }

      sparklineSVG = `
        <svg class="sparkline-svg" width="100" height="20">
          <polyline class="sparkline-path" points="${points.join(' ')}"></polyline>
          ${points.map((p, idx) => {
            const val = team.weeklyPickups[idx + 1] || 0;
            return val > 0 ? `<circle class="sparkline-dot" cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2"><title>Week ${idx+1}: ${val} pickups</title></circle>` : '';
          }).join('')}
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
    const seasonStr = selectedYear;
    if (rawData.standings && rawData.standings[seasonStr]) {
      const divTeams = rawData.standings[seasonStr].divisions.flatMap(d => d.teams);
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

    tr.innerHTML = `
      <td><span class="val-bold">${index + 1}</span></td>
      <td>
        <span class="team-name-link" onclick="openAuditModal('${encodeURIComponent(team.name)}')">${team.name}</span>
        ${championshipsHTML}
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem;">${recordStr}</div>
      </td>
      <td>
        <span class="val-bold">${team.paidPickupsCount}</span> 
        <span style="font-size:0.8rem; color:var(--text-muted);">(${team.pickupCount} total)</span>
        <div style="font-size:0.8rem; color:var(--text-secondary);">$${team.pickupDues.toFixed(2)}</div>
      </td>
      <td>${sparklineSVG}</td>
      <td><span class="${adjClass}">${sign}$${netAdjustments.toFixed(2)}</span></td>
      <td><span class="val-due">$${team.totalDue.toFixed(2)}</span></td>
      <td style="text-align: right;">
        <button class="audit-btn" onclick="openAuditModal('${encodeURIComponent(team.name)}')">Audit Log</button>
      </td>
    `;
    duesTbody.appendChild(tr);
  });
}

// Render Weekly Timeline SVG Bar Chart
function renderWeeklyChart(teamList) {
  // Aggregate weekly stats (Week 1-19)
  const weeklyPickups = Array(20).fill(0);
  teamList.forEach(t => {
    if (t.weeklyPickups) {
      for (let w = 1; w <= 19; w++) {
        weeklyPickups[w] += t.weeklyPickups[w] || 0;
      }
    }
  });

  const maxVal = Math.max(...weeklyPickups, 1);
  
  // Build SVG bars
  let svgContent = `
    <svg width="100%" height="100%" viewBox="0 0 760 130" preserveAspectRatio="none">
      <defs>
        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-cyan)" />
          <stop offset="100%" stop-color="var(--accent-purple)" />
        </linearGradient>
      </defs>
      <!-- Grid Lines -->
      <line class="chart-grid-line" x1="40" y1="15" x2="740" y2="15"></line>
      <line class="chart-grid-line" x1="40" y1="55" x2="740" y2="55"></line>
      <line class="chart-grid-line" x1="40" y1="95" x2="740" y2="95"></line>
  `;

  // Left axis labels
  svgContent += `
    <text class="chart-text" x="10" y="20">${maxVal}</text>
    <text class="chart-text" x="10" y="60">${Math.floor(maxVal/2)}</text>
    <text class="chart-text" x="10" y="100">0</text>
  `;

  // Generate 19 Columns
  const paddingX = 40;
  const colWidth = 28;
  const gap = 8;

  for (let w = 1; w <= 19; w++) {
    const val = weeklyPickups[w] || 0;
    // Map height to 10px - 100px range
    const barHeight = val > 0 ? (val / maxVal) * 85 : 0;
    const x = paddingX + (w - 1) * (colWidth + gap);
    const y = 95 - barHeight;

    // Calculate total additions ($5/pickup for transactions that are above baseline, but let's simplify:
    // show count of pickups and total billable amount generated)
    // To estimate additions: find how many pickups in this week were billed (meaning they occurred after team's 2nd free pickup)
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
        <!-- Clickable transparent hover area -->
        <rect class="chart-hover-area" x="${x}" y="10" width="${colWidth}" height="100" fill="transparent" style="cursor:pointer;"></rect>
        <!-- Bar element -->
        ${val > 0 ? `<rect class="chart-bar-rect" x="${x}" y="${y}" width="${colWidth}" height="${barHeight}"></rect>` : ''}
        <!-- Label axis -->
        <text class="chart-text-week" x="${x + colWidth/2}" y="115">${weekLabel}</text>
      </g>
    `;
  }

  svgContent += `</svg>`;
  timelineChartElement.innerHTML = svgContent;
}

// ----------------------------------------------------
// 5. INTERACTIVE TIMELINE TOOLTIPS
// ----------------------------------------------------
let chartTooltipEl;
window.showChartTooltip = function(event, text) {
  if (!chartTooltipEl) {
    chartTooltipEl = document.createElement('div');
    chartTooltipEl.className = 'chart-tooltip';
    document.body.appendChild(chartTooltipEl);
  }
  chartTooltipEl.textContent = text;
  chartTooltipEl.style.display = 'block';
  chartTooltipEl.style.left = (event.pageX + 10) + 'px';
  chartTooltipEl.style.top = (event.pageY - 30) + 'px';
};

window.hideChartTooltip = function() {
  if (chartTooltipEl) {
    chartTooltipEl.style.display = 'none';
  }
};

// ----------------------------------------------------
// 6. YEAR TABS GENERATOR
// ----------------------------------------------------
function buildYearTabs() {
  yearTabsContainer.innerHTML = '';

  if (yearList.length === 0) return;

  // Tabs layout:
  // Leftmost 3 tabs are the 3 most recent years
  const mainTabs = yearList.slice(0, 3);
  mainTabs.forEach(year => {
    const btn = document.createElement('button');
    btn.className = `year-tab-btn ${year.toString() === selectedYear ? 'active' : ''}`;
    btn.textContent = year.toString();
    btn.addEventListener('click', () => selectYearTab(year.toString()));
    yearTabsContainer.appendChild(btn);
  });

  // Older years are grouped into a dropdown tab
  const olderTabs = yearList.slice(3);
  if (olderTabs.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = "year-dropdown-wrap";
    wrap.id = "older-years-dropdown";

    const btn = document.createElement('button');
    btn.className = "year-tab-btn";
    // Check if selected year is in the older years list to set active tab label
    const isOlderSelected = olderTabs.map(String).includes(selectedYear);
    btn.innerHTML = `${isOlderSelected ? selectedYear : 'Older Seasons'} ▾`;
    if (isOlderSelected) {
      btn.classList.add('active');
    }

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

    // Toggle menu
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      wrap.classList.remove('active');
    });

    yearTabsContainer.appendChild(wrap);
  }
}

function selectYearTab(year) {
  if (selectedYear === year) return;
  selectedYear = year;
  
  // Warp speed jump!
  triggerHyperspaceJump();

  buildYearTabs();
  recalculateAll();
}

// ----------------------------------------------------
// 7. TEAM AUDIT LOG & modal
// ----------------------------------------------------
let currentAuditTeam = "";
let currentAuditFilter = "all";

window.openAuditModal = function(encodedTeamName) {
  const teamName = decodeURIComponent(encodedTeamName);
  currentAuditTeam = teamName;
  currentAuditFilter = "all";

  // Reset filter buttons
  document.querySelectorAll('#audit-filter-buttons button').forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('data-filter') === 'all') b.classList.add('active');
  });

  populateAuditData();
  auditModal.classList.add('active');
};

function populateAuditData() {
  const season = processedData[selectedYear];
  if (!season) return;

  const team = season.teams[currentAuditTeam];
  if (!team) return;

  // Header Details
  modalTeamTitle.textContent = team.name;

  // Standings Current Year Record
  let recordStr = "Record: —";
  if (rawData.standings && rawData.standings[selectedYear]) {
    const divTeams = rawData.standings[selectedYear].divisions.flatMap(d => d.teams);
    const matched = divTeams.find(t => t.name === team.name);
    if (matched && matched.recordOverall) {
      recordStr = `Record: ${matched.recordOverall.wins}-${matched.recordOverall.losses} (Rank #${matched.recordOverall.rank})`;
    }
  }
  document.getElementById('modal-team-record-year').textContent = `${selectedYear} ${recordStr}`;

  // All-Time Record: sum standings over ALL seasons + historical settings stats base
  let totalWins = 0, totalLosses = 0, totalTies = 0;
  const hist = config.teamHistoricalStats && config.teamHistoricalStats[team.name];
  if (hist) {
    totalWins = hist.wins || 0;
    totalLosses = hist.losses || 0;
    totalTies = hist.ties || 0;
    document.getElementById('modal-championships-badge').textContent = `🏆 ${hist.championships || 0} Championships`;
    document.getElementById('modal-championships-badge').style.display = 'inline-block';
  } else {
    document.getElementById('modal-championships-badge').style.display = 'none';
  }

  // Add all synced standings to all-time stats dynamically
  if (rawData.standings) {
    Object.values(rawData.standings).forEach(std => {
      const allDivTeams = std.divisions.flatMap(d => d.teams);
      const m = allDivTeams.find(t => t.name === team.name);
      if (m && m.recordOverall) {
        totalWins += m.recordOverall.wins;
        totalLosses += m.recordOverall.losses;
        totalTies += m.recordOverall.ties;
      }
    });
  }
  document.getElementById('modal-team-record-alltime').textContent = `All-Time Record: ${totalWins}-${totalLosses}-${totalTies}`;

  // Money breakdown cards
  document.getElementById('audit-buy-in').textContent = `$${config.buyInCost.toFixed(2)}`;
  document.getElementById('audit-waiver-cost').textContent = `$${team.pickupDues.toFixed(2)}`;
  document.getElementById('audit-shared-cost').textContent = `$${team.sharedDues.toFixed(2)}`;
  
  const netAdj = team.adjustments + team.specificDues;
  const adjEl = document.getElementById('audit-adj-cost');
  adjEl.textContent = `${netAdj >= 0 ? '+' : ''}$${netAdj.toFixed(2)}`;
  if (netAdj < 0) {
    adjEl.style.color = 'var(--accent-emerald)';
  } else if (netAdj > 0) {
    adjEl.style.color = 'var(--accent-coral)';
  } else {
    adjEl.style.color = 'var(--text-primary)';
  }

  document.getElementById('audit-total-due').textContent = `$${team.totalDue.toFixed(2)}`;

  // Populate chronological history (DESCENDING - most recent first)
  const auditTbody = document.getElementById('audit-tbody');
  auditTbody.innerHTML = '';

  const filteredHistory = team.history.filter(item => {
    if (currentAuditFilter === 'all') return true;
    if (!item.transaction) return currentAuditFilter === 'Reserves';

    const type = item.transaction.type || "TRANSACTION_ADD";
    if (currentAuditFilter === 'Claims') return type === 'TRANSACTION_CLAIM';
    if (currentAuditFilter === 'Adds') return type === 'TRANSACTION_ADD';
    if (currentAuditFilter === 'Drops') return type === 'TRANSACTION_DROP';
    if (currentAuditFilter === 'Trades') return type === 'TRANSACTION_TRADE';
    return false;
  });

  // Reverse list to show newest transactions first
  const descHistory = [...filteredHistory].reverse();

  if (descHistory.length === 0) {
    auditTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching transaction items found</td></tr>';
    return;
  }

  descHistory.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    // Alternating week background colors
    const week = item.nflWeek || 1;
    tr.className = week % 2 === 0 ? 'week-bg-even' : 'week-bg-odd';

    // Timestamp
    let dateStr = "Unknown";
    if (item.timeEpochMilli) {
      const d = new Date(parseInt(item.timeEpochMilli));
      dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Action and Players
    let typeLabel = "Reserve Move";
    let pDetails = "—";
    let costLabel = "—";
    let costClass = "";

    if (item.transaction) {
      const type = item.transaction.type || "TRANSACTION_ADD";
      switch (type) {
        case "TRANSACTION_CLAIM":
          typeLabel = "Waiver Claim";
          break;
        case "TRANSACTION_ADD":
          typeLabel = "Free Agent Add";
          break;
        case "TRANSACTION_DROP":
          typeLabel = "Drop Player";
          break;
        case "TRANSACTION_TRADE":
          typeLabel = "Trade";
          break;
        case "TRANSACTION_IMPORT":
          typeLabel = "Import";
          break;
        case "TRANSACTION_DRAFT":
          typeLabel = "Draft";
          break;
      }

      if (item.transaction.player && item.transaction.player.proPlayer) {
        const p = item.transaction.player.proPlayer;
        pDetails = `${p.nameFull} (${p.position}, ${p.proTeamAbbreviation})`;
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
    } else if (item.reserveChange) {
      typeLabel = item.reserveChange.removed ? "Activate Reserve" : "Place Reserve";
      if (item.reserveChange.player && item.reserveChange.player.proPlayer) {
        const p = item.reserveChange.player.proPlayer;
        pDetails = `${p.nameFull} (${p.position})`;
      }
    }

    tr.innerHTML = `
      <td>${descHistory.length - index}</td>
      <td style="font-family:var(--font-code); font-weight:700; color:var(--accent-yellow);">${getWeekName(week)}</td>
      <td style="color:var(--text-secondary);">${dateStr}</td>
      <td><span class="logo-badge" style="font-size:0.7rem; border-color:var(--border-color);">${typeLabel}</span></td>
      <td style="font-weight:600;">${pDetails}</td>
      <td><span class="${costClass}">${costLabel}</span></td>
    `;
    auditTbody.appendChild(tr);
  });
}

// Close Modal
function closeAuditModal() {
  auditModal.classList.remove('active');
}

// ----------------------------------------------------
// 8. ADMIN SETTINGS OVERLAYS
// ----------------------------------------------------
function openSettingsModal() {
  // Setup inputs
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
  const sortedNames = Object.keys(processedData[selectedYear].teams).sort();
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

// Render the list of global shared costs in Settings modal
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

// Render team adjustments list in Settings modal
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

// Delete item actions
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
// 9. LISTENERS SETUP
// ----------------------------------------------------
function setupEventListeners() {
  // Modal togglers
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

  // Settings subtabs navigation
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

  // Dropdown team change listener to load stats
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

  // Add global due
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

  // Add team override adjustment
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

  // Recalculate
  btnRecalculate.addEventListener('click', () => {
    recalculateAll();
    closeSettingsModal();
  });

  // Export JSON configuration file
  btnExportConfig.addEventListener('click', () => {
    // Generate clean JSON payload of current values
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href",     dataStr     );
    dlAnchorElem.setAttribute("download", "config.json");
    dlAnchorElem.click();
  });

  // Audit filter chip triggers
  document.querySelectorAll('#audit-filter-buttons button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#audit-filter-buttons button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentAuditFilter = e.target.getAttribute('data-filter');
      populateAuditData();
    });
  });
}
