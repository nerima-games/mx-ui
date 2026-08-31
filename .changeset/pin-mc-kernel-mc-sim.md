---
"@nerima-games/mx-ui": patch
---

Pin @nerima-games/mc-kernel to 0.7.0 and @nerima-games/mc-sim to 0.4.1 (org toolchain pin set). No source changes were required: this repository's entire mc-kernel/mc-sim surface (`StageId`, `DeltaTimeSecs`, `GameModule`, `StageRegistration`, `FrameServices`-adjacent clock exports, and mc-sim's `Inventory`/`Slot`/`ItemStack`/`itemStack`/`INVENTORY_SLOT_COUNT`) is unchanged in shape across the jump, and every item id this repository names (`stone`, `stick`, `torch`, `coal`, `diamond`, `diamond_pickaxe`, `iron_helmet`, `iron_boots`, `shield`, `oak_planks`, `cobblestone`, `bread`) still resolves against kernel's current `ItemType` roster.
