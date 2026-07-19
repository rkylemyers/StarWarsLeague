// Global State Variables
let config = {};
let rawData = {};
let processedTeams = {};
let totalGlobalDuesSum = 0;
let teamList = [];

// DOM Elements
const syncTimeLabel = document.getElementById('sync-time-label');
const potValue = document.getElementById('pot-value');
const payoutSplitInfo = document.getElementById('payout-split-info');
const firstPayoutValue = document.getElementById('first-payout-value');
const secondPayoutValue = document.getElementById('second-payout-value');
const totalPickupsValue = document.getElementById('total-pickups-value');
const firstPercentLabel = document.getElementById('first-percent-label');
const secondPercentLabel = document.getElementById('second-percent-label');

const duesTbody = document.getElementById('dues-tbody');
const breakdownTbody = document.getElementById('breakdown-tbody');
const selectAdjTeam = document.getElementById('select-adj-team');
const globalDuesList = document.getElementById('global-dues-list');
const teamAdjustmentsList = document.getElementById('team-adjustments-list');

// Admin Inputs
const inputBuyIn = document.getElementById('input-buyin');
const inputPickupCost = document.getElementById('input-pickup-cost');
const inputFreePickups = document.getElementById('input-free-pickups');
const inputFirstSplit = document.getElementById('input-first-split');
const inputSecondSplit = document.getElementById('input-second-split');
const inputGlobalDesc = document.getElementById('input-global-desc');
const inputGlobalAmount = document.getElementById('input-global-amount');
const inputAdjDesc = document.getElementById('input-adj-desc');
const inputAdjAmount = document.getElementById('input-adj-amount');

// Buttons
const btnAddGlobal = document.getElementById('btn-add-global');
const btnAddAdj = document.getElementById('btn-add-adj');
const btnRecalculate = document.getElementById('btn-recalculate');
const btnExportConfig = document.getElementById('btn-export-config');

// Modal Elements
const auditModal = document.getElementById('audit-modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalTeamTitle = document.getElementById('modal-team-title');
const modalTeamOwner = document.getElementById('modal-team-owner');
const auditTotalPickups = document.getElementById('audit-total-pickups');
const auditWaiverCost = document.getElementById('audit-waiver-cost');
const auditSharedCost = document.getElementById('audit-shared-cost');
const auditAdjCost = document.getElementById('audit-adj-cost');
const auditTbody = document.getElementById('audit-tbody');
const btnCloseModal = document.getElementById('btn-close-modal');

// Initial Setup
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await loadData();
  setupEventListeners();
});

// Setup Navigation Tabs
function setupTabs() {
  const tabs = [
    { buttonId: 'tab-leaderboard-btn', panelId: 'panel-leaderboard' },
    { buttonId: 'tab-breakdown-btn', panelId: 'panel-breakdown' },
    { buttonId: 'tab-admin-btn', panelId: 'panel-admin' }
  ];

  tabs.forEach(t => {
    document.getElementById(t.buttonId).addEventListener('click', (e) => {
      // Remove active class from all buttons and panels
      tabs.forEach(tab => {
        document.getElementById(tab.buttonId).classList.remove('active');
        document.getElementById(tab.panelId).classList.remove('active');
      });
      // Add active class to current selection
      e.target.classList.add('active');
      document.getElementById(t.panelId).classList.add('active');
    });
  });
}

// Load configurations and transaction logs from local JSON data files
async function loadData() {
  try {
    // 1. Fetch Config parameters
    const configResp = await fetch('data/config.json');
    config = await configResp.json();

    // 2. Fetch Sync database
    const dataResp = await fetch('data/transactions_cache.json');
    rawData = await dataResp.json();

    // Update synced at label
    if (rawData.synced_at) {
      const syncDate = new Date(rawData.synced_at);
      syncTimeLabel.textContent = `Synced: ${syncDate.toLocaleDateString()} ${syncDate.toLocaleTimeString()}`;
    } else {
      syncTimeLabel.textContent = 'Synced: Offline Cache';
    }

    // Populate admin settings UI
    populateAdminInputs();

    // Perform calculations and render dashboard
    recalculateAll();

  } catch (err) {
    console.error('Error loading static resource database files:', err);
    syncTimeLabel.textContent = 'Error loading cache';
    syncTimeLabel.style.color = 'var(--accent-coral)';
  }
}

