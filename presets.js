// presets.js
import { combineRgb } from '@companion-module/base'

function portCountFromInstance(instance) {
	const n = Number(instance?.portCount)
	if (Number.isFinite(n) && n > 0) return Math.min(Math.max(n, 1), 5)
	return 5
}

export function getPresets(instance) {
	const ports = portCountFromInstance(instance)

	const groups = [
		{ name: 'Global Power' },
		{ name: 'On' },
		{ name: 'Off' },
		{ name: 'Toggle' },
		{ name: 'Reboot' },
	]

	const presets = {}

	/* -------------------------
	 * Global Power
	 * ------------------------- */
	presets.all_on = {
		type: 'button',
		category: 'Global Power',
		name: 'All On',
		style: {
			text: 'ALL\nON',
			size: '18',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 140, 0),
		},
		steps: [{ down: [{ actionId: 'set_all', options: { state: 1 } }], up: [] }],
	}

	presets.all_off = {
		type: 'button',
		category: 'Global Power',
		name: 'All Off',
		style: {
			text: 'ALL\nOFF',
			size: '18',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(140, 0, 0),
		},
		steps: [{ down: [{ actionId: 'set_all', options: { state: 0 } }], up: [] }],
	}

	presets.refresh_status = {
		type: 'button',
		category: 'Global Power',
		name: 'Refresh Status',
		style: {
			text: 'REFRESH\nSTATUS',
			size: '14',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(60, 60, 60),
		},
		steps: [{ down: [{ actionId: 'refresh_status', options: {} }], up: [] }],
	}

	/* -------------------------
	 * Per-Outlet Presets
	 * ------------------------- */
	for (let outlet = 1; outlet <= ports; outlet++) {
		// ON
		presets[`on_${outlet}`] = {
			type: 'button',
			category: 'On',
			name: `Outlet ${outlet} On`,
			style: {
				text: `P${outlet}\nON`,
				size: '18',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(40, 40, 40),
			},
			steps: [{ down: [{ actionId: 'set_outlet', options: { outlet, state: 1 } }], up: [] }],
			feedbacks: [
				{
					// ON -> green
					feedbackId: 'outlet_on',
					options: { outlet },
					style: {
						bgcolor: combineRgb(0, 140, 0),
					},
				},
				{
					// OFF -> red
					feedbackId: 'outlet_off',
					options: { outlet },
					style: {
						bgcolor: combineRgb(140, 0, 0),
					},
				},
			],
		}

		// OFF
		presets[`off_${outlet}`] = {
			type: 'button',
			category: 'Off',
			name: `Outlet ${outlet} Off`,
			style: {
				text: `P${outlet}\nOFF`,
				size: '18',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(40, 40, 40),
			},
			steps: [{ down: [{ actionId: 'set_outlet', options: { outlet, state: 0 } }], up: [] }],
			feedbacks: [
				{
					// OFF -> red
					feedbackId: 'outlet_off',
					options: { outlet },
					style: {
						bgcolor: combineRgb(140, 0, 0),
					},
				},
				{
					// ON -> green
					feedbackId: 'outlet_on',
					options: { outlet },
					style: {
						bgcolor: combineRgb(0, 140, 0),
					},
				},
			],
		}

		// TOGGLE (unchanged)
		presets[`toggle_${outlet}`] = {
			type: 'button',
			category: 'Toggle',
			name: `Outlet ${outlet} Toggle`,
			style: {
				text: `P${outlet}\nTOGGLE`,
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(40, 40, 40),
			},
			steps: [{ down: [{ actionId: 'toggle_outlet', options: { outlet } }], up: [] }],
			feedbacks: [
				{
					feedbackId: 'outlet_on',
					options: { outlet },
					style: {
						bgcolor: combineRgb(0, 140, 0),
					},
				},
				{
					feedbackId: 'outlet_off',
					options: { outlet },
					style: {
						bgcolor: combineRgb(140, 0, 0),
					},
				},
			],
		}

		// REBOOT
		presets[`reboot_${outlet}`] = {
			type: 'button',
			category: 'Reboot',
			name: `Outlet ${outlet} Reboot`,
			style: {
				text: `P${outlet}\nREBOOT`,
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(110, 60, 0),
			},
			steps: [
				{
					down: [
						{
							actionId: 'reboot_outlet',
							options: {
								outlet,
								delayMs: 5000, // sets the option value (OFF->delay->ON inside handler)
							},
						},
					],
					up: [],
				},
			]
		}
	}

	return { groups, presets }
}
