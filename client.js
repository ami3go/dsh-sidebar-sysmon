window.__ModuleLoader__.load({
  id: '@local/sidebar-sysmon',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Relative to the page directory, like the shipped Connection Fetch clients. */
    const ENDPOINT = 'api/sysmon.load'
    const POLL_MS = 2000

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
            minWidth: 10,
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

    /** Wide strip lane: label, bar, value. */
    function Lane({ label, value, ready }) {
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 5, width: '100%', minWidth: 0 } },
        h(
          'span',
          {
            style: {
              ...LABEL,
              flex: 'none',
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
          ready ? `${Math.round(clamp(value))}%` : '–',
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
      return (number / 1024 / 1024 / 1024).toFixed(1)
    }

    /** The meter itself: two compact rows in the wide sidebar, two lines in the rail. */
    function SystemMonitor({ wide, t }) {
      const data = useLoad()
      const ready = data !== null
      const cpu = data === null ? 0 : clamp(data.cpu)
      const mem = data === null ? 0 : clamp(data.mem)
      const title =
        data === null
          ? t('loading')
          : t('tooltip', {
              cpu: Math.round(cpu),
              mem: Math.round(mem),
              used: gigabytes(data.used),
              total: gigabytes(data.total),
            })

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
              gap: 3,
              width: 34,
              padding: '2px 0',
              cursor: 'default',
              userSelect: 'none',
            },
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('span', { style: { ...LABEL, fontSize: 8, letterSpacing: '0.04em' } }, 'CPU'),
            h('span', { style: { ...VALUE, fontSize: 8, fontVariantNumeric: 'tabular-nums' } }, ready ? Math.round(cpu) : '–'),
          ),
          h(Bar, { value: cpu, height: 3 }),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('span', { style: { ...LABEL, fontSize: 8, letterSpacing: '0.04em' } }, 'MEM'),
            h('span', { style: { ...VALUE, fontSize: 8, fontVariantNumeric: 'tabular-nums' } }, ready ? Math.round(mem) : '–'),
          ),
          h(Bar, { value: mem, height: 3 }),
        )
      }

      return h(
        'div',
        {
          role: 'group',
          'aria-label': title,
          title: title,
          style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 3,
            flex: '1 1 auto',
            minWidth: 0,
            padding: '0 6px 0 2px',
            cursor: 'default',
            userSelect: 'none',
          },
        },
        h(Lane, { label: 'CPU', value: cpu, ready: ready }),
        h(Lane, { label: 'MEM', value: mem, ready: ready }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() =>
          ctx.locale.register('sysmon', {
            en: {
              label: 'CPU and memory load',
              loading: 'Reading CPU and memory load…',
              tooltip: 'CPU {cpu}% · memory {mem}% · {used} of {total} GB',
            },
            zh: {
              label: 'CPU 与内存占用',
              loading: '正在读取 CPU 和内存占用…',
              tooltip: 'CPU {cpu}% · 内存 {mem}% · {used} / {total} GB',
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
