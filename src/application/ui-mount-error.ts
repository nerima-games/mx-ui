export class UiMountError {
  readonly _tag = 'UiMountError'
  readonly name = 'UiMountError'
  readonly message: string
  readonly cause: unknown

  constructor(message: string, options?: ErrorOptions) {
    this.message = message
    this.cause = options?.cause
  }
}
