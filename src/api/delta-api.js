const axios = require('axios');
const crypto = require('crypto');

class DeltaExchangeAPI {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = 'https://api.delta.exchange';
  }

  /**
   * Generate signature for API authentication
   * @param {string} method HTTP method
   * @param {string} requestPath API endpoint path
   * @param {Object} params Request parameters
   * @returns {string} Signature
   */
  generateSignature(method, requestPath, params = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    let queryString = '';
    
    if (method === 'GET' && Object.keys(params).length) {
      queryString = '?' + new URLSearchParams(params).toString();
    }
    
    const signaturePayload = {
      method,
      requestPath: requestPath + queryString,
      timestamp,
      apiKey: this.apiKey
    };
    
    if (method !== 'GET') {
      signaturePayload.body = params;
    }
    
    const payload = JSON.stringify(signaturePayload);
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
    
    return {
      signature,
      timestamp
    };
  }

  /**
   * Make authenticated request to Delta Exchange API
   * @param {string} method HTTP method
   * @param {string} endpoint API endpoint
   * @param {Object} params Request parameters
   * @returns {Promise} API response
   */
  async makeRequest(method, endpoint, params = {}) {
    const requestPath = `/v2${endpoint}`;
    const { signature, timestamp } = this.generateSignature(method, requestPath, params);
    
    const headers = {
      'api-key': this.apiKey,
      'timestamp': timestamp.toString(),
      'signature': signature,
      'Content-Type': 'application/json'
    };
    
    try {
      let response;
      const url = `${this.baseUrl}${requestPath}`;
      
      if (method === 'GET') {
        response = await axios.get(url, { headers, params });
      } else if (method === 'POST') {
        response = await axios.post(url, params, { headers });
      } else if (method === 'DELETE') {
        response = await axios.delete(url, { headers, data: params });
      }
      
      return response.data;
    } catch (error) {
      console.error(`API Error (${method} ${endpoint}):`, error.response?.data || error.message);
      throw error;
    }
  }

  // Market Data Methods
  async getProducts() {
    return this.makeRequest('GET', '/products');
  }

  async getOrderbook(symbol) {
    return this.makeRequest('GET', '/orderbook', { symbol });
  }

  async getTicker(symbol) {
    return this.makeRequest('GET', '/tickers', { symbol });
  }
  
  /**
   * Get historical price data
   * @param {string} symbol Trading symbol
   * @param {string} timeframe Timeframe (1h, 4h, 1d)
   * @returns {Promise} Historical price data
   */
  async getHistoricalData(symbol, timeframe = '1h') {
    // Convert timeframe to seconds
    const timeframeMap = {
      '1h': 3600,
      '4h': 14400,
      '1d': 86400
    };
    
    const interval = timeframeMap[timeframe] || 3600;
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (interval * 100); // Get 100 candles
    
    return this.makeRequest('GET', '/chart/history', {
      symbol,
      resolution: timeframe,
      from: startTime,
      to: endTime
    });
  }

  // Trading Methods
  async placeOrder(orderData) {
    return this.makeRequest('POST', '/orders', orderData);
  }

  async cancelOrder(orderId) {
    return this.makeRequest('DELETE', `/orders/${orderId}`);
  }

  async getOpenOrders(symbol) {
    return this.makeRequest('GET', '/orders', { symbol, status: 'open' });
  }

  // Account Methods
  async getWalletBalance() {
    return this.makeRequest('GET', '/wallet/balances');
  }

  async getPositions() {
    return this.makeRequest('GET', '/positions');
  }
}

module.exports = { DeltaExchangeAPI };