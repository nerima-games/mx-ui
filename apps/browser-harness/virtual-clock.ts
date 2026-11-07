import type { PlaybackSpeed } from './scenario-types'

export const FRAME_SECONDS: number = 1 / 60
export const PLAYBACK_SPEEDS: ReadonlyArray<PlaybackSpeed> = [0.25, 0.5, 1, 2, 4]

export type VirtualClockState = {
  readonly time: number
  readonly playing: boolean
  readonly speed: PlaybackSpeed
}

export type FrameScheduler = {
  readonly requestAnimationFrame: (callback: FrameRequestCallback) => number
  readonly cancelAnimationFrame: (id: number) => void
}

export type VirtualClock = {
  readonly state: () => VirtualClockState
  readonly play: () => void
  readonly pause: () => void
  readonly step: () => void
  readonly setTime: (seconds: number) => void
  readonly setSpeed: (speed: PlaybackSpeed) => void
  readonly reset: () => void
  readonly dispose: () => void
}

export const createVirtualClock = (
  initial: VirtualClockState,
  onChange: (state: VirtualClockState) => void,
  scheduler: FrameScheduler = window,
): VirtualClock => {
  let { time, playing, speed } = initial
  let frameId: number | undefined = undefined
  let previousTimestamp: number | undefined = undefined
  let disposed = false

  const snapshot = (): VirtualClockState => ({ time, playing, speed })
  const publish = (): void => onChange(snapshot())
  const cancelFrame = (): void => {
    if (frameId !== undefined) {
      scheduler.cancelAnimationFrame(frameId)
      frameId = undefined
    }
  }

  const tick: FrameRequestCallback = (timestamp) => {
    frameId = undefined
    if (disposed || !playing) {
      return
    }
    if (previousTimestamp !== undefined && timestamp >= previousTimestamp) {
      time += ((timestamp - previousTimestamp) / 1000) * speed
      publish()
    }
    previousTimestamp = timestamp
    frameId = scheduler.requestAnimationFrame(tick)
  }

  const play = (): void => {
    if (disposed || playing) {
      return
    }
    playing = true
    previousTimestamp = undefined
    publish()
    frameId = scheduler.requestAnimationFrame(tick)
  }

  const pause = (): void => {
    if (disposed || !playing) {
      return
    }
    playing = false
    previousTimestamp = undefined
    cancelFrame()
    publish()
  }

  if (playing) {
    frameId = scheduler.requestAnimationFrame(tick)
  }

  return {
    state: snapshot,
    play,
    pause,
    step: () => {
      if (disposed) {
        return
      }
      playing = false
      previousTimestamp = undefined
      cancelFrame()
      time += FRAME_SECONDS
      publish()
    },
    setTime: (seconds) => {
      if (disposed) {
        return
      }
      time = seconds
      previousTimestamp = undefined
      publish()
    },
    setSpeed: (nextSpeed) => {
      if (disposed) {
        return
      }
      speed = nextSpeed
      publish()
    },
    reset: () => {
      if (disposed) {
        return
      }
      time = 0
      playing = false
      previousTimestamp = undefined
      cancelFrame()
      publish()
    },
    dispose: () => {
      disposed = true
      playing = false
      previousTimestamp = undefined
      cancelFrame()
    },
  }
}
