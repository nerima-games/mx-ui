import { Effect, Schema } from 'effect'
import {
  type QaNamespace,
  QaNamespaceNameSchema,
  type QaOperation,
  QaOperationNameSchema,
} from '@nerima-games/mc-kernel'
import {
  type UiQaSnapshot,
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
  Schema.SchemaError
>

export type UiQaNamespace = QaNamespace<
  Readonly<{ state: UiQaStateOperation }>,
  Readonly<Record<never, never>>
>

const decodeStrict = <CodecType extends Schema.Codec<unknown>>(
  schema: CodecType,
  input: unknown,
): Effect.Effect<CodecType['Type'], Schema.SchemaError, CodecType['DecodingServices']> =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: 'error' })(input)

export const createUiQaNamespace = (read: () => UiQaSnapshot): UiQaNamespace => {
  const state: UiQaStateOperation = {
    input: UiQaStateInputSchema,
    name: UI_QA_STATE_OPERATION_NAME,
    output: UiQaStateSchema,
    run: (input) =>
      decodeStrict(UiQaStateInputSchema, input).pipe(
        Effect.flatMap(() => Effect.sync(read)),
        Effect.map(uiQaStateFromSnapshot),
        Effect.flatMap((snapshot) => decodeStrict(UiQaStateSchema, snapshot)),
      ),
  }

  return {
    command: {},
    name: UI_QA_NAMESPACE_NAME,
    observe: { state },
  }
}
