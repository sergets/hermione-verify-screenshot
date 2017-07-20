# hermione-verify-screenshot [![npm module](https://img.shields.io/npm/v/hermione-verify-screenshot.svg?style=flat)](https://www.npmjs.com/package/hermione-verify-screenshot)

Screenshot comparing plugin for [Hermione](https://github.com/gemini-testing/hermione)

## Usage

- Install npm package.
- Add a plugin declaration to your `hermione.conf.js`:

````js
plugins : {
    'verify-screenshot' : {
        testBasePath : '/func-test/tests',
        referencePath : '/func-test/screenshots',
        unmatchedPath : '/func-test/screenshots-unmatched',
        diffPath : '/func-test/screenshots-diff'
    }
}
````
`testBasePath` is a path under which your test suites are stored.<br>
`referencePath` is a path under which reference screenshots would be stored.<br>
`unmatchedPath` is a path under which you will find image when screenshots do not match to reference.<br>
`diffPath` is a path under which you will find image diffs when screenshots do not match to reference.

- Use `verifyScreenshot` command in your tests. It takes anything that should be shot (a x-y-width-height dimension set, a selector, or nothing meaning full window), and an arbitrary string (actually, a file name of screenshot).

````js
it('should look like we want it', function() {
    return this.browser
        .verifyScreenshot(50, 50, 100, 100, '100-by-100-square')
        .verifyScreenshot(50, 50, 100, 100, '100-by-100-square', {
            excludes: [{
                selector: '.exclude-node'
            }]
        })
        .verifyScreenshot('#selector', 'selector', {
            excludes: [{
                selector: '.exclude-node'
            }]
        })
        .verifyScreenshot('full-browser-window', {
            excludes: [{
                selector: '.exclude-node'
            }]
        })
        .verifyScreenshot('#selector', 'selector', {
            excludes: [{
                selector: '.exclude-node',
                color: '#0000ff'
            }, {
                selector: '.another-exclude-node-to-fill' // default color is #ff0000
            }]
        });
})
````

- Run tests. On first run screenshots will be taken and stored in `referencePath` folder. The file structure mimics structure of tests. So, if test suite is at `{testBasePath}/some/dir/my-test.js`, screenshots from it will be stored at `{referencePath}/some/dir/my-test/{screenshot name}.{browser}.png`. Then you might want to manually test whether screenshots are good.
