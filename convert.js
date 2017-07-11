'use strict';
var https = require('https');
var uuidv4 = require('uuid/v4');
var jsface = require('jsface');
var _ = require('lodash');
var SwaggerParser = require('swagger-parser');

var Ajv = require('ajv');
var metaSchema = require('ajv/lib/refs/json-schema-draft-04.json');

var POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json';

function isValid() {
    return true;
}

var Swagger2Postman = jsface.Class({ // eslint-disable-line
    constructor: function (options) {
        this.collectionJson = {
            info: {
                name: '',
                _postman_id: uuidv4(),
                schema: POSTMAN_SCHEMA
            },
            item: []
        };
        this.basePath = {};
        this.securityDefinitions = {};
        this.globalConsumes = [];
        this.globalProduces = [];
        this.globalSecurity = [];
        this.logger = _.noop;

        this.validator = new Ajv({
            verbose: true,
            allErrors: true,
            meta: false,
            extendRefs: true,
            unknownFormats: 'ignore',
            validateSchema: false,
        });
        this.validator.addMetaSchema(metaSchema);
        this.validator._opts.defaultMeta = metaSchema.id;
        this.validator.removeKeyword('propertyNames');
        this.validator.removeKeyword('contains');
        this.validator.removeKeyword('const');

        this.validate = isValid; // default to a noop incase loading the schema fails

        this.options = options || {};

        this.options.includeQueryParams = typeof this.options.includeQueryParams === 'undefined' ?
            true : this.options.includeQueryParams;

        this.options.includeOptionalQueryParams = typeof this.options.includeOptionalQueryParams === 'undefined' ?
            false : this.options.includeOptionalQueryParams;

        this.options.includeBodyTemplate = typeof this.options.includeBodyTemplate === 'undefined' ?
            false : this.options.includeBodyTemplate;

        this.options.includeTests = typeof this.options.includeTests === 'undefined' ?
            false : this.options.includeTests;

        this.options.tagFilter = this.options.tagFilter || null;

        this.options.host = this.options.host || null;
    },

    setLogger: function (func) {
        this.logger = func;
    },

    loadSchema: function (cb) {
        var self = this;

        https.get(POSTMAN_SCHEMA, function (res) {
            var statusCode = res.statusCode;
            var contentType = res.headers['content-type'];

            var failed = false;
            if (statusCode !== 200) {
                self.logger('load schema request failed: ' + statusCode);
                failed = true;
            } else if (!/^application\/json/.test(contentType)) {
                self.logger('load schema request failed: Expected application/json but received ' + contentType);
                failed = true;
            }
            if (failed) {
                self.logger('failed to load schema; validation disabled.');
                // consume response data to free up memory
                res.resume();
                cb();
                return;
            }

            res.setEncoding('utf8');

            var rawData = '';
            res.on('data', function (chunk) {
                rawData += chunk;
            });
            res.on('end', function () {
                try {
                    var parsedData = JSON.parse(rawData);
                    self.validate = self.validator.compile(parsedData);
                    self.logger('schema load successful');
                } catch (e) {
                    self.logger('schema not json: ' + e.message);
                }
                cb();
            });

        }).on('error', function (err) {
            self.logger('failed to load schema; validation disabled. ' + err);
            cb();
        });
    },

    setBasePath: function (api) {
        // This should be `domain` according to the specs, but postman seems
        // to only accept `host`.
        if (this.options.host) {
            this.basePath.host = this.options.host;
        } else if (api.host) {
            this.basePath.host = api.host;
        } else {
            this.basePath.host = 'localhost';
        }

        if (api.basePath) {
            this.basePath.path = api.basePath.replace(/\/+$/, '').split('/');
        }

        if (api.schemes && api.schemes.indexOf('https') !== -1) {
            this.basePath.protocol = 'https';
        } else {
            this.basePath.protocol = 'http';
        }
    },

    getFolderNameForPath: function (pathUrl) {
        if (pathUrl === '/') {
            return null;
        }
        this.logger('Getting folder name for path: ' + pathUrl);
        var folderName = pathUrl.split('/')[1];
        this.logger('folderName: ' + folderName);
        return folderName;
    },

    handleInfo: function (info) {
        this.collectionJson.info.name = info.title;
        if (info.description) {
            this.collectionJson.info.description = {
                content: info.description,
                type: 'text/markdown'
            };
        }
    },

    mergeParamLists: function (oldParams, newParams) {
        var retVal = {};

        _.forEach(oldParams || [], function (p) {
            retVal[p.name] = p;
        });

        _.forEach(newParams || [], function (p) {
            retVal[p.name] = p;
        });

        return retVal;
    },

    generateTestsFromSpec: function (responses) {
        var tests = [];
        var statusCodes = _.keys(responses);

        tests.push('tests["Status code is expected"] = [' +
          statusCodes.join() + '].indexOf(responseCode.code) > -1;');

        // set test in case of success
        _.forEach(responses, function (response, status) {
            if (Number(status) >= 200 && Number(status) < 300 && response && response.schema) {
                tests.push('');
                tests.push('if (responseCode.code === ' + status + ') {');
                tests.push('\tvar data = JSON.parse(responseBody);');
                tests.push('\tvar schema = ' + JSON.stringify(response.schema, null, 4) + ';');
                tests.push('\ttests["Response Body respects JSON schema documentation"]'
                    + ' = tv4.validate(data, schema);');
                tests.push('\tif(tests["Response Body respect JSON schema documentation"] === false){');
                tests.push('\t\tconsole.log(tv4.error);');
                tests.push('\t}');
                tests.push('}');
            }
        });

        return tests;
    },

    getDefaultValue: function (type) {
        switch (type) {
            case 'integer': {
                return 0;
            }
            case 'number': {
                return 0.0;
            }
            case 'boolean': {
                return true;
            }
            case 'string': {
                return '""';
            }
            /* istanbul ignore next */
            default: {
                return null;
            }
        }
    },

    getModelTemplate: function (schema) {
        if (schema.example) {
            return JSON.stringify(schema.example, null, 4);
        }

        var definition = [];
        var properties = schema.properties;
        var name;
        var value;

        if (schema.type === 'object' || schema.properties) {
            for (name in properties) {
                var propertySchema = properties[name];
                if (!propertySchema.readOnly) {
                    value = this.getModelTemplate(propertySchema);
                    definition.push('"' + name + '" : ' + value);
                }
            }
            return JSON.stringify(JSON.parse('{' + definition.join(',') + '}'), null, '   ');

        } else if (schema.type === 'array') {
            value = this.getModelTemplate(schema.items);
            return JSON.stringify(JSON.parse('[' + value + ']'), null, '   ');
        }

        return this.getDefaultValue(schema.type);
    },

    buildUrl: function (path) {
        // skip the starting '/' to avoid empty space being added as the initial value
        var lpath = path.substring(1).split('/');
        var urlObject = _.clone(this.basePath);

        if (this.basePath.hasOwnProperty('path')) {
            urlObject.path = this.basePath.path.concat(lpath);
        } else {
            urlObject.path = lpath;
        }

        return urlObject;
    },

    applySecurity: function (security, request) {
        for (var securityRequirementName in security) {
            var securityDefinition = this.securityDefinitions[securityRequirementName];
            if (securityDefinition) {
                if (securityDefinition.type === 'oauth2') {
                    request.auth = {
                        type: securityDefinition.type,
                    };

                    var scopes = security[securityRequirementName];
                    if (scopes && scopes.length > 0) {
                        request.auth.oauth2 = {
                            scope: scopes.join(' ')
                        };
                    }

                    _.defaults(request, {header: []});
                    request.header.push({
                        key: 'Authorization',
                        value: 'Bearer {{' + securityRequirementName + '_access_token}}',
                        description: securityDefinition.description,
                    });

                } else if (securityDefinition.type === 'basic') {
                    request.auth = {
                        type: securityDefinition.type,
                        basic: {
                            username: '{{' + securityRequirementName + '_username}}',
                            password: '{{' + securityRequirementName + '_password}}'
                        }
                    };

                /* istanbul ignore else */
                } else if (securityDefinition.type === 'apiKey') {
                    if (securityDefinition.in === 'header') {
                        _.defaults(request, {header: []});
                        request.header.push({
                            key: securityDefinition.name,
                            value: '{{' + securityRequirementName + '_apikey}}',
                            description: securityDefinition.description,
                        });
                    } else {
                        _.defaults(request.url, {query: []});
                        request.url.query.push({
                            key: securityDefinition.name,
                            value: '{{' + securityRequirementName + '_apikey}}',
                            description: securityRequirementName.description,
                        });
                    }
                }
            }
        }

        return request;
    },

    processParameter: function (param, consumes, request) {
        if (param.in === 'query') {
            if (this.options.includeQueryParams === true &&
                (param.required || this.options.includeOptionalQueryParams === true)) {

                _.defaults(request.url, {query: []});
                request.url.query.push({
                    key: param.name,
                    value: '{{' + param.name + '}}',
                    description: param.description,
                });
            }
        }

        if (param.in === 'header') {
            _.defaults(request, {header: []});
            request.header.push({
                key: param.name,
                value: '{{' + param.name + '}}',
                description: param.description,
            });

        }

        if (param.in === 'body') {
            _.defaults(request, {body: {}});
            request.body.mode = 'raw';

            var contentType = _.find(consumes, function (ct) {
                return ct.indexOf('json') > -1;
            });

            if (this.options.includeBodyTemplate === true && param.schema && contentType) {

                _.defaults(request, {header: []});
                request.header.push({
                    key: 'Content-Type',
                    value: contentType
                });

                request.body.raw = this.getModelTemplate(param.schema);
            }

            if (!request.body.raw || request.body.raw === '') {
                request.body.raw = param.description;
            }

        }

        if (param.in === 'formData') {
            _.defaults(request, {body: {}});
            var data = {
                key: param.name,
                value: '{{' + param.name + '}}',
                enabled: true,
                description: {
                    content: param.description,
                    type: 'text/markdown'
                }
            };
            if (consumes.indexOf('application/x-www-form-urlencoded') > -1) {
                request.body.mode = 'urlencoded';
                _.defaults(request.body, {urlencoded: []});
                request.body.urlencoded.push(data);

                _.defaults(request, {header: []});
                request.header.push({
                    key: 'Content-Type',
                    value: 'application/x-www-form-urlencoded'
                });

            } else {
                // Assume this is a multipart/form-data parameter, even if the
                // header isn't set.
                request.body.mode = 'formdata';
                _.defaults(request.body, {formdata: []});
                request.body.formdata.push(data);
            }

        }

        if (param.in === 'path') {
            _.defaults(request.url, {variables: []});
            request.url.variables.push({
                id: param.name,
                value: '{{' + param.name + '}}',
                type: param.type,
                description: param.description,
            });
        }

        return request;
    },

    applyDefaultBodyMode: function (consumes, request) {
        // set the default body mode for this request, as required
        if (!request.hasOwnProperty('body')) {
            if (consumes.indexOf('application/x-www-form-urlencoded') > -1) {
                request.body = {
                    mode: 'urlencoded',
                    urlencoded: [],
                };

            } else if (consumes.indexOf('multipart/form-data') > -1) {
                request.body = {
                    mode: 'formdata',
                    formdata: [],
                };
            } else {
                request.body = {
                    mode: 'raw',
                    raw: '',
                };
            }
        }

        return request;
    },

    buildItemFromOperation: function (path, method, operation, paramsFromPathItem) {
        if (this.options.tagFilter &&
            operation.tags &&
            operation.tags.indexOf(this.options.tagFilter) === -1) {
            // Operation has tags that don't match the filter
            return null;
        }
        var request = {
            url: this.buildUrl(path),
            description: operation.description || operation.summary,
            method: method
        };

        var item = {
            name: operation.summary,
            request: request,
            response: []
        };

        var thisParams = this.mergeParamLists(paramsFromPathItem, operation.parameters);
        var thisConsumes = operation.consumes || this.globalConsumes;
        var thisProduces = operation.produces || this.globalProduces;
        var thisSecurity = operation.security || this.globalSecurity;

        if (thisProduces && thisProduces.length > 0) {
            _.defaults(request, {header: []});
            request.header.push({
                key: 'Accept',
                value: thisProduces[0]
            });
        }

        // TODO: Handle custom swagger attributes for postman aws integration
        // if (operation['x-postman-meta']) {
        //     for (var requestAttr in operation['x-postman-meta']) {
        //         request[requestAttr] = operation['x-postman-meta'][requestAttr];
        //     }
        // }

        // handle security
        // Only consider the first defined security object.
        // Swagger defines that there is a logical OR between the different security objects in the array
        // i.e. only one needs to/should be used at a time
        if (thisSecurity[0]) {
            request = this.applySecurity(thisSecurity[0], request);
        }

        // set data and headers
        for (var param in thisParams) {
            this.logger('Processing param: ' + JSON.stringify(param));
            request = this.processParameter(thisParams[param], thisConsumes, request);
        }

        request = this.applyDefaultBodyMode(thisConsumes, request);

        if (this.options.includeTests === true) {
            this.logger('Adding Test for: ' + path);
            var tests = this.generateTestsFromSpec(operation.responses);
            _.defaults(item, {events: []});
            item.events.push({
                listen: 'test',
                script: {
                    type: 'text/javascript',
                    exec: tests
                }
            });
        }

        return item;
    },

    buildItemListFromPath: function (path, pathItem) {
        var self = this;
        var items = [];
        // replace path variables {petId} with :petId
        var lpath = path.replace(/{/g, ':').replace(/}/g, '');

        var supportedVerbs = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options'];

        _.forEach(supportedVerbs, function (verb) {
            if (pathItem[verb]) {
                var item = self.buildItemFromOperation(lpath, verb.toUpperCase(), pathItem[verb], pathItem.parameters);
                if (item) {
                    items.push(item);
                }
            }
        });

        return items;
    },

    handlePaths: function (paths) {
        var folders = {};
        var items = [];
        // Add a folder for each path
        for (var path in paths) {
            var itemList = this.buildItemListFromPath(path, paths[path]);
            if (itemList && itemList.length > 0) {
                var folderName = this.getFolderNameForPath(path);
                if (folderName) {
                    this.logger('Adding path item. path = ' + path + '   folder = ' + folderName);
                    if (folders.hasOwnProperty(folderName)) {
                        folders[folderName].item = folders[folderName].item.concat(itemList);
                    } else {
                        folders[folderName] = {
                            name: folderName,
                            description: 'Folder for ' + folderName,
                            item: itemList
                        };
                    }
                } else {
                    items = items.concat(itemList);
                }
            }
        }
        this.collectionJson.item = items.concat(_.values(folders));
        this.collectionJson.item.sort(function (a, b) {
            var nameA = (a.name || '').toUpperCase();
            var nameB = b.name.toUpperCase();
            if (nameA < nameB) {
                return -1;
            }
            /* istanbul ignore else */
            if (nameA > nameB) {
                return 1;
            }
            // names must be equal
            /* istanbul ignore next */
            return 0;
        });
    },

    convert: function (spec, cb) {
        var self = this;

        SwaggerParser.validate(spec, function (err, api) {
            if (err) {
                self.logger('spec is not valid: ' + err);
                cb(err, null);
                return;
            }
            self.logger('validation of spec complete...');

            self.loadSchema(function () {

                self.globalConsumes = api.consumes || [];

                self.globalProduces = api.produces || [];

                self.securityDefinitions = api.securityDefinitions || {};

                self.globalSecurity = api.security || [];

                self.handleInfo(api.info);

                self.setBasePath(api);

                self.handlePaths(api.paths);

                self.logger('Conversion successful');

                var valid = self.validate(self.collectionJson);
                /* istanbul ignore else */
                if (valid) {
                    self.logger('Generated collection valid.');
                } else {
                    self.logger('Generated collection invalid: ' + JSON.stringify(self.validate.errors));
                }

                return cb(null, self.collectionJson);
            });

        });
    },

});

module.exports = Swagger2Postman;
