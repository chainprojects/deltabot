/**
 * Delta Exchange Trading Bot - Frontend JavaScript
 */

// DOM Elements
const configForm = document.getElementById('configForm');
const configsList = document.getElementById('configsList');
const addConditionBtn = document.getElementById('addCondition');
const conditionsContainer = document.getElementById('conditionsContainer');
const configModal = new bootstrap.Modal(document.getElementById('configModal'));
const startBotBtn = document.getElementById('startBot');
const stopBotBtn = document.getElementById('stopBot');
const deleteConfigBtn = document.getElementById('deleteConfig');

// Current selected configuration ID
let currentConfigId = null;

// Load all configurations on page load
document.addEventListener('DOMContentLoaded', loadConfigurations);

// Event Listeners
configForm.addEventListener('submit', saveConfiguration);
addConditionBtn.addEventListener('click', addCondition);
conditionsContainer.addEventListener('click', handleConditionEvents);
startBotBtn.addEventListener('click', startBot);
stopBotBtn.addEventListener('click', stopBot);
deleteConfigBtn.addEventListener('click', deleteConfig);

/**
 * Load all trading configurations from the server
 */
async function loadConfigurations() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Failed to load configurations');
    
    const configs = await response.json();
    renderConfigurations(configs);
  } catch (error) {
    console.error('Error loading configurations:', error);
    showAlert('Failed to load configurations', 'danger');
  }
}

/**
 * Render configurations in the UI
 * @param {Array} configs Array of configuration objects
 */
function renderConfigurations(configs) {
  configsList.innerHTML = '';
  
  if (configs.length === 0) {
    configsList.innerHTML = '<div class="col-12"><p class="text-center">No configurations found. Create one above!</p></div>';
    return;
  }
  
  configs.forEach(config => {
    const isActive = config.active;
    const card = document.createElement('div');
    card.className = 'col-md-4';
    card.innerHTML = `
      <div class="card config-card" data-id="${config.id}">
        <div class="card-body">
          <h5 class="card-title">${config.name || 'Unnamed Configuration'}</h5>
          <h6 class="card-subtitle mb-2 text-muted">${config.symbol}</h6>
          <p class="card-text">
            <span class="badge ${isActive ? 'bg-success' : 'bg-secondary'}">
              ${isActive ? 'Active' : 'Inactive'}
            </span>
            <br>
            ${config.conditions.length} condition(s)
            <br>
            Check interval: ${(config.checkInterval / 1000).toFixed(0)}s
          </p>
        </div>
      </div>
    `;
    
    card.querySelector('.config-card').addEventListener('click', () => showConfigDetails(config));
    configsList.appendChild(card);
  });
}

/**
 * Show configuration details in modal
 * @param {Object} config Configuration object
 */
