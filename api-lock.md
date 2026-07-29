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
exported declarations: 271
supporting declarations: 7

## Exported

### AttributeCell  `type`

```ts
type AttributeCell = {
    readonly element: DomElement;
    readonly name: string;
    previous: string | undefined;
};
```

### CAPTION_LIFETIME_SECS  `const`

```ts
const CAPTION_LIFETIME_SECS = 3;
```

### COLLAPSE_SEPARATION  `const`

```ts
const COLLAPSE_SEPARATION = 24;
```

### COLOR_VISION_ATTRIBUTE  `const`

```ts
const COLOR_VISION_ATTRIBUTE = "data-color-vision";
```

### COLOR_VISION_FILTER_COLOR_SPACE  `const`

```ts
const COLOR_VISION_FILTER_COLOR_SPACE: "sRGB";
```

### COLOR_VISION_FILTER_TARGET  `const`

```ts
const COLOR_VISION_FILTER_TARGET: "canvas";
```

### COLOR_VISION_MODES  `const`

```ts
const COLOR_VISION_MODES: ReadonlyArray<ColorVisionMode>;
```

### CRITICAL_PAIRS  `const`

```ts
const CRITICAL_PAIRS: ReadonlyArray<CriticalPair>;
```

### CROSSHAIR_ARM_HIT_WEIGHT  `const`

```ts
const CROSSHAIR_ARM_HIT_WEIGHT = "4px";
```

### CROSSHAIR_ARM_WEIGHT  `const`

```ts
const CROSSHAIR_ARM_WEIGHT = "2px";
```

### CROSSHAIR_HALO_WIDTH  `const`

```ts
const CROSSHAIR_HALO_WIDTH = "1px";
```

### CROSSHAIR_PULSE_SCALE  `const`

```ts
const CROSSHAIR_PULSE_SCALE = 1.45;
```

### CROSSHAIR_PULSE_SECS  `const`

```ts
const CROSSHAIR_PULSE_SECS = 0.12;
```

### CROSSHAIR_SIZE  `const`

```ts
const CROSSHAIR_SIZE = "20px";
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

### CaptionView  `type`

```ts
type CaptionView = {
    readonly root: DomElement;
    readonly render: (lines: ReadonlyArray<CaptionLineView>) => void;
    readonly setMotion: (motion: MotionPreference) => void;
};
```

### ColorVisionCell  `type`

```ts
type ColorVisionCell = {
    readonly target: DomAttributeTarget;
    previous: string | undefined;
    applied: boolean;
};
```

### ColorVisionMatrix  `type`

```ts
type ColorVisionMatrix = readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];
```

### ColorVisionMode  `type`

```ts
type ColorVisionMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
```

### CraftingOutcomeView  `type`

```ts
type CraftingOutcomeView = {
    readonly kind: 'match';
    readonly output: SlotView;
} | {
    readonly kind: 'no-match';
} | {
    readonly kind: 'unknown';
};
```

### CraftingResultSnapshot  `type`

```ts
type CraftingResultSnapshot = {
    readonly _tag: 'Match';
    readonly output: MirroredItemStack;
} | {
    readonly _tag: 'NoMatch';
};
```

### CraftingSnapshot  `type`

```ts
type CraftingSnapshot = {
    readonly gridWidth: number;
    readonly grid: ReadonlyArray<MirroredSlot>;
    readonly result: CraftingResultSnapshot | undefined;
};
```

### CreateWorldRequest  `type`

```ts
type CreateWorldRequest = {
    readonly name: string;
    readonly mode: GameMode;
};
```

### CriticalPair  `type`

```ts
type CriticalPair = {
    readonly left: {
        readonly name: string;
        readonly color: Rgb;
    };
    readonly right: {
        readonly name: string;
        readonly color: Rgb;
    };
    readonly why: string;
    readonly alsoDistinguishedBy: ReadonlyArray<Distinguisher>;
};
```

### CrosshairStatus  `type`

```ts
type CrosshairStatus = {
    readonly modals: ModalStack;
    readonly lastHitAtSecs: number | undefined;
};
```

### CrosshairView  `type`

```ts
type CrosshairView = {
    readonly root: DomElement;
    readonly render: (model: CrosshairViewModel | undefined) => void;
    readonly setMotion: (motion: MotionPreference) => void;
};
```

### CrosshairViewModel  `type`

```ts
type CrosshairViewModel = {
    readonly hit: boolean;
};
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

### DEFAULT_WORLD_NAME  `const`

```ts
const DEFAULT_WORLD_NAME = "New World";
```

### DURABILITY_HIGH  `const`

```ts
const DURABILITY_HIGH: Rgb;
```

### DURABILITY_LOW  `const`

```ts
const DURABILITY_LOW: Rgb;
```

### DURABILITY_LOW_PERCENT  `const`

