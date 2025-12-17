/**
 * main.js
 *
 * Entry point that wires the Companion lifecycle to Synaccess netBooter B Series PDUs.
 * Coordinates configuration, actions, feedbacks, variables, and polling so the
 * module remains cohesive and observable during runtime.
 * File index:
 * - actions.js: Companion actions for outlet control and refresh.
 * - choices.js: Shared dropdown choice builders for outlets and on/off.
 * - config.js: Configuration field definitions.
 * - feedbacks.js: Visual feedback definitions driven by device status and reboot progress.
 * - fields.js: Field helper factories for configuration inputs.
 * - http.js: Serialized HTTP client for device commands.
 * - presets.js: Button presets grouped by outlet behavior.
 * - upgrade.js: Companion upgrade scripts and defaults.
 * - utils.js: Command parsing helpers and validation utilities.
 * - variables.js: Variable definitions and state updates.
 */
import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'

import { configFields } from './config.js'
import { upgradeScripts } from './upgrade.js'

import { SynaccessHttpClient } from './http.js'
import { getActionDefinitions } from './actions.js'
import { getPresets } from './presets.js'

import { parseStatusResponse } from './utils.js'
import { initVariables, updateVariablesFromState, setLastError } from './variables.js'
import { initFeedbacks } from './feedbacks.js'

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { version: MODULE_VERSION } = require('./package.json')

/**
 * Companion module instance for Synaccess netBooter B Series PDUs.
 * Handles lifecycle wiring, polling, and request serialization.
 */
export class SynaccessNetBooterBSeriesInstance extends InstanceBase {
	/**
	 * @param {import('@companion-module/base').InternalInstanceAPI} internal
	 */
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
		this._rebootingOutlets = new Set()
		this._hasLoggedPollSuccess = false
		this._configErrorLogged = false

