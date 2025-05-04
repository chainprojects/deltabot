const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuration storage
const CONFIG_DIR = path.join(__dirname, 'configs');
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR);
}

// Delta Exchange API client
const DeltaAPI = require('./delta-api');
const deltaApi = new DeltaAPI(process.env.API_KEY, process.env.API_SECRET);

// Trading engine
const TradingEngine = require('./trading-engine');
const tradingEngine = new TradingEngine(deltaApi);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all configurations
app.get('/api/configs', (req, res) => {
  try {
    const configs = [];
    const files = fs.readdirSync(CONFIG_DIR);
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const configData = fs.readFileSync(path.join(CONFIG_DIR, file), 'utf8');
        configs.push(JSON.parse(configData));
      }
    });
    
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new configuration
app.post('/api/configs', (req, res) => {
  try {
    const config = req.body;
    config.id = Date.now().toString();
    config.isActive = false;
    config.trades = [];
    
    fs.writeFileSync(
      path.join(CONFIG_DIR, `${config.id}.json`),
      JSON.stringify(config, null, 2)
    );
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new trade to configuration
app.post('/api/configs/:id/trades', (req, res) => {
  try {
    const configId = req.params.id;
    const configPath = path.join(CONFIG_DIR, `${configId}.json`);
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const trade = req.body;
    trade.id = Date.now().toString();
    trade.status = 'pending';
    trade.createdAt = new Date().toISOString();
    
    config.trades.push(trade);
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    res.json(trade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start/stop configuration
app.put('/api/configs/:id/status', (req, res) => {
  try {
    const configId = req.params.id;
    const { isActive } = req.body;
    const configPath = path.join(CONFIG_DIR, `${configId}.json`);
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.isActive = isActive;
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    if (isActive) {
      tradingEngine.startTrading(config);
    } else {
      tradingEngine.stopTrading(config);
    }
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete configuration
app.delete('/api/configs/:id', (req, res) => {
  try {
    const configId = req.params.id;
    const configPath = path.join(CONFIG_DIR, `${configId}.json`);
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    tradingEngine.stopTrading({ id: configId });
    fs.unlinkSync(configPath);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  tradingEngine.init();
});