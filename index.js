module.exports = function(hermione, opts) {
    hermione.on(hermione.events.RUNNER_START, function(runner) {
        var oldFn = hermione.config.prepareBrowser;
        hermione.config.prepareBrowser = function(browser) {
        	oldFn(browser);
        	browser.addCommand('verifyScreenshot', require('./command.js')(opts.testBasePath, opts.referencePath, opts.diffPath))
        }
    });
};
