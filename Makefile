SHELL := /bin/bash

.PHONY: setup-local verify-python setup-linux start-linux docker-build docker-run

setup-local:
	node tools/deploymentRuntime.mjs local-bootstrap

verify-python:
	node tools/deploymentRuntime.mjs python-detect

setup-linux:
	node tools/deploymentRuntime.mjs linux-server-bootstrap

start-linux:
	./tools/start-linux-server.sh

docker-build:
	docker build -t zootopia-club-ai .

docker-run:
	docker run --rm -p 3000:3000 --env-file .env zootopia-club-ai
