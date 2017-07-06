#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
var program = require('commander');
var fs = require('fs');
var Swagger2Postman = require('../convert');

function done(code) {
    process.exit(code); // eslint-disable-line
}

/**
 * Writes a JSON blob to the given path.
 * ``options.path`` must contain the path to the output file.
 * If ``options.pretty`` is true, output will be pretty printed. (Default false)
 * If ``options.overwrite`` is false, output file will be overwritten (Default true)
 *
 * @param data
 * @param options
 * @param callback
 */
function writeJSON(data, options, callback) {
    var json;
    var writeFlag = {flag: 'wx'};
    if (options.overwrite) {
        writeFlag = {flag: 'w'};
    }

    try {
        // json = JSON.stringify(data, null, options.pretty ? 4 : 0);
        json = JSON.stringify(data);
        fs.writeFile(options.output, json, writeFlag, callback);
    } catch (e) {
        callback(e);
    }
}

program
    .usage('[command] [options]')
    .version(require('../package.json').version);

program
    .command('convert')
    .description('Convert Swagger v2 API specification to Postman v2 Collection')
    .option('-i, --input <location>', 'URL or file path of the Swagger specification')
    .option('-o, --output <path>', 'target file path for Postman Collection')
    .option('-w, --overwrite', 'Overwrite the output file if exists')
    .option('--include-query-params', 'Include query parameters', true)
    .option('--include-optional-query-params', 'Include optional query parameters', false)
    .option('--include-body-template', 'Include body template', false)
    .option('-t, --tag-filter', 'Include operations with specific tag', null)
    .action(function (options) {
        if (!options.input) {
            console.error('Input file must be specified!');
            done(1);
        }
        if (!options.output) {
            console.error('Output file must be specified!');
            done(1);
        }

        var opts = {
            includeQueryParams: options.includeQueryParams,
            includeOptionalQueryParams: options.includeOptionalQueryParams,
            includeBodyTemplate: options.includeBodyTemplate,
            tagFilter: options.tagFilter,
        };
        var converter = new Swagger2Postman(opts);
        converter.setLogger(console.log);

        converter.convert(options.input, function (err, result) {
            if (err) {
                console.error('unable to convert specification: ' + err);
                return;
            }
            console.log('writing collection...');
            writeJSON(result, options, function (error) {
                if (error) {
                    console.error('Could not write output file %s', options.output, error);
                    return;
                }
                console.log('collection stored');
            });
        });

    });

program.parse(process.argv);

if (!program.args.length) {
    program.help();
}
