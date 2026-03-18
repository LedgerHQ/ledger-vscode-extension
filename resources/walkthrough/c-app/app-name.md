# Set Your App Name

The app name (`APPNAME`) is displayed on the device dashboard and in the
**Ledger Wallet** app store. It is also displayed in the app itself.

It must be unique and meaningful to your users.

Make sure to remove all mentions of "boilerplate" from the app — in the `Makefile`, `ledger_app.toml`, and any other files where it appears as a name.

## Where to change it

Open `Makefile` at the root of your project and update:
```makefile
APPNAME = "MyApp"
```

This definition is used in NBGL function calls to display the name in the UI.
