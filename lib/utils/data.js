"use strict";

var _ = require("lodash/fp");

/**
 * Data helpers.
 */
module.exports = {
  // Sum up meta properties.
  metaSum: function (props) {
    return _.reduce(function (m, g) {
      return m + _.get(props)(g.meta || g);
    }, 0); // eslint-disable-line no-magic-numbers
  }
};
