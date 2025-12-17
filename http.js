// http.js
import http from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { normalizeCmd, toBasicAuthHeader } from './utils.js'

/**
 * Lightweight HTTP client that serializes requests to the device.
 * Uses a single keep-alive agent to avoid connection buildup on embedded stacks.
 */
export class SynaccessHttpClient {
	constructor(instance) {
		this.instance = instance

		this._queue = Promise.resolve()
		this._pending = 0
		this._agent = null

		this.resetAgent()
	}

	get pending() {
		return this._pending
	}

	destroy() {
		try {
			this._agent?.destroy?.()
		} catch (e) {
			// ignore
		}
		this._agent = null
	}

	resetAgent() {
		this.destroy()
		this._agent = new http.Agent({
			keepAlive: true,
			maxSockets: 1,
			keepAliveMsecs: 1000,
		})
	}

	_isControlCmd(cmdStr) {
		return cmdStr.startsWith('$A3') || cmdStr.startsWith('$A4') || cmdStr.startsWith('$A7')
	}

	async _applyControlPace(cmdStr) {
		// Only pace "control" commands
		if (!this._isControlCmd(cmdStr)) return

		const paceMs = Number(this.instance.config?.controlPaceMs) || 0
		if (paceMs > 0) await sleep(paceMs)
	}

	/**
	 * Send a serialized HTTP GET command to the device.
	 * @param {string} cmd The raw command string (e.g. `$A3 1 1`).
	 * @param {{ timeoutMs?: number }} [options]
	 */
	async get(cmd, { timeoutMs } = {}) {
		if (!this._queue) this._queue = Promise.resolve()

		const cmdStr = String(cmd || '').trim()

		if (!this.instance?.config?.host) {
			throw new Error('Device host is not configured')
		}

		const run = async () => {
			this._pending++

			const cfg = this.instance.config || {}
			const host = String(cfg.host || '').trim()
			const user = String(cfg.username || '')
			const pass = String(cfg.password || '')

			const normalizedCmd = normalizeCmd(cmdStr) // spaces -> '+', no percent encoding
			const path = `/cmd.cgi?${normalizedCmd}`
			const authHeader = toBasicAuthHeader(user, pass)

			const timeoutMsRaw = timeoutMs ?? Number(cfg.controlTimeoutMs) ?? 20000
			const requestTimeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw >= 250 ? timeoutMsRaw : 20000

			const opts = {
				host,
				port: 80,
				method: 'GET',
				path,
				agent: this._agent,
				headers: {
					Authorization: authHeader,
					'User-Agent': 'Bitfocus-Companion/Synaccess-netBooter-BSeries',
					Accept: '*/*',
				},
			}

			try {
				return await new Promise((resolve, reject) => {
					const req = http.request(opts, (res) => {
						let data = ''
						res.setEncoding('utf8')

						res.on('data', (c) => (data += c))
						res.on('end', () => {
							const body = String(data || '').trim()
							if (res.statusCode < 200 || res.statusCode >= 300) {
								reject(new Error(`HTTP ${res.statusCode}: ${body}`))
							} else {
								resolve(body)
							}
						})
					})

					req.setTimeout(requestTimeoutMs, () => {
						this.instance.log('debug', `HTTP Call Timed Out: cmd=${cmdStr} timeoutMs=${requestTimeoutMs} pending=${this._pending}`)
						req.destroy(new Error(`Call timed out (cmd=${cmdStr}, timeoutMs=${requestTimeoutMs})`))
					})

					req.on('error', reject)
					req.end()
				})
			} finally {
				this._pending--
			}
		}

		// Serialize requests. Ensure the next request runs even if the previous failed.
		const queuedRequest = this._queue.then(
			async () => {
				const body = await run()
				await this._applyControlPace(cmdStr)
				return body
			},
			async () => {
				const body = await run()
				await this._applyControlPace(cmdStr)
				return body
			}
		)

		// Keep the queue alive even when callers ignore/propagate failures
		this._queue = queuedRequest.catch(() => undefined)

		return queuedRequest
	}
}
