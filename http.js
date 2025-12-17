/**
 * http.js
 *
 * Serialized HTTP client specialized for Synaccess netBooter B Series devices.
 * Manages a shared keep-alive agent and command pacing to protect the
 * embedded target while providing detailed logging for diagnostics.
 */
import http from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { normalizeCmd, toBasicAuthHeader } from './utils.js'
/** @typedef {import('./main.js').SynaccessNetBooterBSeriesInstance} SynaccessNetBooterBSeriesInstance */

/**
 * Lightweight HTTP client that serializes requests to the device.
 * Uses a single keep-alive agent to avoid connection buildup on embedded stacks.
 */
export class SynaccessHttpClient {
	/**
	 * @param {SynaccessNetBooterBSeriesInstance} instance
	 */
	constructor(instance) {
		this.instance = instance

		this._queue = Promise.resolve()
		this._pending = 0
		this._agent = null

		this.resetAgent()
	}

	_normalizeError(err, host, cmdStr) {
		const code = err?.code
		if (code === 'ENOTFOUND') return `Host not found (${host})`
		if (code === 'ECONNREFUSED') return `Connection refused by ${host}`
		if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return `Timed out reaching ${host} for ${cmdStr}`
		if (code === 'ECONNRESET') return `Connection reset while sending ${cmdStr} to ${host}`
		if (code === 'EHOSTUNREACH') return `Host unreachable (${host})`

		const msg = err?.message || String(err)
		return `${msg}${cmdStr ? ` (cmd=${cmdStr})` : ''}`
	}

	_shouldResetAgent(err) {
		const code = err?.code
		return code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EPIPE'
	}

	/**
	 * Number of in-flight HTTP calls (for pacing/polling coordination).
	 */
	get pending() {
		return this._pending
	}

	/**
	 * Destroy the current keep-alive agent.
	 */
	destroy() {
		try {
			this._agent?.destroy?.()
		} catch (e) {
			this.instance.log('error', `HTTP agent destroy error: ${e?.message || e}`)
		}
		this._agent = null
	}

	/**
	 * Reset the HTTP agent to a fresh keep-alive instance.
	 */
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
				const body = await new Promise((resolve, reject) => {
					const req = http.request(opts, (res) => {
						let data = ''
						res.setEncoding('utf8')

						res.on('data', (c) => (data += c))
						res.on('error', reject)
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
				return body
			} catch (err) {
				const friendly = this._normalizeError(err, host, cmdStr)
				if (this._shouldResetAgent(err)) {
					this.instance.log('debug', `Resetting HTTP agent after network error (${err?.code || 'unknown'})`)
					this.resetAgent()
				}
				this.instance.log('error', `HTTP GET failed for ${path}: ${friendly}`)

				const error = err instanceof Error ? err : new Error(String(err))
				error.message = friendly
				throw error
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
