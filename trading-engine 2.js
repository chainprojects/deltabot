const fs = require('fs');
const path = require('path');

class TradingEngine {
  constructor(deltaApi) {
    this.deltaApi = deltaApi;
    this.activeConfigs = new Map();
    this.configDir = path.join(__dirname, 'configs');
    this.checkInterval = 30000; // 30 seconds
  }

  init() {
    console.log('Initializing trading engine...');
    
    // Load all configurations
    if (fs.existsSync(this.configDir)) {
      const files = fs.readdirSync(this.configDir);
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const configData = fs.readFileSync(path.join(this.configDir, file), 'utf8');
            const config = JSON.parse(configData);
            
            if (config.isActive) {
              this.startTrading(config);
            }
          } catch (error) {
            console.error(`Error loading config ${file}:`, error);
          }
        }
      });
    }
  }

  startTrading(config) {
    if (this.activeConfigs.has(config.id)) {
      return;
    }
    
    console.log(`Starting trading for config ${config.id}`);
    
    const intervalId = setInterval(() => this.processTrades(config), this.checkInterval);
    this.activeConfigs.set(config.id, intervalId);
    
    // Process immediately
    this.processTrades(config);
  }

  stopTrading(config) {
    if (!this.activeConfigs.has(config.id)) {
      return;
    }
    
    console.log(`Stopping trading for config ${config.id}`);
    
    clearInterval(this.activeConfigs.get(config.id));
    this.activeConfigs.delete(config.id);
  }

  async processTrades(config) {
    try {
      // Reload config to get latest state
      const configPath = path.join(this.configDir, `${config.id}.json`);
      const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      for (const trade of updatedConfig.trades) {
        await this.processTrade(updatedConfig, trade);
      }
      
      // Save updated config
      fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    } catch (error) {
      console.error(`Error processing trades for config ${config.id}:`, error);
    }
  }

  async processTrade(config, trade) {
    try {
      if (trade.status === 'completed' || trade.status === 'stopped') {
        return;
      }
      
      const currentPrice = await this.deltaApi.getMarketPrice(trade.symbol);
      
      // Process entry conditions
      if (trade.status === 'pending') {
        if (this.isEntryConditionMet(currentPrice, trade)) {
          await this.executeEntry(trade);
          trade.status = 'active';
          trade.entryPrice = currentPrice;
          trade.entryTime = new Date().toISOString();
          console.log(`Trade ${trade.id} entered at ${currentPrice}`);
        }
      }
      
      // Process stop-loss for active trades
      if (trade.status === 'active' && trade.stopLossPrice) {
        if (this.isStopLossTriggered(currentPrice, trade)) {
          await this.executeStopLoss(trade);
          trade.status = 'stopped';
          trade.exitPrice = currentPrice;
          trade.exitTime = new Date().toISOString();
          console.log(`Trade ${trade.id} stopped at ${currentPrice} (stop-loss)`);
        }
      }
      
      // Process take-profit for active trades
      if (trade.status === 'active' && trade.takeProfitPrice) {
        if (this.isTakeProfitTriggered(currentPrice, trade)) {
          await this.executeTakeProfit(trade);
          trade.status = 'completed';
          trade.exitPrice = currentPrice;
          trade.exitTime = new Date().toISOString();
          console.log(`Trade ${trade.id} completed at ${currentPrice} (take-profit)`);
        }
      }
    } catch (error) {
      console.error(`Error processing trade ${trade.id}:`, error);
    }
  }

  isEntryConditionMet(currentPrice, trade) {
    switch (trade.entryCondition) {
      case 'above':
        return currentPrice >= trade.entryPrice;
      case 'below':
        return currentPrice <= trade.entryPrice;
      case 'equals':
        return Math.abs(currentPrice - trade.entryPrice) < 0.01 * trade.entryPrice;
      default:
        return false;
    }
  }

  isStopLossTriggered(currentPrice, trade) {
    if (trade.side === 'buy') {
      return currentPrice <= trade.stopLossPrice;
    } else {
      return currentPrice >= trade.stopLossPrice;
    }
  }

  isTakeProfitTriggered(currentPrice, trade) {
    if (trade.side === 'buy') {
      return currentPrice >= trade.takeProfitPrice;
    } else {
      return currentPrice <= trade.takeProfitPrice;
    }
  }

  async executeEntry(trade) {
    return this.deltaApi.placeOrder(
      trade.symbol,
      trade.side,
      trade.quantity,
      trade.entryPrice,
      'limit'
    );
  }

  async executeStopLoss(trade) {
    const oppositeSide = trade.side === 'buy' ? 'sell' : 'buy';
    return this.deltaApi.placeOrder(
      trade.symbol,
      oppositeSide,
      trade.quantity
    );
  }

  async executeTakeProfit(trade) {
    const oppositeSide = trade.side === 'buy' ? 'sell' : 'buy';
    return this.deltaApi.placeOrder(
      trade.symbol,
      oppositeSide,
      trade.quantity
    );
  }
}

module.exports = TradingEngine;