var path = require('path'),
    fs = require('vow-fs'),
    vowNode = require('vow-node'),
    chalk = require('chalk'),
    PngImg = require('png-img'),
    looksSame = require('looks-same');

var TOLERANCE = 20;

module.exports = function(testBasePath, referencePath, diffPath) {
    return function async(x, y, width, height, screenshotId) {
        var selector,
            screenshot;

        if(arguments.length === 1) {
            screenshotId = x;
        }
        else if(arguments.length === 2) {
            selector = x;
            screenshotId = y;
        }

        return this
            .saveScreenshot().then(function(screenshotBuffer) {
                screenshot = new PngImg(screenshotBuffer);
            })
            .then(function() {
                return selector?
                    this.isVisible(selector).then(function(isVisible) {
                        if(!isVisible) {
                            throw new Error('Element "' + selector + '" could not be snapped because it is not visible');
                        }
                        return true;
                    })
                    .getLocationInView(selector).then(function(location) {
                        return this.getElementSize(selector).then(function(elementSize) {
                            return {
                                x : location.x,
                                y : location.y,
                                width : elementSize.width,
                                height : elementSize.height
                            };
                        })
                    }) :
                    { x : x || 0, y : y || 0, width : width || +Infinity, height : height || +Infinity }
            })
            .then(function(dimensions) {
                var screenshotSize = screenshot.size();

                return screenshot.crop(
                    Math.max(dimensions.x, 0),
                    Math.max(dimensions.y, 0),
                    Math.min(dimensions.width, screenshotSize.width),
                    Math.min(dimensions.height, screenshotSize.height)
                );
            })
            .then(function(screenshot) {
                var screenshotPath = getScreenshotPath(this.executionContext, screenshotId),
                    browserId = this.executionContext.browserId;

                return fs.exists(screenshotPath).then(function(referenceScreenshotExists) {
                    if(referenceScreenshotExists) {
                        return fs.makeTmpFile().then(function(tempPath) {
                            return saveScreenshot(screenshot, tempPath)
                                .then(function() {
                                    return compareScreenshots(tempPath, screenshotPath);
                                })
                                .then(function(screenshotsLookSame) {
                                    if(screenshotsLookSame) {
                                        return fs.remove(tempPath);
                                    }
                                    return saveScreenshotsDiff(getDiffPath(screenshotPath), tempPath, screenshotPath)
                                        .then(function() {
                                            return fs.remove(tempPath);
                                        })
                                        .then(function() {
                                            throw new Error(
                                                'Screenshot "' +
                                                screenshotId +
                                                '" doesn\'t match to reference. See diff in func-test/screenshots-diff');
                                        });
                                });
                        });
                    }
                    else {
                        return saveScreenshot(screenshot, screenshotPath).then(function() {
                            console.warn(chalk.red(
                                'Reference screenshot "' +
                                screenshotId +
                                '" for browser "' +
                                browserId +
                                '" does not exist. Saving it now. Verify it manually after tests will have passed'));
                            return true; // to make async command return a value;
                        });
                    }
                });
            });
    };

    function getScreenshotPath(executionContext, id) {
        return path.relative(process.cwd(), executionContext.file)
            .replace(/\.js$/, '')
            .replace(new RegExp('^' + testBasePath), referencePath) +
                '/' + id + '.' + executionContext.browserId + '.png';
    }

    function getDiffPath(referenceScreenshot) {
        return referenceScreenshot.replace(new RegExp('^' + referencePath), diffPath);
    }
};

function saveScreenshot(screenshot, filePath) {
    return fs.makeDir(path.dirname(filePath)).then(function() {
        return vowNode.invoke(screenshot.save.bind(screenshot), filePath);
    });
}

function compareScreenshots(screenshot, referenceScreenshot) {
    return vowNode.invoke(looksSame, screenshot, referenceScreenshot, { tolerance : TOLERANCE });
}

function saveScreenshotsDiff(screenshot, referenceScreenshot, diffPath) {
    return fs.makeDir(path.dirname(diffPath))
        .then(function() {
            return vowNode.invoke(looksSame.createDiff.bind(looksSame), {
                current : screenshot,
                reference : referenceScreenshot,
                diff : diffPath,
                tolerance : TOLERANCE,
                highlightColor : '#00ff00'
            });
        });
}