```ts
const DURABILITY_LOW_PERCENT = 25;
```

### Distinguisher  `type`

```ts
type Distinguisher = 'shape' | 'outline' | 'length' | 'weight' | 'position' | 'numeral';
```

### DomAttributeTarget  `type`

```ts
type DomAttributeTarget = {
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
};
```

### DomElement  `type`

```ts
type DomElement = DomNode & {
    textContent: string | null;
    readonly style: DomStyle;
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
    appendChild(child: DomNode): unknown;
};
```

### DomElementFactory  `type`

```ts
type DomElementFactory = {
    createElement(tagName: 'input'): DomInputElement;
    createElement(tagName: 'button'): DomInteractiveElement;
    createElement(tagName: string): DomElement;
};
```

### DomInputElement  `type`

```ts
type DomInputElement = DomInteractiveElement & {
    value: string;
};
```

### DomInteractiveElement  `type`

```ts
type DomInteractiveElement = DomElement & {
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void;
    focus(): void;
};
```

### DomNode  `type`

```ts
type DomNode = {
    readonly nodeType: number;
};
```

### DomStyle  `type`

```ts
type DomStyle = {
    setProperty(property: string, value: string): void;
    removeProperty(property: string): void;
};
```

### EMPTY_SAVE_LIST_NOTE  `const`

```ts
const EMPTY_SAVE_LIST_NOTE = "No saved worlds";
```

### EXPERIENCE_MODULE_STAGE_PREFIXES  `const`

```ts
const EXPERIENCE_MODULE_STAGE_PREFIXES: readonly ["gameplay:", "redstone:", "ui:", "multiplayer:"];
```

### EXPERIENCE_TRANSITION_MS  `const`

```ts
const EXPERIENCE_TRANSITION_MS = 220;
```

### EscapeOutcome  `type`

```ts
type EscapeOutcome = {
    readonly stack: ModalStack;
    readonly action: 'closed' | 'open-pause';
    readonly closed: ScreenId | undefined;
};
```

### FOCUS_RING  `const`

```ts
const FOCUS_RING: Rgb;
```

### FOCUS_RING_SHADOW  `const`

```ts
const FOCUS_RING_SHADOW: Rgb;
```

### FOCUS_RING_SHADOW_WIDTH  `const`

```ts
const FOCUS_RING_SHADOW_WIDTH = "5px";
```

### FOCUS_RING_WIDTH  `const`

```ts
const FOCUS_RING_WIDTH = "3px";
```

### GAME_MODES  `const`

```ts
const GAME_MODES: ReadonlyArray<GameMode>;
```

### GAME_MODE_LABEL  `const`

```ts
const GAME_MODE_LABEL: Readonly<Record<GameMode, string>>;
```

### GUARDED_TOKENS  `const`

```ts
const GUARDED_TOKENS: ReadonlyArray<GuardedToken>;
```

### GameMode  `type`

```ts
type GameMode = 'survival' | 'creative';
```

### GuardedToken  `type`

```ts
type GuardedToken = {
    readonly name: string;
    readonly color: Rgb;
    readonly role: TokenRole;
    readonly on: 'scrim' | 'surface' | 'surfaceRaised';
};
```

### HEALTH_POINTS_PER_HEART  `const`

```ts
const HEALTH_POINTS_PER_HEART = 2;
```

### HEART  `const`

