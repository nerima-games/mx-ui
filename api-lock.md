# API lock — @nerima-games/mx-ui

<!-- ------------------------------------------------------------------------- -->
<!-- GENERATED FILE. Do not edit by hand.                                      -->
<!--                                                                           -->
<!-- Regenerate with `pnpm api:update`. `pnpm api:check`, which `pnpm verify`  -->
<!-- runs, fails when this file is stale.                                      -->
<!--                                                                           -->
<!-- Every line below is part of the published surface of this package. A diff -->
<!-- here is a diff in what consumers can see, and is the thing plan.md §6     -->
<!-- Step 0-3 asks to be reviewed as a diff. See scripts/api-lock.ts for how   -->
<!-- it is produced and why it is produced this way.                           -->
<!-- ------------------------------------------------------------------------- -->

format: 1
exported declarations: 57
supporting declarations: 7

## Exported

### CAPTION_LIFETIME_SECS  `const`

```ts
const CAPTION_LIFETIME_SECS = 3;
```

### COLOR_VISION_FILTER_TARGET  `const`

```ts
const COLOR_VISION_FILTER_TARGET: "canvas";
```

### COLOR_VISION_MODES  `const`

```ts
const COLOR_VISION_MODES: ReadonlyArray<ColorVisionMode>;
```

### CaptionEvent  `type`

```ts
type CaptionEvent = {
    readonly cueId: string;
    readonly text: string;
    readonly direction: 'left' | 'right' | 'ahead' | 'behind' | undefined;
    readonly atSecs: number;
};
```

### CaptionLineView  `type`

```ts
type CaptionLineView = {
    readonly text: string;
    readonly arrow: '←' | '→' | '↑' | '↓' | undefined;
    readonly freshness: number;
};
```

### CaptionQueue  `type`

```ts
type CaptionQueue = {
    readonly visible: ReadonlyArray<CaptionEvent>;
};
```

### CaptionSettings  `type`

```ts
type CaptionSettings = {
    readonly captionsEnabled: boolean;
    readonly audioUnlocked: boolean;
};
```

### ColorVisionMode  `type`

```ts
type ColorVisionMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
```

### DEFAULT_CAPTION_SETTINGS  `const`

```ts
const DEFAULT_CAPTION_SETTINGS: CaptionSettings;
```

### DEFAULT_MAX_HEALTH_POINTS  `const`

```ts
const DEFAULT_MAX_HEALTH_POINTS = 20;
```

### DEFAULT_MAX_HUNGER_POINTS  `const`

```ts
const DEFAULT_MAX_HUNGER_POINTS = 20;
```

### EXPERIENCE_MODULE_STAGE_PREFIXES  `const`

```ts
const EXPERIENCE_MODULE_STAGE_PREFIXES: readonly ["gameplay:", "redstone:", "ui:", "multiplayer:"];
```

### EscapeOutcome  `type`

```ts
type EscapeOutcome = {
    readonly stack: ModalStack;
    readonly action: 'closed' | 'open-pause';
    readonly closed: ScreenId | undefined;
};
```

### HEALTH_POINTS_PER_HEART  `const`

```ts
const HEALTH_POINTS_PER_HEART = 2;
```

### HOTBAR_SLOT_COUNT  `const`

```ts
const HOTBAR_SLOT_COUNT = 9;
```

### HotbarSlotSnapshot  `type`

```ts
type HotbarSlotSnapshot = {
    readonly itemId: string | undefined;
    readonly count: number;
    readonly durability: number | undefined;
};
```

### HotbarSlotView  `type`

```ts
type HotbarSlotView = {
    readonly index: number;
    readonly itemId: string | undefined;
    readonly countLabel: string | undefined;
    readonly durabilityPercent: number | undefined;
    readonly selected: boolean;
    readonly empty: boolean;
};
```

### HudViewModel  `type`

```ts
type HudViewModel = {
    readonly hearts: ReadonlyArray<IconState>;
    readonly shanks: ReadonlyArray<IconState>;
    readonly experienceLevelLabel: string;
    readonly experiencePercent: number;
    readonly hotbar: ReadonlyArray<HotbarSlotView>;
    readonly dead: boolean;
};
```

### IconState  `type`

```ts
type IconState = 'full' | 'half' | 'empty';
```

### InputAction  `type`

```ts
type InputAction = 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight' | 'jump' | 'sneak' | 'sprint' | 'inventory' | 'drop' | 'chat';
```

### KeyBindings  `type`

```ts
type KeyBindings = ReadonlyMap<InputAction, string>;
```

### MAX_VISIBLE_CAPTIONS  `const`

```ts
const MAX_VISIBLE_CAPTIONS = 4;
```

### ModalStack  `type`

```ts
type ModalStack = ReadonlyArray<ScreenId>;
```

### MotionPreference  `type`

```ts
type MotionPreference = 'full' | 'reduced';
```

### MotionSetting  `type`

```ts
type MotionSetting = 'system' | 'full' | 'reduced';
```

### OWN_STAGE_PREFIX  `const`

```ts
const OWN_STAGE_PREFIX = "ui:";
```

### REBIND_CLEAR_KEYS  `const`

```ts
const REBIND_CLEAR_KEYS: ReadonlySet<string>;
```

### RebindResult  `type`

```ts
type RebindResult = {
    readonly kind: 'bound';
    readonly bindings: KeyBindings;
} | {
    readonly kind: 'cleared';
    readonly bindings: KeyBindings;
} | {
    readonly kind: 'conflict';
    readonly heldBy: InputAction;
};
```

### ScreenId  `type`

