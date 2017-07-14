'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

/**
 * Returns the lowercased file extension of the given filepath/URL,
 * or an empty string if it has no extension.
 *
 * Source: https://github.com/BigstickCarpet/json-schema-ref-parser/blob/master/lib/util/url.js
 * Maintains consistency with swagger-parser.
 *
 * @param   {string} filepath
 * @returns {string}
 */
function getExtension(filepath) {
    let lastDot = filepath.lastIndexOf('.');
    if (lastDot >= 0) {
        return filepath.substr(lastDot).toLowerCase();
    }
    return '';
}

function getFilename(filepath) {
    return path.basename(url.parse(filepath).pathname);
}

function getDirname(filepath) {
    let dirname = path.dirname(url.parse(filepath).pathname);
    if (!fs.existsSync(dirname)) {
        return os.tmpdir();
    }
    return dirname;
}

function isYaml(filepath) {
    let ext = getExtension(getFilename(filepath));
    return ext === '.yml' || ext === '.yaml';
}

function writeFile(data, filepath, options) {
    let writeFlag = {flag: 'wx'};
    if (options.overwrite) {
        writeFlag = {flag: 'w'};
    }

    let stringer = options.formatter || JSON.stringify;
    let formatted = stringer(data, null, options.compact ? 2 : 4);

    fs.writeFileSync(filepath, formatted, writeFlag);
}

function readJSON(filepath) {
    return JSON.parse(fs.readFileSync(filepath));
}

module.exports = {
    getExtension: getExtension,
    getFilename: getFilename,
    getDirname: getDirname,
    isYaml: isYaml,
    readJSON: readJSON,
    writeFile: writeFile,
};