```ts
const HEART: Rgb;
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

### HudView  `type`

```ts
type HudView = {
    readonly root: DomElement;
    readonly render: (model: HudViewModel) => void;
    readonly setMotion: (motion: MotionPreference) => void;
    readonly setKeyboardFocus: (index: number | undefined) => void;
};
```

### HudViewModel  `type`

```ts
type HudViewModel = {
    readonly hearts: ReadonlyArray<IconState>;
    readonly shanks: ReadonlyArray<IconState>;
    readonly experienceLevelLabel: string;
    readonly experiencePercent: number;
    readonly hotbar: ReadonlyArray<SlotView>;
    readonly dead: boolean;
};
```

### ICON_EMPTY  `const`

```ts
const ICON_EMPTY: Rgb;
```

### ICON_ROW_LABEL  `const`

```ts
const ICON_ROW_LABEL: Readonly<Record<IconKind, string>>;
```

### IDLE_CROSSHAIR_STATUS  `const`

```ts
const IDLE_CROSSHAIR_STATUS: CrosshairStatus;
```

### IDLE_LOADING_STATUS  `const`

```ts
const IDLE_LOADING_STATUS: LoadingStatus;
```

### IDLE_SAVE_STATUS  `const`

```ts
const IDLE_SAVE_STATUS: SaveStatus;
```

### INK  `const`

```ts
const INK: Rgb;
```

### INK_FAINT  `const`

```ts
const INK_FAINT: Rgb;
```

### INK_MUTED  `const`

```ts
const INK_MUTED: Rgb;
```

### INVENTORY_MAIN_COLUMNS  `const`

```ts
const INVENTORY_MAIN_COLUMNS = 9;
```

### INVENTORY_MAIN_ROWS  `const`

```ts
const INVENTORY_MAIN_ROWS = 3;
```

### INVENTORY_MAIN_SLOT_COUNT  `const`

```ts
const INVENTORY_MAIN_SLOT_COUNT: number;
```

### INVENTORY_SLOT_COUNT  `const`

```ts
const INVENTORY_SLOT_COUNT = 36;
```

### IconElement  `type`

```ts
type IconElement = {
    readonly root: DomElement;
    readonly stateFlag: AttributeCell;
    readonly hiddenFlag: AttributeCell;
    readonly fillWidth: PercentCell;
    previous: IconState | undefined;
};
```

### IconKind  `type`

```ts
type IconKind = 'heart' | 'shank';
```

### IconState  `type`

```ts
type IconState = 'full' | 'half' | 'empty';
```

### InputAction  `type`

```ts
type InputAction = 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight' | 'jump' | 'sneak' | 'sprint' | 'inventory' | 'drop' | 'chat';
```

### InventoryInteractionTarget  `type`

```ts
type InventoryInteractionTarget = {
    readonly kind: 'slot';
    readonly region: RegionId;
    readonly index: number;
} | {
    readonly kind: 'crafting-output';
};
```

### InventoryInteractionView  `type`

```ts
type InventoryInteractionView = {
    readonly focused: InventoryInteractionTarget;
    readonly status: string;
};
```

### InventorySnapshot  `type`

```ts
type InventorySnapshot = {
    readonly inventory: MirroredInventory;
    readonly selectedHotbarIndex: number;
    readonly durabilityBySlot: ReadonlyMap<number, number> | undefined;
    readonly carried: MirroredSlot;
    readonly armour: ReadonlyArray<MirroredSlot> | undefined;
    readonly offhand: MirroredSlot | undefined;
    readonly crafting: CraftingSnapshot | undefined;
    readonly mergeableSlotIndices: ReadonlySet<number> | undefined;
};
```

### InventoryView  `type`

```ts
type InventoryView = {
    readonly root: DomElement;
    readonly render: (model: InventoryViewModel, interaction?: InventoryInteractionView) => void;
};
```

### InventoryViewModel  `type`

```ts
type InventoryViewModel = {
    readonly regions: ReadonlyArray<SlotRegion>;
    readonly carried: SlotView | undefined;
    readonly crafting: CraftingOutcomeView;
    readonly mergeTargets: MergeTargets;
};
```

### KNOWN_NEAR_COLLISIONS  `const`

```ts
const KNOWN_NEAR_COLLISIONS: ReadonlyArray<NearCollision>;
```

### KeyBindings  `type`

```ts
type KeyBindings = ReadonlyMap<InputAction, string>;
```

### LOADING_DETAIL  `const`

```ts
const LOADING_DETAIL: Readonly<Record<LoadingScreenView['kind'], string>>;
```

### LOADING_KICKER  `const`

```ts
const LOADING_KICKER: Readonly<Record<LoadingScreenView['kind'], string>>;
```

### LOADING_LABEL  `const`

```ts
const LOADING_LABEL: Readonly<Record<LoadingScreenView['kind'], string>>;
```

### LOADING_MINIMUM_VISIBLE_SECS  `const`

```ts
const LOADING_MINIMUM_VISIBLE_SECS = 2.5;
```

### LOADING_STATES  `const`

```ts
const LOADING_STATES: ReadonlyArray<LoadingScreenView['kind']>;
```

### LoadingProgress  `type`

```ts
type LoadingProgress = {
    readonly kind: 'preparing';
} | {
    readonly kind: 'ready';
} | {
    readonly kind: 'failed';
    readonly reason: string;
};
```

### LoadingScreenView  `type`

```ts
type LoadingScreenView = {
    readonly kind: 'preparing';
    readonly held: boolean;
} | {
    readonly kind: 'failed';
    readonly reason: string;
};
```

### LoadingStatus  `type`

```ts
type LoadingStatus = {
    readonly progress: LoadingProgress;
    readonly startedAtSecs: number;
};
```

### LoadingView  `type`

```ts
type LoadingView = {
    readonly root: DomElement;
    readonly render: (view: LoadingScreenView | undefined) => void;
};
```

### MAIN_MENU_TITLE  `const`

```ts
const MAIN_MENU_TITLE = "nerima-games";
```

### MAX_VISIBLE_CAPTIONS  `const`

```ts
const MAX_VISIBLE_CAPTIONS = 4;
```

### MENU_ACTION_LABEL  `const`

```ts
const MENU_ACTION_LABEL: {
    readonly confirm: "Confirm";
    readonly cancel: "Cancel";
    readonly back: "Back";
};
```

### MENU_FIELD_LABEL  `const`

```ts
const MENU_FIELD_LABEL: {
    readonly 'world-name': "World name";
    readonly 'game-mode': "Game mode";
};
```

### MENU_PANELS  `const`

```ts
const MENU_PANELS: ReadonlyArray<MenuPanel>;
```

### MENU_PANEL_LABEL  `const`

```ts
const MENU_PANEL_LABEL: Readonly<Record<MenuPanel, string>>;
```

### METER_TRACK  `const`

```ts
const METER_TRACK: Rgb;
```

### MainMenuCallbacks  `type`

```ts
type MainMenuCallbacks = {
    readonly onStateChange: (state: MainMenuState) => void;
    readonly onCreateWorld: (request: CreateWorldRequest) => void;
    readonly onLoadWorld: (world: SavedWorld) => void;
    readonly onOpenSettings: () => void;
};
```

### MainMenuState  `type`

```ts
type MainMenuState = {
    readonly panel: MenuPanel;
    readonly draft: NewWorldDraft;
};
```

### MainMenuView  `type`

```ts
type MainMenuView = {
    readonly root: DomElement;
    readonly render: (model: MainMenuViewModel) => void;
};
```

### MainMenuViewModel  `type`

```ts
type MainMenuViewModel = {
    readonly panel: MenuPanel;
    readonly worldNameInput: string;
    readonly worldName: string;
    readonly mode: GameMode;
    readonly savedWorlds: ReadonlyArray<SavedWorld>;
};
```

### MenuAction  `type`

```ts
type MenuAction = keyof typeof MENU_ACTION_LABEL;
```

### MenuField  `type`

```ts
type MenuField = keyof typeof MENU_FIELD_LABEL;
```

### MenuPanel  `type`

```ts
type MenuPanel = 'root' | 'new-world' | 'load-world';
```

### MergeTargets  `type`

```ts
type MergeTargets = {
    readonly kind: 'known';
    readonly indices: ReadonlySet<number>;
} | {
    readonly kind: 'unknown';
};
```

### MirroredInventory  `type`

```ts
type MirroredInventory = {
    readonly slots: ReadonlyArray<MirroredSlot>;
};
```

### MirroredItemId  `type`

```ts
type MirroredItemId = string;
```

### MirroredItemStack  `type`

```ts
type MirroredItemStack = {
    readonly item: MirroredItemId;
    readonly count: number;
};
```

### MirroredSlot  `type`

```ts
type MirroredSlot = MirroredItemStack | undefined;
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

