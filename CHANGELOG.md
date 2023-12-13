# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1]

### Changed

* Clean debug logs

## [0.3.0]

### Added

* Support for new manifest (keep support of legacy Rust manifest and Makefile only C apps)

### Changed

* Refactor code of TargetSelector, make it a real class.
* Rename tree view elements.

### Fixed

* Fix target name bug for Rust apps.

## [0.2.1]

### Added

* Add command in group `Functional Tests` to run tests with option `--golden_run`.
* Add setting parameter to use the host's `SCP_PRIVKEY` environment variable when loading/deleting app on device.
* Add setting parameter to set the default device.

## [0.2.0]

### Added

* Add support for Rust apps (no sideloading yet).
* Add welcome view when no app folder is detected in the workspace.
* Dynamic tasks list : disable functional tests tasks when no `conftest.py` file is found or if task is not defined for app language.

### Fixed

* Fix various display bugs.

## [0.1.6]

### Added

    - Add setting parameter allowing to automatically close the terminal Window when the Container Update is successful.
    - Add setting parameter to set the max number of allowed Container Update retries.

### Fixed

    - Infinite loops when the Container Update fails.

## [0.1.5]

### Added

    - Add 'delete app from device' feature.
    - Do a 'git submodule update --init --recursive' before the build tasks.

## [0.1.4]

### Fixed

    - Remove unfinished 'delete app from device' feature.

## [0.1.3]

### Fixed

    - Fix infinite container spawning loop bug on Windows (for real this time).

## [0.1.2]

### Added

    - Better tooltips for sidebar items.
    - New command to add additional test dependencies in app docker container.

### Fixed

    - Fix infinite container spawning loop bug.

## [0.1.1]

### Added

    - Add icons to side bar root items.
    - Add auto run of docker containers.

## [0.1.0]

### Changed

    - Code refactoring.

### Added

    - New tasks :
      - Run app in Speculos,
      - Kill Speculos,
      - On device functional tests,
      - Device quick onboarding.

## [0.0.6]

### Fixed

    - Fixes app detection for Windows.

## [0.0.5] - 2023-07-05

### Added

    - Add multi-folder workspace support. User can now choose which app to build from a quickpick menu.
## [0.0.4] - 2023-07-04

### Added

    - Adds container terminal task to side bar items.

## [0.0.3] - 2023-07-04

### Fixed

    - Fixes workspace path in docker run task for Windows.

## [0.0.2] - 2023-07-04

### Added

    - Added icon for extension.

## [0.0.1] - 2023-07-04

    - Initial release.
