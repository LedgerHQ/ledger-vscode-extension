# ledger-vscode-extension

VSCode extension aimed at making it quick and easy to build and test applications for [Ledger](https://www.ledger.com/) devices.

## Features

### Tasks

This extension will automatically add tasks to help you build, test and load your app on a physical device.

### Sidebar

The extension's tasks are all accessible through an easy to use sidebar menu.

### Status Bar

The extension will show you which device you are currently building your app for. It will also show you the status of the Ledger developer tools Docker image.

## Requirements

Explain how to install X Server for Windows and macOS.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `ledgerDevTools.buildDirRelativePath`: Set the build directory relative path of your app.
* `ledgerDevTools.dockerImage`: Set the Ledger developer tools Docker image.

## Release Notes

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