### NO_SAVE_LIST_NOTE  `const`

```ts
const NO_SAVE_LIST_NOTE = "mc-save has not been asked. This list is unknown, which is not the same as empty.";
```

### NearCollision  `type`

```ts
type NearCollision = {
    readonly left: string;
    readonly right: string;
    readonly why: string;
};
```

### NewWorldDraft  `type`

```ts
type NewWorldDraft = {
    readonly name: string;
    readonly mode: GameMode;
};
```

### OWN_STAGE_PREFIX  `const`

```ts
const OWN_STAGE_PREFIX = "ui:";
```

### PALETTE_PROPERTY  `const`

```ts
const PALETTE_PROPERTY: {
    readonly scrim: "--mx-ui-scrim";
    readonly surface: "--mx-ui-surface";
    readonly surfaceRaised: "--mx-ui-surface-raised";
    readonly meterTrack: "--mx-ui-meter-track";
    readonly slotFill: "--mx-ui-slot-fill";
    readonly ink: "--mx-ui-ink";
    readonly inkMuted: "--mx-ui-ink-muted";
    readonly inkFaint: "--mx-ui-ink-faint";
    readonly heart: "--mx-ui-heart";
    readonly shank: "--mx-ui-shank";
    readonly iconEmpty: "--mx-ui-icon-empty";
    readonly xpFill: "--mx-ui-xp-fill";
    readonly xpFillHighlight: "--mx-ui-xp-fill-highlight";
    readonly xpLevel: "--mx-ui-xp-level";
    readonly slotBorder: "--mx-ui-slot-border";
    readonly slotSelected: "--mx-ui-slot-selected";
    readonly statusOk: "--mx-ui-status-ok";
    readonly statusBusy: "--mx-ui-status-busy";
    readonly statusAlert: "--mx-ui-status-alert";
    readonly durabilityHigh: "--mx-ui-durability-high";
    readonly durabilityLow: "--mx-ui-durability-low";
    readonly focusRing: "--mx-ui-focus-ring";
    readonly focusRingShadow: "--mx-ui-focus-ring-shadow";
};
```

### PALETTE_PROPERTY_PREFIX  `const`

