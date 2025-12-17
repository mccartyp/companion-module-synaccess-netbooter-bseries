// config.js
import { staticText, textInput, numberInput } from './fields.js'

export const configFields = [
	staticText({
		id: 'info',
		label: 'Information',
		value:
			'Controls Synaccess netBooter B Series PDUs via HTTP GET cmd.cgi + Basic Auth. ' +
			'Commands are sent as /cmd.cgi?$A3+1+0 (spaces converted to +; no percent-encoding).',
	}),

	textInput({
		id: 'host',
		label: 'Device Host / IP',
		width: 6,
		defaultValue: '192.168.1.100',
		required: true,
	}),

	textInput({
		id: 'username',
		label: 'Username',
		width: 3,
		defaultValue: 'admin',
	}),

	textInput({
		id: 'password',
		label: 'Password',
		width: 3,
		defaultValue: 'admin',
	}),

	numberInput({
		id: 'pollIntervalMs',
		label: 'Status Poll Interval (ms)',
		width: 6,
		defaultValue: 2000,
		min: 250,
		max: 60000,
	}),

	numberInput({
		id: 'controlPaceMs',
		label: 'Pacing Between Control Commands (ms)',
		width: 6,
		defaultValue: 0,
		min: 0,
		max: 10000,
		step: 50,
	}),

	numberInput({
		id: 'statusTimeoutMs',
		label: 'Status Timeout (ms) ($A5)',
		width: 3,
		defaultValue: 3000,
		min: 250,
		max: 30000,
		step: 250,
	}),

	numberInput({
		id: 'controlTimeoutMs',
		label: 'Control Timeout (ms) ($A3/$A7)',
		width: 3,
		defaultValue: 20000,
		min: 500,
		max: 60000,
		step: 500,
	}),

	numberInput({
		id: 'rebootTimeoutMs',
		label: 'Reboot Timeout (ms) (OFF/ON legs)',
		width: 3,
		defaultValue: 30000,
		min: 1000,
		max: 120000,
		step: 500,
	}),

]
