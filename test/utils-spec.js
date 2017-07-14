'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const expect = require('expect.js');
const uuidv4 = require('uuid/v4');
const YAML = require('swagger-parser').YAML;
const utils = require('../lib/utils');

describe('utils tests', function () {

    describe('getExtension', function () {

        it('should return empty string', function () {
            let ext = utils.getExtension('/abc/filename');
            expect(ext).to.be('');
        });

        it('should return .yaml', function () {
            let ext = utils.getExtension('/abc/filename.yaml');
            expect(ext).to.be('.yaml');
        });

        it('should return .json', function () {
            let ext = utils.getExtension('/abc/filename.json');
            expect(ext).to.be('.json');
        });
    });

    describe('getFilename', function () {

        it('should return filename from url', function () {
            let filename = utils.getFilename('http://example.com/v1/persons.json#Persons');
            expect(filename).to.be('persons.json');
        });

        it('should return filename from *nix path', function () {
            let filename = utils.getFilename('/opt/persons.json');
            expect(filename).to.be('persons.json');
        });

        it('should return filename from win path', function () {
            let filename = utils.getFilename('C:\\temp\\persons.json');
            expect(filename).to.be('persons.json');
        });
    });

    describe('getDirname', function () {

        it('should return dirname from url', function () {
            let dirname = utils.getDirname('http://example.com/v1/persons.json#Persons');
            expect(dirname).to.be(os.tmpdir());
        });

        it('should return dirname from *nix path', function () {
            let dirname = utils.getDirname('/opt/persons.json');
            expect(dirname).to.be('/opt');
        });

        it('should return dirname from win path', function () {
            let dirname = utils.getDirname('C:\\opt\\persons.json');
            expect(dirname).to.be('/opt');
        });
    });

    describe('isYaml', function () {

        it('should return true from url', function () {
            let flag = utils.isYaml('http://example.com/v1/persons.yaml#Persons');
            expect(flag).to.be.ok();
        });

        it('should return true from file (.yml)', function () {
            let flag = utils.isYaml('/opt/persons.yml');
            expect(flag).to.be.ok();
        });

        it('should return true from file (.yaml)', function () {
            let flag = utils.isYaml('/opt/persons.yaml');
            expect(flag).to.be.ok();
        });

        it('should return false from url', function () {
            let flag = utils.isYaml('http://example.com/v1/persons.json#Persons');
            expect(flag).to.not.be.ok();
        });

        it('should return false from file (.json)', function () {
            let flag = utils.isYaml('/opt/persons.json');
            expect(flag).to.not.be.ok();
        });
    });

    describe('writeFile', function () {

        it('should write json formatted file', function () {
            let data = {
                example: 'json'
            };
            let filepath = '/tmp/' + uuidv4() + '.json';
            let options = {
                compact: true,
            };

            utils.writeFile(data, filepath, options);
            expect(fs.existsSync(filepath)).to.be.ok();
        });

        it('should overwrite json formatted file', function () {
            let data = {
                example: 'json'
            };
            let filepath = '/tmp/' + uuidv4() + '.json';
            let options = {
                overwrite: true,
            };

            // touch the file before attempting to write file with overwrite
            fs.writeFileSync(filepath, '');
            utils.writeFile(data, filepath, options);
            expect(fs.existsSync(filepath)).to.be.ok();
        });

        it('should write yaml formatted file', function () {
            let data = {
                example: 'yaml'
            };
            let filepath = '/tmp/' + uuidv4() + '.yaml';
            let options = {
                compact: true,
                formatter: YAML.stringify,
            };

            utils.writeFile(data, filepath, options);
            expect(fs.existsSync(filepath)).to.be.ok();
        });

        it('should overwrite yaml formatted file', function () {
            let data = {
                example: 'yaml'
            };
            let filepath = '/tmp/' + uuidv4() + '.yaml';
            let options = {
                overwrite: true,
                formatter: YAML.stringify,
            };

            // touch the file before attempting to write file with overwrite
            fs.writeFileSync(filepath, '');
            utils.writeFile(data, filepath, options);
            expect(fs.existsSync(filepath)).to.be.ok();
        });

        it('should throw error when writing to existing file', function () {
            let data = {
                example: 'json'
            };
            let filepath = '/tmp/' + uuidv4() + '.json';
            let options = {};

            // touch the file before attempting to write file
            fs.writeFileSync(filepath, '');
            expect(utils.writeFile).withArgs(data, filepath, options).to.throwException();
        });

    });

    describe('readJSON', function () {

        it('should read and parse json file', function () {
            let samplePath = path.join(__dirname, 'fixtures', 'example.json');
            let data = utils.readJSON(samplePath);
            expect(data).to.have.key('example');
        });

        it('should throw error reading unknown json file', function () {
            expect(utils.readJSON).withArgs('/tmp/unknown/fake.json').to.throwException();
        });

        it('should throw error parsing invalid json file', function () {
            let samplePath = path.join(__dirname, 'fixtures', 'invalid.json');
            expect(utils.readJSON).withArgs(samplePath).to.throwException();
        });
    });

});
