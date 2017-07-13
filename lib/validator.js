'use strict';
var https = require('https');
var Ajv = require('ajv');
var metaSchema = require('ajv/lib/refs/json-schema-draft-04.json');
var constants = require('./constants');

function load(cb) {

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
            cb(err, null);
            return;
        }

        res.setEncoding('utf8');

        let rawData = '';
        res.on('data', function (chunk) {
            rawData += chunk;
        });
        res.on('end', function () {
            try {
                let parsedData = JSON.parse(rawData);
                cb(null, parsedData);
            } catch (e) {
                cb(e, null);
            }
        });

    }).on('error', function (err) {
        cb(err, null);
    });

}

function create(cb) {

    load(function (err, data) {
        if (err) {
            cb(err, null);
            return;
        }

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
        cb(null, validate);
    });
}

module.exports = {
    create: create,
};
