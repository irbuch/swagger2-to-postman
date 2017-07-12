/* eslint no-console: ["error", { allow: ["time", "timeEnd"] }] */
'use strict';
var https = require('https');
var libpath = require('path');
var uuidv4 = require('uuid/v4');
var _ = require('lodash');
var SwaggerParser = require('swagger-parser');

var Ajv = require('ajv');
var metaSchema = require('ajv/lib/refs/json-schema-draft-04.json');

const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json';
const META_KEY = 'x-postman-meta';

function isValid() {
    return true;
}

class Swagger2Postman {
    constructor(options) {
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
        this.envfile = {};

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

        this.options.excludeQueryParams = typeof this.options.excludeQueryParams === 'undefined' ?
            false : this.options.excludeQueryParams;

        this.options.excludeOptionalQueryParams = typeof this.options.excludeOptionalQueryParams === 'undefined' ?
            false : this.options.excludeOptionalQueryParams;

        this.options.excludeBodyTemplate = typeof this.options.excludeBodyTemplate === 'undefined' ?
            false : this.options.excludeBodyTemplate;

        this.options.excludeTests = typeof this.options.excludeTests === 'undefined' ?
            false : this.options.excludeTests;

        this.options.disableCollectionValidation = typeof this.options.disableCollectionValidation === 'undefined' ?
            false : this.options.disableCollectionValidation;

        this.options.tagFilter = this.options.tagFilter || null;

        this.options.host = this.options.host || null;

        this.options.envfile = this.options.envfile || null;
    }

    setLogger(func) {
        this.logger = func;
    }