// Initialize admin settings form inputs from config object
function populateAdminInputs() {
  inputBuyIn.value = config.buyInCost;
  inputPickupCost.value = config.pickupCost;
  inputFreePickups.value = config.freePickupsCount;
  inputFirstSplit.value = config.payouts.firstPlacePercent;
  inputSecondSplit.value = config.payouts.secondPlacePercent;

  renderGlobalDuesList();
  renderTeamAdjustmentsList();
}

// Render the list of global shared costs in Admin panel
function renderGlobalDuesList() {
  globalDuesList.innerHTML = '';
  totalGlobalDuesSum = 0;
  if (!config.globalDues) config.globalDues = [];

  config.globalDues.forEach((item, index) => {
    totalGlobalDuesSum += item.amount;
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

// Render team adjustments list in Admin panel
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

// Recalculate all tables and values
function recalculateAll() {
  // Update state from inputs
  config.buyInCost = parseFloat(inputBuyIn.value) || 0;
  config.pickupCost = parseFloat(inputPickupCost.value) || 0;
  config.freePickupsCount = parseInt(inputFreePickups.value) || 0;
  config.payouts.firstPlacePercent = parseFloat(inputFirstSplit.value) || 0;
  config.payouts.secondPlacePercent = parseFloat(inputSecondSplit.value) || 0;

  // Process transaction items
  processedTeams = {};
  teamList = [];
  let grandTotalPickupsCount = 0;

  if (rawData && rawData.items) {
    // 1. Group transaction items by team
    rawData.items.forEach(item => {
      let teamName = "";
      if (item.transaction && item.transaction.team) {
        teamName = item.transaction.team.name;
      } else if (item.reserveChange && item.reserveChange.team) {
        teamName = item.reserveChange.team.name;
      }

      if (!teamName) return;

      if (!processedTeams[teamName]) {
        processedTeams[teamName] = {
          name: teamName,
          claims: 0,
          adds: 0,
          trades: 0,
          imports: 0,
          drafts: 0,
          drops: 0,
          reserves: 0,
          total: 0,
          history: [] // Chronological item log
        };
      }

      const team = processedTeams[teamName];
      team.history.push(item);

      // Increment raw counts
      if (item.transaction) {
        team.total++;
        const type = item.transaction.type || "TRANSACTION_ADD";
        switch (type) {
          case "TRANSACTION_CLAIM":
            team.claims++;
            break;
          case "TRANSACTION_ADD":
            team.adds++;
            break;
          case "TRANSACTION_DROP":
            team.drops++;
            break;
          case "TRANSACTION_IMPORT":
            team.imports++;
            break;
          case "TRANSACTION_DRAFT":
            team.drafts++;
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

    // 2. Sort each team's history chronologically ascending (earliest to latest)
    // so we can flag which specific items are the first N free waiver pickups
    Object.values(processedTeams).forEach(team => {
      team.history.sort((a, b) => {
        const timeA = parseInt(a.timeEpochMilli) || 0;
        const timeB = parseInt(b.timeEpochMilli) || 0;
        return timeA - timeB;
      });

      // Count pickups (Claims + Adds) and charge them accordingly
      let pickupIndex = 0;
      team.history.forEach(item => {
        item.isPickup = false;
        item.charge = 0.00;

        if (item.transaction) {
          const type = item.transaction.type || "TRANSACTION_ADD";
          if (type === "TRANSACTION_CLAIM" || type === "TRANSACTION_ADD") {
            item.isPickup = true;
            pickupIndex++;
            if (pickupIndex > config.freePickupsCount) {
              item.charge = config.pickupCost;
            } else {
              item.charge = 0.00; // Free waiver spot
            }
          }
        }
      });

      team.pickupCount = pickupIndex;
      team.paidPickupsCount = Math.max(0, pickupIndex - config.freePickupsCount);
      team.pickupDues = team.paidPickupsCount * config.pickupCost;

      grandTotalPickupsCount += pickupIndex;
      teamList.push(team);
    });
  }

  // Calculate Shared Global Dues per team
  const totalTeams = teamList.length || 1;
  const sharedDuesPerTeam = totalGlobalDuesSum / totalTeams;

  // Process totals per team (Buy-in + Pickups + Shared + Adjustments)
  let grandTotalPot = 0;

  teamList.forEach(team => {
    // Shared global costs
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

    // Final Math
    team.totalDue = config.buyInCost + team.pickupDues + team.sharedDues + team.specificDues + team.adjustments;
    grandTotalPot += team.totalDue;
  });

  // Sort Leaderboard: Higher total dues first
  teamList.sort((a, b) => b.totalDue - a.totalDue);

  // Update Summary Metrics UI
  potValue.textContent = `$${grandTotalPot.toFixed(2)}`;
  totalPickupsValue.textContent = grandTotalPickupsCount.toString();

  const firstPct = config.payouts.firstPlacePercent;
  const secondPct = config.payouts.secondPlacePercent;
  payoutSplitInfo.textContent = `Payout: ${firstPct}/${secondPct} Split`;
  firstPercentLabel.textContent = `${firstPct}% of total pool`;
  secondPercentLabel.textContent = `${secondPct}% of total pool`;

  const firstPayout = grandTotalPot * (firstPct / 100);
  const secondPayout = grandTotalPot * (secondPct / 100);
  firstPayoutValue.textContent = `$${firstPayout.toFixed(2)}`;
  secondPayoutValue.textContent = `$${secondPayout.toFixed(2)}`;

  // Render Leaderboard Table
  renderLeaderboard();

  // Render Breakdown Table
  renderBreakdown();

  // Populate adjust dropdown
  populateTeamDropdown();
}

// Render Dues Leaderboard Table
function renderLeaderboard() {
  duesTbody.innerHTML = '';

  if (teamList.length === 0) {
    duesTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No transaction data loaded</td></tr>';
    return;
  }

  teamList.forEach((team, index) => {
    const tr = document.createElement('tr');
    
    // Format adjustment styling
    const sign = team.adjustments >= 0 ? '+' : '';
    let adjClass = 'val-bold';
    if (team.adjustments < 0) adjClass += ' val-adjust-neg';
    else if (team.adjustments > 0) adjClass += ' val-adjust-pos';

    const netAdjustments = team.adjustments + team.specificDues;
    const netSign = netAdjustments >= 0 ? '+' : '';

    tr.innerHTML = `
      <td><span class="val-bold">${index + 1}</span></td>
      <td><span class="val-bold">${team.name}</span></td>
      <td>$${config.buyInCost.toFixed(2)}</td>
      <td>
        <span class="val-bold">${team.paidPickupsCount}</span> 
        <span style="font-size:0.8rem; color:var(--text-muted);">(${team.pickupCount} total)</span>
        <div style="font-size:0.8rem; color:var(--text-secondary);">$${team.pickupDues.toFixed(2)}</div>
      </td>
      <td>$${team.sharedDues.toFixed(2)}</td>
      <td>
        <span class="${adjClass}">${netSign}$${netAdjustments.toFixed(2)}</span>
      </td>
      <td><span class="val-due">$${team.totalDue.toFixed(2)}</span></td>
      <td>
        <button class="audit-btn" onclick="openAuditModal('${encodeURIComponent(team.name)}')">Audit Log</button>
      </td>
    `;
    duesTbody.appendChild(tr);
  });
}

// Render Transaction Types Counts Table
function renderBreakdown() {
  breakdownTbody.innerHTML = '';

  if (teamList.length === 0) {
    breakdownTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No transaction data loaded</td></tr>';
    return;
  }

  // Sort breakdown table alphabetically by team name
  const sortedBreakdown = [...teamList].sort((a, b) => a.name.localeCompare(b.name));

  sortedBreakdown.forEach(team => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="val-bold">${team.name}</span></td>
      <td>${team.claims}</td>
      <td>${team.adds}</td>
      <td>${team.trades}</td>
      <td>${team.imports}</td>
      <td>${team.drops}</td>
      <td>${team.reserves}</td>
      <td><span class="val-bold">${team.total}</span></td>
    `;
    breakdownTbody.appendChild(tr);
  });
}

// Populate team selection dropdown in adjustments panel
function populateTeamDropdown() {
  // Save current selection
  const prevSel = selectAdjTeam.value;
  selectAdjTeam.innerHTML = '';

  // Sort alphabetically
  const sortedNames = teamList.map(t => t.name).sort();
  sortedNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectAdjTeam.appendChild(opt);
  });

  if (prevSel && sortedNames.includes(prevSel)) {
    selectAdjTeam.value = prevSel;
  }
}

// Audit Modal Logic - Open & Populate Log
window.openAuditModal = function(encodedTeamName) {
  const teamName = decodeURIComponent(encodedTeamName);
  const team = processedTeams[teamName];
  if (!team) return;

  modalTeamTitle.textContent = team.name;
  modalTeamOwner.textContent = `NFL League 111626 | Active Roster`;

  auditTotalPickups.textContent = team.pickupCount.toString();
  auditWaiverCost.textContent = `$${team.pickupDues.toFixed(2)}`;
  auditSharedCost.textContent = `$${team.sharedDues.toFixed(2)}`;
  
  const netAdj = team.adjustments + team.specificDues;
  auditAdjCost.textContent = `${netAdj >= 0 ? '+' : ''}$${netAdj.toFixed(2)}`;
  if (netAdj < 0) {
    auditAdjCost.style.color = 'var(--accent-emerald)';
  } else if (netAdj > 0) {
    auditAdjCost.style.color = 'var(--accent-coral)';
  } else {
    auditAdjCost.style.color = '#fff';
  }

  // Populate list
  auditTbody.innerHTML = '';
  
  if (team.history.length === 0) {
    auditTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No logs found for this team</td></tr>';
  } else {
    let pickupIndex = 0;
    team.history.forEach((item, index) => {
      const tr = document.createElement('tr');
      
      // Timestamp
      let dateStr = "Unknown";
      if (item.timeEpochMilli) {
        const d = new Date(parseInt(item.timeEpochMilli));
        dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      // Classification
      let typeLabel = "Reserve Move";
      let pAdded = "—";
      let pDropped = "—";
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
          case "TRANSACTION_IMPORT":
            typeLabel = "Roster Import";
            break;
          case "TRANSACTION_DRAFT":
            typeLabel = "Draft Pick";
            break;
          case "TRANSACTION_TRADE":
            typeLabel = "Trade Execution";
            break;
        }

        if (item.transaction.player && item.transaction.player.proPlayer) {
          pAdded = `${item.transaction.player.proPlayer.nameFull} (${item.transaction.player.proPlayer.position}, ${item.transaction.player.proPlayer.proTeamAbbreviation})`;
        }

        // Waiver pickup indexing and dues charge
        if (type === "TRANSACTION_CLAIM" || type === "TRANSACTION_ADD") {
          pickupIndex++;
          if (pickupIndex <= config.freePickupsCount) {
            costLabel = "FREE (Initial)";
            costClass = "audit-charge-free";
          } else {
            costLabel = `$${config.pickupCost.toFixed(2)}`;
            costClass = "audit-charge-paid";
          }
        }
      } else if (item.reserveChange) {
        typeLabel = item.reserveChange.removed ? "Reserve Activate" : "Reserve Deactivate";
        if (item.reserveChange.player && item.reserveChange.player.proPlayer) {
          pAdded = `${item.reserveChange.player.proPlayer.nameFull} (${item.reserveChange.player.proPlayer.position})`;
        }
      }

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td style="color:var(--text-secondary);">${dateStr}</td>
        <td><span class="logo-badge" style="font-size:0.75rem; border-color:var(--border-color);">${typeLabel}</span></td>
        <td style="font-weight:600;">${pAdded}</td>
        <td style="color:var(--text-secondary);">${pDropped}</td>
        <td><span class="${costClass}">${costLabel}</span></td>
      `;
      auditTbody.appendChild(tr);
    });
  }

  // Display modal
  auditModal.classList.add('active');
};

// Close modal handler
function closeModal() {
  auditModal.classList.remove('active');
}

// Delete item handlers
window.deleteGlobalDue = function(index) {
  if (config.globalDues && config.globalDues[index]) {
    config.globalDues.splice(index, 1);
    renderGlobalDuesList();
    recalculateAll();
  }
};

window.deleteTeamAdjustment = function(teamName, index) {
  if (config.teamAdjustments && config.teamAdjustments[teamName]) {
    config.teamAdjustments[teamName].splice(index, 1);
    // Remove key if list empty
    if (config.teamAdjustments[teamName].length === 0) {
      delete config.teamAdjustments[teamName];
    }
    renderTeamAdjustmentsList();
    recalculateAll();
  }
};

// Setup Event Listeners
function setupEventListeners() {
  // Add global due item
  btnAddGlobal.addEventListener('click', () => {
    const desc = inputGlobalDesc.value.trim();
    const amount = parseFloat(inputGlobalAmount.value);
    
    if (desc && !isNaN(amount) && amount >= 0) {
      if (!config.globalDues) config.globalDues = [];
      config.globalDues.push({ description: desc, amount: amount });
      
      inputGlobalDesc.value = '';
      inputGlobalAmount.value = '';
      
      renderGlobalDuesList();
      recalculateAll();
    }
  });

  // Add team-specific adjustment item
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
      recalculateAll();
    }
  });

  // Recalculate
  btnRecalculate.addEventListener('click', () => {
    recalculateAll();
  });

  // Close modal listeners
  btnCloseModal.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
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
}
