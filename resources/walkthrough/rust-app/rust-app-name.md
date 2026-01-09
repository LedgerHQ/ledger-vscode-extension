# Set App Name

The app name is defined in two distinct places.

## Cargo.toml

Edit the `name` field of the `[package.metadata.ledger]` section. It defines the application name displayed on the device dashboard and in the Ledger Wallet app store.

## src/app_ui/menu.rs

The name displayed on the **app home screen** is set in the `infos()` method call of the `NbglHomeAndSettings` structure.

```rust
NbglHomeAndSettings::new()
    .infos(
        "App Name",
        env!("CARGO_PKG_VERSION"),
        env!("CARGO_PKG_AUTHORS"),
    )
```

## Reference

- [App Boilerplate Rust](https://github.com/LedgerHQ/app-boilerplate-rust)
