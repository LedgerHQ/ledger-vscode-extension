---
description: "Ledger application test writing rules using Ragger, Pytest, and Speculos"
applyTo: "**/*"
---

# Ledger Test Writing Rules (Python)

Python is used for testing Ledger device applications, it is not part of the embedded application.

## Testing Framework and Tools

The tests are written using the Ragger framework, which provides a bridge between Pytest and the Speculos emulator through pytest fixtures.

- **Framework:** [Ragger](https://github.com/LedgerHQ/ragger) (Python + Pytest)
- **Emulator:** [Speculos](https://github.com/LedgerHQ/speculos)

## Test Readability

- Do **not** use raw hex strings (e.g., `bytes.fromhex("050012...")`) for complex APDU payloads — this makes tests unreadable and unmaintainable.
- Use named variables (`amount`, `derivation_path`, `fee`) and `struct.pack` to construct payloads with clear semantic meaning.
- Use a `CommandSender` abstraction (typically in `application_client/`) to encapsulate APDU construction and response parsing, keeping test code focused on scenarios.

## UI Verification

- For critical actions (signing, key export), verify that the device displays the correct information before the user approves.
- Use the Ragger `navigator` to simulate user interaction: button presses on Nano devices, touch events on Stax/Flex/Apex.
- Use `navigator.navigate_and_compare()` to check screen content against reference images (Golden Snapshots).
- Snapshots and tmp snapshots are handled by the framework, NEVER delete them manually, this is USELESS and error prone.

## Running Tests

- When running tests, give to pytest the `--device TARGET` argument to specify the device target (e.g., `nanox`, `stax`).
- You can regenerate the reference snapshots using the `--golden_run` flag. Do so SPARINGLY to avoid silencing involuntary UI changes.

## Coverage Requirements

Every tested feature must include:
- Happy path
- Error paths (invalid inputs, edge cases, malicious inputs)
- User rejection (where applicable)
- Edge cases (empty data, max-length data, boundary values)
