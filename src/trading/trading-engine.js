const fs = require('fs').promises;
const path = require('path');

class TradingEngine {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.configurations = [];
    this.activeTraders = new Map();
    this.configPath = path.join(__dirname, '../config/user-configurations.json');
  }

  /**
   * Add a new trading configuration
   * @param {Object} config Trading configuration
   */
  async addConfiguration(config) {
    // Generate ID if not provided
    if (!config.id) {
      config.id = Date.now().toString();
    }
    
    // Add timestamp
    config.createdAt = new Date().toISOString();
    
    // Add to configurations list
    const existingIndex = this.configurations.findIndex(c => c.id === config.id);
    if (existingIndex >= 0) {
      this.configurations[existingIndex] = config;
    } else {
      this.configurations.push(config);
    }
    
    // Save to file
    await this.saveConfigurations();
    return config;
  }

  /**
   * Get all trading configurations
   */
  async getConfigurations() {
    return this.configurations;
  }

  /**
   * Save configurations to file
   */
  async saveConfigurations() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write configurations to file
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.configurations, null, 2)
      );
    } catch (error) {
      console.error('Error saving configurations:', error);
      throw error;
    }
  }

  /**
   * Start trading for a specific configuration
   * @param {string} configId Configuration ID
   */
  async startTrading(configId) {
    const config = this.configurations.find(c => c.id === configId);
    if (!config) {
      throw new Error(`Configuration with ID ${configId} not found`);
    }
    
    if (this.activeTraders.has(configId)) {
      console.log(`Trading already active for configuration ${configId}`);
      return;
    }
    
    console.log(`Starting trading for configuration: ${config.name || config.id}`);
    
    // Create trading interval
    const intervalId = setInterval(async () => {
      try {
        await this.evaluateAndExecute(config);
      } catch (error) {
        console.error(`Error in trading cycle for ${config.id}:`, error);
      }
    }, config.checkInterval || 60000); // Default to checking every minute
    
    // Store active trader
    this.activeTraders.set(configId, {
      intervalId,
      config,
      lastCheck: new Date()
    });
    
    // Run initial evaluation
    this.evaluateAndExecute(config).catch(err => {
      console.error(`Initial evaluation error for ${config.id}:`, err);
    });
  }

  /**
   * Stop trading for a specific configuration
   * @param {string} configId Configuration ID
   */
  async stopTrading(configId) {
    const trader = this.activeTraders.get(configId);
    if (!trader) {
      console.log(`No active trading for configuration ${configId}`);
      return;
    }
    
    clearInterval(trader.intervalId);
    this.activeTraders.delete(configId);
    console.log(`Stopped trading for configuration: ${trader.config.name || configId}`);
  }

  /**
   * Evaluate trading conditions and execute trades
   * @param {Object} config Trading configuration
   */
  async evaluateAndExecute(config) {
    console.log(`Evaluating conditions for ${config.name || config.id}`);
    
    try {
      // Get current market data
      const ticker = await this.apiClient.getTicker(config.symbol);
      if (!ticker) {
        throw new Error(`Failed to get ticker data for ${config.symbol}`);
      }
      
      const currentPrice = parseFloat(ticker.last_price);
      console.log(`Current price for ${config.symbol}: ${currentPrice}`);
      
      // Evaluate each condition
      for (const condition of config.conditions) {
        const shouldExecute = await this.evaluateCondition(condition, currentPrice, config.symbol);
        
        if (shouldExecute) {
          await this.executeTrade(condition, config);
        }
      }
    } catch (error) {
      console.error(`Error evaluating conditions for ${config.id}:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a single trading condition
   * @param {Object} condition Trading condition
   * @param {number} currentPrice Current price
   * @param {string} symbol Trading symbol
   */
  async evaluateCondition(condition, currentPrice, symbol) {
    const { type, value, operator, timeframe } = condition;
    
    // Simple price condition
    if (type === 'price') {
      const targetPrice = parseFloat(value);
      
      switch (operator) {
        case 'above':
          return currentPrice > targetPrice;
        case 'below':
          return currentPrice < targetPrice;
        case 'equals':
          // Allow small deviation for equality
          return Math.abs(currentPrice - targetPrice) < (targetPrice * 0.001);
        default:
          console.error(`Unknown operator: ${operator}`);
          return false;
      }
    }
    
    // Moving Average crossover
    if (type === 'ma_cross') {
      try {
        // Get historical data for MA calculation
        const historicalData = await this.apiClient.getHistoricalData(symbol);
        
        // Calculate MAs
        const prices = historicalData.map(candle => parseFloat(candle.close));
        const firstMA = this.calculateMA(prices, condition.period, condition.maType);
        const secondMA = this.calculateMA(prices, condition.secondPeriod, condition.maType);
        
        // Check for crossover
        const currentFirstMA = firstMA[firstMA.length - 1];
        const prevFirstMA = firstMA[firstMA.length - 2];
        const currentSecondMA = secondMA[secondMA.length - 1];
        const prevSecondMA = secondMA[secondMA.length - 2];
        
        if (operator === 'crosses_above') {
          return prevFirstMA <= prevSecondMA && currentFirstMA > currentSecondMA;
        } else if (operator === 'crosses_below') {
          return prevFirstMA >= prevSecondMA && currentFirstMA < currentSecondMA;
        }
      } catch (error) {
        console.error(`Error calculating MA crossover:`, error);
        return false;
      }
    }
    
    // RSI condition
    if (type === 'rsi') {
      try {
        // Get historical data for RSI calculation
        const historicalData = await this.apiClient.getHistoricalData(symbol);
        const prices = historicalData.map(candle => parseFloat(candle.close));
        
        // Calculate RSI
        const rsiValue = this.calculateRSI(prices, condition.period);
        const targetValue = parseFloat(value);
        
        if (operator === 'above') {
          return rsiValue > targetValue;
        } else if (operator === 'below') {
          return rsiValue < targetValue;
        }
      } catch (error) {
        console.error(`Error calculating RSI:`, error);
        return false;
      }
    }
    
    // Volume condition
    if (type === 'volume') {
      try {
        // Get current volume data
        const ticker = await this.apiClient.getTicker(symbol);
        const currentVolume = parseFloat(ticker.volume_24h);
        const targetVolume = parseFloat(value);
        
        if (operator === 'above') {
          return currentVolume > targetVolume;
        } else if (operator === 'below') {
          return currentVolume < targetVolume;
        } else if (operator === 'equals') {
          return Math.abs(currentVolume - targetVolume) < (targetVolume * 0.1);
        }
      } catch (error) {
        console.error(`Error evaluating volume condition:`, error);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Calculate Moving Average
   * @param {Array} prices Array of price data
   * @param {number} period MA period
   * @param {string} type MA type (sma or ema)
   * @returns {Array} Array of MA values
   */
  calculateMA(prices, period, type = 'sma') {
    if (prices.length < period) {
      return [];
    }
    
    const result = [];
    
    if (type === 'sma') {
      // Simple Moving Average
      for (let i = period - 1; i < prices.length; i++) {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    } else if (type === 'ema') {
      // Exponential Moving Average
      const multiplier = 2 / (period + 1);
      
      // First EMA is SMA
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result.push(ema);
      
      // Calculate EMA for remaining prices
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
        result.push(ema);
      }
    }
    
    return result;
  }

  /**
   * Calculate RSI (Relative Strength Index)
   * @param {Array} prices Array of price data
   * @param {number} period RSI period
   * @returns {number} RSI value
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) {
      return 50; // Default to neutral if not enough data
    }
    
    // Calculate price changes
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    // Calculate average gains and losses
    let gains = 0;
    let losses = 0;
    
    for (let i = 0; i < period; i++) {
      if (changes[i] >= 0) {
        gains += changes[i];
      } else {
        losses += Math.abs(changes[i]);
      }
    }
    
    // Calculate initial RS
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculate smoothed RS for remaining periods
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      
      if (change >= 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }
    
    // Calculate RSI
    if (avgLoss === 0) {
      return 100; // No losses, RSI is 100
    }
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Execute a trade based on condition
   * @param {Object} condition Trading condition that triggered
   * @param {Object} config Trading configuration
   */
  async executeTrade(condition, config) {
    const { action, quantity, symbol } = condition;
    const tradeSymbol = symbol || config.symbol;
    
    console.log(`Executing ${action} trade for ${tradeSymbol}, quantity: ${quantity}`);
    
    try {
      // Get current price for stop-loss and take-profit calculations
      const ticker = await this.apiClient.getTicker(tradeSymbol);
      const currentPrice = parseFloat(ticker.last_price);
      
      // Calculate stop-loss and take-profit prices if provided
      let stopLossPrice = null;
      let takeProfitPrice = null;
      
      if (condition.stopLoss) {
        // Calculate stop loss price based on percentage
        if (action.toLowerCase() === 'buy') {
          // For buy orders, stop loss is below entry price
          stopLossPrice = currentPrice * (1 - condition.stopLoss / 100);
        } else {
          // For sell orders, stop loss is above entry price
          stopLossPrice = currentPrice * (1 + condition.stopLoss / 100);
        }
      }
      
      if (condition.takeProfit) {
        // Calculate take profit price based on percentage
        if (action.toLowerCase() === 'buy') {
          // For buy orders, take profit is above entry price
          takeProfitPrice = currentPrice * (1 + condition.takeProfit / 100);
        } else {
          // For sell orders, take profit is below entry price
          takeProfitPrice = currentPrice * (1 - condition.takeProfit / 100);
        }
      }
      
      // Calculate position size based on risk percentage if provided
      let positionSize = quantity;
      if (condition.riskPercent) {
        try {
          // Get account balance
          const balances = await this.apiClient.getWalletBalance();
          const totalBalance = parseFloat(balances.total_balance);
          
          // Calculate risk amount
          const riskAmount = totalBalance * (condition.riskPercent / 100);
          
          // Calculate position size if stop loss is set
          if (stopLossPrice) {
            const riskPerUnit = Math.abs(currentPrice - stopLossPrice);
            if (riskPerUnit > 0) {
              positionSize = riskAmount / riskPerUnit;
              console.log(`Position size adjusted to ${positionSize} based on risk management`);
            }
          }
        } catch (error) {
          console.error('Error calculating position size based on risk:', error);
          // Fall back to the original quantity
        }
      }
      
      // Prepare order data
      const orderData = {
        symbol: tradeSymbol,
        size: positionSize.toString(),
        type: 'market', // Market order by default
        side: action.toLowerCase(), // 'buy' or 'sell'
        stopLossPrice: stopLossPrice ? stopLossPrice.toString() : undefined,
        takeProfitPrice: takeProfitPrice ? takeProfitPrice.toString() : undefined
      };
      
      // Execute the order
      const result = await this.apiClient.placeOrder(orderData);
      console.log(`Order placed successfully:`, result);
      
      // Record the trade
      await this.recordTrade({
        configId: config.id,
        condition: condition,
        order: result,
        entryPrice: currentPrice,
        stopLossPrice,
        takeProfitPrice,
        timestamp: new Date().toISOString()
      });
      
      return result;
    } catch (error) {
      console.error(`Error executing trade:`, error);
      throw error;
    }
  }

  /**
   * Record trade for history and analysis
   * @param {Object} tradeData Trade data to record
   */
  async recordTrade(tradeData) {
    // In a production system, this would save to a database
    // For now, we'll just log it
    console.log('Trade executed:', tradeData);
  }
}

module.exports = { TradingEngine };