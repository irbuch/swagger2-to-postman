[![Build Status](https://travis-ci.org/kenjones-cisco/swagger2-to-postman.svg?branch=develop)](https://travis-ci.org/kenjones-cisco/swagger2-to-postman)

# Swagger2Postman

Converts [Swagger 2.0](https://swagger.io/specification/) API specification to [Postman v2 Collection](https://schema.getpostman.com/json/collection/v2.0.0/docs/index.html).

## Table of Contents

- [Features](#features)
- [CLI](#cli)
    * [Examples](#examples)
- [As Library](#as-library)
    * [Valid Options](#valid-options)
- [Vendor Extensions](#vendor-extensions)
    * [x-postman-meta](#x-postman-meta)
- [TODO](#todo)


## Features

- Validates the provided Swagger 2.0 API specification.
* Supports JSON and YAML locally or via remote URL.
* Validates generated Postman Collection aligns to Collection v2 schema.
* Optionally generates example body based on provided definitions.
* Optionally generates tests to validate responses and associated payload of response.
* Works as CLI or library.


## CLI

```
Usage: swag2post [command] [options]


Options:

  -V, --version  output the version number
  -h, --help     output usage information


Commands:

  convert [options]   Convert Swagger v2 API specification to Postman v2 Collection
```

```
Usage: convert [options]

Convert Swagger v2 API specification to Postman v2 Collection


Options:

  -i, --input <location>           URL or file path of the Swagger specification
  -o, --output <path>              Target file path for Postman Collection
  -w, --overwrite                  Overwrite the output file if exists
  -c, --compact                    Compact the output
  --exclude-query-params           Exclude query parameters
  --exclude-optional-query-params  Exclude optional query parameters
  --exclude-body-template          Exclude body template
  --exclude-tests                  Exclude tests of responses
  --disable-collection-validation  Disable validation of the generated Collection
  -t, --tag-filter <tag>           Include operations with specific tag
  --host <hostname>                Name of API host to use. Overrides value within provided API specification.
  --default-security               Name of the security options to use by default. Default: first listed.
  --default-produces-type          Name of the produces option to use by default. Default: first listed.
  --envfile <path>                 Target path for Postman Environment (json)
  -h, --help                       output usage information
```

### Examples

```bash
swag2post convert -i http://petstore.swagger.io/v2/swagger.json -o petstore_collection.json --exclude-optional-query-params --exclude-body-template --exclude-tests
```

```bash
swag2post convert -i swagger.json -o petstore_collection.json
```

```bash
swag2post convert -i swagger.yaml -o petstore_collection.json
```


## As library

lib/index.js provides a class - `Swagger2Postman`.

Initialize class:

```javascript
    var Swagger2Postman = require('swagger2-to-postman');
    var converter = new Swagger2Postman();
```

Optionally, set a logger:

```javascript
    converter.setLogger(console.log);
```

Convert your Swagger 2.0 API (json, yaml, and remote URL):

```javascript
    var apiLocation = 'api.yaml';
    converter.convert(apiLocation, function (err, collection) {
        if (err) {
            console.error('failed to convert: ' + err);
            return;
        }
        console.log(JSON.stringify(collection, null, 4));
    });
```

Optional Configuration Parameters:
The constructor can also take in a map of configuration options

```javascript
var options = {
  excludeQueryParams: true,
  excludeOptionalQueryParams: true,
  excludeBodyTemplate: true,
  excludeTests: true,
  disableCollectionValidation: false,
  tagFilter: 'SampleTag',
  host: 'my.example.com',
  envfile: 'my-example.json',
};

var converter = new Swagger2Postman(options);
```

### Valid Options

* `excludeQueryParams` - (default *false*) Exclude query string parameters in the request URL.
* `excludeOptionalQueryParams` - (default *false*) Exclude optional query string parameters in the request URL.
* `excludeBodyTemplate` - (default *false*) Exclude example body when body parameter defined and `consumes` includes `application/.*json`.
* `excludeTests` - (default *false*) Exclude test(s) that validate the defined responses for an operation.
* `disableCollectionValidation` - (default *false*) Disable downloading Postman Collection Schema and validating the generated collection.
* `tagFilter` - (default *null*) Filter resources that have a tag that matches this value.
* `host` - (default *null*) Name of the API host. Overrides the value within specification.
* `defaultSecurity` - (default *null*) Name of the security options to use by default. Default: first listed.
* `defaultProducesType` - (default *null*) Name of the produces option to use by default. Default: first listed.
* `envfile` - (default *null*) Target path for Postman Environment (json).


## Vendor Extensions

### x-postman-meta

If specified on an operation and the structure matches the `auth` structure then a Postman specific Authentication can be enabled for the operation.

#### auth Examples

```json
"x-postman-meta": {
    "auth": {
        "type": "awsv4",
        "awsv4": {
            "accessKey": "{{aws_access_key_id}}",
            "secretKey": "{{aws_secret_access_key}}",
            "region": "eu-west-1",
            "service": "execute-api",
            "saveHelperData": true
        }
    }
}
```

```yaml
x-postman-meta:
  auth:
    type: awsv4
    awsv4:
      accessKey: "{{aws_access_key_id}}"
      secretKey: "{{aws_secret_access_key}}"
      region: eu-west-1
      service: execute-api
      saveHelperData: true
```

If specified on an operation and includes the key `tests` that is an array where each item is a separate line in the test block.

#### tests Examples

```json
"x-postman-meta": {
    "tests": [
        "var data = JSON.parse(responseBody);",
        "postman.setEnvironmentVariable('username', data.name);"
    ]
}
```

```yaml
x-postman-meta:
  tests:
    - var data = JSON.parse(responseBody);
    - postman.setEnvironmentVariable('username', data.name);
```


## TODO

- Support `Promise` as well as callback
