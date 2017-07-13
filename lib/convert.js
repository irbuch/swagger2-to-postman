/* eslint no-console: ["error", { allow: ["time", "timeEnd"] }] */
'use strict';
var libpath = require('path');
var uuidv4 = require('uuid/v4');
var _ = require('lodash');
var SwaggerParser = require('swagger-parser');
var constants = require('./constants');

function getDefaultValue(type) {
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

function getFolderNameForPath(pathUrl) {
    if (pathUrl === '/') {
        return null;
    }
    let folderName = pathUrl.split('/')[1];
    return folderName;
}

function mergeParamLists(oldParams, newParams) {
    var retVal = {};

    _.forEach(oldParams || [], function (p) {
        retVal[p.name] = p;
    });

    _.forEach(newParams || [], function (p) {
        retVal[p.name] = p;
    });

    return retVal;
}

function generateTestsFromSpec(responses) {
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

function getModelTemplate(model) {
    if (model.example) {
        return JSON.stringify(model.example, null, 4);
    }

    var value;

    if (model.type === 'object' || model.properties) {
        let definition = [];

        for (let name in model.properties) {
            let propertySchema = model.properties[name];
            if (!propertySchema.readOnly) {
                value = getModelTemplate(propertySchema);
                definition.push('"' + name + '" : ' + value);
            }
        }
        return JSON.stringify(JSON.parse('{' + definition.join(',') + '}'), null, 4);

    } else if (model.type === 'array') {
        value = getModelTemplate(model.items);
        return JSON.stringify(JSON.parse('[' + value + ']'), null, 4);
    }

    return getDefaultValue(model.type);
}

function applyPostmanSecurity(auth, request) {
    _.forEach(constants.AUTH_TYPES, function (authType) {
        if (auth.type === authType && auth.hasOwnProperty(authType)) {
            request.auth = auth;
        }
    });
    return request;
}

function applyDefaultBodyMode(consumes, request) {
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


class Swagger2Postman {
    constructor(options) {
        this.collectionJson = {
            info: {
                name: '',
                _postman_id: uuidv4(),
                schema: constants.POSTMAN_SCHEMA
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

        this.options = options || {};

        this.options.excludeQueryParams = typeof this.options.excludeQueryParams === 'undefined' ?
            false : this.options.excludeQueryParams;

        this.options.excludeOptionalQueryParams = typeof this.options.excludeOptionalQueryParams === 'undefined' ?
            false : this.options.excludeOptionalQueryParams;

        this.options.excludeBodyTemplate = typeof this.options.excludeBodyTemplate === 'undefined' ?
            false : this.options.excludeBodyTemplate;

        this.options.excludeTests = typeof this.options.excludeTests === 'undefined' ?
            false : this.options.excludeTests;

        this.options.tagFilter = this.options.tagFilter || null;

        this.options.host = this.options.host || null;

        this.options.defaultSecurity = this.options.defaultSecurity || null;

        this.options.defaultProducesType = this.options.defaultProducesType || null;

        this.options.envfile = this.options.envfile || null;
    }

    setLogger(func) {
        this.logger = func;
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

    handleInfo(info) {
        this.collectionJson.info.name = info.title;
        if (info.description) {
            this.collectionJson.info.description = {
                content: info.description,
                type: 'text/markdown'
            };
        }
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

                request.body.raw = getModelTemplate(param.schema);
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

    buildItemFromOperation(path, method, operation, paramsFromPathItem) {
        var self = this;
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

        let thisParams = mergeParamLists(paramsFromPathItem, operation.parameters);
        let thisConsumes = operation.consumes || this.globalConsumes;
        let thisProduces = operation.produces || this.globalProduces;
        let thisSecurity = operation.security || this.globalSecurity;

        if (thisProduces && thisProduces.length > 0) {
            let defaultProduceType = thisProduces[0];
            if (this.options.defaultProducesType) {
                defaultProduceType = _.find(thisProduces, function (pt) {
                    return pt === self.options.defaultProducesType;
                }) || thisProduces[0];
            }
            _.defaults(request, {header: []});
            request.header.push({
                key: 'Accept',
                value: defaultProduceType
            });
        }

        if (operation[constants.META_KEY]) {
            if (operation[constants.META_KEY].hasOwnProperty('auth')) {
                request = applyPostmanSecurity(operation[constants.META_KEY].auth, request);
            }
        }

        // handle security
        // Swagger defines that there is a logical OR between the different security objects in the array
        // i.e. only one needs to/should be used at a time
        if (thisSecurity && thisSecurity.length > 0) {
            let defaultSecurity = thisSecurity[0];
            if (this.options.defaultSecurity) {
                defaultSecurity = _.find(thisSecurity, this.options.defaultSecurity) || thisSecurity[0];
            }
            request = this.applySecurity(defaultSecurity, request);
        }

        // set data and headers
        for (let param in thisParams) {
            this.logger('Processing param: ' + JSON.stringify(param));
            request = this.processParameter(thisParams[param], thisConsumes, request);
        }

        // make sure headers are unique
        request.header = _.uniqBy(request.header, 'key');

        request = applyDefaultBodyMode(thisConsumes, request);

        if (this.options.excludeTests === false) {
            this.logger('Adding Test for: ' + path);
            let tests;
            if (operation[constants.META_KEY]) {
                if (operation[constants.META_KEY].hasOwnProperty('tests')) {
                    tests = operation[constants.META_KEY].tests;
                }
            } else {
                tests = generateTestsFromSpec(operation.responses);
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

        _.forEach(constants.METHODS, function (verb) {
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
                let folderName = getFolderNameForPath(path);
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

            cb(null, self.collectionJson);

        });
    }

}

module.exports = Swagger2Postman;