    loadSchema(cb) {
        var self = this;

        if (this.options.disableCollectionValidation) {
            cb();
            return;
        }

        https.get(POSTMAN_SCHEMA, function (res) {
            let statusCode = res.statusCode;
            let contentType = res.headers['content-type'];

            let failed = false;
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

            let rawData = '';
            res.on('data', function (chunk) {
                rawData += chunk;
            });
            res.on('end', function () {
                try {
                    let parsedData = JSON.parse(rawData);
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
    }

    setBasePath(api) {
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
    }

    getFolderNameForPath(pathUrl) {
        if (pathUrl === '/') {
            return null;
        }
        let folderName = pathUrl.split('/')[1];
        this.logger('Mapping path: ' + pathUrl + ' ==> folderName: ' + folderName);
        return folderName;
    }

    handleInfo(info) {
        this.collectionJson.info.name = info.title;
        if (info.description) {
            this.collectionJson.info.description = {
                content: info.description,
                type: 'text/markdown'
            };
        }
    }

    mergeParamLists(oldParams, newParams) {
        var retVal = {};

        _.forEach(oldParams || [], function (p) {
            retVal[p.name] = p;
        });

        _.forEach(newParams || [], function (p) {
            retVal[p.name] = p;
        });

        return retVal;
    }

    generateTestsFromSpec(responses) {
        var tests = [];
        let statusCodes = _.keys(responses);

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
    }

    getDefaultValue(type) {
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
    }

    getModelTemplate(schema) {
        if (schema.example) {
            return JSON.stringify(schema.example, null, 4);
        }

        var value;

        if (schema.type === 'object' || schema.properties) {
            let definition = [];

            for (let name in schema.properties) {
                let propertySchema = schema.properties[name];
                if (!propertySchema.readOnly) {
                    value = this.getModelTemplate(propertySchema);
                    definition.push('"' + name + '" : ' + value);
                }
            }
            return JSON.stringify(JSON.parse('{' + definition.join(',') + '}'), null, 4);

        } else if (schema.type === 'array') {
            value = this.getModelTemplate(schema.items);
            return JSON.stringify(JSON.parse('[' + value + ']'), null, 4);
        }

        return this.getDefaultValue(schema.type);
    }

    addEnvItem(name) {
        this.envfile.values.push({
            key: name,
            value: '',
            type: 'text',
            enabled: true,
        });
    }

    buildUrl(path) {
        // skip the starting '/' to avoid empty space being added as the initial value
        let lpath = path.substring(1).split('/');
        let urlObject = _.clone(this.basePath);

        if (this.basePath.hasOwnProperty('path')) {
            urlObject.path = this.basePath.path.concat(lpath);
        } else {
            urlObject.path = lpath;
        }

        return urlObject;
    }

    applySecurity(security, request) {
        for (let securityRequirementName in security) {
            let securityDefinition = this.securityDefinitions[securityRequirementName];
            if (securityDefinition) {
                this.logger('Adding security details to request of type: ' + securityDefinition.type);
                if (securityDefinition.type === 'oauth2') {
                    let scopes = security[securityRequirementName];
                    if (scopes && scopes.length > 0) {
                        request.auth = {
                            type: securityDefinition.type,
                            oauth2: {
                                scope: scopes.join(' ')
                            }
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
    }

    applyPostmanSecurity(auth, request) {
        const supportedAuthTypes = ['awsv4', 'digest', 'hawk', 'oauth1'];
        _.forEach(supportedAuthTypes, function (authType) {
            if (auth.type === authType && auth.hasOwnProperty(authType)) {
                request.auth = auth;
            }
        });
        return request;
    }

    processParameter(param, consumes, request) {
        if (param.in === 'query') {
            if (this.options.excludeQueryParams === false &&
                (param.required || this.options.excludeOptionalQueryParams === false)) {

                _.defaults(request.url, {query: []});
                request.url.query.push({
                    key: param.name,
                    value: '{{' + param.name + '}}',
                    description: param.description,
                });

                if (this.options.envfile) {
                    this.addEnvItem(param.name);
                }
            }
        }

        if (param.in === 'header') {
            _.defaults(request, {header: []});
            request.header.push({
                key: param.name,
                value: '{{' + param.name + '}}',
                description: param.description,
            });

            if (this.options.envfile) {
                this.addEnvItem(param.name);
            }
        }

        if (param.in === 'body') {
            _.defaults(request, {body: {}});
            request.body.mode = 'raw';

            let contentType = _.find(consumes, function (ct) {
                return ct.indexOf('json') > -1;
            });

            if (this.options.excludeBodyTemplate === false && param.schema && contentType) {

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
            let data = {
                key: param.name,
                value: '{{' + param.name + '}}',
                enabled: true,
                description: {
                    content: param.description,
                    type: 'text/markdown'
                }
            };

            if (this.options.envfile) {
                this.addEnvItem(param.name);
            }

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
            _.defaults(request.url, {variable: []});
            request.url.variable.push({
                key: param.name,
                value: '{{' + param.name + '}}',
                description: param.description,
            });

            if (this.options.envfile) {
                this.addEnvItem(param.name);
            }
        }

        return request;
    }

    applyDefaultBodyMode(consumes, request) {
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
    }

    buildItemFromOperation(path, method, operation, paramsFromPathItem) {
        if (this.options.tagFilter &&
            operation.tags &&
            operation.tags.indexOf(this.options.tagFilter) === -1) {
            // Operation has tags that don't match the filter
            this.logger('Excluding ' + method + ' ' + path + ' due to tagFilter: ' + this.options.tagFilter);
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

        let thisParams = this.mergeParamLists(paramsFromPathItem, operation.parameters);
        let thisConsumes = operation.consumes || this.globalConsumes;
        let thisProduces = operation.produces || this.globalProduces;
        let thisSecurity = operation.security || this.globalSecurity;

        if (thisProduces && thisProduces.length > 0) {
            _.defaults(request, {header: []});
            request.header.push({
                key: 'Accept',
                value: thisProduces[0]
            });
        }

        if (operation[META_KEY]) {
            if (operation[META_KEY].hasOwnProperty('auth')) {
                request = this.applyPostmanSecurity(operation[META_KEY].auth, request);
            }
        }

        // handle security
        // Only consider the first defined security object.
        // Swagger defines that there is a logical OR between the different security objects in the array
        // i.e. only one needs to/should be used at a time
        if (thisSecurity[0]) {
            request = this.applySecurity(thisSecurity[0], request);
        }

        // set data and headers
        for (let param in thisParams) {
            this.logger('Processing param: ' + JSON.stringify(param));
            request = this.processParameter(thisParams[param], thisConsumes, request);
        }

        request = this.applyDefaultBodyMode(thisConsumes, request);

        if (this.options.excludeTests === false) {
            this.logger('Adding Test for: ' + path);
            let tests;
            if (operation[META_KEY]) {
                if (operation[META_KEY].hasOwnProperty('tests')) {
                    tests = operation[META_KEY].tests;
                }
            } else {
                tests = this.generateTestsFromSpec(operation.responses);
            }
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
    }

    buildItemListFromPath(path, pathItem) {
        var self = this;
        var items = [];
        // replace path variables {petId} with :petId
        var lpath = path.replace(/{/g, ':').replace(/}/g, '');

        const supportedVerbs = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options'];

        _.forEach(supportedVerbs, function (verb) {
            if (pathItem[verb]) {
                self.logger('Processing operation ' + verb.toUpperCase() + ' ' + path);
                let item = self.buildItemFromOperation(lpath, verb.toUpperCase(), pathItem[verb], pathItem.parameters);
                if (item) {
                    items.push(item);
                }
            }
        });

        return items;
    }

    handlePaths(paths) {
        var folders = {};
        var items = [];
        // Add a folder for each path
        for (let path in paths) {
            let itemList = this.buildItemListFromPath(path, paths[path]);
            if (itemList && itemList.length > 0) {
                let folderName = this.getFolderNameForPath(path);
                if (folderName) {
                    this.logger('Adding path item to folder: ' + folderName);
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
                    this.logger('Adding path item');
                    items = items.concat(itemList);
                }
            }
        }
        this.collectionJson.item = items.concat(_.values(folders));
        this.collectionJson.item.sort(function (a, b) {
            let nameA = (a.name || '').toUpperCase();
            let nameB = b.name.toUpperCase();
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
    }

    convert(spec, cb) {
        var self = this;

        this.logger('using options: ' + JSON.stringify(this.options, null, 4));
        this.logger('reading API spec from: ' + JSON.stringify(spec));

        console.time('## API Spec Loaded and Validated in');
        SwaggerParser.validate(spec, function (err, api) {
            console.timeEnd('## API Spec Loaded and Validated in');
            if (err) {
                self.logger('spec is not valid: ' + err);
                cb(err, null);
                return;
            }
            self.logger('validation of spec complete...');

            if (!self.options.disableCollectionValidation) {
                console.time('## Postman Schema Loaded in');
            }
            self.loadSchema(function () {
                if (!self.options.disableCollectionValidation) {
                    console.timeEnd('## Postman Schema Loaded in');
                }

                self.globalConsumes = api.consumes || [];

                self.globalProduces = api.produces || [];

                self.securityDefinitions = api.securityDefinitions || {};

                self.globalSecurity = api.security || [];

                if (self.options.envfile) {
                    self.envfile = {
                        id: uuidv4(),
                        name: libpath.basename(self.options.envfile, '.json'),
                        timestamp: Date.now(),
                        _postman_variable_scope: 'environment',
                        values: [],
                    };
                }

                self.handleInfo(api.info);

                self.setBasePath(api);

                self.handlePaths(api.paths);

                if (self.options.envfile) {
                    self.envfile.values = _.uniqBy(self.envfile.values, 'key');
                }

                self.logger('Conversion successful');

                if (!self.options.disableCollectionValidation) {
                    console.time('## Collection Validated in');
                    let valid = self.validate(self.collectionJson);
                    console.timeEnd('## Collection Validated in');
                    /* istanbul ignore else */
                    if (valid) {
                        self.logger('Generated collection valid.');
                    } else {
                        self.logger('Generated collection invalid: ' + JSON.stringify(self.validate.errors));
                    }
                }

                return cb(null, self.collectionJson);
            });

        });
    }

}

module.exports = Swagger2Postman;