function showConfigDetails(config) {
  currentConfigId = config.id;
  const modalBody = document.getElementById('configModalBody');
  
  let conditionsHtml = '';
  config.conditions.forEach((condition, index) => {
    // Format condition type for display
    let conditionTypeDisplay = condition.type;
    if (condition.type === 'ma_cross') {
      conditionTypeDisplay = `MA Cross (${condition.maType.toUpperCase()}, ${condition.period}/${condition.secondPeriod})`;
    } else if (condition.type === 'rsi') {
      conditionTypeDisplay = `RSI (${condition.period})`;
    }
    
    // Build risk management info
    let riskManagementInfo = '';
    if (condition.stopLoss) {
      riskManagementInfo += `<br>Stop Loss: ${condition.stopLoss}%`;
    }
    if (condition.takeProfit) {
      riskManagementInfo += `<br>Take Profit: ${condition.takeProfit}%`;
    }
    if (condition.riskPercent) {
      riskManagementInfo += `<br>Risk per Trade: ${condition.riskPercent}%`;
    }
    
    conditionsHtml += `
      <div class="condition-detail mb-3 p-3 border rounded">
        <h6>Condition ${index + 1}</h6>
        <p>
          When ${conditionTypeDisplay} is <strong>${condition.operator}</strong> 
          <strong>${condition.value}</strong>, 
          <strong>${condition.action.toUpperCase()}</strong> 
          <strong>${condition.quantity}</strong> units
          ${riskManagementInfo}
        </p>
      </div>
    `;
  });
  
  modalBody.innerHTML = `
    <h4>${config.name || 'Unnamed Configuration'}</h4>
    <p><strong>Symbol:</strong> ${config.symbol}</p>
    <p><strong>Status:</strong> 
      <span class="badge ${config.active ? 'bg-success' : 'bg-secondary'}">
        ${config.active ? 'Active' : 'Inactive'}
      </span>
    </p>
    <p><strong>Check Interval:</strong> ${(config.checkInterval / 1000).toFixed(0)} seconds</p>
    <p><strong>Auto-start:</strong> ${config.autoStart ? 'Yes' : 'No'}</p>
    
    <h5 class="mt-4">Trading Conditions</h5>
    ${conditionsHtml}
    
    <p class="text-muted mt-3">Created: ${new Date(config.createdAt).toLocaleString()}</p>
  `;
  
  // Update button states
  startBotBtn.disabled = config.active;
  stopBotBtn.disabled = !config.active;
  
  configModal.show();
}

/**
 * Save configuration to server
 * @param {Event} event Form submit event
 */
async function saveConfiguration(event) {
  event.preventDefault();
  
  try {
    // Gather form data
    const configData = {
      name: document.getElementById('configName').value,
      symbol: document.getElementById('symbol').value,
      checkInterval: parseInt(document.getElementById('checkInterval').value),
      autoStart: document.getElementById('autoStart').checked,
      conditions: []
    };
    
    // Gather conditions
    const conditionRows = document.querySelectorAll('.condition-row');
    conditionRows.forEach(row => {
      const conditionType = row.querySelector('.condition-type').value;
      
      const condition = {
        type: conditionType,
        operator: row.querySelector('.condition-operator').value,
        value: parseFloat(row.querySelector('.condition-value').value),
        action: row.querySelector('.condition-action').value,
        quantity: parseFloat(row.querySelector('.condition-quantity').value),
        stopLoss: parseFloat(row.querySelector('.condition-stop-loss').value) || null,
        takeProfit: parseFloat(row.querySelector('.condition-take-profit').value) || null,
        riskPercent: parseFloat(row.querySelector('.condition-risk-percent').value) || 1
      };
      
      // Add advanced parameters if needed
      if (conditionType === 'ma_cross' || conditionType === 'rsi') {
        condition.period = parseInt(row.querySelector('.condition-period').value) || 14;
        
        if (conditionType === 'ma_cross') {
          condition.maType = row.querySelector('.condition-ma-type').value;
          condition.secondPeriod = parseInt(row.querySelector('.condition-second-period').value) || 28;
        }
      }
      
      configData.conditions.push(condition);
    });
    
    // Validate
    if (configData.conditions.length === 0) {
      throw new Error('At least one trading condition is required');
    }
    
    // Send to server
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(configData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save configuration');
    }
    
    // Reset form and reload configurations
    configForm.reset();
    resetConditions();
    await loadConfigurations();
    
    showAlert('Configuration saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving configuration:', error);
    showAlert(error.message, 'danger');
  }
}

/**
 * Add a new condition row to the form
 */
