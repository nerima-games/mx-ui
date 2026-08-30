# @nerima-games/mx-ui

## 0.4.0

### Minor Changes

- [#14](https://github.com/nerima-games/mx-ui/pull/14) [`ba5d94d`](https://github.com/nerima-games/mx-ui/commit/ba5d94d8147e94536607d1b2b3351638ac296aa4) Thanks [@takeokunn](https://github.com/takeokunn)! - Repoint the frame-contract mirror to @nerima-games/mc-kernel 0.5.1 and adopt mc-sim 0.2.1 real inventory types (branded StackCount, closed ItemType vocabulary); the local Inventory/Slot/ItemStack copies and the inventory mirror test are gone.

### Patch Changes

- [#13](https://github.com/nerima-games/mx-ui/pull/13) [`b08dd11`](https://github.com/nerima-games/mx-ui/commit/b08dd111faff99a82b555f18f6557924c33b23ff) Thanks [@takeokunn](https://github.com/takeokunn)! - Complete the org toolchain devDependency pin set: knip 6.33.0 (its verify gate arrives in Wave 3; the pin belongs to the Wave 0 table) plus @effect/vitest 0.30.0 where it was missing.

## 0.3.9

### Patch Changes

- [#11](https://github.com/nerima-games/mx-ui/pull/11) [`e2c5b18`](https://github.com/nerima-games/mx-ui/commit/e2c5b18c7c911899b7fc0d8dbb968c25fb0b24f0) Thanks [@takeokunn](https://github.com/takeokunn)! - Toolchain frozen to org pin set (TypeScript 7.0.2, vitest 4.1.11, effect 3.22.1, node 24, pnpm 11.24.0); build switched to tsc emit; release workflow added
