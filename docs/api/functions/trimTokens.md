[@ai16z/eliza v0.1.5-alpha.5](../index.md) / trimTokens

# Function: trimTokens()

> **trimTokens**(`context`, `maxTokens`, `model`): `string`

Truncate the context to the maximum length allowed by the model.

## Parameters

• **context**: `string`

The text to truncate

• **maxTokens**: `number`

Maximum number of tokens to keep

• **model**: `TiktokenModel`

The tokenizer model to use

## Returns

`string`

The truncated text

## Defined in

[packages/core/src/generation.ts:455](https://github.com/agent-miraya/Miraya-7f/blob/main/packages/core/src/generation.ts#L455)
