/**
 * Protocol and parsing utilities for Synaccess netBooter B Series.
 */

export function toBasicAuthHeader(username, password) {
	const token = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
	return `Basic ${token}`
}

/**
 * The embedded device is sensitive. Avoid percent-encoding; replace spaces with '+'.
 */
export function normalizeCmd(cmd) {
	return String(cmd || '').trim().replace(/ +/g, '+')
}

/**
 * Parse $A5 status responses.
 *
 * Spec says $A5 looks like:
 *   xxxx,cccc,cccc,tt
 * or
 *   xxxx,cccc,tt
 *
 * Some older/alternate firmware may return:
 *   $A0,00000'
 *
 * Where "xxxx" are outlet bits and the right-most bit is outlet 1.
 *
 * @returns {{
 *   portCount: 2|5,
 *   outlets: boolean[],
 *   bits: string,
 *   currentAmps: number|undefined,
 *   tempC: number|undefined,
 *   raw: string
 * }}
 */
export function parseStatusResponse(raw) {
	const text = String(raw || '').trim()

	// Some firmwares prefix with "$A0,". Strip if present.
	let remainder = text
	if (remainder.startsWith('$A0')) {
		const idx = remainder.indexOf(',')
		remainder = idx >= 0 ? remainder.slice(idx + 1) : ''
	}

	// First CSV token should contain only outlet bits (but may include stray quotes)
	const firstToken = (remainder.split(',')[0] || '').trim()
	const bits = firstToken.replace(/[^01]/g, '')

	if (bits.length !== 2 && bits.length !== 5) {
		throw new Error(`Unable to parse outlet bits from status: ${text}`)
	}

	const portCount = /** @type {2|5} */ (bits.length)

	// Right-most bit is outlet 1
	const outlets = []
	for (let outlet = 1; outlet <= portCount; outlet++) {
		const bit = bits[portCount - outlet]
		outlets.push(bit === '1')
	}

	// Optional current/temp parsing (DU series). Best effort; not required.
	const parts = remainder.split(',').map((p) => p.trim())
	let currentAmps = undefined
	let tempC = undefined

	if (parts.length >= 3) {
		const maybeTemp = parts[parts.length - 1]
		const t = Number(maybeTemp)
		if (!Number.isNaN(t)) tempC = t

		const maybeCurrent = parts[parts.length - 2]
		const c = Number(maybeCurrent)
		if (!Number.isNaN(c)) currentAmps = c
	}

	return { portCount, outlets, bits, currentAmps, tempC, raw: text }
}

/**
 * Validate an outlet number against a detected port count.
 */
export function assertValidOutlet(outlet, portCount) {
	if (!(Number.isInteger(outlet) && outlet >= 1 && outlet <= portCount)) {
		throw new Error(`Invalid outlet ${outlet} for detected port count ${portCount}`)
	}
}

/**
 * Assert a successful action response.
 * Device return codes:
 * - $A0 = OK
 * - $AF = error/unknown
 */
export function assertActionOk(body, context) {
	if (String(body || '').startsWith('$A0')) return
	if (String(body || '').startsWith('$AF')) throw new Error(`Device returned $AF for ${context}`)
	throw new Error(`Unexpected response for ${context}: ${body}`)
}
