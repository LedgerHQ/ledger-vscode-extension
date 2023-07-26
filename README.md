# ledger-vscode-extension

Provide a quick and easy way to build and test applications for [Ledger](https://www.ledger.com/) devices.

The extension uses Ledger's own [docker image](https://github.com/LedgerHQ/ledger-app-builder/blob/master/dev-tools/Dockerfile) to allow developers to setup a build and test environement in a few minutes.

* Build your app for all Ledger devices : Nano S, Nano S Plus, Nano X, Stax.
* Stay up to date with the latest SDK.
* Run tests on the device emulator ([Speculos](https://github.com/LedgerHQ/speculos)) or on a real device.
* Supports multiple apps folders in the same workspace, each folder having its own Docker container.
* See what's executed by the extension in VS Code's terminal panels.

## Features

### Tasks

Automatically add tasks to help you build, test and load your app on a physical device. 
These tasks are accessible through the build task menu keyboard shortcut to avoid clicking around.

<img src="https://github.com/LedgerHQ/ledger-vscode-extension/blob/main/resources/tasks.gif?raw=true" width="70%" height="70%"/>

### Sidebar

The tasks are all accessible through an easy to use sidebar menu.

<img src="https://github.com/LedgerHQ/ledger-vscode-extension/blob/main/resources/sidebar.gif?raw=true" width="70%" height="70%"/>

### Status Bar

Status bar items to quickly identify :

* Which device you are currently building your app for.
* The status of the Ledger developer tools Docker image.

<img src="https://github.com/LedgerHQ/ledger-vscode-extension/blob/main/resources/statusbar.gif?raw=true" width="70%" height="70%"/>

## Requirements

* [Docker](https://www.docker.com/) should be installed and running.
* On macOS and Windows, make sure an X Window System server is installed and running (see [XQuartz](https://www.xquartz.org/) for mac and [VcXsrv](https://sourceforge.net/projec) for windows) otherwise, some testing tasks will not work. **Make sure client connections are allowed**.

## Extension Settings

This extension contributes the following settings:

* `ledgerDevTools.onboardingPin`: Set the device quick onboarding PIN code.
* `ledgerDevTools.onboardingSeed`: Set the device quick onboarding 24-word Seed phrase.
* `ledgerDevTools.dockerImage`: Set the Ledger developer tools Docker image.
* `ledgerDevTools.additionalDepsPerApp`: Add dependencies for current app's functional tests (for instance 'apk add python3-protobuf').

## Release Notes

## 0.1.2

* Better tooltips for sidebar items.
* New command to add additional test dependencies in app docker container.
* Fix infinite container spawning loop bug.

## 0.1.1

* Add icons to side bar root items.
* Add auto run of docker containers.

### 0.1.0

* Code refactoring.
* New tasks :
  * Run app in Speculos,
  * Kill Speculos,
  * On device functional tests,
  * Device quick onboarding.

### 0.0.6

Fixes app detection for Windows.

### 0.0.5

Add multi-folder workspace support. User can now choose which app to build from a quickpick menu.

### 0.0.4

Adds container terminal task to side bar items.

### 0.0.3

Fixes workspace path in docker run task for Windows.

### 0.0.2

Add extension icon.

### 0.0.1

Initial release of the extension.