```ts
const PALETTE_PROPERTY_PREFIX = "--mx-ui-";
```

### PALETTE_SOURCE  `const`

```ts
const PALETTE_SOURCE: Readonly<Record<PaletteTokenName, Rgb>>;
```

### PALETTE_TOKEN_NAMES  `const`

```ts
const PALETTE_TOKEN_NAMES: ReadonlyArray<PaletteTokenName>;
```

### PALETTE_VALUE  `const`

```ts
const PALETTE_VALUE: Readonly<Record<PaletteTokenName, string>>;
```

### PALETTE_VAR  `const`

```ts
const PALETTE_VAR: Readonly<Record<PaletteTokenName, string>>;
```

### PairReading  `type`

```ts
type PairReading = {
    readonly pair: CriticalPair;
    readonly perMode: ReadonlyArray<{
        readonly mode: ColorVisionMode;
        readonly left: Rgb;
        readonly right: Rgb;
        readonly separation: number;
        readonly contrast: number;
    }>;
    readonly worstSeparation: number;
    readonly worstMode: ColorVisionMode;
    readonly collapsed: boolean;
    readonly hueOnly: boolean;
};
```

### PaletteSurvey  `type`

```ts
type PaletteSurvey = {
    readonly tokens: ReadonlyArray<TokenReading>;
    readonly pairs: ReadonlyArray<PairReading>;
    readonly tokensBelowFloor: ReadonlyArray<string>;
    readonly collapsedPairs: ReadonlyArray<string>;
    readonly pairsWithoutRedundancy: ReadonlyArray<string>;
    readonly undeclaredNearCollisions: ReadonlyArray<{
        readonly left: string;
        readonly right: string;
        readonly separation: number;
    }>;
};
```

### PaletteTokenName  `type`

```ts
type PaletteTokenName = keyof typeof PALETTE_PROPERTY;
```

### PaletteUnderSurvey  `type`

```ts
type PaletteUnderSurvey = {
    readonly tokens: ReadonlyArray<GuardedToken>;
    readonly pairs: ReadonlyArray<CriticalPair>;
    readonly knownNearCollisions: ReadonlyArray<NearCollision>;
};
```

### PercentCell  `type`

```ts
type PercentCell = {
    readonly style: StyleCell;
    previous: number;
};
```

### REBIND_CLEAR_KEYS  `const`

```ts
const REBIND_CLEAR_KEYS: ReadonlySet<string>;
```

### ROOT_ENTRIES  `const`

```ts
const ROOT_ENTRIES: ReadonlyArray<RootEntry>;
```

### ROOT_ENTRY_LABEL  `const`

