'use strict';
var https = require('https');

var Ajv = require('ajv');
var maybe = require('call-me-maybe');
var metaSchema = require('ajv/lib/refs/json-schema-draft-04.json');

var constants = require('./constants');

function load() {

    return new Promise(function (resolve, reject) {

        https.get(constants.POSTMAN_SCHEMA, function (res) {
            let statusCode = res.statusCode;
            let contentType = res.headers['content-type'];

            let err;
            if (statusCode !== 200) {
                err = new Error('load schema request failed: ' + statusCode);
            } else if (!/^application\/json/.test(contentType)) {
                err = new Error('load schema request failed: Expected application/json but received ' + contentType);
            }
            if (err) {
                // consume response data to free up memory
                res.resume();
                reject(err);
            }

            res.setEncoding('utf8');

            let rawData = '';
            res.on('data', function (chunk) {
                rawData += chunk;
            });
            res.on('end', function () {
                try {
                    let parsedData = JSON.parse(rawData);
                    resolve(parsedData);
                } catch (e) {
                    reject(e);
                }
            });

        }).on('error', reject);
    });

}

function create(cb) {

    return load().then(function (data) {
        let validator = new Ajv({
            verbose: true,
            allErrors: true,
            meta: false,
            extendRefs: true,
            unknownFormats: 'ignore',
            validateSchema: false,
        });
        validator.addMetaSchema(metaSchema);
        validator._opts.defaultMeta = metaSchema.id;
        validator.removeKeyword('propertyNames');
        validator.removeKeyword('contains');
        validator.removeKeyword('const');

        let validate = validator.compile(data);
        return maybe(cb, Promise.resolve(validate));
    }).catch(function (err) {
        return maybe(cb, Promise.reject(err));
    });
}

module.exports = {
    create: create,
};
