# Set Rust Icons & Glyphs

## Set dashboard icons in `Cargo.toml`

Under `[package.metadata.ledger.<device>]`:

Store icon assets in `icons/`.

## Use glyphs in Rust source

Load glyphs with `include_gif!(...)` in:

Store glyph assets in `glyphs/`.

- `src/app_ui/menu.rs` (home/settings glyph)
- `src/app_ui/sign.rs` (transaction review glyph)
- `src/app_ui/address.rs` (address review glyph)

## Formats & sizes (quick rules)

Icons:

- Nano S Plus / X: 1-bit PNG/GIF, `14x14`
- Stax: 4-bit PNG/GIF, `32x32`
- Flex: 4-bit PNG/GIF, `40x40`
- Apex: 1-bit PNG, `32x32`

Glyphs:

- Nano S Plus / X: 1-bit PNG/GIF, `14x14`
- Stax / Flex: 4-bit PNG/GIF, `64x64`
- Apex: 1-bit PNG, `48x48`

## Reference

- [App Boilerplate Rust](https://github.com/LedgerHQ/app-boilerplate-rust)
- [Icon requirements & guidelines](https://developers.ledger.com/docs/device-app/submission-process/deliverables/icons)
