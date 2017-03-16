module.exports = function(hermione, opts) {
    hermione.on(hermione.events.SESSION_START, function(browser) {
        browser.addCommand('verifyScreenshot', require('./command.js')(opts.testBasePath, opts.referencePath, opts.diffPath));
    });
};
