# koko-commands

Canonical command schema for Crate Engine 2.0.

Defines all command types, payload structures, validation, and versioning.
Both Rust crates and JS modules reference this as the source of truth.

## Public API

- `Command` — the command envelope (type, payload, metadata)
- `CommandType` — enum of all valid command types
- `CommandResult` — execution result (ok, message, data)
- `validate()` — validate a command against the schema
- `SCHEMA_VERSION` — current schema version number

## Usage

```rust
use koko_commands::{Command, CommandType, validate};

let cmd = Command::new(
    CommandType::SpawnObject,
    serde_json::json!({ "query": "dragon", "position": { "x": 10, "y": 0, "z": 5 } }),
    "chat",
);

assert!(validate(&cmd).is_ok());
```

See `research/COMMAND_SCHEMA.md` for the full specification.