function addCondition() {
  const conditionId = Date.now();
  const conditionHtml = `
    <div class="condition-row border rounded p-3 mb-3" data-id="${conditionId}">
      <div class="d-flex justify-content-between mb-2">
        <h6>Trading Condition</h6>
        <button type="button" class="btn btn-sm btn-danger remove-condition">Remove</button>
      </div>
      
      <div class="row mb-3">
        <div class="col-md-6">
          <label class="form-label">Condition Type</label>
          <select class="form-select condition-type" onchange="updateConditionFields(this)">
            <option value="price">Price</option>
            <option value="ma_cross">Moving Average Crossover</option>
            <option value="rsi">RSI</option>
            <option value="volume">Volume</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">Operator</label>
          <select class="form-select condition-operator">
            <option value="above">Above</option>
            <option value="below">Below</option>
            <option value="equals">Equals</option>
            <option value="crosses_above">Crosses Above</option>
            <option value="crosses_below">Crosses Below</option>
          </select>
        </div>
      </div>
      
      <div class="row mb-3">
        <div class="col-md-6">
          <label class="form-label">Value</label>
          <input type="number" step="0.01" class="form-control condition-value" required>
        </div>
        <div class="col-md-6 period-field d-none">
          <label class="form-label">Period</label>
          <input type="number" class="form-control condition-period" value="14">
        </div>
      </div>
      
      <div class="row mb-3 ma-fields d-none">
        <div class="col-md-6">
          <label class="form-label">MA Type</label>
          <select class="form-select condition-ma-type">
            <option value="sma">Simple MA</option>
            <option value="ema">Exponential MA</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">Second Period</label>
          <input type="number" class="form-control condition-second-period" value="28">
        </div>
      </div>
      
      <div class="row mb-3">
        <div class="col-md-6">
          <label class="form-label">Action</label>
          <select class="form-select condition-action">
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">Quantity</label>
          <input type="number" step="0.01" class="form-control condition-quantity" required>
        </div>
      </div>
      
      <div class="row mb-3">
        <div class="col-md-4">
          <label class="form-label">Stop Loss (%)</label>
          <input type="number" step="0.1" class="form-control condition-stop-loss">
        </div>
        <div class="col-md-4">
          <label class="form-label">Take Profit (%)</label>
          <input type="number" step="0.1" class="form-control condition-take-profit">
        </div>
        <div class="col-md-4">
          <label class="form-label">Risk (%)</label>
          <input type="number" step="0.1" class="form-control condition-risk-percent" value="1">
        </div>
      </div>
    </div>
  `;
  
  conditionsContainer.insertAdjacentHTML('beforeend', conditionHtml);
}

/**
 * Update condition fields based on selected condition type
 * @param {HTMLElement} selectElement The condition type select element
 */
function updateConditionFields(selectElement) {
  const conditionRow = selectElement.closest('.condition-row');
  const conditionType = selectElement.value;
  const operatorSelect = conditionRow.querySelector('.condition-operator');
  const periodField = conditionRow.querySelector('.period-field');
  const maFields = conditionRow.querySelector('.ma-fields');
  
  // Reset operator options
  operatorSelect.innerHTML = '';
  
  // Show/hide fields based on condition type
  if (conditionType === 'price' || conditionType === 'volume') {
    // Price and Volume conditions
    addOption(operatorSelect, 'above', 'Above');
    addOption(operatorSelect, 'below', 'Below');
    addOption(operatorSelect, 'equals', 'Equals');
    
    periodField.classList.add('d-none');
    maFields.classList.add('d-none');
  } else if (conditionType === 'ma_cross') {
    // MA Crossover conditions
    addOption(operatorSelect, 'crosses_above', 'Crosses Above');
    addOption(operatorSelect, 'crosses_below', 'Crosses Below');
    
    periodField.classList.remove('d-none');
    maFields.classList.remove('d-none');
  } else if (conditionType === 'rsi') {
    // RSI conditions
    addOption(operatorSelect, 'above', 'Above');
    addOption(operatorSelect, 'below', 'Below');
    
    periodField.classList.remove('d-none');
    maFields.classList.add('d-none');
  }
}

/**
 * Helper function to add option to select element
 * @param {HTMLElement} select Select element
 * @param {string} value Option value
 * @param {string} text Option text
 */
function addOption(select, value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  select.appendChild(option);
}

/**
 * Reset conditions to initial state
 */
function resetConditions() {
  conditionsContainer.innerHTML = '';
  addCondition();
}

/**
 * Handle condition-related events (e.g., remove button)
 * @param {Event} event Click event
 */
