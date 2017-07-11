# Swagger2Postman

Converts [Swagger 2.0](https://swagger.io/specification/) API specification to [Postman v2 Collection](https://schema.getpostman.com/json/collection/v2.0.0/docs/index.html).

## Table of Contents

- [Features](#features)
- [CLI](#cli)
    * [Examples](#examples)
- [As Library](#as-library)
    * [Valid Options](#valid-options)
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
  -o, --output <path>              target file path for Postman Collection
  -w, --overwrite                  Overwrite the output file if exists
  -c, --compact                    Compact the output
  --include-query-params           Include query parameters
  --include-optional-query-params  Include optional query parameters
  --include-body-template          Include body template
  --include-tests                  Include tests of responses
  --disable-collection-validation  Disable validation of the generated Collection
  -t, --tag-filter <tag>           Include operations with specific tag
  --host <hostname>                Name of API host to use. Overrides value within provided API specification.
  -h, --help                       output usage information
```

### Examples

```bash
swag2post convert -i http://petstore.swagger.io/v2/swagger.json -o petstore_collection.json --include-optional-query-params --include-body-template --include-tests
```

```bash
swag2post convert -i swagger.json -o petstore_collection.json
```

```bash
swag2post convert -i swagger.yaml -o petstore_collection.json
```


## As library

convert.js provides a jsFace class - Swagger2Postman.

Initialize class:

```javascript
    var swaggerConverter = new Swagger2Postman();
```

Optionally, set a logger:

```javascript
    swaggerConverter.setLogger(console.log);
```

Convert your Swagger 2.0 API (json, yaml, and remote URL):

```javascript
    var apiLocation = 'api.yaml';
    swaggerConverter.convert(apiLocation, function (err, collection) {
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
  includeQueryParams: true,
  includeOptionalQueryParams: true,
  includeBodyTemplate: true,
  includeTests: true,
  disableCollectionValidation: false,
  tagFilter: 'SampleTag',
  host: 'my.example.com',
};

var swaggerConverter = new Swagger2Postman(options);
```

### Valid Options

* `includeQueryParams` - (default *true*) Include query string parameters in the request URL.
* `includeOptionalQueryParams` - (default *false*) Include optional query string parameters in the request URL.
* `includeBodyTemplate` - (default *false*) Include example body when body parameter defined and `consumes` includes `application/.*json`.
* `includeTests` - (default *false*) Include test(s) that validate the defined responses for an operation.
* `disableCollectionValidation` - (default *false*) Disable downloading Postman Collection Schema and validating the generated collection.
* `tagFilter` - (default *null*) Filter resources that have a tag that matches this value.
* `host` - (default *null*) Name of the API host. Overrides the value within specification.


## TODO

* Support Swagger vendor extensions.
* Support generating associated Postman Environment.
