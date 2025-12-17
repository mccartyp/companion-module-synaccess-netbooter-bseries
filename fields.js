/**
 * Common field helpers for this module.
 * Keep these small and predictable so config.js stays clean.
 */

export function textInput(opts) {
	const {
		id,
		label,
		width,
		defaultValue,
		isRequired,
		required,
		tooltip,
		placeholder,
		isVisibleExpression,
		regex,
	} = opts

	return {
		type: 'textinput',
		id,
		label,
		width,
		// Companion expects `default`
		default: defaultValue ?? '',
		// Companion expects `required`
		required: Boolean(required ?? isRequired),
		tooltip,
		placeholder,
		isVisibleExpression,
		regex,
	}
}

export function numberInput(opts) {
	const {
		id,
		label,
		width = 6,
		defaultValue = 0,
		min,
		max,
		step,
		required,
		isRequired,
		isVisibleExpression,
		tooltip,
	} = opts

	const field = {
		type: 'number',
		id,
		label,
		width,
		// Companion expects `default`
		default: defaultValue,
		// Companion expects `required`
		required: Boolean(required ?? isRequired),
		tooltip,
		isVisibleExpression,
	}

	if (min !== undefined) field.min = min
	if (max !== undefined) field.max = max
	if (step !== undefined) field.step = step

	return field
}

export function staticText({
	id,
	label,
	width = 12,
	value,
}) {
	return {
		type: 'static-text',
		id,
		label,
		width,
		value,
	}
}