```ts
const ROOT_ENTRY_LABEL: Readonly<Record<RootEntry, string>>;
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

### RegionId  `type`

```ts
type RegionId = 'hotbar' | 'main' | 'armour' | 'offhand' | 'crafting-grid';
```

### Rgb  `type`

```ts
type Rgb = readonly [number, number, number];
```

### RgbChannels  `type`

```ts
type RgbChannels = readonly [number, number, number];
```

### RootEntry  `type`

```ts
type RootEntry = 'new-world' | 'load-world' | 'settings';
```

### SAVED_VISIBLE_SECS  `const`

```ts
const SAVED_VISIBLE_SECS = 3;
```

### SAVE_MESSAGES  `const`

```ts
const SAVE_MESSAGES: ReadonlyArray<SaveMessage>;
```

### SAVE_STATUS_GLYPH  `const`

```ts
const SAVE_STATUS_GLYPH: Readonly<Record<SaveMessage, string>>;
```

### SAVE_STATUS_LABEL  `const`

```ts
const SAVE_STATUS_LABEL: Readonly<Record<SaveMessage, string>>;
```

### SCRIM  `const`

```ts
const SCRIM: Rgb;
```

### SCRIM_ALPHA  `const`

```ts
const SCRIM_ALPHA = 0.9;
```

### SCRIM_OVER_BRIGHTEST_WORLD  `const`

```ts
const SCRIM_OVER_BRIGHTEST_WORLD: Rgb;
```

### SCRIM_OVER_DARKEST_WORLD  `const`

```ts
const SCRIM_OVER_DARKEST_WORLD: Rgb;
```

### SHANK  `const`

```ts
const SHANK: Rgb;
```

### SLOT_BORDER  `const`

```ts
const SLOT_BORDER: Rgb;
```

### SLOT_FILL  `const`

```ts
const SLOT_FILL: Rgb;
```

### SLOT_FILL_ALPHA  `const`

```ts
const SLOT_FILL_ALPHA = 0.55;
```

### SLOT_SELECTED  `const`

```ts
const SLOT_SELECTED: Rgb;
```

### SLOT_TARGET_MIN_SIZE  `const`

```ts
const SLOT_TARGET_MIN_SIZE = "24px";
```

### STATUS_ALERT  `const`

```ts
const STATUS_ALERT: Rgb;
```

### STATUS_BUSY  `const`

```ts
const STATUS_BUSY: Rgb;
```

### STATUS_OK  `const`

```ts
const STATUS_OK: Rgb;
```

### SURFACE  `const`

```ts
const SURFACE: Rgb;
```

### SURFACE_RAISED  `const`

```ts
const SURFACE_RAISED: Rgb;
```

### SaveIndicator  `type`

```ts
type SaveIndicator = {
    readonly root: DomElement;
    readonly render: (message: SaveMessage | undefined) => void;
};
```

### SaveMessage  `type`

```ts
type SaveMessage = 'saving' | 'saved' | 'failed';
```

### SaveState  `type`

```ts
type SaveState = 'idle' | SaveMessage;
```

### SaveStatus  `type`

```ts
type SaveStatus = {
    readonly state: SaveState;
    readonly sinceSecs: number;
};
```

### SavedWorld  `type`

```ts
type SavedWorld = {
    readonly sessionId: string;
    readonly name: string;
};
```

### ScreenId  `type`

```ts
type ScreenId = 'pause' | 'settings' | 'inventory' | 'crafting' | 'chat' | 'achievements' | 'statistics';
```

### SlotButtonView  `type`

```ts
type SlotButtonView = {
    readonly label: string;
    readonly disabled: boolean;
    readonly tabStop: boolean;
    readonly focused: boolean;
};
```

### SlotElement  `type`

```ts
type SlotElement = {
    readonly root: DomElement;
    readonly hiddenFlag: AttributeCell;
    readonly itemText: TextCell;
    readonly countText: TextCell;
    readonly emptyFlag: AttributeCell;
    readonly mergeableFlag: AttributeCell;
    readonly selectedFlag: AttributeCell;
    readonly borderColor: StyleCell;
    readonly borderWeight: StyleCell;
    readonly durabilityHidden: AttributeCell;
    readonly durabilityWidth: PercentCell;
    readonly durabilityColor: StyleCell;
    readonly tabStop: AttributeCell;
    readonly focusRingHidden: AttributeCell;
    readonly role: AttributeCell;
    readonly ariaLabel: AttributeCell;
    readonly ariaDisabled: AttributeCell;
    readonly ariaLive: AttributeCell;
};
```

### SlotRegion  `type`

```ts
type SlotRegion = {
    readonly kind: 'slots';
    readonly id: RegionId;
    readonly columns: number;
    readonly slots: ReadonlyArray<SlotView>;
} | {
    readonly kind: 'unknown';
    readonly id: RegionId;
    readonly why: string;
};
```

### SlotView  `type`

```ts
type SlotView = {
    readonly index: number;
    readonly itemId: string | undefined;
    readonly countLabel: string | undefined;
    readonly durabilityPercent: number | undefined;
    readonly selected: boolean;
    readonly empty: boolean;
};
```

### StyleCell  `type`

```ts
type StyleCell = {
    readonly style: DomStyle;
    readonly property: string;
    previous: string;
};
```

### TEXT_CONTRAST_MIN  `const`

```ts
const TEXT_CONTRAST_MIN = 4.5;
```

### THIS_PALETTE  `const`

```ts
const THIS_PALETTE: PaletteUnderSurvey;
```

### TextCell  `type`

```ts
type TextCell = {
    readonly element: DomElement;
    previous: string;
};
```

### TokenReading  `type`

```ts
type TokenReading = {
    readonly name: string;
    readonly color: Rgb;
    readonly role: TokenRole;
    readonly on: GuardedToken['on'];
    readonly worstContrast: number;
    readonly floor: number;
    readonly meetsFloor: boolean;
    readonly boundIsExact: boolean;
};
```

### TokenRole  `type`

```ts
type TokenRole = 'text' | 'ui';
```

### UI_CONTRAST_MIN  `const`

```ts
const UI_CONTRAST_MIN = 3;
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
    readonly captionSettings: Ref.Ref<CaptionSettings>;
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

### XP_FILL  `const`

```ts
const XP_FILL: Rgb;
```

### XP_FILL_HIGHLIGHT  `const`

```ts
const XP_FILL_HIGHLIGHT: Rgb;
```

### XP_LEVEL  `const`

```ts
const XP_LEVEL: Rgb;
```

### animationDurationMs  `const`

```ts
const animationDurationMs: (baseMs: number, motion: MotionPreference) => number;
```

### applyCaptionSettings  `const`

```ts
const applyCaptionSettings: (queue: CaptionQueue, settings: CaptionSettings) => CaptionQueue;
```

### applyColorVision  `const`

```ts
const applyColorVision: (cell: ColorVisionCell, mode: ColorVisionMode) => void;
```

