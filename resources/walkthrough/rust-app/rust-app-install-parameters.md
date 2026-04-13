# Set Install Parameters

In Rust apps, install parameters are set in `Cargo.toml` under `[package.metadata.ledger]`.

## Cargo.toml — `[package.metadata.ledger]`

`cargo ledger build` uses these fields to enforce derivation limits and permissions:

- `curve`: allowed cryptographic curves (example: `["secp256k1"]`)
- `path`: allowed BIP-44 prefixes (example: `["44'/60'"]`)
- `flags`: app permission bitmask

Common values:

- Curves: `secp256k1`, `secp256r1`, `ed25519`, `bls12381g1`
- Paths: Bitcoin `"44'/0'"`, EVM `"44'/60'"`, Solana `"44'/501'"`, Cardano `"1852'/1815'"`

## Configure app flags carefully (available flags)

Flags grant elevated OS permissions. Enable only what you need.

In `Cargo.toml`, `flags` is a bitmask built from `APPLICATION_FLAG_*` values
from `appflags.h`.

- `APPLICATION_FLAG_GLOBAL_PIN` (`0x40`): ask user to re-enter PIN at runtime
- `APPLICATION_FLAG_BOLOS_SETTINGS` (`0x200`): modify device-level settings
- `APPLICATION_FLAG_LIBRARY` (`0x800`): expose app as callable library (`os_lib_call`)

Set `flags` to the OR/sum of required values (for example, `0x10 | 0x40 = 0x50`).

## Reference

- [App permissions reference](https://developers.ledger.com/docs/device-app/references/app-permissions)
- [SDK app flags definitions (`appflags.h`)](https://github.com/LedgerHQ/ledger-secure-sdk/blob/master/include/appflags.h)
- [SLIP-0044 coin types](https://github.com/satoshilabs/slips/blob/master/slip-0044.md)
