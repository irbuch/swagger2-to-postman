'use strict';
var uuidv4 = require('uuid/v4');
var jsface = require('jsface');
var _ = require('lodash');
var SwaggerParser = require('swagger-parser');

var META_KEY = 'x-postman-meta';
var POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json';

var Swagger2Postman = jsface.Class({ // eslint-disable-line
    constructor: function (options) {
        this.collectionJson = {
            info: {
                name: '',
                _postman_id: uuidv4(),
                schema: POSTMAN_SCHEMA
            },
            items: []
        };
        this.basePath = {};
        this.securityDefinitions = {};
        this.globalConsumes = [];
        this.globalSecurity = [];
        this.logger = _.noop;

        this.options = options || {};

        this.options.includeQueryParams = typeof this.options.includeQueryParams === 'undefined' ?
            true : this.options.includeQueryParams;

        this.options.includeOptionalQueryParams = typeof this.options.includeOptionalQueryParams === 'undefined' ?
            false : this.options.includeOptionalQueryParams;

        this.options.includeBodyTemplate = typeof this.options.includeBodyTemplate === 'undefined' ?
            false : this.options.includeBodyTemplate;

        this.options.tagFilter = this.options.tagFilter || null;
    },

    setLogger: function (func) {
        this.logger = func;
    },

    setBasePath: function (json) {
        if (json.host) {
            // This should be `domain` according to the specs, but postman seems
            // to only accept `host`.
            this.basePath.host = json.host;
        }
        if (json.basePath) {
            this.basePath.path = json.basePath.replace(/\/+$/, '').split('/');
        }

        if (json.schemes && json.schemes.indexOf('https') !== -1) {
            this.basePath.protocol = 'https';
        } else {
            this.basePath.protocol = 'http';
        }
    },

    getFolderNameForPath: function (pathUrl) {
        if (pathUrl === '/') {
            return null;
        }
        var segments = pathUrl.split('/');

        this.logger('Getting folder name for path: ' + pathUrl);
        this.logger('Segments: ' + JSON.stringify(segments));

        var folderName = segments[1];
        this.logger('For path ' + pathUrl + ', returning folderName ' + folderName);
        return folderName;
    },

    handleInfo: function (json) {
        this.collectionJson.info.name = json.info.title;
        if (json.info.description) {
            this.collectionJson.info.description = {
                content: json.info.description,
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

    generateTestsFromSpec: function (responses, path) {
        var tests = [];
        var statusCodes = _.keys(responses);

        this.logger('Adding Test for: ' + path);

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
        var lpath = path.substring(1);
        lpath = lpath.split('/');

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
                // TODO: add usage of scopes
                // var scopes = security[securityRequirementName];
                // TODO: support apiKey security
                if (securityDefinition.type === 'oauth2') {
                    request.headers.push({
                        key: 'Authorization',
                        value: 'Bearer {{' + securityRequirementName + '_access_token}}'
                    });
                } else if (securityDefinition.type === 'basic') {
                    request.auth = {
                        type: 'basic',
                        basic: {
                            username: '{{' + securityRequirementName + '_username}}',
                            password: '{{' + securityRequirementName + '_password}}',
                            saveHelperData: true,
                            showPassword: true
                        }
                    };
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
                    description: param.description
                });
            }
        }

        if (param.in === 'header') {
            request.headers.push({
                key: param.name,
                value: '{{' + param.name + '}}'
            });

        }

        if (param.in === 'body') {
            _.defaults(request, {body: {}});
            request.body.mode = 'raw';

            if (this.options.includeBodyTemplate === true &&
                param.schema &&
                consumes.indexOf('application/json') > -1) {

                request.headers.push({
                    key: 'Content-Type',
                    value: 'application/json'
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
                enabled: true
            };
            if (consumes.indexOf('application/x-www-form-urlencoded') > -1) {
                request.body.mode = 'urlencoded';
                _.defaults(request.body, {urlencoded: []});
                request.body.urlencoded.push(data);

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
                type: param.type
            });
        }

        return request;
    },

    applyDefaultBodyMode: function (consumes, request) {
        // set the default body mode for this request, even if it doesn't have a body
        // eg. for GET requests
        if (!request.hasOwnProperty('body')) {
            request.body = {};
            if (consumes.indexOf('application/x-www-form-urlencoded') > -1) {
                request.body.mode = 'urlencoded';
                request.body.urlencoded = [];

            } else if (consumes.indexOf('multipart/form-data') > -1) {
                request.body.mode = 'formdata';
                request.body.formdata = [];

            } else {
                request.body.mode = 'raw';
                request.body.raw = '';
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
            // This field isn't in the 2.1 spec, but seems to be used by postman
            description: operation.description,
            auth: {},
            method: method,
            headers: []
        };

        var item = {
            name: operation.summary,
            events: [],
            request: request,
            responses: []
        };

        var thisParams = this.mergeParamLists(paramsFromPathItem, operation.parameters);
        var thisConsumes = operation.consumes || this.globalConsumes;
        var thisSecurity = operation.security || this.globalSecurity;

        // TODO: Where should this go in postman 2.x spec?
        // Handle custom swagger attributes for postman aws integration
        if (operation[META_KEY]) {
            for (var requestAttr in operation[META_KEY]) {
                request[requestAttr] = operation[META_KEY][requestAttr];
            }
        }

        // handle security
        // Only consider the first defined security object.
        // Swagger defines that there is a logical OR between the different security objects in the array -
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

        var tests = this.generateTestsFromSpec(operation.responses, path);
        item.events.push({
            listen: 'test',
            script: {
                type: 'text/javascript',
                exec: tests
            }
        });

        return item;
    },

    buildItemListFromPath: function (path, pathItem) {
        var self = this;
        var items = [];
        // replace path variables {petId} with :petId
        var lpath = path.replace(/{/g, ':').replace(/}/g, '');

        var acceptedPostmanVerbs = [
            'get', 'put', 'post', 'patch', 'delete', 'copy', 'head', 'options',
            'link', 'unlink', 'purge', 'lock', 'unlock', 'propfind', 'view'];

        _.forEach(acceptedPostmanVerbs, function (verb) {
            if (pathItem[verb]) {
                items.push(
                    self.buildItemFromOperation(
                        lpath,
                        verb.toUpperCase(),
                        pathItem[verb],
                        pathItem.parameters
                    )
                );
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
                        folders[folderName].items = folders[folderName].items.concat(itemList);
                    } else {
                        folders[folderName] = {
                            name: folderName,
                            items: itemList
                        };
                    }
                } else {
                    items = items.concat(itemList);
                }
            }
        }
        this.collectionJson.items = items.concat(_.values(folders));
    },

    convert: function (spec, cb) {
        var self = this;

        SwaggerParser.validate(spec, function (err, api) {
            if (err) {
                self.logger('spec is not valid: ' + err);
                return cb(err, null);
            }
            self.logger('validation of spec complete...');

            self.globalConsumes = api.consumes || [];

            self.securityDefinitions = api.securityDefinitions || {};

            self.globalSecurity = api.security || [];

            self.handleInfo(api);

            self.setBasePath(api);

            self.handlePaths(api.paths);

            self.logger('Conversion successful');

            return cb(null, self.collectionJson);

        });
    },

});

module.exports = Swagger2Postman;
