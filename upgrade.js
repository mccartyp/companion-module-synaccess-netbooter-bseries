// upgrade.js

export const upgradeScripts = [
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
		if (cfg.username === undefined) cfg.username = 'admin'
		if (cfg.password === undefined) cfg.password = 'admin'

		result.updatedConfig = cfg
		return result
	},
]
