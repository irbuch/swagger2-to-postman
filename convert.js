'use strict';
var uuidv4 = require('uuid/v4');
var jsface = require('jsface');
var _ = require('lodash');
var SwaggerParser = require('swagger-parser');

var META_KEY = 'x-postman-meta';

var Swagger2Postman = jsface.Class({ // eslint-disable-line
    constructor: function (options) {
        this.collectionJson = {
            info: {
                name: '',
                _postman_id: uuidv4(),
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            items: []
        };
        this.basePath = {};
        this.definitions = {};
        this.paramDefinitions = {};
        this.securityDefinitions = {};
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

    // getDefinitonByKey: function (key) {
    //     return this.definitions[key];
    // },
    //
    // getDefinitonRefKey: function (ref) {
    //     if (ref.indexOf('#/definitions/') > -1) {
    //         return ref.split('/').pop();
    //     }
    //     return null;
    // },

    // resolveDefiniton: function (definition) {
    //     if (definition.$ref) {
    //         var key = this.getDefinitonRefKey(definition.$ref);
    //         if (key) {
    //             return this.getDefinitonByKey(key);
    //         }
    //     }
    //     return definition;
    // },

    // getAllReferencedDefinitions: function (definition, referenced) {
    //     // If the definition is a reference, and we haven't already added it,
    //     // resolve and add it, and then find any references in the resolved definition.
    //     if (definition.$ref) {
    //         var key = this.getDefinitonRefKey(definition.$ref);
    //         if (key && !referenced.hasOwnProperty(key)) {
    //             definition = this.getDefinitonByKey(key);
    //             if (definition) {
    //                 referenced[key] = definition;
    //                 return this.getAllReferencedDefinitions(definition, referenced);
    //             }
    //         }
    //     // If the definition is an object, find any references in its propertes and
    //     // additionalProperties definitions.
    //     } else if (definition.type === 'object') {
    //         for (var name in definition.properties) {
    //             if (definition.properties.hasOwnProperty(name)) {
    //                 var propertyDefinition = definition.properties[name];
    //                 referenced = this.getAllReferencedDefinitions(propertyDefinition, referenced);
    //             }
    //         }
    //         if (definition.additionalProperties) {
    //             referenced = this.getAllReferencedDefinitions(definition.additionalProperties, referenced);
    //         }
    //     // If the definition is an array, find any references in its items definition.
    //     } else if (definition.type === 'array' && definition.items) {
    //         return this.getAllReferencedDefinitions(definition.items, referenced);
    //     }
    //     // Otherwise, return the current references.
    //     return referenced;
    // },

    // generateTestsFromSpec: function (responses, path) {
    //     var self = this;
    //     var tests = [];
    //     var statusCodes = _.keys(responses);
    //
    //     if (statusCodes.length > 0) {
    //         this.logger('Adding Test for: ' + path);
    //
    //         var statusCodesString = statusCodes.join();
    //
    //         tests.push('tests["Status code is expected"] = [' +
    //           statusCodesString + '].indexOf(responseCode.code) > -1;');
    //
    //         // set test in case of success
    //         _.forEach(responses, function (response, status) {
    //             if (Number(status) >= 200 && Number(status) < 300 && response && response.schema) {
    //                 var schema = self.resolveDefiniton(response.schema);
    //
    //                 if (schema && schema.type) {
    //                     var fullSchema = _.clone(schema);
    //                     fullSchema.definitions = self.getAllReferencedDefinitions(schema, {});
    //
    //                     tests.push('');
    //                     tests.push('if (responseCode.code === ' + status + ') {');
    //                     tests.push('\tvar data = JSON.parse(responseBody);');
    //                     tests.push('\tvar schema = ' + JSON.stringify(fullSchema, null, 4) + ';');
    //                     tests.push('\ttests["Response Body respects JSON schema documentation"]'
    //                         + ' = tv4.validate(data, schema);');
    //                     tests.push('\tif(tests["Response Body respect JSON schema documentation"] === false){');
    //                     tests.push('\t\tconsole.log(tv4.error);');
    //                     tests.push('\t}');
    //                     tests.push('}');
    //                 }
    //             }
    //         });
    //     }
    //
    //     return tests;
    // },

    getDefaultValue: function (type) {
        switch (type) {
            case 'integer': {
                return 0;
            }
            case 'number': {
                return 0.0;
            }
            case 'array': {
                return '[]';
            }
            case 'boolean': {
                return true;
            }
            case 'string': {
                return '""';
            }
            default: {
                return '{}';
            }
        }
    },

    getModelTemplate: function (schema, depth) {
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
                    value = this.getModelTemplate(propertySchema, depth + 1);
                    definition.push('"' + name + '" : ' + value);
                }
            }
            return JSON.stringify(JSON.parse('{' + definition.join(',') + '}'), null, '   ');

        } else if (schema.type === 'array') {
            value = this.getModelTemplate(schema.items, depth + 1);
            return JSON.stringify(JSON.parse('[' + value + ']'), null, '   ');
        }

        return this.getDefaultValue(schema.type);
    },

    buildUrl: function (basePath, path) {
        var lpath = path;
        if (lpath.length > 0 && lpath[0] === '/') {
            lpath = lpath.substring(1);
        }
        lpath = lpath.split('/');

        var urlObject = _.clone(basePath);
        if (basePath.hasOwnProperty('path')) {
            urlObject.path = basePath.path.concat(lpath);
        } else {
            urlObject.path = lpath;
        }

        return urlObject;
    },

    applySecurity: function (security, request) {
        // Only consider the first defined security object.
        // Swagger defines that there is a logical OR between the different security objects in the array -
        // i.e. only one needs to/should be used at a time
        for (var securityRequirementName in security) {
            if (security.hasOwnProperty(securityRequirementName) &&
                security[securityRequirementName] &&
                this.securityDefinitions[securityRequirementName]) {

                // TODO: add usage of scopes
                // var scopes = securityObject[securityRequirementName];
                var securityDefinition = this.securityDefinitions[securityRequirementName];
                // TODO: support apiKey security
                if (securityDefinition) {
                    if (securityDefinition.type === 'oauth2') {
                        var tokenVarName = securityRequirementName + '_access_token';
                        request.headers.push({
                            key: 'Authorization',
                            value: 'Bearer {{' + tokenVarName + '}}'
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

                request.body.raw = this.getModelTemplate(param.schema, 0);
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
            url: this.buildUrl(this.basePath, path),
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
        // var thisResponses = operation.responses;
        var thisConsumes = operation.consumes || this.globalConsumes;
        var thisSecurity = operation.security || this.globalSecurity;

        // TODO: Where should this go in postman 2.x spec?
        // Handle custom swagger attributes for postman aws integration
        if (operation[META_KEY]) {
            for (var requestAttr in operation[META_KEY]) {
                if (operation[META_KEY].hasOwnProperty(requestAttr)) {
                    request[requestAttr] = operation[META_KEY][requestAttr];
                }
            }
        }

        // handle security
        if (thisSecurity[0]) {
            request = this.applySecurity(thisSecurity[0], request);
        }

        // set data and headers
        for (var param in thisParams) {
            if (thisParams.hasOwnProperty(param) && thisParams[param]) {
                this.logger('Processing param: ' + JSON.stringify(param));
                request = this.processParameter(thisParams[param], thisConsumes, request);
            }
        }

        request = this.applyDefaultBodyMode(thisConsumes, request);

        // var tests = this.generateTestsFromSpec(thisResponses, path);
        // if (tests && tests.length > 0) {
        //     item.events.push({
        //         listen: 'test',
        //         script: {
        //             type: 'text/javascript',
        //             exec: tests
        //         }
        //     });
        // }

        return item;
    },

    buildItemListFromPath: function (path, pathItem) {
        var self = this;
        var lpath = path;
        if (pathItem.$ref) {
            this.logger('Error - cannot handle $ref attributes');
            return null;
        }

        var items = [];

        var acceptedPostmanVerbs = [
            'get', 'put', 'post', 'patch', 'delete', 'copy', 'head', 'options',
            'link', 'unlink', 'purge', 'lock', 'unlock', 'propfind', 'view'];

        // replace path variables {petId} with :petId
        if (lpath) {
            lpath = lpath.replace(/{/g, ':').replace(/}/g, '');
        }

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

        // for (var i = 0; i < acceptedPostmanVerbs.length; i++) {
        //     var verb = acceptedPostmanVerbs[i];
        //     if (pathItem[verb]) {
        //         items.push(
        //             this.buildItemFromOperation(
        //                 lpath,
        //                 verb.toUpperCase(),
        //                 pathItem[verb],
        //                 pathItem.parameters
        //             )
        //         );
        //     }
        // }
        return items;
    },

    handlePaths: function (paths) {
        var folders = {};
        var items = [];
        // Add a folder for each path
        for (var path in paths) {
            if (paths.hasOwnProperty(path)) {
                var folderName = this.getFolderNameForPath(path);
                this.logger('Adding path item. path = ' + path + '   folder = ' + folderName);
                var itemList = this.buildItemListFromPath(path, paths[path]);
                if (itemList && itemList.length > 0) {
                    if (folderName) {
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

            self.collectionId = uuidv4();

            self.globalConsumes = api.consumes || [];

            self.securityDefinitions = api.securityDefinitions || {};

            self.globalSecurity = api.security || [];

            self.definitions = api.definitions || {};

            self.paramDefinitions = api.parameters || {};

            self.handleInfo(api);

            self.setBasePath(api);

            self.handlePaths(api.paths);

            self.logger('Conversion successful');

            return cb(null, self.collectionJson);

        });
    },

});

module.exports = Swagger2Postman;
