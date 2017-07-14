'use strict';
const maybe = require('call-me-maybe');
const SwaggerParser = require('swagger-parser');
const YAML = SwaggerParser.YAML;

const utils = require('./utils');

function bundle(spec, options, cb) {
    // If the API contains circular $refs, then ignore them.
    // Otherwise, JSON serialization will fail
    let opts = {$refs: {circular: 'ignore'}};

    if (!options.output) {
        options.output = utils.getDirname(spec) + '/bundle-' + utils.getFilename(spec);
    }
    if (utils.isYaml(options.output)) {
        options.formatter = YAML.stringify;
    }

    return SwaggerParser.bundle(spec, opts).then(function (api) {
        utils.writeFile(api, options.output, options);
        return maybe(cb, Promise.resolve(api));
    }).catch(function (err) {
        return maybe(cb, Promise.reject(err));
    });
}

module.exports = {
    bundle: bundle,
};
