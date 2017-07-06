'use strict';
var expect = require('expect.js');
var Swagger2Postman = require('../convert.js');
var fs = require('fs');
var path = require('path');

/* global describe, it */
describe('converter tests', function () {
    var samples = fs.readdirSync(path.join(__dirname, 'data'));

    samples.map(function (sample) {
        var samplePath = path.join(__dirname, 'data', sample);
        it('must convert ' + samplePath + ' to a postman collection', function (done) {
            var converter = new Swagger2Postman();
            converter.convert(samplePath, function (err, result) {
                expect(result).to.be.ok();
                done(err);
            });
        });
        return null;
    });

    it('must read values from the "x-postman-meta" key', function (done) {
        var samplePath = path.join(__dirname, 'data', 'swagger_aws.json');
        var converter = new Swagger2Postman();
        converter.convert(samplePath, function (err, result) {
            if (err) {
                done(err);
                return;
            }
            // Make sure that currentHelper and helperAttributes are processed
            expect(result.items[0].items[0].request).to.have.key('currentHelper');
            expect(result.items[0].items[0].request).to.have.key('helperAttributes');
            done();
        });
    });

    it('should return an error on invalid api spec', function (done) {
        var samplePath = path.join(__dirname, 'invalid', 'no-paths.json');
        var converter = new Swagger2Postman();
        converter.convert(samplePath, function (err, result) {
            expect(err).to.be.ok();
            expect(result).not.to.be.ok();
            done();
        });
    });

    it('should obey the includeQueryParams option', function (done) {
        var options = {
            includeQueryParams: false
        };
        var samplePath = path.join(__dirname, 'data', 'sampleswagger.json');
        var converter = new Swagger2Postman(options);
        converter.convert(samplePath, function (err, result) {
            expect(result.items[0].items[3].request.url).not.to.have.key('query');
            done(err);
        });
    });

    it('should obey the includeOptionalQueryParams option', function (done) {
        var opts = {
            includeOptionalQueryParams: true
        };
        var samplePath = path.join(__dirname, 'data', 'sampleswagger.json');
        var converter = new Swagger2Postman(opts);
        converter.convert(samplePath, function (err, result) {
            expect(result.items[0].items[3].request.url.query.length > 0);
            done(err);
        });
    });

    it('should obey the includeBodyTemplate option', function (done) {
        var options = {
            includeBodyTemplate: true
        };
        var samplePath = path.join(__dirname, 'data', 'sampleswagger.json');
        var converter = new Swagger2Postman(options);
        converter.setLogger(console.log); // eslint-disable-line
        converter.convert(samplePath, function (err, result) {
            expect(result.items[0].items[0].request.body.raw.indexOf('status') > 0);
            done(err);
        });
    });

    it('should convert path paramters to postman-compatible paramters', function (done) {
        var samplePath = path.join(__dirname, 'data', 'swagger2-with-params.json');
        var converter = new Swagger2Postman();
        converter.convert(samplePath, function (err, result) {
            expect(result.items[0].items[0].request.url.path.indexOf(':ownerId') > 0);
            expect(result.items[0].items[0].request.url.path.indexOf(':petId') > 0);
            done(err);
        });
    });

    it('should obey the tagFilter option - tag not found', function (done) {
        var options = {
            tagFilter: 'FOO'
        };
        var samplePath = path.join(__dirname, 'data', 'swagger2.json');
        var converter = new Swagger2Postman(options);
        converter.convert(samplePath, function (err, result) {
            expect(result.items.length === 0);
            done(err);
        });
    });

    it('should obey the tagFilter option - tag found', function (done) {
        var options = {
            tagFilter: 'SampleTag'
        };
        var samplePath = path.join(__dirname, 'data', 'swagger2.json');
        var converter = new Swagger2Postman(options);
        converter.convert(samplePath, function (err, result) {
            expect(result.items.length > 0);
            done(err);
        });
    });
});
