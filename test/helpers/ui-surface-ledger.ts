export type UiSurfaceClassification = 'visual' | 'composite' | 'nonvisual'

export interface UiSurfaceLedgerEntry {
  readonly surfaceId: string
  readonly classification: UiSurfaceClassification
  readonly scenarioIds: ReadonlyArray<string>
  readonly hasTimeInput: boolean
  readonly exclusionReason?: string
}

export interface UiSurfaceScenarioExclusion {
  readonly scenarioId: string
  readonly reason: string
}

export type UiSurfaceLedgerIssueCode =
  | 'unclassified-barrel-export'
  | 'ledger-export-not-in-barrel'
  | 'duplicate-ledger-export'
  | 'surface-without-scenario'
  | 'empty-exclusion-reason'
  | 'unknown-scenario'
  | 'unclassified-registry-scenario'

export interface UiSurfaceLedgerIssue {
  readonly code: UiSurfaceLedgerIssueCode
  readonly subject: string
}

export interface UiSurfaceLedgerInput {
  readonly barrelExportNames: ReadonlyArray<string>
  readonly entries: ReadonlyArray<UiSurfaceLedgerEntry>
  readonly registryScenarioIds: ReadonlyArray<string>
  readonly scenarioExclusions: ReadonlyArray<UiSurfaceScenarioExclusion>
}

export const scenarioReference = (screen: string, id: string): string => `${screen}/${id}`

export const validateUiSurfaceLedger = ({
  barrelExportNames,
  entries,
  registryScenarioIds,
  scenarioExclusions,
}: UiSurfaceLedgerInput): ReadonlyArray<UiSurfaceLedgerIssue> => {
  const issues: UiSurfaceLedgerIssue[] = []
  const barrelExports = new Set(barrelExportNames)
  const registryIds = new Set(registryScenarioIds)
  const classifiedExports = new Set<string>()
  const classifiedScenarios = new Set<string>()

  for (const entry of entries) {
    if (classifiedExports.has(entry.surfaceId)) {
      issues.push({ code: 'duplicate-ledger-export', subject: entry.surfaceId })
    }
    classifiedExports.add(entry.surfaceId)

    if (!barrelExports.has(entry.surfaceId)) {
      issues.push({ code: 'ledger-export-not-in-barrel', subject: entry.surfaceId })
    }
    if (
      (entry.classification === 'visual' || entry.classification === 'composite') &&
      entry.scenarioIds.length === 0
    ) {
      issues.push({ code: 'surface-without-scenario', subject: entry.surfaceId })
    }
    if (entry.classification === 'nonvisual' && !entry.exclusionReason?.trim()) {
      issues.push({ code: 'empty-exclusion-reason', subject: entry.surfaceId })
    }

    for (const scenarioId of entry.scenarioIds) {
      classifiedScenarios.add(scenarioId)
      if (!registryIds.has(scenarioId)) {
        issues.push({ code: 'unknown-scenario', subject: scenarioId })
      }
    }
  }

  for (const exportName of barrelExportNames) {
    if (!classifiedExports.has(exportName)) {
      issues.push({ code: 'unclassified-barrel-export', subject: exportName })
    }
  }

  for (const exclusion of scenarioExclusions) {
    classifiedScenarios.add(exclusion.scenarioId)
    if (!exclusion.reason.trim()) {
      issues.push({ code: 'empty-exclusion-reason', subject: exclusion.scenarioId })
    }
    if (!registryIds.has(exclusion.scenarioId)) {
      issues.push({ code: 'unknown-scenario', subject: exclusion.scenarioId })
    }
  }

  for (const scenarioId of registryScenarioIds) {
    if (!classifiedScenarios.has(scenarioId)) {
      issues.push({ code: 'unclassified-registry-scenario', subject: scenarioId })
    }
  }

  return issues
}

const NON_SURFACE_REASON =
  'This export is a model, schema, service, constant, utility, stage, or low-level DOM primitive rather than a standalone user-facing view surface.'

