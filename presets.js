/**
 * presets.js
 *
 * Button presets for common outlet operations on the Synaccess module.
 * Supplies Companion-ready presets for per-outlet and global actions, with
 * styling aligned to feedback indicators, including per-outlet status tiles
 * and reboot state highlighting.
 */
import { combineRgb } from '@companion-module/base'

const COLOR_ON = combineRgb(0, 140, 0)
const COLOR_OFF = combineRgb(140, 0, 0)
const COLOR_TEXT = combineRgb(255, 255, 255)
const COLOR_BASE = combineRgb(40, 40, 40)
const COLOR_REBOOT = combineRgb(110, 60, 0)
const COLOR_STATUS = combineRgb(30, 30, 30)

function portCountFromInstance(instance) {
	const n = Number(instance?.portCount)
	if (Number.isFinite(n) && n > 0) return Math.min(Math.max(n, 1), 5)
	return 5
}

/**
 * Build Companion presets using the detected port count.
 * @param {import('@companion-module/base').InstanceBase} instance
 * @returns {{ presets: Record<string, import('@companion-module/base').CompanionPresetDefinition>, presetGroups: { name: string }[] }}
 */
export function getPresets(instance) {
	const ports = portCountFromInstance(instance)

	const presetGroups = [
		{ name: 'Global Power' },
		{ name: 'Status' },
		{ name: 'On' },
		{ name: 'Off' },
		{ name: 'Toggle' },
		{ name: 'Reboot' },
	]

	const presets = {}

	// ---------------------------------------------------------------------
	// Global Power
	// ---------------------------------------------------------------------
	presets.all_on = {
		type: 'button',
		category: 'Global Power',
		name: 'All On',
		style: {
			text: 'ALL\nON',
			size: '18',
			color: COLOR_TEXT,
			bgcolor: COLOR_ON,
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
			color: COLOR_TEXT,
			bgcolor: COLOR_OFF,
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
			color: COLOR_TEXT,
			bgcolor: combineRgb(60, 60, 60),
		},
		steps: [{ down: [{ actionId: 'refresh_status', options: {} }], up: [] }],
	}

	// ---------------------------------------------------------------------
	// Per-outlet presets
	// ---------------------------------------------------------------------
	for (let outlet = 1; outlet <= ports; outlet++) {
		// STATUS
		presets[`status_${outlet}`] = {
			type: 'button',
			category: 'Status',
			name: `Outlet ${outlet} Status`,
			style: {
				text: `P${outlet}\nSTATUS`,
				size: '14',
				color: COLOR_TEXT,
				bgcolor: COLOR_STATUS,
			},
			steps: [{ down: [], up: [] }],
			feedbacks: [
				// Brightness pulsing provided by advanced feedback
				{ feedbackId: 'outlet_rebooting', options: { outlet } },
				// ON -> green highlight
				{ feedbackId: 'outlet_on', options: { outlet }, style: { bgcolor: COLOR_ON } },
				// OFF -> red highlight
				{ feedbackId: 'outlet_off', options: { outlet }, style: { bgcolor: COLOR_OFF } },
			],
		}

		// ON
		presets[`on_${outlet}`] = {
			type: 'button',
			category: 'On',
			name: `Outlet ${outlet} On`,
			style: {
				text: `P${outlet}\nON`,
				size: '18',
				color: COLOR_TEXT,
				bgcolor: COLOR_BASE,
			},
			steps: [{ down: [{ actionId: 'set_outlet', options: { outlet, state: 1 } }], up: [] }],
			feedbacks: [
				// Brightness pulsing provided by advanced feedback
				{ feedbackId: 'outlet_rebooting', options: { outlet } },
				// ON -> green highlight
				{ feedbackId: 'outlet_on', options: { outlet }, style: { bgcolor: COLOR_ON } },
				// OFF -> red highlight
				{ feedbackId: 'outlet_off', options: { outlet }, style: { bgcolor: COLOR_OFF } },
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
				color: COLOR_TEXT,
				bgcolor: COLOR_BASE,
			},
			steps: [{ down: [{ actionId: 'set_outlet', options: { outlet, state: 0 } }], up: [] }],
			feedbacks: [
				// Brightness pulsing provided by advanced feedback
				{ feedbackId: 'outlet_rebooting', options: { outlet } },
				// OFF -> red highlight
				{ feedbackId: 'outlet_off', options: { outlet }, style: { bgcolor: COLOR_OFF } },
				// ON -> green highlight
				{ feedbackId: 'outlet_on', options: { outlet }, style: { bgcolor: COLOR_ON } },
			],
		}

		// TOGGLE
		presets[`toggle_${outlet}`] = {
			type: 'button',
			category: 'Toggle',
			name: `Outlet ${outlet} Toggle`,
			style: {
				text: `P${outlet}\nTOGGLE`,
				size: '14',
				color: COLOR_TEXT,
				bgcolor: COLOR_BASE,
			},
			steps: [{ down: [{ actionId: 'toggle_outlet', options: { outlet } }], up: [] }],
			feedbacks: [
				// Brightness pulsing provided by advanced feedback
				{ feedbackId: 'outlet_rebooting', options: { outlet } },
				// OFF -> red highlight
				{ feedbackId: 'outlet_off', options: { outlet }, style: { bgcolor: COLOR_OFF } },
				// ON -> green highlight
				{ feedbackId: 'outlet_on', options: { outlet }, style: { bgcolor: COLOR_ON } },
			],
		}

		// REBOOT (passes delayMs option to the action)
		presets[`reboot_${outlet}`] = {
			type: 'button',
			category: 'Reboot',
			name: `Outlet ${outlet} Reboot`,
			style: {
				text: `P${outlet}\nREBOOT`,
				size: '14',
				color: COLOR_TEXT,
				bgcolor: COLOR_REBOOT,
			},
			steps: [{ down: [{ actionId: 'reboot_outlet', options: { outlet, delayMs: 5000 } }], up: [] }],
			feedbacks: [
				// Brightness pulsing provided by advanced feedback
				{ feedbackId: 'outlet_rebooting', options: { outlet } },
			],
		}
	}

	return { presets, presetGroups }
}
