# Add a Custom EVM Chain

The Ledger [Ethereum signer app](https://github.com/LedgerHQ/app-ethereum) handles all EVM chains on Ledger devices. When signing a transaction, Ledger Live injects chain metadata (name, ticker, icon) from the [Crypto Asset List](https://github.com/LedgerHQ/ledger-live/tree/develop/libs/ledgerjs/packages/cryptoassets) into the app, which then displays it on screen.

To get your EVM network recognized and displayed, contribute icons to the [ledger-network-icons](https://github.com/LedgerHQ/ledger-network-icons) repository — Ledger will then add the network to the CAL.

> Full instructions in the [ledger-network-icons README](https://github.com/LedgerHQ/ledger-network-icons/blob/main/README.md).