const nonSurfaceExportNames: ReadonlyArray<string> = [
  'ACHIEVEMENT_TOAST_EVENT_SUBSCRIBER_CAPACITY',
  'ANVIL_OPERATION_TARGETS',
  'ANVIL_SLOT_IDS',
  'AchievementToastEventBusLayer',
  'AchievementToastIconSchema',
  'AchievementToastSchema',
  'AchievementToastTitleSchema',
  'CAPTION_DISPLAY_SECS',
  'CAPTION_LIFETIME_SECS',
  'CHEST_STORAGE_COLUMNS',
  'CHEST_STORAGE_ROWS',
  'CHEST_STORAGE_SLOT_COUNT',
  'COLLAPSE_SEPARATION',
  'COLOR_VISION_ATTRIBUTE',
  'COLOR_VISION_CHOICES',
  'COLOR_VISION_FILTER_COLOR_SPACE',
  'COLOR_VISION_FILTER_TARGET',
  'ColorVisionMatrixValuesSchema',
  'COLOR_VISION_MODES',
  'CRITICAL_PAIRS',
  'CROSSHAIR_ARM_HIT_WEIGHT',
  'CROSSHAIR_ARM_WEIGHT',
  'CROSSHAIR_BREAK_PROGRESS_LABEL',
  'CROSSHAIR_HALO_WIDTH',
  'CROSSHAIR_PULSE_SCALE',
  'CROSSHAIR_PULSE_SECS',
  'CROSSHAIR_SIZE',
  'DEFAULT_DEBUG_HUD_SNAPSHOT',
  'DEFAULT_MAX_HEALTH_POINTS',
  'DEFAULT_MAX_HUNGER_POINTS',
  'DEFAULT_UI_SETTINGS',
  'DEFAULT_WORLD_NAME',
  'DIFFICULTY_CHOICES',
  'DURABILITY_HIGH',
  'DURABILITY_LOW',
  'DURABILITY_LOW_PERCENT',
  'EMPTY_SAVE_LIST_NOTE',
  'ENCHANTING_OFFER_IDS',
  'ENCHANTING_OPERATION_TARGETS',
  'ENCHANTING_SLOT_IDS',
  'ENDER_DRAGON_DEFAULT_NAME',
  'EQUIPMENT_SLOT_IDS',
  'EXPERIENCE_MODULE_STAGE_PREFIXES',
  'EXPERIENCE_TRANSITION_MS',
  'FOCUS_RING',
  'FOCUS_RING_SHADOW',
  'FOCUS_RING_SHADOW_WIDTH',
  'FOCUS_RING_WIDTH',
  'FPS_SAMPLE_WINDOW_SECS',
  'FURNACE_SLOT_IDS',
  'FramesPerSecondSchema',
  'GAME_MODES',
  'GAME_MODE_LABEL',
  'GRAPHICS_PRESET_CHOICES',
  'GUARDED_TOKENS',
  'GpuTimeMillisecondsSchema',
  'HEALTH_POINTS_PER_HEART',
  'HEART',
  'HOTBAR_SLOT_COUNT',
  'HudPresentationSnapshotSchema',
  'ICON_EMPTY',
  'ICON_ROW_LABEL',
  'IDLE_CROSSHAIR_STATUS',
  'IDLE_LOADING_STATUS',
  'IDLE_SAVE_STATUS',
  'INK',
  'INK_FAINT',
  'INK_MUTED',
  'INVENTORY_MAIN_COLUMNS',
  'INVENTORY_MAIN_ROWS',
  'INVENTORY_MAIN_SLOT_COUNT',
  'INVENTORY_SLOT_COUNT',
  'KNOWN_NEAR_COLLISIONS',
  'LOADING_DETAIL',
  'LOADING_KICKER',
  'LOADING_LABEL',
  'LOADING_MINIMUM_VISIBLE_SECS',
  'LOADING_STATES',
  'MAIN_MENU_TITLE',
  'MAX_VISIBLE_CAPTIONS',
  'MENU_ACTION_LABEL',
  'MENU_FIELD_LABEL',
  'MENU_PANELS',
  'MENU_PANEL_LABEL',
  'METER_TRACK',
  'NO_SAVE_LIST_NOTE',
  'OWN_STAGE_PREFIX',
  'PALETTE_PROPERTY',
  'PALETTE_PROPERTY_PREFIX',
  'PALETTE_SOURCE',
  'PALETTE_TOKEN_NAMES',
  'PALETTE_VALUE',
  'PALETTE_VAR',
  'PAUSE_MENU_ACTION_LABEL',
  'PORTAL_EYE_SLOT_COUNT',
  'REBIND_CLEAR_KEYS',
  'REDUCED_MOTION_CHOICES',
  'ROOT_ENTRIES',
  'ROOT_ENTRY_LABEL',
  'SAVED_VISIBLE_SECS',
  'SAVE_AND_QUIT_TO_TITLE_INTENT',
  'SAVE_MESSAGES',
  'SAVE_STATUS_GLYPH',
  'SAVE_STATUS_LABEL',
  'SCRIM',
  'SCRIM_ALPHA',
  'SCRIM_OVER_BRIGHTEST_WORLD',
  'SCRIM_OVER_DARKEST_WORLD',
  'SHANK',
  'SLOT_BORDER',
  'SLOT_FILL',
  'SLOT_FILL_ALPHA',
  'SLOT_SELECTED',
  'SLOT_TARGET_MIN_SIZE',
  'STATUS_ALERT',
  'STATUS_BUSY',
  'STATUS_OK',
  'SURFACE',
  'SURFACE_RAISED',
  'SelectedHotbarSlotSchema',
  'TEXT_CONTRAST_MIN',
  'THIS_PALETTE',
  'TradeSnapshotSchema',
  'UI_CONTRAST_MIN',
  'UI_QA_NAMESPACE_NAME',
  'UI_QA_STATE_OPERATION_NAME',
  'UI_STAGE_IDS',
  'UPSTREAM_STAGE_IDS',
  'UiMountError',
  'UiQaStateInputSchema',
  'UiQaStateSchema',
  'XP_FILL',
  'XP_FILL_HIGHLIGHT',
  'XP_LEVEL',
  'achievementToastFromEvent',
  'advanceFpsCounter',
  'animationDurationMs',
  'anvilViewModel',
  'applyColorVision',
  'applyColorVisionMatrix',
  'attributeCell',
  'backToRoot',
  'bossHealthBarViewModel',
  'brewingViewModel',
  'captionLines',
  'chestStorageCloseIntent',
  'chestStorageSlotClickIntent',
  'chestStorageViewModel',
  'clearStyle',
  'closePauseSettings',
  'closeScreen',
  'colorVisionAttribute',
  'colorVisionCell',
  'colorVisionMatrix',
  'colorVisionMatrixValues',
  'compositeOver',
  'contrastRatio',
  'createIconElement',
  'createSessionHref',
  'createSlotElement',
  'createUiQaNamespace',
  'createUniqueSessionId',
  'crosshairViewModel',
  'cssColor',
  'declarePalette',
  'cycleGameMode',
  'cycleWorldMode',
  'debugOverlayModel',
  'decodeTradeSnapshot',
  'dragonDefeatPresentationKey',
  'dragonDefeatRewardNotification',
  'emptyFpsCounter',
  'emptyInventorySnapshot',
  'emptyModalStack',
  'emptyNewWorldDraft',
  'enchantingOffers',
  'enchantingTableSnapshotOf',
  'enchantingTableViewModel',
  'escapePauseMenu',
  'escapePressed',
  'furnaceController',
  'furnaceSnapshotOf',
  'furnaceViewModel',
  'gameplayInputSuppressed',
  'hex',
  'hideSlotElementAtMount',
  'hotbarSlotIndex',
  'hudViewModel',
  'iconRow',
  'initialMainMenuState',
  'inventoryActionStatus',
  'inventoryActionTarget',
  'inventoryFocusTargetForElement',
  'inventoryTargetAt',
  'inventoryTargets',
  'inventoryViewModel',
  'loadingScreenView',
  'loadingStatus',
  'mainMenuViewModel',
  'makeUiFrameState',
  'makeUiMount',
  'makeUiStages',
  'moveInventoryTarget',
  'nameWorld',
  'onboardingViewModel',
  'openPanel',
  'openPauseSettings',
  'openScreen',
  'pauseMenuViewModel',
  'percentCell',
  'pointerLockReleased',
  'portalEyeProgressViewModel',
  'rebind',
  'rebindSettingsKey',
  'regionOf',
  'relativeLuminance',
  'requireRootButton',
  'resetSettings',
  'resolveMotionPreference',
  'restoreSettings',
  'resumePauseMenu',
  'retireIconElement',
  'sameInventoryTarget',
  'saveStatus',
  'saveStatusMessage',
  'separation',
  'sessionHref',
  'setSlotButtonView',
  'setSlotHidden',
  'setSlotKeyboardFocus',
  'setSlotTabStop',
  'settingsCandidate',
  'settingsViewModel',
  'shouldAnimate',
  'simulateColorVision',
  'slotSnapshotOf',
  'slotView',
  'spawnSnapshot',
  'startAchievementToastSubscriber',
  'strongholdLocatorViewModel',
  'styleCell',
  'surveyPalette',
  'textCell',
  'topOf',
  'tradeViewModel',
  'uiModule',
  'uiQaStateFromSnapshot',
  'uiStages',
  'unbindSettingsKey',
  'unboundActions',
  'updateIconElement',
  'updateSettings',
  'updateSlotElement',
  'worldNameLabel',
  'worstCaseContrastOnScrim',
  'writeAttribute',
  'writeHidden',
  'writePercent',
  'writeStyle',
  'writeText',
  'ACHIEVEMENT_TITLES',
  'DEFAULT_UI_LANGUAGE',
  'GAME_FONT_FAMILY',
  'GAME_FONT_STACK',
  'GAME_FONT_STYLESHEET_EXPORT',
  'ICON_ROW_MESSAGE_KEY',
  'ItemDisplayNameSchema',
  'MotionSettingSchema',
  'REDUCED_MOTION_MEDIA_QUERY',
  'UI_LANGUAGES',
  'UiMessageTextSchema',
  'UI_MESSAGES',
  'UI_SCALE_MAX',
  'UI_SCALE_MIN',
  'UI_SCALE_PROPERTY',
  'UI_TRANSLATION_KEY_COUNT',
  'ColorVisionModeSchema',
  'UiLanguageSchema',
  'UiScaleSchema',
  'applyUiLanguage',
  'applyUiScale',
  'colorVisionCorrectionMatrixValues',
  'createColorVisionFilterController',
  'createMotionPreferenceController',
  'decodeColorVisionMode',
  'decodeMotionSetting',
  'decodeUiLanguage',
  'decodeUiScale',
  'focusTargetForElement',
  'hudPresentationView',
  'inputActionMessageKey',
  'itemDisplayNameView',
  'moveFocusTarget',
  'resolveItemDisplayName',
  'translateAchievementTitle',
  'translateUiMessage',
]

