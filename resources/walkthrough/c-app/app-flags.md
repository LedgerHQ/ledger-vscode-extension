# Configure App Flags & Features

App flags grant your app elevated OS permissions. Request **only** the flags
your app genuinely needs — every extra flag widens the attack surface and will
be scrutinised during the security audit.

## Available flags

Uncomment the relevant lines in the `Makefile` section labelled
`Application custom permissions`

- `HAVE_APPLICATION_FLAG_DERIVE_MASTER`: derive keys directly from master seed (no hardened prefix).
- `HAVE_APPLICATION_FLAG_GLOBAL_PIN`: ask user to re-enter PIN at runtime.
- `HAVE_APPLICATION_FLAG_BOLOS_SETTINGS`: allow device-level settings changes.
- `HAVE_APPLICATION_FLAG_LIBRARY`: allow app library calls via `os_lib_call`.

## Communication & UI features

Uncomment the relevant lines in the `Makefile`

- `ENABLE_BLUETOOTH`: Bluetooth support (not on Nano S Plus).
- `ENABLE_NFC`: NFC support (not on Nano X / Nano S Plus).
- `ENABLE_NBGL_FOR_NANO_DEVICES`: use NBGL on Nano S Plus / X instead of BAGL.
- `ENABLE_NBGL_QRCODE`: enable QR code widget.
- `ENABLE_NBGL_KEYBOARD`: enable on-screen keyboard.
- `ENABLE_NBGL_KEYPAD`: enable on-screen keypad.

## Reference

- [App permissions reference](https://developers.ledger.com/docs/device-app/references/app-permissions)
- [App flags](https://github.com/LedgerHQ/ledger-secure-sdk/blob/master/include/appflags.h)
