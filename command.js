var path = require('path'),
    fs = require('vow-fs'),
    vowNode = require('vow-node'),
    chalk = require('chalk'),
    PngImg = require('png-img'),
    looksSame = require('looks-same'),
    vow = require('vow');

module.exports = function(pluginOptions) {
    return function async(x, y, width, height, screenshotId, options) {
        var args = [].slice.apply(arguments);

        options = args.pop();
        screenshotId = typeof options === 'string'? options : args.pop();

        var selector = (args.length === 1) && x,
            screenshot,
            excludeSelectors = options && options.excludes,
            tolerance = options && options.tolerance;

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
                if (!excludeSelectors) {
                    return dimensions;
                }

                var screenshotSize = screenshot.size();
                var excludePromises = excludeSelectors.map(function(excludeNode) {
                    return this
                        .getLocation(excludeNode.selector)
                        .then(function(location) {
                            return this.getElementSize(excludeNode.selector).then(function(elementSize) {
                                var elementSizes = [].concat(elementSize);
                                var locations = [].concat(location);

                                return elementSizes
                                    .map(function(size, i) {
                                        return {
                                            x: locations[i].x,
                                            y: locations[i].y,
                                            width: size.width,
                                            height: size.height,
                                            color: excludeNode.color || '#ff0000'
                                        };
                                    })
                                    .filter(function(rect) {
                                        return rect.x > 0 && (rect.x + rect.width) < screenshotSize.width &&
                                            rect.y > 0 && (rect.y + rect.height) < screenshotSize.height;
                                    })
                                    .map(function(rect) {
                                        return screenshot.fill(rect.x, rect.y, rect.width, rect.height, rect.color);
                                    });
                            });
                        });
                }, this);

                return vow.all(excludePromises)
                    .then(function() {
                        return dimensions;
                    }, function() {
                        return dimensions;
                    });
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
                                    return compareScreenshots(tempPath, screenshotPath, tolerance);
                                })
                                .then(function(screenshotsLookSame) {
                                    if(screenshotsLookSame) {
                                        pluginOptions.verbose && console.log(
                                            chalk.gray(' ... '),
                                            chalk.green('✓'),
                                            chalk.gray('verified ', chalk.bold(screenshotId),' screenshot in ', chalk.bold(executionContext.browserId)));
                                        return fs.remove(tempPath);
                                    }
                                    return saveScreenshotsDiff(tempPath, screenshotPath, getDiffPath(screenshotPath), tolerance)
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
            .replace(new RegExp('^' + pluginOptions.testBasePath), pluginOptions.referencePath) +
                '/' + id + '.' + executionContext.browserId + '.png';
    }

    function getDiffPath(referenceScreenshot) {
        return referenceScreenshot.replace(new RegExp('^' + pluginOptions.referencePath), pluginOptions.diffPath);
    }
};

function saveScreenshot(screenshot, filePath) {
    return fs.makeDir(path.dirname(filePath)).then(function() {
        return vowNode.invoke(screenshot.save.bind(screenshot), filePath);
    });
}

function compareScreenshots(screenshot, referenceScreenshot, tolerance) {
    return vowNode.invoke(looksSame, screenshot, referenceScreenshot, { tolerance : tolerance });
}

function saveScreenshotsDiff(screenshot, referenceScreenshot, diffPath, tolerance) {
    return fs.makeDir(path.dirname(diffPath))
        .then(function() {
            return vowNode.invoke(looksSame.createDiff.bind(looksSame), {
                current : screenshot,
                reference : referenceScreenshot,
                diff : diffPath,
                tolerance : tolerance,
                highlightColor : '#00ff00'
            });
        });
}
