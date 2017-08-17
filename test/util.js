"use strict";

const finishAsserts = function (done, err, assertion) {
  if (err) { return void done(err); }

  try {
    assertion();
    done();
  } catch (e) {
    done(e);
  }
};

module.exports = {
  finishAsserts
};
