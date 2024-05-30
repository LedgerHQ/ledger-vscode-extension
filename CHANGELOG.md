# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0]

### Changed

* Update `webpack` and `electron` versions and dependencies
* Update `KeepTerminal` to also include `Load app on device` and `Delete app from device`

### Added

* Start `Update Container` task in background
* 1st CI workflows to perform:
  * Spelling check
  * Build / Lint / Test (Fix _Add CI with some checks and publishing mechanism_ [#10](https://github.com/LedgerHQ/ledger-vscode-extension/issues/10))
  * Deploy (when a new tag is pushed)
* Export the chosen device when opening the terminal (Fix _Export currently chosen device when opening the terminal_ [#15](https://github.com/LedgerHQ/ledger-vscode-extension/issues/15))
* Add function to properly retrieve the `APPNAME`, using `make listinfo` (Fix Improve App detection [#40](https://github.com/LedgerHQ/ledger-vscode-extension/issues/40))
* Add _build use case_ feature, allowing to build selecting a use case defined in the manifest
  (Fix _Add an easy way to build with flags_ [#14](https://github.com/LedgerHQ/ledger-vscode-extension/issues/14))
* Add _build variant_ feature, allowing to build a specific **variant**
  (Fix _Add an easy way to build with flags_ [#14](https://github.com/LedgerHQ/ledger-vscode-extension/issues/14))
* Save the selected target device in settings (Fix _Memorize target device when VS Code is quit_ [#39](https://github.com/LedgerHQ/ledger-vscode-extension/issues/39))

## [0.6.1]

### Fixed

* Fix macOS venv creation for device operation tasks.

## [0.6.0]

### Added

* Flex device support.

### Fixed

* Fix wording case for "Update container" task.

## [0.5.2]

### Fixed

* Fix plugin support on Windows : clone and build of test dependencies were not working properly.

## [0.5.1]

### Fixed

* Fix bugs introduced in 0.5.0 :
  * "dependsOn" task execution string was missing when generating tasks.
  * When one app detection failed, it prevented any app in the workspace to be detected afterwards.
  * Extension update was not triggered properly when selecting app through the quick pick menu.

## [0.5.0]

### Added

* New setting to allow / deny device operations on Nano X (denied by default).
* Support parsing of `test.dependencies` fields from the [app manifest specification](https://github.com/LedgerHQ/ledgered/blob/master/doc/utils/manifest.md).
  Speed up the setup for running functional tests by automating the clone/build of tests dependencies when needed.
* Add button to rebuild test dependencies (if any) in treeview.

### Changed

* Refactor of `appSelected.ts` for better maintainability.

### Fixed

* Replace TOML parsing package (previous one couldn't parse 1.0.0 TOML)
* Update Udev rules for sideloading following hidapi python package update.
  Display warning message when rules need to be updated.
* Wording in some tree view items.

## [0.4.0]

### Added

* Add "select all targets" command with a button in the main tree view.

### Changed

* Replace `.png` icons with `vscode.ThemeIcon` icons.

### Fixed

* Fix app sideload task requirements installation on macOS.

## [0.3.4]

### Fixed

* Fix section titles in README.

## [0.3.3]

### Changed

* Fix logo link in README.

## [0.3.2]

### Changed

* Update README + displayed extension name.

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
* Dynamic tasks list : disable functional tests tasks when no `conftest.py` file is found
  or if task is not defined for app language.

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
