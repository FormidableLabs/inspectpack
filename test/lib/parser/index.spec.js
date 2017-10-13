"use strict";

const expect = require("chai").expect;

const parse = require("../../../lib/parser/index");

describe.only("lib/parser/index", () => {
  it("handles no-match cases", () => {
    expect(parse("")).to.eql([]);
    expect(parse("(function () {}());")).to.eql([]);
    expect(parse("noMatch([0],[])")).to.eql([]);
  });

  it("handles normal webpack array", () => {
    expect(parse(`
/******/ (function(modules) { // webpackBootstrap
/******/ 	// SNIPPED
/******/ })
/************************************************************************/
/******/ ([]);
    `))
      .to.have.length(1).and
      .to.have.deep.property("[0].type", "empty");
  });

  it("handles DLL array");
  it("handles webpackJsonp array");
  it("handles webpackJsonp array concat");
  it("handles webpackJsonp object");
});
