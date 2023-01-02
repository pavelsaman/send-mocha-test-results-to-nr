SHELL := bash

COLOR_START = \e[91m\e[1m
COLOR_END   = \e[0m
SAY         = @printf "$(COLOR_START)%s\n$(COLOR_END)"


.PHONY: install install-git-hooks format lint build package all clean clean-all dist-check

install:
	$(SAY) "Installing dependencies..."
	@npm $@

install-git-hooks:
	$(SAY) "Installing git hooks..."
	@find ./hooks/ -maxdepth 1 -type f -exec ln -vfs ../../{} .git/hooks/ \;

format:
	$(SAY) "Formatting..."
	@npm run $@

lint:
	$(SAY) "Linting..."
	@npm run $@

build: format lint
	$(SAY) "Building..."
	@npm run $@

package: build
	$(SAY) "Packaging..."
	@npm run $@

all: format lint package

clean:
	$(SAY) "Cleaning dist/ ..."
	git clean dxf dist -f

clean-all:
	$(SAY) "Removing node modules, compiled code, and packaged artifacts..."
	@npm run $@

dist-check: package
	$(SAY) "Checking that dist/ is not dirty..."
	git diff --exit-code --stat dist/
