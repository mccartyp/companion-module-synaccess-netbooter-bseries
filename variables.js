// variables.js
// Variable definitions + updates for Synaccess netBooter B Series

/**
 * Set/clear last error text and keep the variable in sync.
 * @param {import('@companion-module/base').InstanceBase & { lastError?: string }} instance
 * @param {string} msg
 */
export function setLastError(instance, msg) {
	instance.lastError = msg || ''
	// Keep the variable updated if definitions are already set
	try {
		instance.setVariableValues({ last_error: instance.lastError })
	} catch {
		// ignore if variable defs not yet established
	}
}

/**
 * Define the module variables based on the detected port count, and push current values.
 * @param {import('@companion-module/base').InstanceBase & {
 *   portCount: number,
 *   outletState: boolean[],
 *   currentAmps?: number,
 *   tempC?: number
 *   lastError?: string
 * }} instance
 */
export function initVariables(instance) {
	const variables = [
		{ variableId: 'port_count', name: 'Number of outlets (2 or 5)' },
		{ variableId: 'outlets_bits', name: 'Outlet states in outlet order (1..N), e.g. 10100' },
		{ variableId: 'current_amps', name: 'Current draw (amps), if provided by device' },
		{ variableId: 'temp_c', name: 'Temperature (C), if provided by device' },
		{ variableId: 'last_error', name: 'Last error message (empty when OK)' },
	]

	for (let i = 1; i <= instance.portCount; i++) {
		variables.push({ variableId: `outlet_${i}`, name: `Outlet ${i} state (1=ON,0=OFF)` })
	}

	instance.setVariableDefinitions(variables)
	updateVariablesFromState(instance)
}

/**
 * Push variable values derived from current cached state.
 * @param {import('@companion-module/base').InstanceBase & {
 *   portCount: number,
 *   outletState: boolean[],
 *   currentAmps?: number,
 *   tempC?: number
 *   lastError?: string
 * }} instance
 */
export function updateVariablesFromState(instance) {
	const vars = {}

	vars['port_count'] = String(instance.portCount)
	vars['outlets_bits'] = (instance.outletState || []).map((v) => (v ? '1' : '0')).join('')
	vars['last_error'] = String(instance.lastError || '')

	for (let i = 1; i <= instance.portCount; i++) {
		vars[`outlet_${i}`] = instance.outletState?.[i - 1] ? '1' : '0'
	}

	// Optional DU-series fields (best effort)
	if (instance.currentAmps !== undefined) vars['current_amps'] = String(instance.currentAmps)
	if (instance.tempC !== undefined) vars['temp_c'] = String(instance.tempC)

	instance.setVariableValues(vars)
}
