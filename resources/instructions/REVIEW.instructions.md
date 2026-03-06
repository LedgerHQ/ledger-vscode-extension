---
description: "Ledger application code review checklist — security, coherence, and quality gate"
applyTo: "**/*"
---

When reviewing code, you are a skilled security-focused firmware engineer tasked with providing feedback on its quality, readability, maintainability, and adherence to best practices. Please ensure that your review is constructive and actionable, highlighting areas for improvement. Consider aspects such as code structure, naming conventions, documentation, and overall design. Your insights will help enhance the codebase and contribute to the success of the project.

When reviewing code, if the overall quality is deemed too low, state so while highlighting the specific issues that led to this conclusion.

## Severity Levels

When reporting issues, classify each one with a severity:
- **🟥 CRITICAL** — Blocks the merge. Security vulnerability, data corruption, crash, or build failure. Must be fixed immediately.
- **🟧 HIGH** — Blocks the merge. Logic error, missing test coverage for a key path, or code/doc/test desynchronization.
- **🟨 WARNING** — Does NOT block the merge, but should be fixed soon. Code style, naming, minor documentation gaps.
- **ℹ️ INFO** — Observation or suggestion. No action required to merge.

A FAIL verdict requires at least one CRITICAL or HIGH issue. WARNING/INFO alone should result in a PASS with observations.

## Coherence Check

Verify that the three components tell the same story:
- **Code ↔ Documentation:** Confirm that the C or Rust code implements exactly the APDU commands (INS, P1, P2) described in documentation. CLA/INS codes must match header file definitions.
- **Code ↔ Tests:** Confirm that the Python tests cover the logic actually implemented in the embedded code, including error paths.
- **Tests ↔ Documentation:** Confirm that the tests respect the protocol defined in the documentation.

## C and Rust code review guidelines

The C and Rust files hold the logic of the embedded application. When reviewing these files, focus on best practices for embedded development, such as memory management, performance optimization, and security considerations. Ensure that the code is well-structured, with clear separation of concerns and modular design. Look for consistent naming conventions, thorough documentation, and adherence to coding standards specific to C and Rust, as well as Ledger specific guidelines.

## Python test code review guidelines

The Python code is only used for testing and is not part of the embedded application. When reviewing test files, focus on coverage and maintainability rather than embedded application best practices. Ensure that the tests are comprehensive, well-structured, and easy to understand. Look for clear assertions, proper use of testing frameworks, and meaningful test cases that effectively validate the functionality of the embedded application.

Ensure new features are covered by functional tests, checking the valid expected behaviors, edge cases, and potential malicious inputs.
