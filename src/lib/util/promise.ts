// Execute promises in serial.
export const serial = (proms: (() => Promise<any>)[]) => proms.reduce(
  (memo, prom) => memo.then((vals) => prom().then((val: any) => vals.concat(val))),
  Promise.resolve([]),
);
