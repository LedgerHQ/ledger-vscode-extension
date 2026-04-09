# Create a Bitcoin Clone App

To support a Bitcoin-derived chain on Ledger devices, fork the [app-btcext-boilerplate](https://github.com/LedgerHQ/app-btcext-boilerplate) rather than building from scratch. It wraps [app-bitcoin-new](https://github.com/LedgerHQ/app-bitcoin-new) as a submodule and exposes hook functions for your customization.

## Setup

After forking, initialize the base app submodule: `git submodule update --init --recursive`

## Customize `src/main.c`

Implement the three hook functions documented in that file:

- **`validate_and_display_transaction`** *(mandatory)* — validate the PSBT against your protocol rules and display relevant fields to the user
- **`sign_custom_inputs`** *(optional)* — sign external inputs using base-app helpers like `compute_sighash_segwitv1` and `sign_sighash_schnorr_and_yield`
- **`custom_apdu_handler`** *(optional)* — handle additional APDU commands (custom `INS` must be ≥ 128)

## Also required

- **Icons** — add device-specific icons (see [icon deliverables](https://developers.ledger.com/docs/device-app/submission-process/deliverables/icons))
- **Makefile & README** — update to reflect your chain
- **Signed commits** — mandatory throughout: `git commit -S -m "your message"`

## Next steps

Build and test with this extension, then follow the [app submission process](https://developers.ledger.com/docs/device-app/submission-process/process).
