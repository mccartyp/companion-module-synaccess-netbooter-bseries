// http.js
import http from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { normalizeCmd } from './utils.js'

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

	async get(cmd, { timeoutMs } = {}) {
		if (!this._queue) this._queue = Promise.resolve()

		const cmdStr = String(cmd || '').trim()

		const run = async () => {
			this._pending++

			const cfg = this.instance.config || {}
			const host = String(cfg.host || '').trim()
			const user = String(cfg.username || '')
			const pass = String(cfg.password || '')

			const q = normalizeCmd(cmdStr) // spaces -> '+', no percent encoding
			const path = `/cmd.cgi?${q}`
			const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')

			const toMsRaw = timeoutMs ?? Number(cfg.controlTimeoutMs) ?? 20000
			const toMs = Number.isFinite(toMsRaw) && toMsRaw >= 250 ? toMsRaw : 20000

			const opts = {
				host,
				port: 80,
				method: 'GET',
				path,
				agent: this._agent,
				headers: {
					Authorization: `Basic ${token}`,
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

					req.setTimeout(toMs, () => {
						this.instance.log('debug', `HTTP Call Timed Out: cmd=${cmdStr} timeoutMs=${toMs} pending=${this._pending}`)
						req.destroy(new Error(`Call timed out (cmd=${cmdStr}, timeoutMs=${toMs})`))
					})

					req.on('error', reject)
					req.end()
				})
			} finally {
				this._pending--
			}
		}

		// Serialize requests. Ensure the next request runs even if the previous failed.
		const p = this._queue.then(
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
		this._queue = p.catch(() => undefined)

		return p
	}
}
