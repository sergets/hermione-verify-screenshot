var path = require('path'),
    fs = require('vow-fs'),
    vowNode = require('vow-node'),
    chalk = require('chalk'),
    PngImg = require('png-img'),
    looksSame = require('looks-same'),
    vow = require('vow'),
    chai = require('chai');

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
                            reportError('Element "' + selector + '" could not be snapped because it is not visible');
                        }
                        else {
                            return true;
                        }
                    })
                        .getLocationInView(selector).then(function(location) {
                        return this.getElementSize(selector).then(function(elementSize) {
                            var elementSizes = [].concat(elementSize);
                            var locations = [].concat(location);

                            return {
                                x : locations[0].x,
                                y : locations[0].y,
                                width : elementSizes[0].width,
                                height : elementSizes[0].height
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
                                var locations = [].concat(location).reverse();

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
                                        return rect.x >= 0 && (rect.x + rect.width) < screenshotSize.width &&
                                            rect.y >= 0 && (rect.y + rect.height) < screenshotSize.height;
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
                var screenshotSize = screenshot.size(),
                    offsetX = Math.max(dimensions.x, 0),
                    offsetY = Math.max(dimensions.y, 0);

                return screenshot.crop(
                    offsetX,
                    offsetY,
                    Math.min(screenshotSize.width - offsetX, dimensions.width, screenshotSize.width),
                    Math.min(screenshotSize.height - offsetY, dimensions.height, screenshotSize.height)
                );
            })
            .then(function(screenshot) {
                var referencePath = getScreenshotPath(this.executionContext, screenshotId),
                    unmatchedPath = getUnmatchedPath(referencePath),
                    diffPath = getDiffPath(referencePath),
                    browserId = this.executionContext.browserId,
                    allure = this.allure;

                return fs.exists(referencePath).then(function(referenceScreenshotExists) {
                    if(referenceScreenshotExists) {
                        return saveScreenshot(screenshot, unmatchedPath)
                            .then(function() {
                                return compareScreenshots(unmatchedPath, referencePath, tolerance);
                            })
                            .then(function(screenshotsLookSame) {
                                if(screenshotsLookSame) {
                                    pluginOptions.verbose && console.log(
                                        chalk.gray(' ... '),
                                        chalk.green('✓'),
                                        chalk.gray('verified ', chalk.bold(screenshotId),' screenshot in ', chalk.bold(browserId)));
                                    return fs.remove(unmatchedPath);
                                }
                                return saveScreenshotsDiff(unmatchedPath, referencePath, diffPath, tolerance)
                                    .then(function() {
                                        if(allure) {
                                            return createAllureAttachments(allure, screenshotId, browserId, unmatchedPath, referencePath, diffPath);
                                        }
                                    })
                                    .then(function() {
                                        reportError(
                                            'Screenshot "' +
                                            screenshotId +
                                            '" doesn\'t match to reference. See diff in func-test/screenshots-diff');
                                    });
                            });
                    }
                    else {
                        return saveScreenshot(screenshot, referencePath).then(function() {
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

    function getUnmatchedPath(referenceScreenshot) {
        return referenceScreenshot.replace(new RegExp('^' + pluginOptions.referencePath), pluginOptions.unmatchedPath);
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

function createAllureAttachments(allure, screenshotId, browserId, unmatchedPath, referencePath, diffPath) {
    return vow.all([
        fs.read(unmatchedPath),
        fs.read(referencePath),
        fs.read(diffPath)
    ]).spread(function(unmatched, reference, diff) {
        allure.createAttachment(
            'Screenshot ' + screenshotId + ' mismatch in ' + browserId,
            getComparisonHtml(unmatched, reference, diff),
            'text/html');
    });
}

function getComparisonHtml(unmatchedContent, referenceContent, diffContent) {
    var unmatchedBase64 = 'data:image/png;base64,' + new Buffer(unmatchedContent).toString('base64'),
        referenceBase64 = 'data:image/png;base64,' + new Buffer(referenceContent).toString('base64'),
        diffBase64 = 'data:image/png;base64,' + new Buffer(diffContent).toString('base64');

    return (
        '<html>' +
            '<head>' +
                '<style type="text/css">' +
                    '.comparison { position: relative; float: left }' +
                    '.diff { position: relative }' +
                    '.unmatched, .reference { display: none; position: absolute; top: 0 }' +
                    '.hotspot { position: absolute; top: 0; height: 100%; width: 50%; z-index: 1 }' +
                    '.reference-hotspot { left: 50% }' +
                    '.unmatched-hotspot:hover~.unmatched, .reference-hotspot:hover~.reference { display: block }' +
                '</style>' +
            '</head>' +
            '<body>' +
                '<div class="comparison">' +
                    '<div class="reference-hotspot hotspot"></div>' +
                    '<div class="unmatched-hotspot hotspot"></div>' +
                    '<img class="screenshot diff" src="' + diffBase64 + '"/>' +
                    '<img class="screenshot unmatched" src="' + unmatchedBase64 + '"/>' +
                    '<img class="screenshot reference" src="' + referenceBase64 + '"/>' +
                '</div>' +
            '</body>' +
        '</html>'
    );
}

function reportError(text) {
    chai.assert(false, text);
}
