---
'@nerima-games/mx-ui': minor
---

Display host-supplied chunk coordinates, biome values, loaded chunk counts, and fault counts in the debug overlay and UI QA observations. Require all four snapshot keys, using mc-kernel's ChunkAxis and BiomeType plus the new LoadedChunkCount and FaultCount brands. Their counter schemas accept nonnegative safe integers. Pass undefined for unavailable snapshot values; the model and QA output always include both counters and preserve zero.
