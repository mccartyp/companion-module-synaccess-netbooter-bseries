// main.js
import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import http from 'node:http'

import { configFields } from './config.js'
import { getPresets } from './presets.js'
import { upgradeScripts } from './upgrade.js'

import { outletChoices, onOffChoices } from './choices.js'
import {
	toBasicAuthHeader,
	normalizeCmd,
	parseStatusResponse,
	assertValidOutlet,
	assertActionOk,
} from './utils.js'

import { initVariables, updateVariablesFromState, setLastError } from './variables.js'
import { initFeedbacks } from './feedbacks.js'

class SynaccessNetBooterBSeriesInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.config = {}
		this.portCount = 5
		this.outletState = []
		this.currentAmps = undefined
		this.tempC = undefined
		this.lastError = ''

		if (!this._rebootLocks) this._rebootLocks = new Set()
		if (!this._httpQueue) this._httpQueue = Promise.resolve()

		this._pollTimer = undefined
		this._isPolling = false
	}

	async init(config) {
		this.config = config

		initVariables(this)
		initFeedbacks(this)
		this.initActions()
		this.initPresets()

		setLastError(this, '')
		this.startPolling()
	}

	async destroy() {
		this.stopPolling()
	}

	getConfigFields() {
		return configFields
	}

	async configUpdated(config) {
		this.config = config
		this.stopPolling()

		this.initActions()
		this.initPresets()
		initFeedbacks(this)
		initVariables(this)

		await this.refreshStatus()
		this.startPolling()
	}

	startPolling() {
		const interval = Number(this.config.pollIntervalMs) || 2000
		if (interval <= 0) return

		this._pollTimer = setInterval(() => {
			if (this._isPolling) return
			this.refreshStatus().catch(() => null)
		}, interval)
	}

	stopPolling() {
		if (this._pollTimer) {
			clearInterval(this._pollTimer)
			this._pollTimer = undefined
		}
	}

	_isRebootLocked(outlet) {
		if (!this._rebootLocks) this._rebootLocks = new Set()
		return this._rebootLocks.has(outlet)
	}

	_lockReboot(outlet) {
		if (!this._rebootLocks) this._rebootLocks = new Set()
		this._rebootLocks.add(outlet)
	}

	_unlockReboot(outlet) {
		if (this._rebootLocks) this._rebootLocks.delete(outlet)
	}

	_buildUrl(cmd) {
		const host = (this.config.host || '').trim()
		const q = normalizeCmd(cmd)
		return `http://${host}/cmd.cgi?${q}`
	}

	async _httpGet(cmd) {
		// Ensure queue exists (defensive)
		if (!this._httpQueue) this._httpQueue = Promise.resolve()

		const run = async () => {
			const host = String(this.config.host || '').trim()
			const timeoutMs = Number(this.config.timeoutMs) || 3000

			const user = String(this.config.username || '')
			const pass = String(this.config.password || '')

			const q = normalizeCmd(cmd) // must ONLY replace spaces with '+'
			const path = `/cmd.cgi?${q}`

			// Build Authorization exactly like curl does
			const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')

			const options = {
				host,
				port: 80,
				method: 'GET',
				path,
				headers: {
					Authorization: `Basic ${token}`,
					'User-Agent': 'curl/7.88.1',
					Accept: '*/*',
					Connection: 'close',
				},
			}

			return await new Promise((resolve, reject) => {
				const req = http.request(options, (res) => {
					let data = ''
					res.setEncoding('utf8')

					res.on('data', (chunk) => (data += chunk))
					res.on('end', () => {
						const body = String(data || '').trim()

						if (res.statusCode < 200 || res.statusCode >= 300) {
							const www = res.headers?.['www-authenticate']
							if (res.statusCode === 401) {
								this.log('error', `401 diagnostic: www-authenticate=${www || '<none>'}`)
							}
							reject(new Error(`HTTP ${res.statusCode}: ${body}`.trim()))
							return
						}

						resolve(body)
					})
				})

				req.setTimeout(timeoutMs, () => {
					req.destroy(new Error('Call timed out'))
				})

				req.on('error', reject)
				req.end()
			})
		}

		// Serialize by chaining onto the queue.
		// Use .then(run, run) so even if the previous request failed, this one still runs.
		const p = this._httpQueue.then(run, run)

		// Keep the queue alive even when p rejects
		this._httpQueue = p.catch(() => undefined)

		return p
	}

	async refreshStatus() {
		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing host/IP')
			setLastError(this, 'Missing host/IP')
			this.checkFeedbacks()
			return
		}

		this._isPolling = true
		try {
			const body = await this._httpGet('$A5')
			const parsed = parseStatusResponse(body)

			const oldPortCount = this.portCount
			this.portCount = parsed.portCount

			const changed =
				oldPortCount !== this.portCount ||
				this.outletState.length !== parsed.outlets.length ||
				parsed.outlets.some((v, i) => v !== this.outletState[i]) ||
				this.currentAmps !== parsed.currentAmps ||
				this.tempC !== parsed.tempC

			this.outletState = parsed.outlets
			this.currentAmps = parsed.currentAmps
			this.tempC = parsed.tempC

			// Clear last error on success
			setLastError(this, '')

			this.updateStatus(InstanceStatus.Ok, 'Poll succeeded')
			// Important: connected feedback depends on status and must update even if outlet state didn't change
			this.checkFeedbacks()

			// Autodetect may change port count; rebuild surfaces
			if (oldPortCount !== this.portCount) {
				initVariables(this)
				initFeedbacks(this)
				this.initActions()
				this.initPresets()
				// Ensure feedback option dropdowns refresh after port-count changes
				this.checkFeedbacks()
			}

			if (changed) {
				updateVariablesFromState(this)
				// Feedbacks might depend on outlet states, so re-check after updates
				this.checkFeedbacks()
			}
		} catch (e) {
			const msg = e?.message || String(e)
			// Provide actionable context without exposing credentials
			this.log('error', `Status poll ($A5) failed for host "${this.config.host}": ${msg}`)
			setLastError(this, msg)
			this.updateStatus(InstanceStatus.ConnectionFailure, msg)
			// Important: connected feedback depends on status
			this.checkFeedbacks()
		} finally {
			this._isPolling = false
		}
	}

	initPresets() {
	  const { groups, presets } = getPresets(this)
	  this.setPresetDefinitions(presets, groups)
	}

	initActions() {
		this.setActionDefinitions({
			set_outlet: {
				name: 'Set Outlet ON/OFF',
				options: [
					{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outletChoices(this.portCount) },
					{ type: 'dropdown', id: 'state', label: 'State', default: 1, choices: onOffChoices },
				],
				callback: async (action) => {
					const outlet = Number(action.options.outlet)
					const state = Number(action.options.state)

					assertValidOutlet(outlet, this.portCount)

					const resp = await this._httpGet(`$A3 ${outlet} ${state}`)
					assertActionOk(resp, 'Set Outlet ON/OFF')

					await this.refreshStatus()
				},
			},

			toggle_outlet: {
				name: 'Toggle Outlet',
				options: [
					{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outletChoices(this.portCount) },
				],
				callback: async (action) => {
					const outlet = Number(action.options.outlet)
					assertValidOutlet(outlet, this.portCount)

					if (this.outletState.length !== this.portCount) await this.refreshStatus()
					const next = this.outletState[outlet - 1] ? 0 : 1

					const resp = await this._httpGet(`$A3 ${outlet} ${next}`)
					assertActionOk(resp, 'Toggle Outlet')

					await this.refreshStatus()
				},
			},

			reboot_outlet: {
				name: 'Reboot Outlet',
				options: [
					{
						type: 'dropdown',
						id: 'outlet',
						label: 'Outlet',
						default: 1,
						choices: outletChoices(this.portCount),
					},
					{
						type: 'number',
						id: 'delayMs',
						label: 'Reboot delay (ms)',
						default: 5000,
						min: 500,
						max: 60000,
						step: 500,
					},
				],
				callback: async (action) => {
					const outlet = Number(action.options.outlet)
					assertValidOutlet(outlet, this.portCount)

					const delayMs = Number(action.options.delayMs)
					if (!Number.isFinite(delayMs) || delayMs < 0) {
						throw new Error('Invalid reboot delay')
					}

					// Prevent overlapping reboots per outlet
					if (this._isRebootLocked(outlet)) {
						this.log('warn', `Reboot already in progress for outlet ${outlet}; ignoring request`)
						return
					}

					this._lockReboot(outlet)
					try {
						// Sanity check: ensure connectivity before timed sequence
						await this.refreshStatus()

						// OFF
						{
							const respOff = await this._httpGet(`$A3 ${outlet} 0`)
							assertActionOk(respOff, 'Set Outlet OFF')
						}

						// Delay
						await new Promise((resolve) => setTimeout(resolve, delayMs))

						// ON
						{
							const respOn = await this._httpGet(`$A3 ${outlet} 1`)
							assertActionOk(respOn, 'Set Outlet ON')
						}

						await this.refreshStatus()
					} finally {
						this._unlockReboot(outlet)
					}
				},
			},

			set_all: {
				name: 'Set All Outlets ON/OFF',
				options: [{ type: 'dropdown', id: 'state', label: 'State', default: 1, choices: onOffChoices }],
				callback: async (action) => {
					const state = Number(action.options.state)

					const resp = await this._httpGet(`$A7 ${state}`)
					assertActionOk(resp, 'Set All Outlets ON/OFF')

					await this.refreshStatus()
				},
			},

			refresh_status: {
				name: 'Refresh Status Now',
				options: [],
				callback: async () => this.refreshStatus(),
			},
		})
	}
}

runEntrypoint(SynaccessNetBooterBSeriesInstance, upgradeScripts)
