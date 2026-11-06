window.__ModuleLoader__.load({
  id: '@local/sidebar-sysmon',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Relative to the page directory, like the shipped Connection Fetch clients. */
    const ENDPOINT = 'api/sysmon.load'
    const POLL_MS = 2000
    const GIB = 1024 * 1024 * 1024

    const LABEL = { color: 'var(--dsw-alias-label-secondary)' }
    const VALUE = { color: 'var(--dsw-alias-label-primary)' }

    /** Clamp a percentage into the drawable range. */
    function clamp(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return 0
      return Math.max(0, Math.min(100, number))
    }

    /** Color a meter by pressure: accent, warning, then error. */
    function tone(value) {
      if (value >= 85) return 'var(--dsw-alias-state-error-primary)'
      if (value >= 60) return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-brand-primary)'
    }

    /** One thin proportional bar on a themed track. */
    function Bar({ value, height }) {
      return h(
        'div',
        {
          style: {
            flex: 1,
            minWidth: 8,
            height: height,
            borderRadius: 999,
            background: 'var(--dsw-alias-border-l1)',
            overflow: 'hidden',
          },
        },
        h('div', {
          style: {
            width: `${clamp(value)}%`,
            height: '100%',
            borderRadius: 999,
            background: tone(value),
            transition: 'width 400ms ease, background 400ms ease',
          },
        }),
      )
    }

    /** One labelled grid cell: label, bar, value. */
    function Lane({ label, value, text, ready }) {
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 } },
        h(
          'span',
          {
            style: {
              ...LABEL,
              flex: 'none',
              width: 27,
              fontSize: 9,
              letterSpacing: '0.06em',
              fontWeight: 600,
            },
          },
          label,
        ),
        h(Bar, { value: value, height: 4 }),
        h(
          'span',
          {
            style: {
              ...VALUE,
              flex: 'none',
              minWidth: 26,
              fontSize: 10,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            },
          },
          ready ? text : '–',
        ),
      )
    }

    /** Poll the Host snapshot, keeping the last good reading while a request fails. */
    function useLoad() {
      const [state, setState] = React.useState(null)
      React.useEffect(() => {
        let stopped = false
        let timer = 0
        const read = async () => {
          if (stopped || document.hidden) return
          try {
            const response = await fetch(ENDPOINT, { cache: 'no-store' })
            if (!response.ok) return
            const next = await response.json()
            if (!stopped) setState(next)
          } catch {
            // Keep the previous sample; the next tick retries.
          }
        }
        read()
        timer = window.setInterval(read, POLL_MS)
        const onVisibility = () => {
          if (!document.hidden) read()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          stopped = true
          window.clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [])
      return state
    }

    /** GB with one decimal, for the tooltip. */
    function gigabytes(bytes) {
      const number = Number(bytes)
      if (!Number.isFinite(number) || number <= 0) return '0.0'
      return (number / GIB).toFixed(1)
    }

    /** Compact free-space readout, e.g. `38G` or `<1G`. */
    function freeLabel(space) {
      if (!space) return '–'
      const gb = Number(space.free) / GIB
      if (!Number.isFinite(gb)) return '–'
      if (gb < 1) return '<1G'
      return `${Math.round(gb)}G`
    }

    /** The meter itself: a 2×2 grid in the wide sidebar, four lines in the rail. */
    function SystemMonitor({ wide, t }) {
      const data = useLoad()
      const ready = data !== null
      const cpu = data === null ? 0 : clamp(data.cpu)
      const mem = data === null ? 0 : clamp(data.mem)
      const disk = data === null || !data.disk ? null : data.disk
      const tmp = data === null || !data.tmp ? null : data.tmp

      const title =
        data === null
          ? t('loading')
          : t('tooltip', {
              cpu: Math.round(cpu),
              mem: Math.round(mem),
              diskFree: disk ? gigabytes(disk.free) : '—',
              diskTotal: disk ? gigabytes(disk.total) : '—',
              tmpFree: tmp ? gigabytes(tmp.free) : '—',
              tmpTotal: tmp ? gigabytes(tmp.total) : '—',
            })

      const metrics = [
        { key: 'cpu', label: 'CPU', short: 'CPU', pct: cpu, text: `${Math.round(cpu)}%`, ready: ready },
        { key: 'mem', label: 'MEM', short: 'MEM', pct: mem, text: `${Math.round(mem)}%`, ready: ready },
        {
          key: 'disk',
          label: 'DISK',
          short: 'DSK',
          pct: disk ? clamp(disk.pct) : 0,
          text: freeLabel(disk),
          ready: disk !== null,
        },
        {
          key: 'tmp',
          label: 'TMP',
          short: 'TMP',
          pct: tmp ? clamp(tmp.pct) : 0,
          text: freeLabel(tmp),
          ready: tmp !== null,
        },
      ]

      if (!wide) {
        return h(
          'div',
          {
            role: 'group',
            'aria-label': title,
            title: title,
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              width: 34,
              padding: '2px 0',
              cursor: 'default',
              userSelect: 'none',
            },
          },
          metrics.map((metric) =>
            h(
              'div',
              {
                key: metric.key,
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
              },
              h('span', { style: { ...LABEL, fontSize: 8, letterSpacing: '0.04em' } }, metric.short),
              h(
                'span',
                { style: { ...VALUE, fontSize: 8, fontVariantNumeric: 'tabular-nums' } },
                metric.ready ? metric.text : '–',
              ),
            ),
          ),
        )
      }

      return h(
        'div',
        {
          role: 'group',
          'aria-label': title,
          title: title,
          style: {
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            columnGap: 10,
            rowGap: 3,
            alignContent: 'center',
            flex: '1 1 auto',
            minWidth: 0,
            padding: '0 6px 0 2px',
            cursor: 'default',
            userSelect: 'none',
          },
        },
        metrics.map((metric) =>
          h(Lane, {
            key: metric.key,
            label: metric.label,
            value: metric.pct,
            text: metric.text,
            ready: metric.ready,
          }),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() =>
          ctx.locale.register('sysmon', {
            en: {
              label: 'CPU, memory and disk load',
              loading: 'Reading CPU, memory and disk load…',
              tooltip:
                'CPU {cpu}% · memory {mem}% · disk {diskFree} of {diskTotal} GB free · /tmp {tmpFree} of {tmpTotal} GB free',
            },
            zh: {
              label: 'CPU、内存与磁盘占用',
              loading: '正在读取 CPU、内存与磁盘占用…',
              tooltip:
                'CPU {cpu}% · 内存 {mem}% · 磁盘剩余 {diskFree}/{diskTotal} GB · /tmp 剩余 {tmpFree}/{tmpTotal} GB',
            },
          }),
        )
        const t = ctx.locale.bind('sysmon')
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'sidebar-sysmon',
              order: -10,
              label: () => t('label'),
            },
            (props) => h(SystemMonitor, { wide: props.wide, t: t }),
          ),
        )
      },
    }
  },
})
