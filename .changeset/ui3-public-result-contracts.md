---
"@nerima-games/mx-ui": minor
---

**Breaking API change:** `crosshairViewModel` now returns `Result<CrosshairViewModel | undefined, InvalidCrosshairViewModelInput>` instead of `CrosshairViewModel | undefined`. It fails when `status` is null, an array, or not an object; when `status.modals` is not an array of supported screen IDs; when a supplied `breakProgress` is not a finite number; when a supplied `lastHitAtSecs` is not finite; when `nowSecs` is not finite; or when `pulseSecs` is non-finite or negative. Finite `breakProgress` values are clamped to 0–1, and omitted optional status fields remain valid.

Callers must check the result before rendering. `Result.isFailure(result)` identifies invalid input; on success, `result.success` is still `CrosshairViewModel | undefined`. The success value is `undefined` when the crosshair is hidden because pointer lock was released.

The public return contracts of `updateIconElement`, `updateSlotElement`, and `requireRootButton` also change to `Result`. The `render()` methods returned by `createAnvilView`, `createCaptionView`, `createChestStorageView`, `createCrosshairView`, `createEnchantingTableView`, `createFurnaceView`, `createHudView`, `createInventoryView`, `createMainMenuView`, and `createSettingsView` now return typed `Result<void, Failure>` values instead of `void`. Check each result with `Result.isFailure`; the success value is available at `.success`. `createMainMenuView` also exposes an `initializationResult` that callers should inspect.

`worldNameLabel` now declares `WorldNameText | UiMessageText` instead of `string`; both remain string values. Additional malformed-input overloads on model helpers preserve their existing return types for well-typed successful calls.
