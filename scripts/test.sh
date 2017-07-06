#!/usr/bin/env bash

set -e;

echo "eslint $(eslint --version)";
eslint ./convert.js bin/ test/;

echo
echo "mocha v$(mocha --version)";
mocha test/*-spec.js;

# echo
# echo "istanbul v$(istanbul --version)";
# istanbul cover _mocha -- tests/**
