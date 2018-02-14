Contributing
============

Thanks for helping out!

## Checks, Tests

Before opening a PR, make sure to run:

- `npm run check`: What CI will run.
- `npm run benchmark`: Extra, slow benchmarks for the library.


## Releases

```sh
# History
$ vim HISTORY.md
$ git add HISTORY.md
$ git commit -m "History for vVERSION_NUMBER"

# Publish
$ npm run version <major|minor|patch|VERSION_NUMBER>
$ npm publish
$ git push && git push --tags
````
