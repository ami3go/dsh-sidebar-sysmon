/**
 * Host half of the sidebar system monitor.
 *
 * It owns one authenticated read-only Fetch route (`GET /api/sysmon.load`) on
 * the shared Connection channel, so the browser half can poll live CPU,
 * memory, root-disk, and /tmp figures without registering a public web route.
 */
import { readFileSync, statfsSync } from 'node:fs'
import os from 'node:os'

/** Connection must exist before the route can be registered. */
export const inject = ['connection']

const ROUTE = '/api/sysmon.load'

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
 * Capacity of the temp directory: `/tmp` when it exists, otherwise the
 * platform's tmpdir.
 * @returns capacity in bytes, or null when unmeasurable.
 */
function readTmp() {
  return readSpace('/tmp') ?? readSpace(os.tmpdir())
}

/**
 * Build one load sample.
 * @returns JSON-serializable CPU, memory, and disk figures for the browser half.
 */
async function sample() {
  const gap = Date.now() - previous.at
  if (gap > MAX_GAP_MS || gap < MIN_GAP_MS) {
    previous = sampleCpu()
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  const memory = readMemory()
  const used = Math.max(0, memory.total - memory.available)
  return {
    cpu: cpuPercent(),
    mem: memory.total > 0 ? Math.round((used / memory.total) * 1000) / 10 : 0,
    total: memory.total,
    used,
    cores: os.cpus().length,
    load1: os.loadavg()[0],
    uptime: os.uptime(),
    disk: readSpace('/'),
    tmp: readTmp(),
    at: Date.now(),
  }
}

/**
 * Register the authenticated snapshot route.
 * @param ctx - Host plugin context providing the Connection service.
 */
export function apply(ctx) {
  ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () =>
      Response.json(await sample(), {
        headers: { 'cache-control': 'no-store' },
      }),
  })
}
