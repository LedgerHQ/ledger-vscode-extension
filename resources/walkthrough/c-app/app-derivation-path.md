# Set Derivation Path & Curves

These two settings define **which keys your app can derive** from the user's
master seed. They act as a security boundary: the OS rejects any derivation
request outside the declared paths and curves.

Edit `CURVE_APP_LOAD_PARAMS` and `PATH_APP_LOAD_PARAMS` in your `Makefile`.

## Cryptographic curves

- `secp256k1`: Bitcoin, Ethereum, most EVM chains.
- `secp256r1`: enterprise chains, WebAuthn-style signing.
- `ed25519`: Solana, Cardano, Polkadot, Near.
- `bls12381g1`: Ethereum 2.0 validator keys.

## BIP-44 derivation path

Look up your coin type in the [SLIP-0044 registry](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).

- Bitcoin: `"44'/0'"`
- Ethereum / EVM: `"44'/60'"`
- Solana: `"44'/501'"`
- Cardano: `"1852'/1815'"`

## Reference

- [BIP-0044 spec](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
- [Ledger cryptography API](https://developers.ledger.com/docs/device-app/references/cryptography-api)
