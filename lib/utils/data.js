"use strict";

const _ = require("lodash/fp");

/**
 * Data helpers.
 */
module.exports = {
  // Sum up meta properties.
  metaSum(props) {
    return _.reduce((m, g) => {
      return m + _.get(props)(g.meta || g);
    }, 0); // eslint-disable-line no-magic-numbers
  }
};
