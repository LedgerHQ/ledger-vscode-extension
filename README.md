# Ledger Dev Tools

<img src="https://github.com/LedgerHQ/ledger-vscode-extension/blob/main/resources/ledger-wordmark.png?raw=true"
  width="40%" height="40%"/><br/>

![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version-short/LedgerHQ.ledger-dev-tools.png)
![Visual Studio Marketplace Installs](https://vsmarketplacebadges.dev/installs-short/LedgerHQ.ledger-dev-tools.png)
![Visual Studio Marketplace Rating](https://vsmarketplacebadges.dev/rating-star/LedgerHQ.ledger-dev-tools.png)

[VS Code](https://code.visualstudio.com/) extension that provides a quick and easy way to build and test
applications for [Ledger](https://www.ledger.com/) devices.

The extension uses Ledger's own [Docker image](https://github.com/LedgerHQ/ledger-app-builder/blob/master/dev-tools/Dockerfile)
to allow developers to setup a build and test environment in a few minutes.

* Build your app for all Ledger devices : Nano S, Nano S Plus, Nano X, Stax and Flex.
* Supports C and Rust apps.
* Stay up to date with the latest SDK.
* Run [tests](https://developers.ledger.com/docs/device-app/integration/requirements/development#tests)
  on the device emulator ([Speculos](https://github.com/LedgerHQ/speculos)) or on a real device.
* Supports multiple apps folders in the same workspace, each folder having its own Docker container.
* See what's executed by the extension in VS Code's terminal panels.
* Run [development guidelines](https://developers.ledger.com/docs/device-app/integration/requirements/development#workflows)
  checks to ensure your app is ready to get deployed

## Features

### Tasks

Automatically add tasks to help you build, test and load your app on a physical device.
These tasks are accessible through the build task menu keyboard shortcut to avoid clicking around.
<p align="center">
<img src="https://github.com/LedgerHQ/ledger-vscode-extension/blob/main/resources/tasks.gif?raw=true" width="70%" height="70%"/>
</p>

### Sidebar

The tasks are all accessible through an easy to use sidebar menu.
<p align="center">
<img src="https://github.com/LedgerHQ/ledger-vscode-extension/blob/main/resources/sidebar.gif?raw=true" width="70%" height="70%"/>
</p>

### Status Bar

Status bar items to quickly identify :

* Which device you are currently building your app for.
* The status of the Ledger developer tools Docker image.

<p align="center">
<img src="https://github.com/LedgerHQ/ledger-vscode-extension/blob/main/resources/statusbar.gif?raw=true" width="70%" height="70%"/>
</p>

## Requirements

* [Docker](https://www.docker.com/) should be installed and running.
* On macOS and Windows, make sure an X Window System server is installed and running
  (see [XQuartz](https://www.xquartz.org/) for mac and [VcXsrv](https://sourceforge.net/project) for windows).
  Otherwise, some testing tasks will not work. **Make sure client connections are allowed**.

## Extension Settings

This extension contributes the following settings:

* `ledgerDevTools.onboardingPin`: Set the device quick onboarding PIN code.
* `ledgerDevTools.onboardingSeed`: Set the device quick onboarding 24-word Seed phrase.
* `ledgerDevTools.dockerImage`: Set the Ledger developer tools Docker image.
* `ledgerDevTools.dockerRunArgs`: Any additional command line args to pass to the `docker run`
  command for the Ledger developer tools Docker image.
* `ledgerDevTools.additionalReqsPerApp`: Add prerequisites for current app's functional tests (for instance 'apk add python3-protobuf').
* `ledgerDevTools.keepTerminal`: Indicates to keep the Terminal window opened after a successful task execution.
* `ledgerDevTools.openContainerAsRoot`: Open docker container using `root`:`root` user.
* `ledgerDevTools.containerUpdateRetries`: Set the max number of Container Update retries.
* `ledgerDevTools.userScpPrivateKey`: Use the host's `SCP_PRIVKEY` environment variable when loading/deleting app on device.
  Cf. <https://developers.ledger.com/docs/embedded-app/pin-bypass>
* `ledgerDevTools.defaultDevice`: Select the default Device
* `ledgerDevTools.enableDeviceOpsForNanoX`: Allow device operations on Nano X (requires special development device)

## Changelog

To check full changelog [click here](CHANGELOG.md).
