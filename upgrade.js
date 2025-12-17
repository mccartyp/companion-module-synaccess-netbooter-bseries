/**
 * upgrade.js
 *
 * Companion upgrade scripts and defaults for the Synaccess module.
 * Houses versioned migrations to keep configurations compatible across
 * releases.
 */

export const upgradeScripts = [
	/**
	 * Upgrade script to seed defaults for v0.1.0.
	 */
	function upgradeTo_v0_1_0(_context, props) {
		const result = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		// props.config is where instance config lives
		const cfg = { ...(props.config || {}) }

		if (cfg.pollIntervalMs === undefined) cfg.pollIntervalMs = 2000
		if (cfg.statusTimeoutMs === undefined) cfg.statusTimeoutMs = 3000
		if (cfg.controlPaceMs === undefined) cfg.controlPaceMs = 0
		if (cfg.controlTimeoutMs === undefined) cfg.controlTimeoutMs = 20000
		if (cfg.rebootTimeoutMs === undefined) cfg.rebootTimeoutMs = 30000
		if (cfg.username === undefined) cfg.username = 'admin'
		if (cfg.password === undefined) cfg.password = 'admin'

		result.updatedConfig = cfg
		return result
	},
]
