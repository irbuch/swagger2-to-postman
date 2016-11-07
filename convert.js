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
                'id': '',
                'name': '',
                'description': '',
                'order': [],
                'folders': [],
                'timestamp': 1413302258635,
                'synced': false,
                'requests': []
            };
            this.basePath = '';
            this.collectionId = '';
            this.folders = {};
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
            this.basePath = '';
            if (json.host) {
                this.basePath = json.host;
            }
            if (json.basePath) {
                this.basePath += json.basePath;
            }

            if (json.schemes && json.schemes.indexOf('https') != -1) {
                this.basePath = 'https://' + this.basePath;
            }
            else {
                this.basePath = 'http://' + this.basePath;
            }

            if (!this.endsWith(this.basePath, '/')) {
                this.basePath += '/';
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

                // create a folder for this path url
                if (!this.folders[folderName]) {
                    this.folders[folderName] = this.createNewFolder(folderName);
                }
                this.logger('For path ' + pathUrl + ', returning folderName ' + this.folders[folderName].name);
                return this.folders[folderName].name;
            }
            else {
                this.logger('Error - path MUST begin with /');
                return null;
            }
        },

        createNewFolder: function (name) {
            var newFolder = {
                'id': uuid.v4(),
                'name': name,
                'description': 'Folder for ' + name,
                'order': [],
                'collection_name': this.collectionJson.name,
                'collection_id': this.collectionId,
                'collection': this.collectionId
            };
            this.logger('Created folder ' + newFolder.name);
            return newFolder;
        },

        handleInfo: function (json) {
            this.collectionJson.name = json.info.title;
            this.collectionJson.description = json.info.description;
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

        generateTestsFromSpec: function(responses, url) {
            var tests = "",
                statusCodes = _.keys(responses);

            if (statusCodes.length > 0) {
                this.logger('Adding Test for: ' + url);

                var statusCodesString = statusCodes.join();

                tests += 'tests["Status code is expected"] = [' + statusCodesString + '].indexOf(responseCode.code) > -1;\n';

                // set test in case of success
                _.forEach(responses, (response,status) => {
                    if (Number(status) >= 200 && Number(status) < 300 &&
                        response && response.schema) {

                        var schema = this.resolveDefiniton(response.schema);

                        if (schema && schema.type) {
                            var fullSchema = _.clone(schema)
                            fullSchema['definitions'] = this.getAllReferencedDefinitions(schema, {});

                            tests+='\n'
                            tests+='if (responseCode.code === ' + status + ') {\n';
                            tests+='\tvar data = JSON.parse(responseBody);\n';
                            tests+='\tvar schema = ' + JSON.stringify(fullSchema,null,4) + ';\n';
                            tests+='\ttests["Response Body respects JSON schema documentation"] = tv4.validate(data, schema);\n'
                            tests+='\tif(tests["Response Body respect JSON schema documentation"] === false){\n';
                            tests+='\t\tconsole.log(tv4.error);\n';
                            tests+='\t}\n';
                            tests+='}\n';
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

        addOperationToFolder: function (path, method, operation, folderName, paramsFromPathItem) {
            if (this.options.tagFilter &&
                operation.tags &&
                operation.tags.indexOf(this.options.tagFilter) === -1) {
                // Operation has tags that don't match the filter
                return;
            }

            var request = {
                    'id': uuid.v4(),
                    'headers': '',
                    'url': '',
                    'pathVariables': {},
                    'preRequestScript': '',
                    'method': 'GET',
                    'data': [],
                    'dataMode': 'raw',
                    "rawModeData": "",
                    'description': operation.description || '',
                    'descriptionFormat': 'html',
                    'time': '',
                    'version': 2,
                    'responses': [],
                    'tests': '',
                    'collectionId': this.collectionId,
                    'synced': false
                },
                thisParams = this.mergeParamLists(paramsFromPathItem, operation.parameters),
                thisResponses = operation.responses,
                hasQueryParams = false,
                param,
                requestAttr,
                thisConsumes = this.globalConsumes,
                tempBasePath,
                thisSecurity = operation.security || this.globalSecurity;

            if (path.length > 0 && path[0] === '/') {
                path = path.substring(1);
            }

            // Problem here
            // url.resolve("http://host.com/", "/api") returns "http://host.com/api"
            // but url.resolve("http://{{host}}.com/", "/api") returns "http:///%7B..host.com/api"
            // (note the extra slash after http:)
            // request.url = decodeURI(url.resolve(this.basePath, path));
            tempBasePath = this.basePath
                .replace(/{{/g, 'POSTMAN_VARIABLE_OPEN_DB')
                .replace(/}}/g, 'POSTMAN_VARIABLE_CLOSE_DB');

            request.url = decodeURI(url.resolve(tempBasePath, path))
                .replace(/POSTMAN_VARIABLE_OPEN_DB/g, '{{')
                .replace(/POSTMAN_VARIABLE_CLOSE_DB/g, '}}');

            request.method = method;
            request.name = operation.summary;
            request.time = (new Date()).getTime();

            // Handle custom swagger attributes for postman aws integration
            if (operation[META_KEY]) {
                for (requestAttr in operation[META_KEY]) {
                    if (operation[META_KEY].hasOwnProperty(requestAttr)) {
                        request[requestAttr] = operation[META_KEY][requestAttr];
                    }
                }
            }

            if (operation.consumes) {
                thisConsumes = operation.consumes;
            }
            // set the default dataMode for this request, even if it doesn't have a body
            // eg. for GET requests
            if (thisConsumes.indexOf('application/x-www-form-urlencoded') > -1) {
                request.dataMode = 'urlencoded';
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
                        // TODO: support basic and apiKey security
                        // TODO: Do we need to check the oauth2 flow type here?
                        if (securityDefinition && securityDefinition.type === 'oauth2') {
                            var tokenVarName = 'token_' + securityRequirementName + '_' + scopes.join('_');
                            request.headers += 'Authorization: Bearer {{' + tokenVarName + '}}\n';
                        }
                    }
                }
            }

            // set data and headers
            for (param in thisParams) {
                if (thisParams.hasOwnProperty(param) && thisParams[param]) {
                    this.logger('Processing param: ' + JSON.stringify(param));
                    if (thisParams[param].in === 'query' && this.options.includeQueryParams !== false) {
                        if (thisParams[param].required || this.options.includeOptionalQueryParams == true) {
                            if (!hasQueryParams) {
                                hasQueryParams = true;
                                request.url += '?';
                            }
                            request.url += thisParams[param].name + '={{' + thisParams[param].name + '}}&';
                        }
                    }

                    else if (thisParams[param].in === 'header') {
                        request.headers += thisParams[param].name + ': {{' + thisParams[param].name + '}}\n';
                    }

                    else if (thisParams[param].in === 'body') {
                        request.dataMode = 'raw';
                        if (this.options.includeBodyTemplate === true &&
                            thisParams[param].schema &&
                            thisConsumes.indexOf('application/json') > -1) {
                            request.headers += 'Content-Type: application/json\n';

                            var schema = this.resolveDefiniton(thisParams[param].schema);
                            if(schema){
                                request.rawModeData = this.getModelTemplate(schema, 0);
                            }
                        }
                        if(!request.rawModeData || request.rawModeData === ""){
                            request.rawModeData = thisParams[param].description;
                        }
                    }

                    else if (thisParams[param].in === 'formData') {
                        if (thisConsumes.indexOf('application/x-www-form-urlencoded') > -1) {
                            request.dataMode = 'urlencoded';
                        }
                        else {
                            request.dataMode = 'params';
                        }
                        request.data.push({
                            'key': thisParams[param].name,
                            'value': '{{' + thisParams[param].name + '}}',
                            'type': 'text',
                            'enabled': true
                        });
                    }
                    else if (thisParams[param].in === 'path') {
                        if (!request.hasOwnProperty('pathVariables')) {
                            request.pathVariables = {};
                        }
                        request.pathVariables[thisParams[param].name] = '{{' + thisParams[param].name + '}}';
                    }
                }
            }

            request.tests = this.generateTestsFromSpec(thisResponses, request.url);

            if (hasQueryParams && this.endsWith(request.url, '&')) {
                request.url = request.url.slice(0, -1);
            }

            this.collectionJson.requests.push(request);
            if (folderName !== null) {
                this.folders[folderName].order.push(request.id);
            }
            else {
                this.collectionJson.order.push(request.id);
            }
        },

        addPathItemToFolder: function (path, pathItem, folderName) {
            if (pathItem.$ref) {
                this.logger('Error - cannot handle $ref attributes');
                return;
            }

            var acceptedPostmanVerbs = [
                    'get', 'put', 'post', 'patch', 'delete', 'copy', 'head', 'options',
                    'link', 'unlink', 'purge', 'lock', 'unlock', 'propfind', 'view'],
                numVerbs = acceptedPostmanVerbs.length,
                i,
                verb;

            // replace path variables {petId} with :petId
            if (path) {
                path = path.replace(/{/g, ':').replace(/}/g, '');
            }

            for (i = 0; i < numVerbs; i++) {
                verb = acceptedPostmanVerbs[i];
                if (pathItem[verb]) {
                    this.addOperationToFolder(
                        path,
                        verb.toUpperCase(),
                        pathItem[verb],
                        folderName,
                        pathItem.parameters
                    );
                }
            }
        },

        handlePaths: function (json) {
            var paths = json.paths,
                path,
                folderName;

            // Add a folder for each path
            for (path in paths) {
                if (paths.hasOwnProperty(path)) {
                    folderName = this.getFolderNameForPath(path);
                    this.logger('Adding path item. path = ' + path + '   folder = ' + folderName);
                    this.addPathItemToFolder(path, paths[path], folderName);
                }
            }
        },

        addFoldersToCollection: function () {
            var folderName;
            for (folderName in this.folders) {
                if (this.folders.hasOwnProperty(folderName) && this.folders[folderName].order.length > 0) {
                    this.collectionJson.folders.push(this.folders[folderName]);
                }
            }
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

            this.handlePaths(json);

            this.addFoldersToCollection();

            this.collectionJson.id = this.collectionId;
            // this.logger(JSON.stringify(this.collectionJson));
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
