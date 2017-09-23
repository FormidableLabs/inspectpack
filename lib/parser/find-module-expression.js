"use strict";

const _ = require("lodash/fp");

const hasBootstrapComment = _.flow(
  _.get("comments[1].value"),
  _.trim,
  (comment) => comment === "webpackBootstrap"
);
const getStandardModules = _.get(
  "program.body[0].expression.arguments[0]"
);
const getDllModules = _.get(
  "program.body[0].declarations[0].init.arguments[0]"
);

const isJsonp = _.flow(
  _.get("program.body[0].expression.callee.name"),
  (name) => name === "webpackJsonp"
);
// All arguments except for the second are internal webpack ids
const getJsonpModules = _.get("program.body[0].expression.arguments[1]");

module.exports = (ast) =>
  isJsonp(ast) && getJsonpModules(ast) ||
  hasBootstrapComment(ast) && (
    getDllModules(ast) ||
    getStandardModules(ast)
  );
