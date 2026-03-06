---
description: "Ledger embedded platform constraints shared by C and Rust applications"
applyTo: "**/*"
---

# Ledger Embedded Platform Rules

These rules apply to all embedded code (C and Rust) running on Ledger devices.

- The UI is the fundamental part of the embedded application, NOT a cosmetic side. Ensure all sensitive operations (signing, public key export) are preceded by an explicit user validation screen. Flag any "blind signing" patterns or flows where the screen doesn't accurately represent the buffer being signed.
- The RAM is limited to around 24 kilobytes. Ensure that the code is optimized for low memory usage and does not contain unnecessary allocations or unnecessarily large data structures.
- Ensure sensitive data such as private keys are explicitly cleaned.
- Cryptographic calls must be made through the SDK's functions, not implemented in application code. Ensure that all cryptographic operations are performed using these functions and that they are used correctly to maintain security and performance.
- APDUs are the sole entry point of the application. Ensure the code treats the incoming APDUs as untrusted input and implements proper validation and error handling to prevent potential security vulnerabilities. Look for robust parsing of APDU commands, validation of input data, and appropriate responses to invalid or malicious requests.
- Remember that the RAM is reset on every power cycle.
