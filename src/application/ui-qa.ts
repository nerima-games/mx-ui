import {
  QaNamespaceNameSchema,
  QaOperationNameSchema,
  type QaNamespace,
  type QaOperation,
} from '@nerima-games/mc-kernel'
import { Effect, Schema } from 'effect'
import {
  UiQaStateInputSchema,
  UiQaStateSchema,
  uiQaStateFromSnapshot,
  type UiQaSnapshot,
} from '../domain/ui-qa.js'

export const UI_QA_NAMESPACE_NAME: Schema.Schema.Type<typeof QaNamespaceNameSchema> =
  Schema.decodeUnknownSync(QaNamespaceNameSchema)('ui')
export const UI_QA_STATE_OPERATION_NAME: Schema.Schema.Type<typeof QaOperationNameSchema> =
  Schema.decodeUnknownSync(QaOperationNameSchema)('state')

export type UiQaStateOperation = QaOperation<
  typeof UiQaStateInputSchema,
  typeof UiQaStateSchema,
  Schema.SchemaError
>

export type UiQaNamespace = QaNamespace<
  Readonly<{ state: UiQaStateOperation }>,
  Readonly<Record<never, never>>
>

const decodeStrict = <S extends Schema.Codec<unknown>>(
  schema: S,
  input: unknown,
): Effect.Effect<S['Type'], Schema.SchemaError, S['DecodingServices']> =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: 'error' })(input)

export const createUiQaNamespace = (read: () => UiQaSnapshot): UiQaNamespace => {
  const state: UiQaStateOperation = {
    name: UI_QA_STATE_OPERATION_NAME,
    input: UiQaStateInputSchema,
    output: UiQaStateSchema,
    run: (input) =>
      decodeStrict(UiQaStateInputSchema, input).pipe(
        Effect.flatMap(() => Effect.sync(read)),
        Effect.map(uiQaStateFromSnapshot),
        Effect.flatMap((snapshot) => decodeStrict(UiQaStateSchema, snapshot)),
      ),
  }

  return {
    name: UI_QA_NAMESPACE_NAME,
    observe: { state },
    command: {},
  }
}
