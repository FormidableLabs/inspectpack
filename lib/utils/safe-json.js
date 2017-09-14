"use strict";

module.exports = class SafeJSON {
  static parse(string) {
    try {
      return JSON.parse(string);
    } catch (err) {
      return null;
    }
  }

  static stringify(object) {
    try {
      return JSON.stringify(object);
    } catch (err) {
      return null;
    }
  }
};