### applyColorVisionMatrix  `const`

```ts
const applyColorVisionMatrix: (channels: RgbChannels, matrix: ColorVisionMatrix) => RgbChannels;
```

### attributeCell  `const`

```ts
const attributeCell: (element: DomElement, name: string) => AttributeCell;
```

### backToRoot  `const`

```ts
const backToRoot: (state: MainMenuState) => MainMenuState;
```

### captionLines  `const`

```ts
const captionLines: (queue: CaptionQueue, nowSecs: number, lifetimeSecs?: number) => ReadonlyArray<CaptionLineView>;
```

### clearStyle  `const`

```ts
const clearStyle: (cell: StyleCell) => void;
```

### closeScreen  `const`

```ts
const closeScreen: (stack: ModalStack, screen: ScreenId) => ModalStack;
```

### colorVisionAttribute  `const`

```ts
const colorVisionAttribute: (mode: ColorVisionMode) => string | undefined;
```

### colorVisionCell  `const`

```ts
const colorVisionCell: (target: DomAttributeTarget) => ColorVisionCell;
```

### colorVisionMatrix  `const`

```ts
const colorVisionMatrix: (mode: ColorVisionMode) => ColorVisionMatrix | undefined;
```

### colorVisionMatrixValues  `const`

```ts
const colorVisionMatrixValues: (mode: ColorVisionMode) => string | undefined;
```

### compositeOver  `const`

```ts
const compositeOver: (color: Rgb, alpha: number, backdrop: Rgb) => Rgb;
```

### contrastRatio  `const`

```ts
const contrastRatio: (left: Rgb, right: Rgb) => number;
```

### createCaptionView  `const`

```ts
const createCaptionView: (factory: DomElementFactory, parent: DomElement, motion: MotionPreference) => CaptionView;
```

### createCrosshairView  `const`

```ts
const createCrosshairView: (factory: DomElementFactory, parent: DomElement, motion: MotionPreference) => CrosshairView;
```

### createHudView  `const`

```ts
const createHudView: (factory: DomElementFactory, parent: DomElement, motion: MotionPreference) => HudView;
```

### createIconElement  `const`

```ts
const createIconElement: (factory: DomElementFactory, kind: IconKind) => IconElement;
```

### createInventoryView  `const`

```ts
const createInventoryView: (factory: DomElementFactory, parent: DomElement) => InventoryView;
```

### createLoadingView  `const`

```ts
const createLoadingView: (factory: DomElementFactory, parent: DomElement) => LoadingView;
```

### createMainMenuView  `const`

```ts
const createMainMenuView: (factory: DomElementFactory, parent: DomElement, callbacks?: MainMenuCallbacks) => MainMenuView;
```

### createSaveIndicator  `const`

```ts
const createSaveIndicator: (factory: DomElementFactory, parent: DomElement) => SaveIndicator;
```

### createSlotElement  `const`

```ts
const createSlotElement: (factory: DomElementFactory, index: number) => SlotElement;
```

### crosshairViewModel  `const`

```ts
const crosshairViewModel: (status: CrosshairStatus, nowSecs: number, pulseSecs?: number) => CrosshairViewModel | undefined;
```

### cssColor  `const`

```ts
const cssColor: (color: Rgb, alpha?: number) => string;
```

### cycleGameMode  `const`

```ts
const cycleGameMode: (mode: GameMode) => GameMode;
```

### cycleWorldMode  `const`

```ts
const cycleWorldMode: (state: MainMenuState) => MainMenuState;
```

### declarePalette  `const`

```ts
const declarePalette: (root: DomElement) => void;
```

### emptyCaptionQueue  `const`

```ts
const emptyCaptionQueue: CaptionQueue;
```

### emptyInventorySnapshot  `const`

```ts
const emptyInventorySnapshot: InventorySnapshot;
```

### emptyModalStack  `const`

```ts
const emptyModalStack: ModalStack;
```

### emptyNewWorldDraft  `const`

