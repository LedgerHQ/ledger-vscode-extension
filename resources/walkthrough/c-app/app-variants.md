# Choose App Variants

Variants let you build **multiple flavours of the same app** from a single
codebase — one per chain, network, or asset.

Edit `VARIANT_PARAM` and `VARIANT_VALUES` in your `Makefile`:

- `VARIANT_PARAM` — the `make` variable name used to select a variant (e.g. `COIN`)
- `VARIANT_VALUES` — space-separated list of valid values (e.g. `MyChain MyChainTestnet`)
