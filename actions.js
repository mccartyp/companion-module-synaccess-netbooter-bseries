// actions.js
import { setTimeout as sleep } from 'node:timers/promises'
import { outletChoices, onOffChoices } from './choices.js'
import { assertValidOutlet, assertActionOk } from './utils.js'

export function getActionDefinitions(instance) {
	return {
		set_outlet: {
			name: 'Set Outlet',
			options: [
				{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outletChoices(instance.portCount) },
				{ type: 'dropdown', id: 'state', label: 'State', default: 1, choices: onOffChoices },
			],
			callback: async (action) => {
				const outlet = Number(action.options.outlet)
				const state = Number(action.options.state)
				assertValidOutlet(outlet, instance.portCount)

				const resp = await instance.http.get(`$A3 ${outlet} ${state}`)
				assertActionOk(resp, 'Set Outlet')

				instance._needsStatusRefresh = true
			},
		},

		toggle_outlet: {
			name: 'Toggle Outlet',
			options: [{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outletChoices(instance.portCount) }],
			callback: async (action) => {
				const outlet = Number(action.options.outlet)
				assertValidOutlet(outlet, instance.portCount)

				const cur = instance.outletState?.[outlet - 1] ? 1 : 0
				const next = cur ? 0 : 1

				const resp = await instance.http.get(`$A3 ${outlet} ${next}`)
				assertActionOk(resp, 'Toggle Outlet')

				instance._needsStatusRefresh = true
			},
		},

		reboot_outlet: {
			name: 'Reboot Outlet',
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

				try {
					// OFF (this is the only awaited part)
					assertActionOk(await instance.http.get(`$A3 ${outlet} 0`, { timeoutMs: rebootTimeoutMs }), 'Reboot OFF')
				} catch (e) {
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
						instance._needsStatusRefresh = true
					} catch (e) {
						instance.log('error', `Reboot ON failed for outlet ${outlet}: ${e?.message || e}`)
						// recover the agent on failure
						instance.http.resetAgent()
					} finally {
						instance._rebootInProgress--
						instance._unlockReboot(outlet)
					}
				}, delayMs)
			},
		},

		set_all: {
			name: 'Set All Outlets ON/OFF',
			options: [{ type: 'dropdown', id: 'state', label: 'State', default: 1, choices: onOffChoices }],
			callback: async (action) => {
				const state = Number(action.options.state)

				const resp = await instance.http.get(`$A7 ${state}`)
				assertActionOk(resp, 'Set All Outlets ON/OFF')

				// Keep consistent with reboot: don't hard-fail this action due to a status poll
				instance._needsStatusRefresh = true
			},
		},

		refresh_status: {
			name: 'Refresh Status Now',
			options: [],
			callback: async () => {
				await instance.refreshStatus()
			},
		},
	}
}
