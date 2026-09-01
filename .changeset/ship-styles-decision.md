---
"@nerima-games/mx-ui": patch
---

Record the styling/asset shipping decision in `docs/versioning.md` §4: mx-ui ships no external
stylesheet, font, or image asset — palette colours and layout are custom properties and inline
styles written by the JS the package already exports (`declarePalette`, `application/*.ts`), icons
are Unicode glyphs, and the DN-UI-1a colour-vision filter ships as plain matrix values while its
`<defs>` block and CSS scoping stay the host's asset, matching the reference split. `files` and
`exports` need no addition; the previous "undecided" note predated the implementation that settled
it. No source or public API changed.
