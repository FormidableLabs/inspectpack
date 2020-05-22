Contributing
============

Thanks for contributing!

## Development

Install the project using `yarn` (which we've standardized on for development):

```sh
$ yarn install
```

`tl:dr` - You can run everything with:

```sh
$ yarn run build
$ yarn run build-test
$ yarn run check
```

### Testing

Our tests rely on a number of webpack-created application bundles and stats
files that are not placed into source. The application and webpack config files
for these fixtures are written in JavaScript, not TypeScript. Before starting
work, you will need to run:

```sh
$ yarn run build-test
```

and re-run it whenever something in `test/fixtures` changes. If you add a
completely _new_ scenario, like `test/fixtures/<new-scenario>` it needs to have
a buildable `src/index.js` file and you will need to add an entry in the
[`test/fixtures/config/scenarios.json`](./test/fixtures/config/scenarios.json)
file to have the build pick it up.

Other than this, all of our tests are written in TypeScript like our library
source. You can run the tests with:

```sh
$ yarn run test
```

### Style

We run TypeScript linting on our library source ([`src`](./src)) + tests and
JavaScript linting on our test fixtures ([`test/fixtures`](./test/fixtures)). You
can lint with:

```sh
$ yarn run tslint
$ yarn run eslint

# ... or both together ...
$ yarn run lint
```

### Quality

Some miscellaneous things we periodically do:

#### Check unused exports

Some things in `src/lib/index.ts` we _may_ wish to export without consuming in
either `src/bin/inspectpack.ts` or `test/**/*.ts`, but generally speaking we
keep the public API surface down to an absolute minimum. To help with this, we
can run tools to list out all unused exports:

```sh
$ npm install -g ts-unused-exports
# Mac/linux-only command.
$ ts-unused-exports tsconfig.lint.json $(find {src,test} -name "*.ts")
```

## Before submitting a PR...

Before you go ahead and submit a PR, make sure that you have done the following:

```sh
$ yarn run build
$ yarn run build-test
$ yarn run check
```

## Releasing a new version to NPM

_Only for project administrators_.

1. Update `HISTORY.md`, following format for previous versions
2. Commit as "History for version NUMBER"
3. Run `npm version patch` (or `minor|major|VERSION`) to run tests and lint,
   build published directories, then update `package.json` + add a git tag.
4. Run `npm publish` and publish to NPM if all is well.
5. Run `git push && git push --tags`
