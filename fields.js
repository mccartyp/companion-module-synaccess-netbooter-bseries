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

	const f = {
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

	if (min !== undefined) f.min = min
	if (max !== undefined) f.max = max
	if (step !== undefined) f.step = step

	return f
}
export function checkbox(opts) {
	const {
		id,
		label,
		width = 3,
		defaultValue = false,
		required,
		isRequired,
		isVisibleExpression,
		tooltip,
	} = opts

	return {
		type: 'checkbox',
		id,
		label,
		width,
		// Companion expects `default`
		default: Boolean(defaultValue),
		// Companion expects `required`
		required: Boolean(required ?? isRequired),
		tooltip,
		isVisibleExpression,
	}
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
