"use strict";

const expect = require("chai").expect;
const parse = require("babylon").parse;

const findModuleExpression = require("../../../lib/parser/find-module-expression");
const find = (src) => findModuleExpression(parse(src, { sourceType: "module" }));

describe("lib/parser/find-module-expression", () => {
  it("handles no-match cases", () => {
    expect(find("")).to.equal(false);
    expect(find("(function () {}());")).to.equal(false);
    expect(find("noMatch([0],[])")).to.equal(false);
  });

  it("finds various module types", () => {
    expect(find(`
/******/ (function(modules) { // webpackBootstrap
/******/ 	// SNIPPED
/******/ })
/************************************************************************/
/******/ ([]);
    `))
      .to.have.property("type", "ArrayExpression");

    expect(find("webpackJsonp([0],[])")).to.have.property("type", "ArrayExpression");
    expect(find("webpackJsonp([0],{})")).to.have.property("type", "ObjectExpression");

    expect(find("webpackJsonp([0],Array(0).concat([]))"))
      .to.have.property("type", "CallExpression");
  });
});
