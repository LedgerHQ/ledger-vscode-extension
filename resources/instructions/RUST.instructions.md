---
description: "Rust programming language coding conventions and best practices"
applyTo: "**/*"
---

# Rust Coding Conventions and Best Practices

Follow idiomatic Rust practices and community standards when writing Rust code.

## General

- Always prioritize readability, safety, and maintainability.
- Use strong typing and leverage Rust's ownership system for memory safety.
- Break down complex functions into smaller, more manageable functions.
- Handle errors gracefully using `Result<T, E>` and provide meaningful error messages.
- Write idiomatic, safe, and efficient Rust code that follows the borrow checker's rules.
- Ensure code compiles without warnings.

## Patterns to Avoid

- Don't use `unwrap()` or `expect()` unless failure is truly impossible or represents an unrecoverable state.
- Avoid panics in library code—return `Result` instead.
- Don't rely on global mutable state—use dependency injection or thread-safe containers.
- Avoid `unsafe` unless required and fully documented.
- Don't overuse `clone()`, use borrowing instead of cloning unless ownership transfer is needed.

## Error Handling

- Use `Result<T, E>` for recoverable errors and `panic!` only for unrecoverable errors.
- Prefer `?` operator over `unwrap()` or `expect()` for error propagation.
- Validate function arguments and return appropriate errors for invalid input.

## Testing (Speculos / Custom Targets)

This repo targets custom ARM Cortex-M devices, not standard Rust host platforms. Tests cannot use standard `cargo test` on the host — they must run inside the [Speculos](https://github.com/LedgerHQ/speculos) emulator against a device target.

**Custom test harness**: The `testmacro` crate provides `test_item`, a proc-macro replacement for `#[test]`. Inside `#[cfg(test)]` modules, import it as:
```rust
#[cfg(test)]
mod tests {
    use crate::testing::TestType;
    use testmacro::test_item as test;

    #[test]
    fn test_example() {
        // test body — return Ok(()) on success
    }
}
```

- Do **not** create a `tests/` directory for integration tests — there are no host-side integration tests.
- Use `assert_eq_err!` (from `testing.rs`) instead of `assert_eq!` inside test functions.
- Enable the `speculos` and `debug` cargo features when running tests.

## Code Style and Formatting

- Follow the Rust Style Guide and use `rustfmt` for automatic formatting.
- Keep lines under 100 characters when possible.
- Use `cargo clippy` to catch common mistakes and enforce best practices.
