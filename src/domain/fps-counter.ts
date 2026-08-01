export const FPS_SAMPLE_WINDOW_SECS = 1
const FRAME_INCREMENT = 1
const ZERO = 0

export type FpsCounter = {
  readonly elapsedSecs: number
  readonly frameCount: number
  readonly fps: number
}

export const emptyFpsCounter: FpsCounter = {
  elapsedSecs: ZERO,
  fps: ZERO,
  frameCount: ZERO,
}

export const advanceFpsCounter = (
  counter: FpsCounter,
  dtSecs: number,
  sampleWindowSecs = FPS_SAMPLE_WINDOW_SECS,
): FpsCounter => {
  if (
    !Number.isFinite(dtSecs) ||
    dtSecs <= ZERO ||
    !Number.isFinite(sampleWindowSecs) ||
    sampleWindowSecs <= ZERO
  ) {
    return counter
  }

  const elapsedSecs = counter.elapsedSecs + dtSecs
  const frameCount = counter.frameCount + FRAME_INCREMENT
  if (elapsedSecs < sampleWindowSecs) {
    return { ...counter, elapsedSecs, frameCount }
  }

  return {
    elapsedSecs: ZERO,
    fps: frameCount / elapsedSecs,
    frameCount: ZERO,
  }
}
