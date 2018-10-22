module.exports = (webpack, config) => {
  if (webpack) {
    // Add multiple entries.
    config.entry = Object.assign({}, config.entry, {
      "bundle-no-duplicates": "./src/index-no-duplicates.js"
    });
  }

  return config;
};
