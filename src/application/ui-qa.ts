import { Effect, Schema } from 'effect'
import {
  type QaNamespace,
  QaNamespaceNameSchema,
  type QaOperation,
  QaOperationNameSchema,
} from '@nerima-games/mc-kernel'
import {
  type UiQaSnapshot,
  type UiQaState,
  UiQaStateInputSchema,
  UiQaStateSchema,
  uiQaStateFromSnapshot,
} from '../domain/ui-qa.js'

export const UI_QA_NAMESPACE_NAME: Schema.Schema.Type<typeof QaNamespaceNameSchema> =
  Schema.decodeUnknownSync(QaNamespaceNameSchema)('ui')
export const UI_QA_STATE_OPERATION_NAME: Schema.Schema.Type<typeof QaOperationNameSchema> =
  Schema.decodeUnknownSync(QaOperationNameSchema)('state')

export type UiQaStateOperation = QaOperation<
  typeof UiQaStateInputSchema,
  typeof UiQaStateSchema,
  Schema.SchemaError | UiQaSnapshotFailure
>

type UiQaSnapshotFailure = Readonly<{ readonly _tag: 'InvalidUiQaSnapshot'; readonly field: string }>

const decodeStrict = <CodecType extends Schema.Codec<unknown>>(
  schema: CodecType,
  input: unknown,
): Effect.Effect<CodecType['Type'], Schema.SchemaError, CodecType['DecodingServices']> =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: 'error' })(input)

const projectUiQaSnapshot = (
  snapshot: unknown,
): Effect.Effect<UiQaState, Schema.SchemaError | UiQaSnapshotFailure> => {
  const projection = uiQaStateFromSnapshot(snapshot)
  if ('failure' in projection) {
    return Effect.fail({ _tag: 'InvalidUiQaSnapshot', field: projection.failure.field })
  }
  return decodeStrict(UiQaStateSchema, projection)
}

export type UiQaNamespace = QaNamespace<
  Readonly<{ state: UiQaStateOperation }>,
  Readonly<Record<never, never>>
>

export const createUiQaNamespace = (read: () => UiQaSnapshot): UiQaNamespace => {
  const state: UiQaStateOperation = {
    input: UiQaStateInputSchema,
    name: UI_QA_STATE_OPERATION_NAME,
    output: UiQaStateSchema,
    run: (input) =>
      decodeStrict(UiQaStateInputSchema, input).pipe(
        Effect.flatMap(() => Effect.sync(read)),
        Effect.flatMap(projectUiQaSnapshot),
      ),
  }

  return {
    command: {},
    name: UI_QA_NAMESPACE_NAME,
    observe: { state },
  }
}
