#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
var program = require('commander');
var fs = require('fs');
var Swagger2Postman = require('../lib');
var validator = require('../lib').validator;

function done(code) {
    process.exit(code); // eslint-disable-line
}

/**
 * Writes a JSON blob to the given path.
 * If ``options.compact`` is true, output will be pretty printed. (Default false)
 * If ``options.overwrite`` is false, output file will be overwritten (Default true)
 *
 * @param data
 * @param filepath
 * @param options
 */
function writeJSON(data, filepath, options) {
    let writeFlag = {flag: 'wx'};
    if (options.overwrite) {
        writeFlag = {flag: 'w'};
    }

    try {
        let json = JSON.stringify(data, null, options.compact ? 0 : 4);
        fs.writeFileSync(filepath, json, writeFlag);
    } catch (e) {
        console.error('Could not write file %s', filepath, e);
        return false;
    }
    return true;
}

program
    .usage('[command] [options]')
    .version(require('../package.json').version);

program
    .command('convert')
    .description('Convert Swagger v2 API specification to Postman v2 Collection')
    .option('-i, --input <location>', 'URL or file path of the Swagger specification')
    .option('-o, --output <path>', 'Target file path for Postman Collection')
    .option('-w, --overwrite', 'Overwrite the output file if exists', false)
    .option('-c, --compact', 'Compact the output', false)
    .option('--exclude-query-params', 'Exclude query parameters', false)
    .option('--exclude-optional-query-params', 'Exclude optional query parameters', false)
    .option('--exclude-body-template', 'Exclude body template', false)
    .option('--exclude-tests', 'Exclude tests of responses', false)
    .option('-t, --tag-filter <tag>', 'Include operations with specific tag', null)
    .option('--host <hostname>', 'Name of API host to use. Overrides value within provided API specification.', null)
    .option('--default-security', 'Name of the security options to use by default. Default: first listed.', null)
    .option('--default-produces-type', 'Name of the produces option to use by default. Default: first listed.', null)
    .option('--envfile <path>', 'Target path for Postman Environment (json)', null)
    .action(function (options) {
        if (!options.input) {
            console.error('Input file must be specified!');
            done(1);
        }
        if (!options.output) {
            console.error('Output file must be specified!');
            done(1);
        }

        let opts = {
            excludeQueryParams: options.excludeQueryParams,
            excludeOptionalQueryParams: options.excludeOptionalQueryParams,
            excludeBodyTemplate: options.excludeBodyTemplate,
            excludeTests: options.excludeTests,
            tagFilter: options.tagFilter,
            host: options.host,
            defaultSecurity: options.defaultSecurity,
            defaultProducesType: options.defaultProducesType,
            envfile: options.envfile,
        };
        console.time('# Conversion Completed in');
        let converter = new Swagger2Postman(opts);
        converter.setLogger(console.log);

        converter.convert(options.input).then(function (result) {
            console.log('writing collection...');
            if (writeJSON(result, options.output, options)) {
                console.log('collection stored');
            }
            console.timeEnd('# Conversion Completed in');

            if (options.envfile) {
                writeJSON(converter.envfile, options.envfile, options);
            }

        }).catch(function (err) {
            console.error('unable to convert specification: ' + err);
            console.timeEnd('# Conversion Completed in');
        });

    });

program
    .command('validate')
    .description('Validate a Postman V2 Collection')
    .usage('<file>')
    .action(function (file) {

        let content;
        try {
            content = JSON.parse(fs.readFileSync(file));
        } catch (e) {
            console.error('failed to read file: ' + e.message);
            done(1);
        }

        console.time('# Postman Schema Loaded in');
        validator.create().then(function (validate) {
            console.timeEnd('# Postman Schema Loaded in');

            console.time('# Collection Validated in');
            let valid = validate(content);
            console.timeEnd('# Collection Validated in');
            if (valid) {
                console.log('No issues found.');
            } else {
                console.error(JSON.stringify(validate.errors));
            }
        }).catch(function (err) {
            console.error('failed to load schema: ' + err.message);
        });

    });

program.parse(process.argv);

if (!program.args.length) {
    program.help();
}
