var uuid = require('node-uuid'),
    jsface = require('jsface'),
    url = require('url'),
    _ = require('lodash'),
    META_KEY = 'x-postman-meta',

    ConvertResult = function (status, message) {
        this.status = status;
        this.message = message;
    },

    Swagger2Postman = jsface.Class({
        constructor: function (options) {
            this.collectionJson = {
                'info': {
                    'name': '',
                    '_postman_id': uuid.v4(),
                    'schema': 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
                },
                'items': []
            };
            this.basePath = {};
            this.definitions = {};
            this.paramDefinitions = {};
            this.securityDefinitions = {};
            this.globalSecurity = [];
            this.logger = function () {
            };

            this.options = options || {};

            this.options.includeQueryParams = typeof (this.options.includeQueryParams) == 'undefined' ?
                                                        true : this.options.includeQueryParams;

            this.options.includeOptionalQueryParams = typeof (this.options.includeOptionalQueryParams) == 'undefined' ?
                                                         false : this.options.includeOptionalQueryParams;

            this.options.includeBodyTemplate = typeof (this.options.includeBodyTemplate) == 'undefined' ?
                                                         false : this.options.includeBodyTemplate;

            this.options.tagFilter = this.options.tagFilter || null;
        },

        setLogger: function (func) {
            this.logger = func;
        },

        validate: function (json) {
            if (!json.hasOwnProperty('swagger') || json.swagger !== '2.0') {
                return new ConvertResult('failed', 'Must contain a swagger field (2.0)');
            }

            if (!json.hasOwnProperty('info')) {
                return new ConvertResult('failed', 'Must contain an info object');
            }
            else {
                var info = json.info;
                if (!info || !info.title) {
                    return new ConvertResult('failed', 'Must contain info.title');
                }
            }

            return new ConvertResult('passed', '');
        },

        setBasePath: function (json) {
            if (json.host) {
                // This should be `domain` according to the specs, but postman seems
                // to only accept `host`.
                this.basePath.host = json.host;
            }
            if (json.basePath) {
                this.basePath.path = json.basePath.replace(/\/+$/, "").split('/');
            }

            if (json.schemes && json.schemes.indexOf('https') != -1) {
                this.basePath.protocol = 'https';
            }
            else {
                this.basePath.protocol = 'http';
            }
        },

        getFolderNameForPath: function (pathUrl) {
            if (pathUrl == '/') {
                return null;
            }
            var segments = pathUrl.split('/'),
                numSegments = segments.length,
                folderName = null;
            this.logger('Getting folder name for path: ' + pathUrl);
            this.logger('Segments: ' + JSON.stringify(segments));
            if (numSegments > 1) {
                folderName = segments[1];
                this.logger('For path ' + pathUrl + ', returning folderName ' + folderName);
                return folderName;
            }
            else {
                this.logger('Error - path MUST begin with /');
                return null;
            }
        },

        handleInfo: function (json) {
            this.collectionJson.info.name = json.info.title;
            if (json.info.description) {
                this.collectionJson.info.description = {
                    'content': json.info.description,
                    'type': 'text/markdown'
                }
            }
        },

        resolveParam: function (param) {
            if (param.$ref) {
                var ref = param.$ref;
                if (ref.indexOf("#/parameters/") > -1) {
                    var definitionKey = ref.split("/").pop();
                    if (definitionKey) {
                        return this.paramDefinitions[definitionKey];
                    }
                }
            } else {
                return param;
            }
        },

        mergeParamLists: function (oldParams, newParams) {
            var retVal = {},
                numOldParams,
                numNewParams,
                i,
                param;

            oldParams = oldParams || [];
            newParams = newParams || [];

            numOldParams = oldParams.length;
            numNewParams = newParams.length;

            for (i = 0; i < numOldParams; i++) {
                param = this.resolveParam(oldParams[i]);
                retVal[param.name] = param;
            }

            for (i = 0; i < numNewParams; i++) {
                param = this.resolveParam(newParams[i]);
                retVal[param.name] = param;
            }

            return retVal;
        },

        getDefinitonByKey: function (key) {
            return this.definitions[key];
        },

        getDefinitonRefKey: function (ref) {
            if (ref.indexOf("#/definitions/") > -1) {
                return ref.split("/").pop();
            }
        },

        resolveDefiniton: function (definition) {
            if (definition.$ref) {
                var key = this.getDefinitonRefKey(definition.$ref);
                if (key) {
                    return this.getDefinitonByKey(key)
                }
            } else {
                return definition;
            }
        },

        getAllReferencedDefinitions: function (definition, referenced) {
            // If the definition is a reference, and we haven't already added it,
            // resolve and add it, and then find any references in the resolved definition.
            if (definition.$ref) {
                var key = this.getDefinitonRefKey(definition.$ref);
                if (key && !referenced.hasOwnProperty(key)) {
                    definition = this.getDefinitonByKey(key);
                    if (definition) {
                        referenced[key] = definition;
                        return this.getAllReferencedDefinitions(definition, referenced);
                    }
                }
            }
            // If the definition is an object, find any references in its propertes and
            // additionalProperties definitions.
            else if (definition.type == 'object') {
                for (var name in definition.properties) {
                    if (definition.properties.hasOwnProperty(name)) {
                        var propertyDefinition = definition.properties[name];
                        referenced = this.getAllReferencedDefinitions(propertyDefinition, referenced);
                    }
                }
                if (definition.additionalProperties) {
                    referenced = this.getAllReferencedDefinitions(definition.additionalProperties, referenced);
                }
            }
            // If the definition is an array, find any references in its items definition.
            else if (definition.type == 'array' && definition.items) {
                return this.getAllReferencedDefinitions(definition.items, referenced);
            }
            // Otherwise, return the current references.
            return referenced;
        },

        generateTestsFromSpec: function(responses, path) {
            var tests = [],
                statusCodes = _.keys(responses);

            if (statusCodes.length > 0) {
                this.logger('Adding Test for: ' + path);

                var statusCodesString = statusCodes.join();

                tests.push('tests["Status code is expected"] = [' + statusCodesString + '].indexOf(responseCode.code) > -1;');

                // set test in case of success
                _.forEach(responses, (response,status) => {
                    if (Number(status) >= 200 && Number(status) < 300 &&
                        response && response.schema) {

                        var schema = this.resolveDefiniton(response.schema);

                        if (schema && schema.type) {
                            var fullSchema = _.clone(schema)
                            fullSchema['definitions'] = this.getAllReferencedDefinitions(schema, {});

                            tests.push('');
                            tests.push('if (responseCode.code === ' + status + ') {');
                            tests.push('\tvar data = JSON.parse(responseBody);');
                            tests.push('\tvar schema = ' + JSON.stringify(fullSchema,null,4) + ';');
                            tests.push('\ttests["Response Body respects JSON schema documentation"] = tv4.validate(data, schema);');
                            tests.push('\tif(tests["Response Body respect JSON schema documentation"] === false){');
                            tests.push('\t\tconsole.log(tv4.error);');
                            tests.push('\t}');
                            tests.push('}');
                        }
                    }
                });

            }

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
                return JSON.stringify(schema.example,null,4);
            }

            var definition = [],
                properties = schema.properties,
                name,
                value;

            if (schema.type == 'object') {
                for (name in properties) {
                    var propertySchema = this.resolveDefiniton(properties[name]);
                    // TODO: Check for circular refs
                    if (!propertySchema.readOnly) {
                        value = this.getModelTemplate(propertySchema, depth + 1);
                        definition.push('"' + name + '" : ' + value );
                    }
                }
                return JSON.stringify(JSON.parse('{' + definition.join(',') + '}'), null, '   ');
            } else if (schema.type == 'array') {
                var itemSchema = this.resolveDefiniton(schema.items);
                // TODO: Check for circular refs
                value = this.getModelTemplate(itemSchema, depth + 1);
                return JSON.stringify(JSON.parse('[' + value + ']'), null, '   ');
            }
            else {
                return this.getDefaultValue(schema.type);
            }
        },

        buildUrl: function(basePath, path) {
            if (path.length > 0 && path[0] === '/') {
                path = path.substring(1);
            }
            path = path.split('/');

            var urlObject = _.clone(basePath)
            if (basePath.hasOwnProperty('path')) {
                urlObject.path = basePath.path.concat(path);
            } else {
                urlObject.path = path;
            }

            return urlObject
        },

        buildItemFromOperation: function (path, method, operation, paramsFromPathItem) {
            if (this.options.tagFilter &&
                operation.tags &&
                operation.tags.indexOf(this.options.tagFilter) === -1) {
                // Operation has tags that don't match the filter
                return;
            }
            var request = {
                'url': this.buildUrl(this.basePath, path),
                // This field isn't in the 2.1 spec, but seems to be used by postman
                'description': operation.description,
                'auth': {},
                'method': method,
                'headers': []
            }

            var item = {
                'name': operation.summary,
                'events': [],
                'request': request,
                'responses': []
            }

            var thisParams = this.mergeParamLists(paramsFromPathItem, operation.parameters),
                thisResponses = operation.responses,
                thisConsumes = this.globalConsumes,
                thisSecurity = operation.security || this.globalSecurity;

            // TODO: Where should this go in postman 2.x spec?
            // Handle custom swagger attributes for postman aws integration
            if (operation[META_KEY]) {
                for (var requestAttr in operation[META_KEY]) {
                    if (operation[META_KEY].hasOwnProperty(requestAttr)) {
                        request[requestAttr] = operation[META_KEY][requestAttr];
                    }
                }
            }

            if (operation.consumes) {
                thisConsumes = operation.consumes;
            }

            // handle security
            if (thisSecurity[0]) {
                // Only consider the first defined security object.
                // Swagger defines that there is a logical OR between the different security objects in the array -
                // i.e. only one needs to/should be used at a time
                var securityObject = thisSecurity[0];
                for (securityRequirementName in securityObject) {
                    if (securityObject.hasOwnProperty(securityRequirementName) &&
                        securityObject[securityRequirementName] &&
                        this.securityDefinitions[securityRequirementName]) {

                        var scopes = securityObject[securityRequirementName];
                        var securityDefinition = this.securityDefinitions[securityRequirementName];
                        // TODO: support apiKey security
                        if (securityDefinition) {
                            if (securityDefinition.type === 'oauth2') {
                                var tokenVarName = securityRequirementName + '_access_token';
                                request.headers.push({
                                    'key': 'Authorization',
                                    'value': 'Bearer {{' + tokenVarName + '}}'
                                });
                            } else if (securityDefinition.type === 'basic') {
                                request.auth = {
                                    'type': 'basic',
                                    'basic': {
                                        'username': '{{' + securityRequirementName + '_username}}',
                                        'password': '{{' + securityRequirementName + '_password}}',
                                        'saveHelperData': true,
                                        'showPassword': true
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // set data and headers
            for (var param in thisParams) {
                if (thisParams.hasOwnProperty(param) && thisParams[param]) {
                    this.logger('Processing param: ' + JSON.stringify(param));
                    if (thisParams[param].in === 'query' && this.options.includeQueryParams !== false) {
                        if (thisParams[param].required || this.options.includeOptionalQueryParams == true) {
                            if (!request.url.hasOwnProperty('query')) {
                                request.url.query = [];
                            }
                            request.url.query.push({
                                'key': thisParams[param].name,
                                'value': '{{' + thisParams[param].name + '}}',
                                'description': thisParams[param].description
                            });
                        }
                    }

                    else if (thisParams[param].in === 'header') {
                        request.headers.push({
                            'key': thisParams[param].name,
                            'value': '{{' + thisParams[param].name + '}}'
                        });
                    }

                    else if (thisParams[param].in === 'body') {
                        if (!request.hasOwnProperty('body')) {
                            request.body = {};
                        }
                        request.body.mode = 'raw';
                        if (this.options.includeBodyTemplate === true &&
                            thisParams[param].schema &&
                            thisConsumes.indexOf('application/json') > -1) {
                            request.headers.push({
                                'key': 'Content-Type',
                                'value': 'application/json'
                            });

                            var schema = this.resolveDefiniton(thisParams[param].schema);
                            if(schema){
                                request.body.raw = this.getModelTemplate(schema, 0);
                            }
                        }
                        if(!request.body.raw || request.body.raw === ""){
                            request.body.raw = thisParams[param].description;
                        }
                    }

                    else if (thisParams[param].in === 'formData') {
                        if (!request.hasOwnProperty('body')) {
                            request.body = {};
                        }
                        var data = {
                            'key': thisParams[param].name,
                            'value': '{{' + thisParams[param].name + '}}',
                            'enabled': true
                        };
                        if (thisConsumes.indexOf('application/x-www-form-urlencoded') > -1) {
                            request.body.mode = 'urlencoded';
                            if (!request.body.hasOwnProperty('urlencoded')) {
                                request.body.urlencoded = [];
                            }
                            request.body.urlencoded.push(data);
                        } else {
                            // Assume this is a multipart/form-data parameter, even if the
                            // header isn't set.
                            request.body.mode = 'formdata';
                            if (!request.body.hasOwnProperty('formdata')) {
                                request.body.formdata = [];
                            }
                            request.body.formdata.push(data);
                        }
                    }
                    else if (thisParams[param].in === 'path') {
                        if (!request.url.hasOwnProperty('variables')) {
                            request.url.variables = [];
                        }
                        request.url.variables.push({
                            'id': thisParams[param].name,
                            'value': '{{' + thisParams[param].name + '}}',
                            'type': thisParams[param].type
                        });
                    }
                }
            }
            // set the default body mode for this request, even if it doesn't have a body
            // eg. for GET requests
            if (!request.hasOwnProperty('body')) {
                request.body = {};
                if (thisConsumes.indexOf('application/x-www-form-urlencoded') > -1) {
                    request.body.mode = 'urlencoded';
                    request.body.urlencoded = [];
                } else if (thisConsumes.indexOf('multipart/form-data') > -1) {
                    request.body.mode = 'formdata';
                    request.body.formdata = [];
                } else {
                    request.body.mode = 'raw';
                    request.body.raw = '';
                }
            }

            var tests = this.generateTestsFromSpec(thisResponses, path);
            if (tests && tests.length > 0) {
                item.events.push({
                    'listen': 'test',
                    'script': {
                        'type': 'text/javascript',
                        'exec': tests
                    }
                });
            }

            return item;
        },

        buildItemListFromPath: function (path, pathItem) {
            if (pathItem.$ref) {
                this.logger('Error - cannot handle $ref attributes');
                return;
            }

            var items = [];

            var acceptedPostmanVerbs = [
                'get', 'put', 'post', 'patch', 'delete', 'copy', 'head', 'options',
                'link', 'unlink', 'purge', 'lock', 'unlock', 'propfind', 'view'];

            // replace path variables {petId} with :petId
            if (path) {
                path = path.replace(/{/g, ':').replace(/}/g, '');
            }

            for (var i = 0; i < acceptedPostmanVerbs.length; i++) {
                var verb = acceptedPostmanVerbs[i];
                if (pathItem[verb]) {
                    items.push(
                        this.buildItemFromOperation(
                            path,
                            verb.toUpperCase(),
                            pathItem[verb],
                            pathItem.parameters
                        )
                    );
                }
            }
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
                                    'name': folderName,
                                    'items': itemList
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

        convert: function (json) {
            var validationResult = this.validate(json);
            if (validationResult.status === 'failed') {
                // error
                return validationResult;
            }

            this.collectionId = uuid.v4();

            this.globalConsumes = json.consumes || [];

            this.securityDefinitions = json.securityDefinitions || {};

            this.globalSecurity = json.security || [];

            this.definitions = json.definitions;

            this.paramDefinitions = json.parameters;

            this.handleInfo(json);

            this.setBasePath(json);

            this.handlePaths(json.paths);

            this.logger('Swagger converted successfully');

            validationResult.collection = this.collectionJson;

            return validationResult;
        },

        // since travis doesnt support es6
        endsWith: function (str, suffix) {
            return str.indexOf(suffix, str.length - suffix.length) !== -1;
        }
    });

module.exports = Swagger2Postman;
