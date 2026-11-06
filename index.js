/**
 * Host half of the sidebar system monitor.
 *
 * It owns one authenticated read-only Fetch route (`GET /api/sysmon.load`) on
 * the shared Connection channel, so the browser half can poll live CPU,
 * memory, disk, and /tmp figures without registering a public web route.
 *
 * Every field is optional and live-editable from the plugin's Settings page:
 * the values are declared `.volatile()`, so a write changes the running meter
 * without restarting the entry.
 */
import z from '@deepseek-ai/schemastery'
import { readFileSync, statfsSync } from 'node:fs'
import os from 'node:os'

/** Connection must exist before the route can be registered. */
export const inject = ['connection']

const ROUTE = '/api/sysmon.load'
/** Settings namespace (the profile row id) the client page writes through. */
export const SETTINGS_NS = 'sidebar-sysmon'

/** Every field is optional: defaults apply when the profile declares nothing. */
export const Config = z.object({
  refreshMs: z.natural().min(500).max(60000).default(2000).volatile(),
  showCpu: z.boolean().default(true).volatile(),
  showMem: z.boolean().default(true).volatile(),
  showDisk: z.boolean().default(true).volatile(),
  showTmp: z.boolean().default(true).volatile(),
  diskPath: z.string().default('/').volatile(),
  tmpPath: z.string().default('/tmp').volatile(),
  warnPct: z.natural().min(1).max(99).default(60).volatile(),
  errorPct: z.natural().min(2).max(100).default(85).volatile(),
})

/**
 * Snapshot the aggregate CPU time counters.
 * @returns idle and total jiffies across every core.
 */
function sampleCpu() {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    const times = cpu.times
    idle += times.idle
    total += times.user + times.nice + times.sys + times.irq + times.idle
  }
  return { idle, total, at: Date.now() }
}

let previous = sampleCpu()
/** Last computed value, reused when two requests arrive too close together. */
let previousPercent = 0
/** A longer idle gap is re-measured instead of averaged across the idle time. */
const MAX_GAP_MS = 5000
/** A too-short gap is noise; measure a short fresh window instead. */
const MIN_GAP_MS = 400

/**
 * CPU busy percentage since the previous request.
 * @returns 0-100, rounded to one decimal.
 */
function cpuPercent() {
  const current = sampleCpu()
  const totalDelta = current.total - previous.total
  const idleDelta = current.idle - previous.idle
  const at = current.at
  if (totalDelta > 0) {
    previousPercent = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100))
  }
  previous = { idle: current.idle, total: current.total, at }
  return Math.round(previousPercent * 10) / 10
}

/**
 * Total and available memory in bytes.
 * Linux reports MemAvailable, which reflects reclaimable cache; other
 * platforms fall back to the Node totals.
 * @returns total and available bytes.
 */
function readMemory() {
  try {
    const text = readFileSync('/proc/meminfo', 'utf8')
    const totalKb = Number(/^MemTotal:\s+(\d+)\s+kB/m.exec(text)?.[1])
    const availableKb = Number(/^MemAvailable:\s+(\d+)\s+kB/m.exec(text)?.[1])
    if (Number.isFinite(totalKb) && Number.isFinite(availableKb) && totalKb > 0) {
      return { total: totalKb * 1024, available: availableKb * 1024 }
    }
  } catch {
    // Not Linux: fall through to the portable totals below.
  }
  return { total: os.totalmem(), available: os.freemem() }
}

/**
 * Free and total bytes of the filesystem holding `path`.
 * @param path - Existing path on the filesystem to measure.
 * @returns capacity in bytes, or null when the path cannot be measured.
 */
function readSpace(path) {
  try {
    const stats = statfsSync(path)
    const total = Number(stats.blocks) * Number(stats.bsize)
    const free = Number(stats.bavail) * Number(stats.bsize)
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) return null
    const available = Math.max(0, Math.min(total, free))
    return {
      total,
      free: available,
      used: total - available,
      pct: Math.round(((total - available) / total) * 1000) / 10,
    }
  } catch {
    return null
  }
}

/**
 * Read the live (volatile) configuration values.
 * @param config - Resolved plugin config carrying volatile accessors.
 * @returns Plain settings object for the wire payload.
 */
function readSettings(config) {
  const read = (name, fallback) => {
    const entry = config === undefined ? undefined : config[name]
    if (entry !== null && typeof entry === 'object' && typeof entry.get === 'function') return entry.get()
    return entry === undefined ? fallback : entry
  }
  return {
    refreshMs: read('refreshMs', 2000),
    showCpu: read('showCpu', true),
    showMem: read('showMem', true),
    showDisk: read('showDisk', true),
    showTmp: read('showTmp', true),
    diskPath: read('diskPath', '/'),
    tmpPath: read('tmpPath', '/tmp'),
    warnPct: read('warnPct', 60),
    errorPct: read('errorPct', 85),
  }
}

/**
 * Build one load sample.
 * @param config - Resolved plugin config carrying volatile accessors.
 * @returns JSON-serializable CPU, memory, and disk figures for the browser half.
 */
async function sample(config) {
  const settings = readSettings(config)
  const gap = Date.now() - previous.at
  if (gap > MAX_GAP_MS || gap < MIN_GAP_MS) {
    previous = sampleCpu()
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  const memory = readMemory()
  const used = Math.max(0, memory.total - memory.available)
  const diskPath = settings.diskPath.trim() || '/'
  const tmpPath = settings.tmpPath.trim() || '/tmp'
  return {
    cpu: cpuPercent(),
    mem: memory.total > 0 ? Math.round((used / memory.total) * 1000) / 10 : 0,
    total: memory.total,
    used,
    cores: os.cpus().length,
    load1: os.loadavg()[0],
    uptime: os.uptime(),
    disk: readSpace(diskPath),
    tmp: readSpace(tmpPath) ?? readSpace(os.tmpdir()),
    settings,
    ns: SETTINGS_NS,
    at: Date.now(),
  }
}

/**
 * Register the authenticated snapshot route.
 * @param ctx - Host plugin context providing the Connection service.
 * @param config - Resolved plugin config (volatile fields read per request).
 */
export function apply(ctx, config = {}) {
  // This plugin ships its own Settings page, so no auto-generated form is needed.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })

  const ns = ctx.fiber?.entry?.options?.id ?? SETTINGS_NS
  ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      const body = await sample(config)
      body.ns = ns
      return Response.json(body, {
        headers: { 'cache-control': 'no-store' },
      })
    },
  })
}
