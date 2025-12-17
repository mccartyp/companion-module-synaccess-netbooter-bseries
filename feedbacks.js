/**
 * feedbacks.js
 *
 * Feedback definitions that reflect outlet states and connection health.
 * Provides boolean feedbacks used to color and signal status on Companion
 * buttons based on cached device state, including reboot progress visibility.
 */
import { combineRgb, InstanceStatus } from '@companion-module/base'
import { outletChoices } from './choices.js'

/**
 * Register feedback definitions for the instance.
 * @param {import('@companion-module/base').InstanceBase & {
 *   portCount: number,
 *   outletState: boolean[]
 * }} instance
 */
export function initFeedbacks(instance) {
	instance.setFeedbackDefinitions({
		outlet_on: {
			type: 'boolean',
			name: 'Outlet is ON',
			description: 'True when the selected outlet is currently ON',
			options: [
				{
					type: 'dropdown',
					id: 'outlet',
					label: 'Outlet',
					default: 1,
					choices: outletChoices(instance.portCount),
				},
			],
			defaultStyle: { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) },
			callback: (feedback) => {
				const outlet = Number(feedback.options.outlet)
				if (!(outlet >= 1 && outlet <= instance.portCount)) return false
				return !!instance.outletState[outlet - 1]
			},
		},

		outlet_off: {
			type: 'boolean',
			name: 'Outlet is OFF',
			description: 'True when the selected outlet is currently OFF',
			options: [
				{
					type: 'dropdown',
					id: 'outlet',
					label: 'Outlet',
					default: 1,
					choices: outletChoices(instance.portCount),
				},
			],
			defaultStyle: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
			callback: (feedback) => {
				const outlet = Number(feedback.options.outlet)
				if (!(outlet >= 1 && outlet <= instance.portCount)) return false
				return !instance.outletState[outlet - 1]
			},
		},

		outlet_rebooting: {
			type: 'boolean',
			name: 'Outlet is rebooting',
			description: 'True while the selected outlet is mid-reboot (OFF->delay->ON)',
			options: [
				{
					type: 'dropdown',
					id: 'outlet',
					label: 'Outlet',
					default: 1,
					choices: outletChoices(instance.portCount),
				},
			],
			defaultStyle: {
				bgcolor: combineRgb(140, 0, 0),
				color: combineRgb(255, 255, 255),
				animation: { style: 'blink', speed: 'slow' },
			},
			callback: (feedback) => {
				const outlet = Number(feedback.options.outlet)
				if (!(outlet >= 1 && outlet <= instance.portCount)) return false
				return instance._isOutletRebooting?.(outlet) ?? false
			},
		},

		connected: {
			type: 'boolean',
			name: 'Connected',
			description: 'True when the module is currently connected (last poll OK)',
			options: [],
			defaultStyle: { bgcolor: combineRgb(0, 120, 255), color: combineRgb(255, 255, 255) },
			callback: () => instance.status === InstanceStatus.Ok,
		},
	})
}
