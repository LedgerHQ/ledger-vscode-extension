# Prerequisites

Before you start, make sure the following tools are installed and running.

## <img src="./docker.svg" height="20" style="vertical-align:middle"/> Docker

The extension builds and tests your app inside Ledger's official
[developer tools container](https://github.com/LedgerHQ/ledger-app-builder/).
Docker must be running when you use the extension.

[Get Docker](https://www.docker.com/)

## <img src="./git.svg" height="20" style="vertical-align:middle"/> Git

Git is required to clone Ledger app templates from GitHub when generating a new
app.

[Get Git](https://git-scm.com/)

## <img src="./x11.svg" height="20" style="vertical-align:middle"/> X11 Server

An X11 display server is required to run the
[Speculos](https://github.com/LedgerHQ/speculos) device emulator.

| OS | Solution |
|----|----------|
| Linux | Xorg or Wayland (via XWayland) — usually pre-installed |
| macOS | [XQuartz](https://www.xquartz.org/) |
| Windows | [VcXsrv](https://sourceforge.net/projects/vcxsrv/) |

Make sure your X11 server is configured to **allow connections from clients**.
