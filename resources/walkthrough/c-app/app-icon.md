# Set C Icons & Glyphs

## Set dashboard icons in `Makefile`

Set per-device icons with `ICON_*` variables:

- `ICON_NANOX = icons/app_boilerplate_14px.gif`
- `ICON_NANOSP = icons/app_boilerplate_14px.gif`
- `ICON_STAX = icons/app_boilerplate_32px.gif`
- `ICON_FLEX = icons/app_boilerplate_40px.gif`
- `ICON_APEX_P = icons/app_boilerplate_32px_apex.png`

Store icon assets in `icons/`.

## Use glyphs in C source

Glyph symbols are generated in `glyphs.h` and used through `ICON_APP_*` macros in `src/ui/display.h`.

- `src/ui/menu_nbgl.c` (home/settings)
- `src/ui/nbgl_display_transaction.c` (transaction review)
- `src/ui/nbgl_display_address.c` (address review)

Store glyph assets in `glyphs/`.

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

- [App Boilerplate (C)](https://github.com/LedgerHQ/app-boilerplate)
- [Icon requirements & guidelines](https://developers.ledger.com/docs/device-app/submission-process/deliverables/icons)
