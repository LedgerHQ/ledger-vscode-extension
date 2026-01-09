# Register Your App in the Database

The [ledger-app-database](https://github.com/LedgerHQ/ledger-app-database) registers every app's
`APPNAME`, `appFlags`, `curve`, and derivation `path` for each variant.
It is checked by the mandatory compliance CI workflow to detect naming conflicts
and `APP_LOAD_PARAMS` misuse across all Ledger apps.

## What to do

Once your app parameters are finalised, open a pull request on
[ledger-app-database](https://github.com/LedgerHQ/ledger-app-database) to add
or update your app entry in `app-load-params-db.json`.

You can generate the entry automatically using the provided script:

```sh
python scripts/app_load_params_gen_db.py --app_path /path/to/your/app
```

## Reference

- [ledger-app-database](https://github.com/LedgerHQ/ledger-app-database)
