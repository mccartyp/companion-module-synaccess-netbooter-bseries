export const upgradeScripts = [
	function upgradeTo_v0_1_0(context, props) {
		const upgraded = { ...props }

		if (upgraded.pollIntervalMs === undefined) upgraded.pollIntervalMs = 2000
		if (upgraded.timeoutMs === undefined) upgraded.timeoutMs = 3000
		if (upgraded.username === undefined) upgraded.username = 'admin'
		if (upgraded.password === undefined) upgraded.password = 'admin'

		return upgraded
	},
]