```ts
type ScreenId = 'pause' | 'settings' | 'inventory' | 'crafting' | 'chat' | 'achievements' | 'statistics';
```

### UI_STAGE_IDS  `const`

```ts
const UI_STAGE_IDS: {
    readonly hudSync: StageId;
    readonly overlaySync: StageId;
};
```

### UPSTREAM_STAGE_IDS  `const`

```ts
const UPSTREAM_STAGE_IDS: {
    readonly simPhysics: StageId;
};
```

### UiFrameState  `type`

```ts
type UiFrameState = {
    readonly snapshot: Ref.Ref<VitalsSnapshot>;
    readonly hud: Ref.Ref<HudViewModel>;
    readonly captions: Ref.Ref<CaptionQueue>;
    readonly modals: Ref.Ref<ModalStack>;
    readonly elapsedSecs: Ref.Ref<number>;
};
```

### VitalsSnapshot  `type`

```ts
type VitalsSnapshot = {
    readonly healthPoints: number;
    readonly maxHealthPoints: number;
    readonly hungerPoints: number;
    readonly maxHungerPoints: number;
    readonly experienceLevel: number;
    readonly experienceProgress: number;
    readonly hotbar: ReadonlyArray<HotbarSlotSnapshot>;
    readonly selectedHotbarIndex: number;
};
```

### animationDurationMs  `const`

```ts
const animationDurationMs: (baseMs: number, motion: MotionPreference) => number;
```

### captionLines  `const`

```ts
const captionLines: (queue: CaptionQueue, nowSecs: number, lifetimeSecs?: number) => ReadonlyArray<CaptionLineView>;
```

### closeScreen  `const`

```ts
const closeScreen: (stack: ModalStack, screen: ScreenId) => ModalStack;
```

### colorVisionAttribute  `const`

```ts
const colorVisionAttribute: (mode: ColorVisionMode) => string | undefined;
```

### emptyCaptionQueue  `const`

```ts
const emptyCaptionQueue: CaptionQueue;
```

### emptyModalStack  `const`

```ts
const emptyModalStack: ModalStack;
```

### escapePressed  `const`

```ts
const escapePressed: (stack: ModalStack) => EscapeOutcome;
```

### expireCaptions  `const`

```ts
const expireCaptions: (queue: CaptionQueue, nowSecs: number, lifetimeSecs?: number) => CaptionQueue;
```

### gameplayInputSuppressed  `const`

```ts
const gameplayInputSuppressed: (stack: ModalStack) => boolean;
```

### hudViewModel  `const`

```ts
const hudViewModel: (snapshot: VitalsSnapshot) => HudViewModel;
```

### iconRow  `const`

```ts
const iconRow: (points: number, maxPoints: number) => ReadonlyArray<IconState>;
```

### makeUiFrameState  `const`

```ts
const makeUiFrameState: Effect.Effect<UiFrameState>;
```

### makeUiStages  `const`

```ts
const makeUiStages: Effect.Effect<ReadonlyArray<StageRegistration>>;
```

### openScreen  `const`

```ts
const openScreen: (stack: ModalStack, screen: ScreenId) => ModalStack;
```

### pointerLockReleased  `const`

```ts
const pointerLockReleased: (stack: ModalStack) => boolean;
```

### rebind  `const`

```ts
const rebind: (bindings: KeyBindings, action: InputAction, code: string) => RebindResult;
```

### receiveCaption  `const`

```ts
const receiveCaption: (queue: CaptionQueue, event: CaptionEvent, settings: CaptionSettings) => CaptionQueue;
```

### resolveMotionPreference  `const`

```ts
const resolveMotionPreference: (setting: MotionSetting, systemPrefersReducedMotion: boolean) => MotionPreference;
```

### shouldAnimate  `const`

```ts
const shouldAnimate: (motion: MotionPreference) => boolean;
```

### spawnSnapshot  `const`

```ts
const spawnSnapshot: VitalsSnapshot;
```

### topOf  `const`

```ts
const topOf: (stack: ModalStack) => ScreenId | undefined;
```

### uiModule  `const`

```ts
const uiModule: GameModule<never, never, never>;
```

### uiStages  `const`

```ts
const uiStages: (state: UiFrameState) => ReadonlyArray<StageRegistration>;
```

### unboundActions  `const`

```ts
const unboundActions: (bindings: KeyBindings, actions: ReadonlyArray<InputAction>) => ReadonlyArray<InputAction>;
```

## Supporting declarations

Not exported from the barrel, but named by the signatures above, so a
consumer is exposed to them. `Context.Tag` service classes emit their real
type onto one of these.

### DeltaTimeSecs  `const`

```ts
const DeltaTimeSecs: Brand.Brand.Constructor<DeltaTimeSecs>;
```

### DeltaTimeSecs  `type`

```ts
type DeltaTimeSecs = number & Brand.Brand<'DeltaTimeSecs'>;
```

### FrameServices  `type`

```ts
type FrameServices = never;
```

### GameModule  `interface`

```ts
interface GameModule<ROut, E, RIn, RRegister = never> {
    readonly layers: Layer.Layer<ROut, E, RIn>;
    readonly frameStages: Effect.Effect<ReadonlyArray<StageRegistration>, never, RRegister>;
}
```

### StageId  `const`

```ts
const StageId: Brand.Brand.Constructor<StageId>;
```

### StageId  `type`

```ts
type StageId = string & Brand.Brand<'StageId'>;
```

### StageRegistration  `interface`

```ts
interface StageRegistration {
    readonly id: StageId;
    readonly after?: ReadonlyArray<StageId>;
    readonly run: (dt: DeltaTimeSecs) => Effect.Effect<void, never, FrameServices>;
}
```
