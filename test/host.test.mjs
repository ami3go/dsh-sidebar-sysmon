import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

/** Mount the host half against a stub Connection registry. */
function mount() {
  const routes = new Map()
  apply({
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
        },
      },
    },
  })
  return routes
}

const route = mount().get('/api/sysmon.load')

test('registers one authenticated read-only GET route', () => {
  assert.ok(route, 'the host half registers /api/sysmon.load')
  assert.deepEqual(route.methods, ['GET'])
  assert.equal(route.requestBody, 'buffered')
})

test('serves a no-store snapshot with bounded figures', async () => {
  const response = await route.fetch(new Request('http://dsh.test/api/sysmon.load'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')

  const sample = await response.json()
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
})

test('stays stable across consecutive requests', async () => {
  const read = async () => {
    const response = await route.fetch(new Request('http://dsh.test/api/sysmon.load'))
    return response.json()
  }

  const first = await read()
  await new Promise((resolve) => setTimeout(resolve, 450))
  const second = await read()

  assert.equal(second.total, first.total, 'total memory is stable')
  assert.ok(second.cpu >= 0 && second.cpu <= 100)
  assert.ok(second.mem >= 0 && second.mem <= 100)
})
