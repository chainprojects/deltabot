const axios = require('axios');
const crypto = require('crypto');

class DeltaAPI {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://api.delta.exchange';
  }

  generateSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method + requestPath + body;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('hex');
  }

  async request(method, endpoint, data = null) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const requestPath = '/v2' + endpoint;
      const body = data ? JSON.stringify(data) : '';
      
      const signature = this.generateSignature(timestamp, method, requestPath, body);
      
      const headers = {
        'API-Key': this.apiKey,
        'API-Signature': signature,
        'API-Timestamp': timestamp,
        'Content-Type': 'application/json'
      };
      
      const response = await axios({
        method,
        url: this.baseUrl + requestPath,
        headers,
        data: data || undefined
      });
      
      return response.data;
    } catch (error) {
      console.error('Delta API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getMarketPrice(symbol) {
    const response = await this.request('GET', `/products?symbol=${symbol}`);
    if (response.result && response.result.length > 0) {
      const product = response.result[0];
      return parseFloat(product.mark_price);
    }
    throw new Error(`Symbol ${symbol} not found`);
  }

  async placeOrder(symbol, side, size, price = null, orderType = 'market') {
    const data = {
      symbol,
      side: side.toLowerCase(),
      size,
      order_type: orderType
    };
    
    if (price && orderType !== 'market') {
      data.price = price;
    }
    
    return this.request('POST', '/orders', data);
  }

  async getOpenPositions() {
    return this.request('GET', '/positions?status=open');
  }

  async placeStopLossOrder(symbol, side, size, stopPrice) {
    const data = {
      symbol,
      side: side.toLowerCase(),
      size,
      order_type: 'stop_market',
      stop_price: stopPrice
    };
    
    return this.request('POST', '/orders', data);
  }
}

module.exports = DeltaAPI;