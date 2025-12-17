/**
 * actions.js
 *
 * Companion action definitions for the Synaccess netBooter B Series module.
 * Exposes button/command callbacks that translate user intent into device
 * HTTP commands, with validation and logging for maintainability.
 */
import { outletChoices, onOffChoices } from './choices.js'
import { assertValidOutlet, assertActionOk } from './utils.js'
/** @typedef {import('./main.js').SynaccessNetBooterBSeriesInstance} SynaccessNetBooterBSeriesInstance */

/**
 * Build action definitions using the provided module instance context.
 * @param {SynaccessNetBooterBSeriesInstance} instance
 */
export function getActionDefinitions(instance) {
	return {
		set_outlet: {
			name: 'Set Outlet Power',
			description: 'Explicitly set a single outlet ON or OFF',
			options: [
				{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outletChoices(instance.portCount) },
				{ type: 'dropdown', id: 'state', label: 'State', default: 1, choices: onOffChoices },
			],
			callback: async (action) => {
				const outlet = Number(action.options.outlet)
				const state = Number(action.options.state)
				assertValidOutlet(outlet, instance.portCount)

				instance.log('info', `Action: set outlet ${outlet} -> ${state === 1 ? 'ON' : 'OFF'}`)

				try {
					const resp = await instance.http.get(`$A3 ${outlet} ${state}`)
					assertActionOk(resp, 'Set Outlet')
				} catch (e) {
					instance.log('error', `Set outlet ${outlet} failed: ${e?.message || e}`)
					throw e
				}

				instance._needsStatusRefresh = true
			},
		},

		toggle_outlet: {
			name: 'Toggle Outlet Power',
			description: 'Toggle a single outlet based on its current state',
			options: [{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outletChoices(instance.portCount) }],
			callback: async (action) => {
				const outlet = Number(action.options.outlet)
				assertValidOutlet(outlet, instance.portCount)

				const cur = instance.outletState?.[outlet - 1] ? 1 : 0
				const next = cur ? 0 : 1

				instance.log('info', `Action: toggle outlet ${outlet} (${cur ? 'ON' : 'OFF'} -> ${next ? 'ON' : 'OFF'})`)

				try {
					const resp = await instance.http.get(`$A3 ${outlet} ${next}`)
					assertActionOk(resp, 'Toggle Outlet')
				} catch (e) {
					instance.log('error', `Toggle outlet ${outlet} failed: ${e?.message || e}`)
					throw e
				}

				instance._needsStatusRefresh = true
			},
		},

		reboot_outlet: {
			name: 'Reboot Outlet with Delay',
			description: 'Power-cycle a single outlet with a programmable OFF/ON delay',
			options: [
				{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outletChoices(instance.portCount) },
				{ type: 'number', id: 'delayMs', label: 'Reboot delay (ms)', default: 5000, min: 500, max: 60000, step: 500 },
			],
			callback: async (action) => {
				const outlet = Number(action.options.outlet)
				const rawDelay = Number(action.options.delayMs)
				const delayMs = Number.isFinite(rawDelay) && rawDelay >= 0 ? rawDelay : 5000

				assertValidOutlet(outlet, instance.portCount)

				if (!instance._lockReboot(outlet)) {
					instance.log('warn', `Reboot already in progress for outlet ${outlet}; ignoring request`)
					return
				}

				instance._rebootInProgress++

				// Capture config now (avoid changes mid-flight)
				const rawRebootTimeout = Number(instance.config.rebootTimeoutMs)
				const rebootTimeoutMs = Number.isFinite(rawRebootTimeout) && rawRebootTimeout >= 250 ? rawRebootTimeout : 30000
				instance.log('info', `Action: reboot outlet ${outlet} with delay ${delayMs}ms and timeout ${rebootTimeoutMs}ms`)

				try {
					// OFF (this is the only awaited part)
					assertActionOk(await instance.http.get(`$A3 ${outlet} 0`, { timeoutMs: rebootTimeoutMs }), 'Reboot OFF')

					// Keep feedbacks responsive while polling is paused during reboot
					if (Array.isArray(instance.outletState) && outlet >= 1 && outlet <= instance.portCount) {
						instance.outletState[outlet - 1] = false
						instance.checkFeedbacks('outlet_on', 'outlet_off')
					}
				} catch (e) {
					instance.log('error', `Reboot OFF failed for outlet ${outlet}: ${e?.message || e}`)
					instance._rebootInProgress--
					instance._unlockReboot(outlet)
					throw e
				}

				// IMPORTANT: do NOT await the long delay in the action callback
				setTimeout(async () => {
					try {
						// Fresh socket for ON leg after long delay
						instance.http.resetAgent()
						// small settle delay helps some embedded stacks
						await new Promise((r) => setTimeout(r, 25))

						assertActionOk(await instance.http.get(`$A3 ${outlet} 1`, { timeoutMs: rebootTimeoutMs }), 'Reboot ON')
						if (Array.isArray(instance.outletState) && outlet >= 1 && outlet <= instance.portCount) {
							instance.outletState[outlet - 1] = true
							instance.checkFeedbacks('outlet_on', 'outlet_off')
						}
						instance._needsStatusRefresh = true
					} catch (e) {
						instance.log('error', `Reboot ON failed for outlet ${outlet}: ${e?.message || e}`)
						// recover the agent on failure
						instance.http.resetAgent()
					} finally {
						instance.log('info', `Reboot sequence completed for outlet ${outlet}`)
						instance._rebootInProgress--
						instance._unlockReboot(outlet)
					}
				}, delayMs)
			},
		},

		set_all: {
			name: 'Set All Outlets On/Off',
			description: 'Send a single command to set every outlet ON or OFF at once',
			options: [{ type: 'dropdown', id: 'state', label: 'State', default: 1, choices: onOffChoices }],
			callback: async (action) => {
				const state = Number(action.options.state)

				instance.log('info', `Action: set all outlets -> ${state === 1 ? 'ON' : 'OFF'}`)

				try {
					const resp = await instance.http.get(`$A7 ${state}`)
					assertActionOk(resp, 'Set All Outlets ON/OFF')
				} catch (e) {
					instance.log('error', `Set all outlets failed: ${e?.message || e}`)
					throw e
				}

				// Keep consistent with reboot: don't hard-fail this action due to a status poll
				instance._needsStatusRefresh = true
			},
		},

		refresh_status: {
			name: 'Refresh Device Status',
			description: 'Immediately poll the device status outside the normal interval',
			options: [],
			callback: async () => {
				instance.log('info', 'Action: manual status refresh requested')
				try {
					await instance.refreshStatus()
				} catch (e) {
					instance.log('error', `Manual status refresh failed: ${e?.message || e}`)
					throw e
				}
			},
		},
	}
}
