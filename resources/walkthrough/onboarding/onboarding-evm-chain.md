# Add a Custom EVM Chain

The Ledger [Ethereum signer app](https://github.com/LedgerHQ/app-ethereum) handles all EVM chains on Ledger devices. When signing a transaction, Ledger Live injects chain metadata (name, ticker, icon) from the [Crypto Asset List](https://github.com/LedgerHQ/ledger-live/tree/develop/libs/ledgerjs/packages/cryptoassets) into the app, which then displays it on screen.

To get your EVM network recognized and displayed, contribute icons to the [ledger-network-icons](https://github.com/LedgerHQ/ledger-network-icons) repository — Ledger will then add the network to the CAL.

## Prerequisites

Install [Python 3.12+](https://www.python.org/), [PDM](https://pdm-project.org/), and [ImageMagick](https://imagemagick.org/), then set up the project with `pdm install --dev`.

## Steps

> Full instructions in the [ledger-network-icons README](https://github.com/LedgerHQ/ledger-network-icons/blob/main/README.md).

1. **Generate icons** from a quality GIF or PNG source, passing your chain ID (e.g. 42161): `icon_scripts/resize/resize_icon.sh SOURCE_ICON.png 42161`

2. **Copy** the generated files into `icons/ethereum/`

3. **Validate** locally: `pdm run validate-icons`

4. **Open a PR** — once merged, Ledger handles adding the network to the CAL, after which the Ethereum signer app will display it on device when signing transactions.
