/**
 * Every `StageId` this repository writes down, in one file.
 *
 * See `@nerima-games/mc-kernel`'s `domain/identifiers.ts` for why a stage id
 * is a string and what that implies: naming one creates no import and no
 * dependency edge, so an `after` constraint is invisible to
 * `pnpm check:deps`. Collecting them here is what makes them reviewable, and
 * `test/stage-registration.test.ts` fails if one points at a sibling
 * experience module.
 */
import { StageId } from '@nerima-games/mc-kernel'

/**
 * Lowercase alias for the brand smart constructor.
 *
 * `StageId` is capitalised to read as the type it also names (the effect-ts
 * Brand pattern), which trips the `new-cap` rule at every call site below —
 * the rule reads an uppercase callee as "this wants `new`". It is a plain
 * factory function, not a constructor, so the alias is the honest fix: a
 * lowercase name a reader can call without the rule (correctly) objecting.
 */
const stageId = StageId

/**
 * Stages owned by mx-ui.
 *
 * plan.md §4.2 puts `hud-sync` at the very end of the skeleton:
 *
 *     input -> simulation(…) -> camera-mirror -> chunk-sync -> render ->
 *     post-fx -> hud-sync
 *
 * mx-ui does NOT declare itself to be after `post-fx`. That would be an ordering
 * against mc-render, which is not a parent of this repository, and — more to the
 * point — it would be a claim about the global order that only mc-compose is
 * entitled to make (plan.md §2.3-3). What mx-ui's own correctness requires is
 * that the HUD reflects THIS frame's simulation, which is what the `after`
 * constraint below says.
 *
 * Two stages, split by what they read:
 *
 *   - `ui:hud-sync` reads mc-sim's state and rebuilds the view model.
 *   - `ui:overlay-sync` reads this module's own modal stack and caption queue.
 *     It needs no simulation state at all, which is why it can also run in a
 *     per-screen preview with no game behind it (plan.md §3.13).
 */
export const UI_STAGE_IDS: {
  readonly hudSync: StageId
  readonly overlaySync: StageId
} = {
  /** Project mc-sim's vitals, hotbar and XP into the HUD view model. */
  hudSync: stageId('ui:hud-sync'),
  /** Age out captions, and settle modal open/close transitions. */
  overlaySync: stageId('ui:overlay-sync'),
}

/**
 * Stages owned by OTHER repositories that mx-ui orders itself against.
 *
 * `sim:physics` only. A HUD drawn from pre-integration state shows the player's
 * health one frame late, which is invisible in a screenshot and extremely
 * visible when you are on half a heart.
 */
export const UPSTREAM_STAGE_IDS: {
  readonly simPhysics: StageId
} = {
  simPhysics: stageId('sim:physics'),
}

/**
 * The `<repo>:` prefixes belonging to the four experience modules (plan.md
 * §2.2). Used by the regression test that enforces §2.3-1's zero-edge rule at
 * the ordering level as well as at the import level.
 *
 * mx-ui is the repository where the temptation is strongest: "the hotbar should
 * update after mining" reads like an ordering constraint on `gameplay:`. It is
 * not. mx-gameplay writes to mc-sim's InventoryService and mx-ui reads mc-sim —
 * so what mx-ui actually needs is to run after the simulation, which is what
 * `UPSTREAM_STAGE_IDS` already says.
 */
export const EXPERIENCE_MODULE_STAGE_PREFIXES = ['gameplay:', 'redstone:', 'ui:', 'multiplayer:'] as const

/** This repository's own prefix, excluded when checking for sibling edges. */
export const OWN_STAGE_PREFIX = 'ui:'
