---
---

No release: the change is confined to `scripts/verify-package.mjs`, which
`package.json#files` does not ship. Consumers receive identical bytes. The
package check gained a probe over the packed styling exports, so this
strengthens what a release is verified against without altering one.
