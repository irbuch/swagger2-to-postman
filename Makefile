MAKEFLAGS += --warn-undefined-variables
SHELL := /bin/bash
.SHELLFLAGS := -o pipefail -euc
.DEFAULT_GOAL := test

export PROJECT = swagger2-to-postman

# Windows environment?
CYG_CHECK := $(shell hash cygpath 2>/dev/null && echo 1)
ifeq ($(CYG_CHECK),1)
	VBOX_CHECK := $(shell hash VBoxManage 2>/dev/null && echo 1)

	# Docker Toolbox (pre-Windows 10)
	ifeq ($(VBOX_CHECK),1)
		ROOT := /${PROJECT}
	else
		# Docker Windows
		ROOT := $(shell cygpath -m -a "$(shell pwd)")
	endif
else
	# all non-windows environments
	ROOT := $(shell pwd)
endif

DEV_IMAGE := swagpost_dev

DOCKERRUN := docker run --rm \
	-v ${ROOT}:/mnt \
	-w /mnt \
	${DEV_IMAGE}


.PHONY: clean
clean:
	@rm -rf coverage

## Same as clean but also removes cached dependencies.
veryclean: clean
	@rm -rf .tmp node_modules

## builds the dev container
prepare: .tmp/dev_image_id
.tmp/dev_image_id: Dockerfile.dev
	@mkdir -p .tmp
	@docker rmi -f ${DEV_IMAGE} > /dev/null 2>&1 || true
	@echo "Building dev container"
	@docker build -t ${DEV_IMAGE} -f Dockerfile.dev .
	@docker inspect -f "{{ .ID }}" ${DEV_IMAGE} > .tmp/dev_image_id


.PHONY: install
install: prepare
	${DOCKERRUN} npm install

.PHONY: test
test: prepare
	${DOCKERRUN} npm test

.PHONY: cover
cover: prepare
	${DOCKERRUN} npm run coverage

.PHONY: lint
lint: prepare
	${DOCKERRUN} npm run lint


# ------ Docker Helpers
.PHONY: drma
drma:
	@docker rm $(shell docker ps -a -q) 2>/dev/null || :

.PHONY: drmia
drmia:
	@docker rmi $(shell docker images -q --filter "dangling=true") 2>/dev/null || :

.PHONY: drmvu
drmvu:
	@docker volume rm $(shell docker volume ls -qf dangling=true) 2>/dev/null || :