		// HTTP client (serialized, keep-alive)
		this.http = new SynaccessHttpClient(this)
	}

	/* --------------------------------------------------------------------- */
	/* Lifecycle                                                             */
	/* --------------------------------------------------------------------- */

	/**
	 * Initialize the module with user configuration.
	 * @param {import('./config.js').ConfigShape} config
	 */
	async init(config) {
		this.config = config

		// Log module identity and version early for diagnostics
		this.log(
			'info',
			`Initializing Synaccess netBooter B Series module v${MODULE_VERSION}`
		)

		// Ensure HTTP agent starts fresh with current settings
		this.http.resetAgent()

		this.initActions()
		this.initPresets()
		initFeedbacks(this)
		initVariables(this)

		this.updateStatus(InstanceStatus.Ok, 'Initializing')
		setLastError(this, '')
		this.log('info', 'Initialization complete; starting periodic status polling')
		this.startPolling()
	}

	/**
	 * Clean up resources on module unload.
	 */
	async destroy() {
		this.log('info', 'Instance destroyed; stopping polling and HTTP client')
		this.stopPolling()
		this.http.destroy()
	}

	/**
	 * Provide Companion configuration field definitions.
	 */
	getConfigFields() {
		return configFields
	}

	/**
	 * React to configuration updates from the UI.
	 * @param {import('./config.js').ConfigShape} config
	 */
	async configUpdated(config) {
		this.config = config
		this.log('info', 'Configuration updated; restarting polling with new settings')
		this.stopPolling()

		this.http.resetAgent()
		this._hasLoggedPollSuccess = false

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

	/**
	 * Register Companion actions using the latest device context.
	 */
	initActions() {
		this.setActionDefinitions(getActionDefinitions(this))
	}

	/**
	 * Register Companion presets using the latest device context.
	 */
	initPresets() {
		const { presets, presetGroups } = getPresets(this)
		this.setPresetDefinitions(presets, presetGroups)
	}

	_hasValidConfig() {
		const host = String(this.config?.host || '').trim()
		if (!host) {
			const msg = 'Device host/IP is required in the configuration'
			if (!this._configErrorLogged) {
				this.log('warn', msg)
				this._configErrorLogged = true
			}
			setLastError(this, msg)
			this.updateStatus(InstanceStatus.BadConfig, msg)
			return false
		}

		this._configErrorLogged = false
		return true
	}

	/* --------------------------------------------------------------------- */
	/* Polling                                                               */
	/* --------------------------------------------------------------------- */

	/**
	 * Begin periodic status polling if configured with a valid interval.
	 */
	startPolling() {
		const intervalMs = Number(this.config.pollIntervalMs) || 2000
		if (intervalMs <= 0) return
		if (!this._hasValidConfig()) return

		// Defensive: avoid multiple timers if startPolling() gets called twice
		this.stopPolling()
		this.log('info', `Starting status polling every ${intervalMs} ms`)

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

	/**
	 * Stop periodic status polling.
	 */
	stopPolling() {
		if (this._pollTimer) {
			clearInterval(this._pollTimer)
			this._pollTimer = undefined
			this.log('info', 'Stopped status polling')
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
		this._setOutletRebooting(outlet, true)
		return true
	}

	_unlockReboot(outlet) {
		this._rebootLocks.delete(outlet)
		this._setOutletRebooting(outlet, false)
	}

	_isOutletRebooting(outlet) {
		return this._rebootingOutlets.has(outlet)
	}

	_setOutletRebooting(outlet, rebooting) {
		if (rebooting) this._rebootingOutlets.add(outlet)
		else this._rebootingOutlets.delete(outlet)

		if (typeof this.checkFeedbacks === 'function') {
			this.checkFeedbacks('outlet_rebooting')
		}
	}

	/* --------------------------------------------------------------------- */
	/* HTTP + status                                                         */
	/* --------------------------------------------------------------------- */

	/**
	 * Send a GET command using the module HTTP client.
	 * @param {string} cmd
	 * @param {{ timeoutMs?: number }} [options]
	 */
	async _httpGet(cmd, { timeoutMs } = {}) {
		return this.http.get(cmd, { timeoutMs })
	}

	/**
	 * Poll device status and update Companion state.
	 */
	async refreshStatus() {
		if (!this._hasValidConfig()) {
			this._isPolling = false
			return
		}

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

			// Info log once on startup or when a change is detected; debug otherwise to reduce noise
			const summary = `ports=${status.portCount} amps=${status.currentAmps ?? 'n/a'} tempC=${status.tempC ?? 'n/a'}`
			if (!this._hasLoggedPollSuccess || oldPortCount !== this.portCount) {
				this.log('info', `Status poll succeeded: ${summary}`)
				this._hasLoggedPollSuccess = true
			}

			setLastError(this, '')
			this.updateStatus(InstanceStatus.Ok, 'Poll succeeded')
		} catch (e) {
			const msg = e?.message ? String(e.message) : String(e)
			setLastError(this, msg)
			this.log('error', `Status poll failed: ${msg}`)
			this._hasLoggedPollSuccess = false
			this.updateStatus(InstanceStatus.ConnectionFailure, msg)
			this.checkFeedbacks()
		} finally {
			this._isPolling = false
		}
	}
}

runEntrypoint(SynaccessNetBooterBSeriesInstance, upgradeScripts)

/**
 * Type alias describing the instance fields accessed across the module.
 * @typedef {SynaccessNetBooterBSeriesInstance & {
 *   config: import('./config.js').ConfigShape,
 *   portCount: number,
 *   outletState: boolean[],
 *   currentAmps?: number,
 *   tempC?: number,
 *   lastError?: string,
 *   http: import('./http.js').SynaccessHttpClient,
 *   _rebootInProgress: number,
 *   _hasLoggedPollSuccess: boolean,
 *   _lockReboot: (outlet: number) => boolean,
 *   _unlockReboot: (outlet: number) => void,
 *   _setOutletRebooting: (outlet: number, rebooting: boolean) => void,
 *   _isOutletRebooting: (outlet: number) => boolean,
 *   _rebootingOutlets: Set<number>,
 *   _needsStatusRefresh?: boolean
 * }} SynaccessInstanceAugmented
 */