```ts
const emptyNewWorldDraft: NewWorldDraft;
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

### hex  `const`

```ts
const hex: (color: Rgb) => string;
```

### hideSlotElementAtMount  `const`

```ts
const hideSlotElementAtMount: (slot: SlotElement) => void;
```

### hotbarSlotIndex  `const`

```ts
const hotbarSlotIndex: (value: number) => number;
```

### hudViewModel  `const`

```ts
const hudViewModel: (snapshot: VitalsSnapshot) => HudViewModel;
```

### iconRow  `const`

```ts
const iconRow: (points: number, maxPoints: number) => ReadonlyArray<IconState>;
```

### initialMainMenuState  `const`

```ts
const initialMainMenuState: MainMenuState;
```

### inventoryViewModel  `const`

```ts
const inventoryViewModel: (snapshot: InventorySnapshot) => InventoryViewModel;
```

### loadingScreenView  `const`

```ts
const loadingScreenView: (status: LoadingStatus, nowSecs: number, minimumVisibleSecs?: number) => LoadingScreenView | undefined;
```

### loadingStatus  `const`

```ts
const loadingStatus: (progress: LoadingProgress, atSecs: number) => LoadingStatus;
```

### mainMenuViewModel  `const`

```ts
const mainMenuViewModel: (state: MainMenuState, savedWorlds?: ReadonlyArray<SavedWorld>) => MainMenuViewModel;
```

### makeUiFrameState  `const`

```ts
const makeUiFrameState: Effect.Effect<UiFrameState>;
```

### makeUiStages  `const`

```ts
const makeUiStages: Effect.Effect<ReadonlyArray<StageRegistration>>;
```

### nameWorld  `const`

```ts
const nameWorld: (state: MainMenuState, name: string) => MainMenuState;
```

### openPanel  `const`

```ts
const openPanel: (state: MainMenuState, panel: MenuPanel) => MainMenuState;
```

### openScreen  `const`

```ts
const openScreen: (stack: ModalStack, screen: ScreenId) => ModalStack;
```

### percentCell  `const`

```ts
const percentCell: (element: DomElement, property: string) => PercentCell;
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

### regionOf  `const`

```ts
const regionOf: (model: InventoryViewModel, id: RegionId) => SlotRegion | undefined;
```

### relativeLuminance  `const`

```ts
const relativeLuminance: (color: Rgb) => number;
```

### resolveMotionPreference  `const`

```ts
const resolveMotionPreference: (setting: MotionSetting, systemPrefersReducedMotion: boolean) => MotionPreference;
```

### retireIconElement  `const`

```ts
const retireIconElement: (icon: IconElement) => void;
```

### saveStatus  `const`

```ts
const saveStatus: (state: SaveState, atSecs: number) => SaveStatus;
```

### saveStatusMessage  `const`

```ts
const saveStatusMessage: (status: SaveStatus, nowSecs: number, savedVisibleSecs?: number) => SaveMessage | undefined;
```

### separation  `const`

```ts
const separation: (left: Rgb, right: Rgb) => number;
```

### setSlotButtonView  `const`

```ts
const setSlotButtonView: (slot: SlotElement, view: SlotButtonView | undefined) => void;
```

### setSlotHidden  `const`

```ts
const setSlotHidden: (slot: SlotElement, hidden: boolean) => void;
```

### setSlotKeyboardFocus  `const`

```ts
const setSlotKeyboardFocus: (slot: SlotElement, focused: boolean) => void;
```

### setSlotTabStop  `const`

```ts
const setSlotTabStop: (slot: SlotElement, tabbable: boolean) => void;
```

### shouldAnimate  `const`

```ts
const shouldAnimate: (motion: MotionPreference) => boolean;
```

### simulateColorVision  `const`

```ts
const simulateColorVision: (color: Rgb, mode: ColorVisionMode) => Rgb;
```

### slotSnapshotOf  `const`

```ts
const slotSnapshotOf: (slot: MirroredSlot, durability: number | undefined) => HotbarSlotSnapshot;
```

### slotView  `const`

```ts
const slotView: (slot: HotbarSlotSnapshot | undefined, index: number, selectedIndex: number) => SlotView;
```

### spawnSnapshot  `const`

```ts
const spawnSnapshot: VitalsSnapshot;
```

### styleCell  `const`

```ts
const styleCell: (element: DomElement, property: string) => StyleCell;
```

### surveyPalette  `const`

```ts
const surveyPalette: (palette?: PaletteUnderSurvey) => PaletteSurvey;
```

### textCell  `const`

```ts
const textCell: (element: DomElement) => TextCell;
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

### updateIconElement  `const`

```ts
const updateIconElement: (icon: IconElement, state: IconState) => void;
```

### updateSlotElement  `const`

```ts
const updateSlotElement: (slot: SlotElement, view: SlotView, mergeable: boolean | undefined) => void;
```

### worldNameLabel  `const`

```ts
const worldNameLabel: (draft: NewWorldDraft) => string;
```

### worstCaseContrastOnScrim  `const`

```ts
const worstCaseContrastOnScrim: (color: Rgb) => number;
```

### writeAttribute  `const`

```ts
const writeAttribute: (cell: AttributeCell, value: string | undefined) => void;
```

### writeHidden  `const`

```ts
const writeHidden: (cell: AttributeCell, hidden: boolean) => void;
```

### writePercent  `const`

```ts
const writePercent: (cell: PercentCell, percent: number) => void;
```

### writeStyle  `const`

```ts
const writeStyle: (cell: StyleCell, value: string) => void;
```

### writeText  `const`

```ts
const writeText: (cell: TextCell, text: string) => void;
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
