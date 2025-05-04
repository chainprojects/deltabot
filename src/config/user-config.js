const fs = require('fs').promises;
const path = require('path');

/**
 * Load user configurations from file
 * @returns {Promise<Array>} Array of user configurations
 */
async function loadUserConfigurations() {
  const configPath = path.join(__dirname, 'user-configurations.json');
  
  try {
    // Check if file exists
    await fs.access(configPath);
    
    // Read and parse configurations
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error loading configurations:', error);
    throw error;
  }
}

/**
 * Save user configuration to file
 * @param {Object} config Configuration to save
 * @returns {Promise<Object>} Saved configuration
 */
async function saveUserConfiguration(config) {
  const configPath = path.join(__dirname, 'user-configurations.json');
  
  try {
    // Load existing configurations
    let configurations = [];
    try {
      configurations = await loadUserConfigurations();
    } catch (error) {
      // If error loading, start with empty array
      configurations = [];
    }
    
    // Add or update configuration
    const existingIndex = configurations.findIndex(c => c.id === config.id);
    if (existingIndex >= 0) {
      configurations[existingIndex] = config;
    } else {
      // Generate ID if not provided
      if (!config.id) {
        config.id = Date.now().toString();
      }
      config.createdAt = new Date().toISOString();
      configurations.push(config);
    }
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    
    // Write configurations to file
    await fs.writeFile(
      configPath,
      JSON.stringify(configurations, null, 2)
    );
    
    return config;
  } catch (error) {
    console.error('Error saving configuration:', error);
    throw error;
  }
}

module.exports = {
  loadUserConfigurations,
  saveUserConfiguration
};