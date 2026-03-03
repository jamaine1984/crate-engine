# web/runtime/

Engine 2.0 modular runtime layer. All new JS functionality lives here.

## Modules

- `command-bus.mjs` — Central dispatcher. ALL engine actions flow through here.
- `command-schema.mjs` — Command type definitions, validation, and schema versioning.

## Rules

1. Legacy files (`engine.mjs`, `character.mjs`) are NOT modified for new features.
2. New functionality goes here as separate modules.
3. Each module exports a clean public API.
4. All engine actions must be dispatched through the command bus.

See `research/ENGINE_2_0_SPEC.md` for the full architecture.
