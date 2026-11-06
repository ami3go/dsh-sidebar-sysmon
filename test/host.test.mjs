import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, Config } from '../index.js'

const FIELD_NAMES = [
  'refreshMs',
  'showCpu',
  'showMem',
  'showDisk',
  'showTmp',
  'diskPath',
  'tmpPath',
  'warnPct',
  'errorPct',
]

/** Live configuration values behind volatile accessors, as the Loader supplies them. */
function configStub(overrides = {}) {
  const values = {
    refreshMs: 2000,
    showCpu: true,
    showMem: true,
    showDisk: true,
    showTmp: true,
    diskPath: '/',
    tmpPath: '/tmp',
    warnPct: 60,
    errorPct: 85,
    ...overrides,
  }
  const config = {}
  for (const name of FIELD_NAMES) {
    config[name] = { get: () => values[name] }
  }
  return { config, values }
}

/** Mount the host half against a stub Connection registry and plugin context. */
function mount(overrides = {}) {
  const routes = new Map()
  const { config, values } = configStub(overrides)
  apply(
    {
      fiber: { entry: { options: { id: 'sidebar-sysmon' } } },
      inject: () => {},
      connection: {
        fetch: {
          register(route) {
            routes.set(route.path, route)
          },
        },
      },
    },
    config,
  )
  return { route: routes.get('/api/sysmon.load'), values }
}

async function read(route) {
  const response = await route.fetch(new Request('http://dsh.test/api/sysmon.load'))
  return { response, sample: await response.json() }
}

const { route } = mount()

test('registers one authenticated read-only GET route', () => {
  assert.ok(route, 'the host half registers /api/sysmon.load')
  assert.deepEqual(route.methods, ['GET'])
  assert.equal(route.requestBody, 'buffered')
})

test('every setting is optional and defaults are declared', () => {
  const resolved = Config({})
  const valueOf = (entry) => (entry !== null && typeof entry === 'object' && typeof entry.get === 'function' ? entry.get() : entry)
  for (const name of FIELD_NAMES) {
    assert.ok(name in resolved, `${name} resolves its default`)
  }
  assert.equal(valueOf(resolved.refreshMs), 2000)
  assert.equal(valueOf(resolved.diskPath), '/')
  assert.equal(valueOf(resolved.tmpPath), '/tmp')
  assert.equal(valueOf(resolved.warnPct), 60)
  assert.equal(valueOf(resolved.errorPct), 85)
})

test('serves a no-store snapshot with bounded figures', async () => {
  const { response, sample } = await read(route)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')

  assert.equal(typeof sample.cpu, 'number')
  assert.equal(typeof sample.mem, 'number')
  assert.ok(sample.cpu >= 0 && sample.cpu <= 100, `cpu ${sample.cpu} is a percentage`)
  assert.ok(sample.mem >= 0 && sample.mem <= 100, `mem ${sample.mem} is a percentage`)
  assert.ok(sample.total > 0, 'total memory is positive')
  assert.ok(sample.used >= 0 && sample.used <= sample.total, 'used memory stays within total')
  assert.ok(sample.cores >= 1, 'at least one core is reported')
  assert.ok(sample.load1 >= 0, 'load average is non-negative')
  assert.ok(Math.abs(Date.now() - sample.at) < 5_000, 'the sample is fresh')

  for (const key of ['disk', 'tmp']) {
    assert.ok(key in sample, `${key} is reported`)
    const space = sample[key]
    if (space === null) continue // statfs unavailable on this platform
    assert.ok(space.total > 0, `${key} total is positive`)
    assert.ok(space.free >= 0 && space.free <= space.total, `${key} free stays within total`)
    assert.equal(space.used, space.total - space.free, `${key} used is total minus free`)
    assert.ok(space.pct >= 0 && space.pct <= 100, `${key} percent is bounded`)
  }

  if (process.platform === 'linux') {
    assert.ok(sample.disk, 'the root filesystem is measurable on Linux')
    assert.ok(sample.tmp, 'the temp filesystem is measurable on Linux')
  }

  assert.equal(sample.ns, 'sidebar-sysmon', 'the settings namespace is reported')
  assert.equal(sample.settings.refreshMs, 2000)
  assert.equal(sample.settings.showCpu, true)
})

test('reports live settings and hidden meters on every request', async () => {
  const live = mount({ refreshMs: 5000, showTmp: false, warnPct: 40 })
  const first = await read(live.route)
  assert.equal(first.sample.settings.refreshMs, 5000)
  assert.equal(first.sample.settings.showTmp, false)
  assert.equal(first.sample.settings.warnPct, 40)

  live.values.refreshMs = 1000
  live.values.showTmp = true
  const second = await read(live.route)
  assert.equal(second.sample.settings.refreshMs, 1000, 'volatile values are re-read per request')
  assert.equal(second.sample.settings.showTmp, true)
})

test('stays stable across consecutive requests', async () => {
  const first = await read(route)
  await new Promise((resolve) => setTimeout(resolve, 450))
  const second = await read(route)

  assert.equal(second.sample.total, first.sample.total, 'total memory is stable')
  assert.ok(second.sample.cpu >= 0 && second.sample.cpu <= 100)
  assert.ok(second.sample.mem >= 0 && second.sample.mem <= 100)
})
