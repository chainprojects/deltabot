require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { DeltaExchangeAPI } = require('./api/delta-api');
const { TradingEngine } = require('./trading/trading-engine');
const { loadUserConfigurations } = require('./config/user-config');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Delta Exchange API client
const deltaAPI = new DeltaExchangeAPI({
  apiKey: process.env.DELTA_API_KEY,
  apiSecret: process.env.DELTA_API_SECRET
});

// Initialize Trading Engine
const tradingEngine = new TradingEngine(deltaAPI);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to save trading configuration
app.post('/api/config', async (req, res) => {
  try {
    const config = req.body;
    // Validate configuration
    if (!config.symbol || !config.conditions || !config.conditions.length) {
      return res.status(400).json({ error: 'Invalid configuration' });
    }
    
    // Save configuration
    await tradingEngine.addConfiguration(config);
    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (error) {
    console.error('Error saving configuration:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// API endpoint to get all configurations
app.get('/api/config', async (req, res) => {
  try {
    const configs = await tradingEngine.getConfigurations();
    res.json(configs);
  } catch (error) {
    console.error('Error fetching configurations:', error);
    res.status(500).json({ error: 'Failed to fetch configurations' });
  }
});

// API endpoint to delete a configuration
app.delete('/api/config/:id', async (req, res) => {
  try {
    const configId = req.params.id;
    
    // First stop trading if active
    try {
      await tradingEngine.stopTrading(configId);
    } catch (stopError) {
      console.log(`Configuration ${configId} was not actively trading`);
    }
    
    // Remove from configurations
    const configs = await tradingEngine.getConfigurations();
    const updatedConfigs = configs.filter(config => config.id !== configId);
    
    // Update trading engine configurations
    tradingEngine.configurations = updatedConfigs;
    await tradingEngine.saveConfigurations();
    
    res.json({ success: true, message: 'Configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting configuration:', error);
    res.status(500).json({ error: 'Failed to delete configuration' });
  }
});

// API endpoint to start/stop the trading bot
app.post('/api/bot/control', async (req, res) => {
  const { action, configId } = req.body;
  
  if (action === 'start') {
    try {
      // Update configuration to mark as active
      const configs = await tradingEngine.getConfigurations();
      const configIndex = configs.findIndex(c => c.id === configId);
      
      if (configIndex >= 0) {
        configs[configIndex].active = true;
        tradingEngine.configurations = configs;
        await tradingEngine.saveConfigurations();
      }
      
      await tradingEngine.startTrading(configId);
      res.json({ success: true, message: 'Trading bot started' });
    } catch (error) {
      console.error('Error starting trading bot:', error);
      res.status(500).json({ error: 'Failed to start trading bot' });
    }
  } else if (action === 'stop') {
    try {
      // Update configuration to mark as inactive
      const configs = await tradingEngine.getConfigurations();
      const configIndex = configs.findIndex(c => c.id === configId);
      
      if (configIndex >= 0) {
        configs[configIndex].active = false;
        tradingEngine.configurations = configs;
        await tradingEngine.saveConfigurations();
      }
      
      await tradingEngine.stopTrading(configId);
      res.json({ success: true, message: 'Trading bot stopped' });
    } catch (error) {
      console.error('Error stopping trading bot:', error);
      res.status(500).json({ error: 'Failed to stop trading bot' });
    }
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
});

// API endpoint to get historical price data
app.get('/api/market/history', async (req, res) => {
  try {
    const { symbol, timeframe } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    // Get historical data from Delta Exchange API
    const historicalData = await deltaAPI.getHistoricalData(symbol, timeframe || '1h');
    res.json(historicalData);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Load saved user configurations
  loadUserConfigurations().then(configs => {
    configs.forEach(config => {
      if (config.autoStart) {
        tradingEngine.addConfiguration(config);
        tradingEngine.startTrading(config.id);
        console.log(`Auto-started trading for config: ${config.name}`);
      }
    });
  }).catch(err => {
    console.error('Failed to load configurations:', err);
  });
});