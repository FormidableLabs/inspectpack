/* eslint-disable no-magic-numbers */

module.exports = (webpack, config, vers) => {
  if (webpack) {
    // Use expose loader to make global
    config.module = config.module || {};
    config.module.rules = config.module.rules.concat([
      {
        test: require.resolve("./src/bunny.js"),
        use: vers === 1 ? "expose-loader?BunBun" : [
          {
            loader: "expose-loader",
            // webpack5 version of options.
            options: vers <= 5 ? "BunBun" : { exposes: "BunBun" }
          }
        ]
      }
    ]);
  }

  return config;
};
