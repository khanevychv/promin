// Test harness: serves the project folder and drives headless Edge through the DevTools protocol.
// Each "device" is a separate browser profile, so localStorage and the service worker are its own.
import { spawn, execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const EDGE = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function startServer(port = 5610) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0])
    const file = join(ROOT, path === '/' ? 'index.html' : path)
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
    try {
      const data = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(data)
    } catch { res.writeHead(404); res.end('not found') }
  })
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((done) => { server.closeAllConnections(); server.close(done) }),
  })))
}

export async function openDevice({ width = 1280, height = 860, mobile = false } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'promin-device-'))
  const port = 9600 + Math.floor(Math.random() * 300)
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  let wsUrl
  for (let i = 0; i < 120 && !wsUrl; i++) {
    await sleep(250)
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch {}
  }
  if (!wsUrl) throw new Error('Edge DevTools not reachable')
  const ws = new WebSocket(wsUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)
  })
  const send = (method, params = {}) => new Promise((ok) => { const n = ++id; pending.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })) })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })

  const device = {
    errors,
    send,
    async goto(url, wait = 1500) { await send('Page.navigate', { url }); await sleep(wait) },
    async reload(wait = 1500) { await send('Page.reload', { ignoreCache: true }); await sleep(wait) },
    // Runs an expression (or async IIFE) in the page and returns its JSON value; page exceptions are rethrown.
    async eval(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text)
      return res.result?.result?.value
    },
    async waitFor(expression, timeout = 10_000) {
      const end = Date.now() + timeout
      while (Date.now() < end) {
        if (await device.eval(`Boolean(${expression})`).catch(() => false)) return true
        await sleep(150)
      }
      throw new Error(`timed out waiting for: ${expression}`)
    },
    async setOffline(offline) {
      await send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    },
    async blockUrls(urls) { await send('Network.setBlockedURLs', { urls }) },
    async resize(w, h, isMobile = w < 600) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: isMobile }) },
    async screenshot(path) {
      const { result } = await send('Page.captureScreenshot', { format: 'png' })
      const { writeFile } = await import('node:fs/promises')
      await writeFile(path, Buffer.from(result.data, 'base64'))
    },
    async close() {
      ws.close()
      try { execSync(`taskkill /PID ${edge.pid} /T /F`, { stdio: 'ignore' }) } catch {}
      await sleep(300)
      await rm(profile, { recursive: true, force: true }).catch(() => {})
    },
  }
  return device
}

// Today in the app's own date format (local time, YYYY-MM-DD).
export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