function handleConditionEvents(event) {
  if (event.target.classList.contains('remove-condition')) {
    const conditionRow = event.target.closest('.condition-row');
    
    // Don't remove if it's the only condition
    if (document.querySelectorAll('.condition-row').length > 1) {
      conditionRow.remove();
    } else {
      showAlert('At least one condition is required', 'warning');
    }
  }
}

/**
 * Start the trading bot for current configuration
 */
async function startBot() {
  if (!currentConfigId) return;
  
  try {
    const response = await fetch('/api/bot/control', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'start',
        configId: currentConfigId
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start bot');
    }
    
    await loadConfigurations();
    configModal.hide();
    showAlert('Trading bot started successfully!', 'success');
  } catch (error) {
    console.error('Error starting bot:', error);
    showAlert(error.message, 'danger');
  }
}

/**
 * Stop the trading bot for current configuration
 */
async function stopBot() {
  if (!currentConfigId) return;
  
  try {
    const response = await fetch('/api/bot/control', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'stop',
        configId: currentConfigId
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to stop bot');
    }
    
    await loadConfigurations();
    configModal.hide();
    showAlert('Trading bot stopped successfully!', 'success');
  } catch (error) {
    console.error('Error stopping bot:', error);
    showAlert(error.message, 'danger');
  }
}

/**
 * Delete configuration
 */
async function deleteConfig() {
  if (!currentConfigId || !confirm('Are you sure you want to delete this configuration?')) {
    return;
  }
  
  try {
    // First stop the bot if it's running
    await fetch('/api/bot/control', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'stop',
        configId: currentConfigId
      })
    });
    
    // Then delete the configuration
    // Note: This endpoint would need to be implemented on the server
    const response = await fetch(`/api/config/${currentConfigId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete configuration');
    }
    
    await loadConfigurations();
    configModal.hide();
    showAlert('Configuration deleted successfully!', 'success');
  } catch (error) {
    console.error('Error deleting configuration:', error);
    showAlert(error.message, 'danger');
  }
}

/**
 * Show alert message
 * @param {string} message Alert message
 * @param {string} type Alert type (success, danger, warning, info)
 */
function showAlert(message, type = 'info') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
  alertDiv.style.zIndex = '9999';
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  
  document.body.appendChild(alertDiv);
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    const bsAlert = new bootstrap.Alert(alertDiv);
    bsAlert.close();
  }, 5000);
}

// Chart variables
let priceChart = null;

// Initialize chart when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  loadConfigurations();
  initializeChart();
  
  // Add event listeners for chart controls
  document.getElementById('chartSymbol').addEventListener('change', updateChart);
  document.getElementById('chartTimeframe').addEventListener('change', updateChart);
});

/**
 * Initialize the price chart
 */
function initializeChart() {
  const ctx = document.getElementById('priceChart').getContext('2d');
  
  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Price',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        pointRadius: 0.5
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Time'
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Price'
          }
        }
      }
    }
  });
  
  // Load initial chart data
  updateChart();
}

/**
 * Update chart with new data
 */
async function updateChart() {
  const symbol = document.getElementById('chartSymbol').value;
  const timeframe = document.getElementById('chartTimeframe').value;
  
  try {
    const response = await fetch(`/api/market/history?symbol=${symbol}&timeframe=${timeframe}`);
    if (!response.ok) throw new Error('Failed to fetch chart data');
    
    const data = await response.json();
    
    // Format data for chart
    const timestamps = data.t.map(timestamp => new Date(timestamp * 1000).toLocaleTimeString());
    const prices = data.c; // Closing prices
    
    // Update chart
    priceChart.data.labels = timestamps;
    priceChart.data.datasets[0].data = prices;
    priceChart.data.datasets[0].label = `${symbol} Price`;
    priceChart.update();
    
  } catch (error) {
    console.error('Error updating chart:', error);
    showAlert('Failed to load chart data', 'danger');
  }
}