# Changelog

All notable changes to the Node SDK (`@memsy-io/memsy` on npm) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Business key errors**: two typed errors for the rules on business keys
  (`msy_biz_…` keys that act as an application). Both are exported from the package root.
  - `MemsyActorIdRequiredError` (400, `actor_id_required`): a business key searched
    without `actorId`.
  - `MemsyOwnerNotAllowedError` (403, `owner_not_allowed`): a business key called a
    connector route. Extends `MemsyAuthorizationError`, so existing `instanceof` checks
    still catch it.

### Changed

- `owner_not_allowed` (403) now returns `MemsyOwnerNotAllowedError` instead of a plain
  `MemsyAuthorizationError`: `err.name` is `"MemsyOwnerNotAllowedError"` and the message
  starts with "Owner not allowed: …". `instanceof MemsyAuthorizationError` still matches;
  only code that compares `err.name`, `err.constructor` or the message text is affected.

## [0.3.5]

Last release before this changelog was started.
