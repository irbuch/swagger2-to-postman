'use strict';
var _ = require('lodash');
var expect = require('expect.js');
var Swagger2Postman = require('../convert.js');
var fs = require('fs');
var path = require('path');
var nock = require('nock');

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

    it.skip('must read values from the "x-postman-meta" key', function (done) {
        var samplePath = path.join(__dirname, 'data', 'swagger_aws.json');
        var converter = new Swagger2Postman();
        converter.convert(samplePath, function (err, result) {
            if (err) {
                done(err);
                return;
            }
            // Make sure that currentHelper and helperAttributes are processed
            expect(result.item[0].item[0].request).to.have.key('currentHelper');
            expect(result.item[0].item[0].request).to.have.key('helperAttributes');
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
            expect(result.item[0].item[3].request.url).not.to.have.key('query');
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
            expect(result.item[0].item[3].request.url.query.length > 0).to.be.ok();
            done(err);
        });
    });

    it('should obey the includeBodyTemplate option', function (done) {
        var options = {
            includeBodyTemplate: true
        };
        var samplePath = path.join(__dirname, 'data', 'sampleswagger.json');
        var converter = new Swagger2Postman(options);
        converter.setLogger(_.noop);
        converter.convert(samplePath, function (err, result) {
            expect(result.item[0].item[0].request.body.raw.indexOf('status') > 0).to.be.ok();
            done(err);
        });
    });

    it('should obey the includeBodyTemplate option - another', function (done) {
        var options = {
            includeBodyTemplate: true
        };
        var samplePath = path.join(__dirname, 'data', 'swagger2.json');
        var converter = new Swagger2Postman(options);
        converter.convert(samplePath, function (err, result) {
            expect(result.item[1].item[0].request.body.raw.indexOf('rating') > 0).to.be.ok();
            done(err);
        });
    });

    it('should convert path paramters to postman-compatible paramters', function (done) {
        var samplePath = path.join(__dirname, 'data', 'swagger2-with-params.json');
        var converter = new Swagger2Postman();
        converter.convert(samplePath, function (err, result) {
            expect(result.item[0].item[0].request.url.path.indexOf(':ownerId') > 0).to.be.ok();
            expect(result.item[0].item[0].request.url.path.indexOf(':petId') > 0).to.be.ok();
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
            // one operation has a tag but the other does not; therefore the list should
            // only contain the operation with no tags.
            expect(result.item.length === 1).to.be.ok();
            expect(result.item[0].name).to.equal('Data');
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
            expect(result.item.length > 0).to.be.ok();
            done(err);
        });
    });

    describe('schema load tests', function () {

        before(function () {
            nock.cleanAll.bind(nock);
        });

        it('should disable collection validation if https.get status code != 200', function (done) {
            var server = nock('https://schema.getpostman.com')
                .get('/json/collection/v2.0.0/collection.json')
                .reply(404);

            var logs = [];
            function _logger(msg) {
                logs.push(msg);
            }

            var samplePath = path.join(__dirname, 'data', 'swagger2.json');
            var converter = new Swagger2Postman();
            converter.setLogger(_logger);
            converter.convert(samplePath, function (err, result) {
                expect(logs.indexOf('load schema request failed: 404') > 0).to.be.ok();
                expect(server.isDone());
                expect(result).to.be.ok();
                done(err);
            });
        });

        it('should disable collection validation if https.get content-type not application/json', function (done) {
            var server = nock('https://schema.getpostman.com')
                .defaultReplyHeaders({
                    'Content-Type': 'application/xml'
                })
                .get('/json/collection/v2.0.0/collection.json')
                .reply(200);

            var logs = [];
            function _logger(msg) {
                logs.push(msg);
            }

            var samplePath = path.join(__dirname, 'data', 'swagger2.json');
            var converter = new Swagger2Postman();
            converter.setLogger(_logger);
            converter.convert(samplePath, function (err, result) {
                expect(
                    logs.indexOf(
                        'load schema request failed: Expected application/json but received application/xml'
                    ) > 0).to.be.ok();
                expect(server.isDone());
                expect(result).to.be.ok();
                done(err);
            });
        });

        it('should disable collection validation if https.get payload not valid JSON', function (done) {
            var server = nock('https://schema.getpostman.com')
                .defaultReplyHeaders({
                    'Content-Type': 'application/json'
                })
                .get('/json/collection/v2.0.0/collection.json')
                .reply(200, '{"name": "abc",}');

            var logs = [];
            function _logger(msg) {
                logs.push(msg);
            }

            var samplePath = path.join(__dirname, 'data', 'swagger2.json');
            var converter = new Swagger2Postman();
            converter.setLogger(_logger);
            converter.convert(samplePath, function (err, result) {
                expect(logs.indexOf('schema not json: Unexpected token } in JSON at position 15') > 0).to.be.ok();
                expect(server.isDone());
                expect(result).to.be.ok();
                done(err);
            });
        });

        it('should disable collection validation if https.get fails', function (done) {
            var server = nock('https://schema.getpostman.com')
                .get('/json/collection/v2.0.0/collection.json')
                .replyWithError('unexpected error');

            var logs = [];
            function _logger(msg) {
                logs.push(msg);
            }

            var samplePath = path.join(__dirname, 'data', 'swagger2.json');
            var converter = new Swagger2Postman();
            converter.setLogger(_logger);
            converter.convert(samplePath, function (err, result) {
                expect(
                    logs.indexOf(
                        'failed to load schema; validation disabled. Error: unexpected error'
                    ) > 0).to.be.ok();
                expect(server.isDone());
                expect(result).to.be.ok();
                done(err);
            });
        });
    });
});