const nonSurfaceEntries: ReadonlyArray<UiSurfaceLedgerEntry> = nonSurfaceExportNames.map(
  (surfaceId) => ({
    surfaceId,
    classification: 'nonvisual' as const,
    scenarioIds: [],
    hasTimeInput: false,
    exclusionReason: NON_SURFACE_REASON,
  }),
)

// A true time input means that virtual time changes the mounted scenario's rendered input.
// For achievement toasts, the harness selects the sequence state; the production view has no timer.
const surfaceEntries: ReadonlyArray<UiSurfaceLedgerEntry> = [
  {
    surfaceId: 'createAchievementToastView',
    classification: 'visual',
    scenarioIds: [
      'hud/achievement-toast-unlocked',
      'hud/achievement-toast-sequence',
      'hud/achievement-toast-long-title',
    ],
    hasTimeInput: true,
  },
  {
    surfaceId: 'createAnvilView',
    classification: 'visual',
    scenarioIds: [
      'anvil/empty',
      'anvil/repairable',
      'anvil/rename',
      'anvil/one-character-rename',
      'anvil/name-text-boundaries',
      'anvil/output-ready',
      'anvil/rejected-too-expensive',
      'anvil/negative-cost-normalized',
      'anvil/large-stack-count',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createBrewingView',
    classification: 'visual',
    scenarioIds: [
      'brewing/empty',
      'brewing/ready',
      'brewing/in-progress',
      'brewing/completed-output',
      'brewing/no-fuel',
      'brewing/one-bottle',
      'brewing/three-bottles',
      'brewing/max-fuel-and-stack',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createCaptionView',
    classification: 'visual',
    scenarioIds: [
      'captions/default',
      'captions/captions-zero-rows',
      'captions/captions-multiple-pan',
      'captions/captions-unavailable',
      'captions/captions-expiry-boundary',
      'captions/captions-string-boundaries',
      'captions/captions-density-six',
      'captions/captions-density-fifty',
    ],
    hasTimeInput: true,
  },
  {
    surfaceId: 'createChestStorageView',
    classification: 'visual',
    scenarioIds: [
      'chest-storage/empty',
      'chest-storage/populated-regions',
      'chest-storage/full',
      'chest-storage/cursor-holds-item',
      'chest-storage/stack-count-boundaries',
      'chest-storage/slot-capacity-boundary',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createCrosshairView',
    classification: 'visual',
    scenarioIds: [
      'crosshair/default',
      'crosshair/crosshair-idle',
      'crosshair/crosshair-hit-window',
      'crosshair/crosshair-progress-range',
      'crosshair/crosshair-progress-normalization',
    ],
    hasTimeInput: true,
  },
  {
    surfaceId: 'createDebugOverlayView',
    classification: 'visual',
    scenarioIds: [
      'hud/debug-hud-all-values',
      'hud/debug-hud-unavailable-values',
      'hud/debug-hud-finite-extremes',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createEnchantingTableView',
    classification: 'visual',
    scenarioIds: [
      'enchanting-table/empty',
      'enchanting-table/three-offers',
      'enchanting-table/lapis-rejection-message',
      'enchanting-table/experience-rejection-message',
      'enchanting-table/cost-normalization',
      'enchanting-table/stack-count-boundaries',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createFurnaceView',
    classification: 'visual',
    scenarioIds: [
      'furnace/empty',
      'furnace/fuel-only',
      'furnace/input-ready',
      'furnace/insufficient-fuel',
      'furnace/in-progress',
      'furnace/output-ready',
      'furnace/progress-clamped',
      'furnace/non-finite-progress',
      'furnace/stack-count-boundaries',
      'furnace/zero-stack-count',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createHudView',
    classification: 'visual',
    scenarioIds: [
      'hud/default',
      'hud/hud-death-respawn',
      'hud/hud-zero-health',
      'hud/hud-half-heart-low-hunger',
      'hud/hud-full-selected-hotbar',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createInventoryView',
    classification: 'visual',
    scenarioIds: [
      'inventory/default',
      'inventory/regions-known',
      'inventory/crafting-match',
      'inventory/crafting-no-match',
      'inventory/crafting-unknown',
      'inventory/unknown-region',
      'inventory/cursor-stack',
      'inventory/stack-zero-empty',
      'inventory/stack-one',
      'inventory/stack-64',
      'inventory/stack-99',
      'inventory/stack-100-rejected',
      'inventory/accessibility-name-role-state',
      'inventory/mc-sim-roundtrip',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createLoadingView',
    classification: 'visual',
    scenarioIds: [
      'loading/default',
      'loading/loading-preparing',
      'loading/loading-ready-floor',
      'loading/loading-failed-short',
      'loading/loading-failed-empty-reason',
      'loading/loading-failed-long-unicode-reason',
    ],
    hasTimeInput: true,
  },
  {
    surfaceId: 'createMainMenuView',
    classification: 'visual',
    scenarioIds: [
      'main-menu/default',
      'main-menu/root-panel',
      'main-menu/new-world-survival',
      'main-menu/new-world-creative',
      'main-menu/new-world-long-name',
      'main-menu/load-world-empty',
      'main-menu/load-world-one',
      'main-menu/load-world-200',
      'main-menu/load-world-name-boundaries',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createOnboardingView',
    classification: 'visual',
    scenarioIds: ['onboarding/open', 'onboarding/closed'],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createPauseMenuView',
    classification: 'visual',
    scenarioIds: [
      'pause/paused',
      'session-overlays/pause-only',
      'session-overlays/pause-settings-stack',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createSaveIndicator',
    classification: 'visual',
    scenarioIds: [
      'save-indicator/default',
      'save-indicator/save-idle',
      'save-indicator/save-saving-elapsed',
      'save-indicator/save-saved-expiry',
      'save-indicator/save-failed-elapsed',
    ],
    hasTimeInput: true,
  },
  {
    surfaceId: 'createSessionOverlays',
    classification: 'composite',
    scenarioIds: [
      'session-overlays/factory-none-open',
      'session-overlays/factory-settings-open',
      'session-overlays/factory-debug-hud-open',
      'session-overlays/factory-settings-debug-open',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createSettingsView',
    classification: 'visual',
    scenarioIds: [
      'settings/valid-boundaries',
    ],
    hasTimeInput: false,
  },
  {
    surfaceId: 'createTradeView',
    classification: 'visual',
    scenarioIds: [
      'trade/no-offers',
      'trade/available',
      'trade/unavailable',
      'trade/different-profession',
      'trade/out-of-stock',
      'trade/multiple-offers',
      'trade/quantity-boundaries',
      'trade/status-text-boundaries',
    ],
    hasTimeInput: false,
  },
]

export const UI_SURFACE_LEDGER_ENTRIES: ReadonlyArray<UiSurfaceLedgerEntry> = [
  ...surfaceEntries,
  ...nonSurfaceEntries,
]

export const UI_SURFACE_SCENARIO_EXCLUSIONS: ReadonlyArray<UiSurfaceScenarioExclusion> = [
  {
    scenarioId: 'hud/end-hud-inspector',
    reason:
      'The browser-harness derived-data table is diagnostic output, not a public application view factory or in-game UI surface.',
  },
  ...[
    'hud/hud-vitals-decode-failure',
    'hud/hud-hotbar-decode-failure',
    'hud/debug-hud-decode-failure',
    'hud/achievement-toast-decode-missing-icon',
    'captions/captions-boundary-decode-failure',
    'settings/invalid-nan-fov',
    'settings/invalid-high-fov',
  ].map((scenarioId) => ({
    scenarioId,
    reason:
      'This scenario tests rejected input or schema handling by rendering a harness diagnostic alert without invoking the public view factory.',
  })),
]

