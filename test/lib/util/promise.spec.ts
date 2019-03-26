import {
  serial,
} from "../../../src/lib/util/promise";

describe("lib/util/promise", () => {

  describe("serial", () => {
    it("handles base cases", () =>
      serial([])
        .then((vals) => {
          expect(vals).to.eql([]);
        }),
    );

    it("handles arrays", () =>
      serial([
        () => Promise.resolve(10),
        () => Promise.resolve(20),
      ])
        .then((vals) => {
          expect(vals).to.eql([
            10,
            20,
          ]);
        }),
    );
  });
});
