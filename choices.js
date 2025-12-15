/**
 * Common dropdown choice helpers.
 */

export function outletChoices(portCount) {
	const max = portCount === 2 ? 2 : 5
	const choices = []
	for (let i = 1; i <= max; i++) {
		choices.push({ id: i, label: `Outlet ${i}` })
	}
	return choices
}

export const onOffChoices = [
	{ id: 1, label: 'ON' },
	{ id: 0, label: 'OFF' },
]
