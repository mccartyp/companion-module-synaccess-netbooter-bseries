// config.js
import { staticText, textInput, numberInput, checkbox } from './fields.js'

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
		id: 'timeoutMs',
		label: 'HTTP Timeout (ms)',
		width: 6,
		defaultValue: 3000,
		min: 250,
		max: 30000,
	}),
]
