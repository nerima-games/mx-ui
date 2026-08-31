---
"@nerima-games/mx-ui": minor
---

Add a listener-free settings screen projection (`createSettingsView`, `settingsViewModel`) lowered from mc-compose's `apps/web/settings-view.ts`, and the main menu's session-link builders (`sessionHref`, `createSessionHref`, `createUniqueSessionId`) lowered from `apps/web/session-navigation.ts`. The settings value rules and the Title⇄InGame session-lifecycle decision stay outside this repository — see the new modules' headers.
