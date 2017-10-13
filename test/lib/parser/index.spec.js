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

    expect(parse(`
/******/ (function(modules) { // webpackBootstrap
/******/ 	// SNIPPED
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/*!*****************!*\
  !*** ./foo.js ***!
  \*****************/
/*! exports provided:  */
/*! all exports used */
/***/ (function(module, __webpack_exports__, __webpack_require__) {
var foo = "foo";
/***/ })
/******/ ]);
    `))
      .to.have.length(1).and
      .to.have.deep.property("[0].type", "code");
  });

  it("handles DLL array", () => {
    expect(parse(`
var lib_00d73d25eef8ddd2ed11 =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// SNIPPED
/******/ })
/************************************************************************/
/******/ ([]);
    `))
      .to.have.length(1).and
      .to.have.deep.property("[0].type", "empty");

    expect(parse(`
var lib_00d73d25eef8ddd2ed11 =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// SNIPPED
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/*!*****************!*\
  !*** ./foo.js ***!
  \*****************/
/*! exports provided:  */
/*! all exports used */
/***/ (function(module, __webpack_exports__, __webpack_require__) {
var foo = "foo";
/***/ })
/******/ ]);
    `))
      .to.have.length(1).and
      .to.have.deep.property("[0].type", "code");
  });

  it("handles webpackJsonp array", () => {
    expect(parse(`
webpackJsonp([1],[]);
    `))
      .to.have.length(1).and
      .to.have.deep.property("[0].type", "empty");

    const parsed = parse(`
webpackJsonp([1],[
/* 0 */,
/* 1 */
/*!*****************!*\
  !*** ./foo.js ***!
  \*****************/
/*! no static exports found */
/*! all exports used */
/***/ (function(module, exports, __webpack_require__) {
var foo = "foo";
/***/ })
]);
    `);

    expect(parsed).to.have.length(2);
    expect(parsed).to.have.deep.property("[0].type", "nothing");
    expect(parsed).to.have.deep.property("[1].type", "code");
  });

  it("handles webpackJsonp array concat", () => {
    expect(parse(`
webpackJsonp([1],{});
    `))
      .to.have.length(1).and
      .to.have.deep.property("[0].type", "empty");

    expect(parse(`
webpackJsonp([1],{
/***/ 3:
/*!****************!*\
  !*** ./foo.js ***!
  \****************/
/*! no static exports found */
/*! all exports used */
/***/ (function(module, exports) {
var foo = "foo";
/***/ })
});
    `))
      .to.have.length(1).and
      .to.have.deep.property("[0].type", "code");
  });

  it("handles webpackJsonp object");
});
