

module.exports = (webpack, config) => {
  if (webpack) {
    config.plugins = (config.plugins || []).concat([
      // From: https://github.com/jmblog/how-to-optimize-momentjs-with-webpack#using-contextreplacementplugin
      new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /es/)
    ]);
  }

  return config;
};
