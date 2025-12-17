// main.js
import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'

import { configFields } from './config.js'
import { upgradeScripts } from './upgrade.js'

import { SynaccessHttpClient } from './http.js'
import { getActionDefinitions } from './actions.js'
import { getPresets } from './presets.js'

import { parseStatusResponse } from './utils.js'
import { initVariables, updateVariablesFromState, setLastError } from './variables.js'
import { initFeedbacks } from './feedbacks.js'

/**
 * Companion module instance for Synaccess netBooter B Series PDUs.
 * Handles lifecycle wiring, polling, and request serialization.
 */
class SynaccessNetBooterBSeriesInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.config = {}
		this.portCount = 5
		this.outletState = []
		this.currentAmps = undefined
		this.tempC = undefined
		this.lastError = ''

		this._pollTimer = undefined
		this._isPolling = false

		// Per-outlet reboot locks (NOT global)
		this._rebootLocks = new Set()
		this._rebootInProgress = 0

		// HTTP client (serialized, keep-alive)
		this.http = new SynaccessHttpClient(this)
	}

	/* --------------------------------------------------------------------- */
	/* Lifecycle                                                             */
	/* --------------------------------------------------------------------- */

	async init(config) {
		this.config = config

		// Ensure HTTP agent starts fresh with current settings
		this.http.resetAgent()

		this.initActions()
		this.initPresets()
		initFeedbacks(this)
		initVariables(this)

		this.updateStatus(InstanceStatus.Ok)
		setLastError(this, '')
		this.startPolling()
	}

	async destroy() {
		this.stopPolling()
		this.http.destroy()
	}

	getConfigFields() {
		return configFields
	}

	async configUpdated(config) {
		this.config = config
		this.stopPolling()

		this.http.resetAgent()

		this.initActions()
		this.initPresets()
		initFeedbacks(this)
		initVariables(this)

		await this.refreshStatus().catch(() => null)
		this.startPolling()
	}

	/* --------------------------------------------------------------------- */
	/* Definitions                                                            */
	/* --------------------------------------------------------------------- */

	initActions() {
		this.setActionDefinitions(getActionDefinitions(this))
	}

	initPresets() {
		const { presets, presetGroups } = getPresets(this)
		this.setPresetDefinitions(presets, presetGroups)
	}

	/* --------------------------------------------------------------------- */
	/* Polling                                                               */
	/* --------------------------------------------------------------------- */

	startPolling() {
		const intervalMs = Number(this.config.pollIntervalMs) || 2000
		if (intervalMs <= 0) return

		// Defensive: avoid multiple timers if startPolling() gets called twice
		this.stopPolling()

		this._pollTimer = setInterval(() => {
			// Do not poll during reboot sequences (OFF->delay->ON)
			if (this._rebootInProgress > 0) return

			// Prioritize user actions; don't build a backlog of polls
			if (this.http?.pending > 0) return

			// Avoid overlapping polls
			if (this._isPolling) return

			// If an action requested a refresh, do it once when safe
			if (this._needsStatusRefresh) {
				this._needsStatusRefresh = false
				void this.refreshStatus()
				return
			}

			void this.refreshStatus()
		}, intervalMs)
	}

	stopPolling() {
		if (this._pollTimer) {
			clearInterval(this._pollTimer)
			this._pollTimer = undefined
		}
	}

	/* --------------------------------------------------------------------- */
	/* Reboot helpers                                                        */
	/* --------------------------------------------------------------------- */

	_isRebootLocked(outlet) {
		return this._rebootLocks.has(outlet)
	}

	_lockReboot(outlet) {
		if (this._rebootLocks.has(outlet)) return false
		this._rebootLocks.add(outlet)
		return true
	}

	_unlockReboot(outlet) {
		this._rebootLocks.delete(outlet)
	}

	/* --------------------------------------------------------------------- */
	/* HTTP + status                                                         */
	/* --------------------------------------------------------------------- */

	async _httpGet(cmd, { timeoutMs } = {}) {
		return this.http.get(cmd, { timeoutMs })
	}

	async refreshStatus() {
		if (this._isPolling) return
		this._isPolling = true

		try {
			const timeoutMs = Number(this.config.statusTimeoutMs) || 3000
			const body = await this._httpGet('$A5', { timeoutMs })

			const status = parseStatusResponse(body)

			const oldPortCount = this.portCount

			this.portCount = status.portCount
			this.outletState = status.outlets
			this.currentAmps = status.currentAmps
			this.tempC = status.tempC

			// Only rebuild definitions if the device type/autodetect changed
			if (oldPortCount !== this.portCount) {
				initFeedbacks(this)
				initVariables(this)
				this.setActionDefinitions(getActionDefinitions(this))
				const { presets, presetGroups } = getPresets(this)
				this.setPresetDefinitions(presets, presetGroups)
			}

			updateVariablesFromState(this)
			this.checkFeedbacks()

			setLastError(this, '')
			this.updateStatus(InstanceStatus.Ok, 'Poll succeeded')
		} catch (e) {
			const msg = e?.message ? String(e.message) : String(e)
			setLastError(this, msg)
			this.updateStatus(InstanceStatus.ConnectionFailure, msg)
			this.checkFeedbacks()
		} finally {
			this._isPolling = false
		}
	}
}

runEntrypoint(SynaccessNetBooterBSeriesInstance, upgradeScripts)
