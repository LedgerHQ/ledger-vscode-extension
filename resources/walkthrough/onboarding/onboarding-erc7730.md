# Add Clear Signing with ERC-7730

[ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) standardizes human-readable transaction display — instead of raw hex, users see plain language like "Swap 0.5 ETH for ~1,250 USDC". It is a display-only layer: it never modifies transaction data.

This applies to the [Ethereum signer app](https://github.com/LedgerHQ/app-ethereum), which processes EVM transactions on all Ledger devices.

> Full guide on the [Ledger Developer Portal](https://developers.ledger.com/docs/clear-signing/erc7730/getting-started).

## How it works

Create a JSON metadata file that describes your smart contract's functions in human-readable terms, then submit it to the [Clear Signing Registry](https://github.com/LedgerHQ/clear-signing-erc7730-registry). Once reviewed and published, compatible wallets — including Ledger — fetch and render it at signing time.

## Steps

1. **Author the JSON file** — the format is defined in the [ERC-7730 specification](https://eips.ethereum.org/EIPS/eip-7730); use the [JSON Builder](https://developers.ledger.com/docs/clear-signing/for-dapps/json-builder) or the [manual creation guide](https://developers.ledger.com/docs/clear-signing/for-dapps/manual-implementation)
2. **Validate** your file against the registry CI checks
3. **Open a PR** to the [Clear Signing Registry](https://github.com/LedgerHQ/clear-signing-erc7730-registry) — once reviewed and published, Ledger wallets will render your transactions clearly.
