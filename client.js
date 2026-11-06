window.__ModuleLoader__.load({
  id: '@local/sidebar-sysmon',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    /** Relative to the page directory, like the shipped Connection Fetch clients. */
    const ENDPOINT = 'api/sysmon.load'
    const GIB = 1024 * 1024 * 1024
    const NS = 'sidebar-sysmon'

    const LABEL = { color: 'var(--dsw-alias-label-secondary)' }
    const VALUE = { color: 'var(--dsw-alias-label-primary)' }

    const FIELD = {
      boxSizing: 'border-box',
      width: '100%',
      maxWidth: 220,
      background: 'var(--dsw-alias-bg-layer-2)',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 6,
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: 13,
      padding: '6px 8px',
    }

    /** Clamp a percentage into the drawable range. */
    function clamp(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return 0
      return Math.max(0, Math.min(100, number))
    }

    /** Normalize the configured polling interval. */
    function normalizeRefresh(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return 2000
      return Math.max(500, Math.min(60000, Math.round(number)))
    }

    /** Color a meter by pressure: accent, warning, then error. */
    function tone(value, warn, error) {
      if (value >= error) return 'var(--dsw-alias-state-error-primary)'
      if (value >= warn) return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-brand-primary)'
    }

    /** One thin proportional bar on a themed track. */
    function Bar({ value, height, warn, error }) {
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
            background: tone(clamp(value), warn, error),
            transition: 'width 400ms ease, background 400ms ease',
          },
        }),
      )
    }

    /** One labelled grid cell: label, bar, value. */
    function Lane({ label, value, text, ready, warn, error }) {
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
        h(Bar, { value: value, height: 4, warn: warn, error: error }),
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

    /** A small on/off switch. */
    function Switch({ on }) {
      return h(
        'span',
        {
          'aria-hidden': true,
          style: {
            flex: 'none',
            width: 26,
            height: 14,
            borderRadius: 999,
            background: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)',
            position: 'relative',
            transition: 'background 150ms ease',
          },
        },
        h('span', {
          style: {
            position: 'absolute',
            top: 1,
            left: on ? 13 : 1,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 150ms ease',
          },
        }),
      )
    }

    /** The meter's ⋯ button; opens the quick on/off menu. */
    function MenuButton({ open, onClick, inputRef, t }) {
      const [hover, setHover] = React.useState(false)
      return h(
        'button',
        {
          ref: inputRef,
          type: 'button',
          'aria-label': t('menuLabel'),
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          title: t('menuLabel'),
          onClick: onClick,
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            flex: 'none',
            width: 18,
            height: 18,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            background: hover || open ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
            color: 'var(--dsw-alias-label-secondary)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          },
        },
        h(
          'svg',
          { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'currentColor', 'aria-hidden': true },
          h('circle', { cx: 3, cy: 8, r: 1.4 }),
          h('circle', { cx: 8, cy: 8, r: 1.4 }),
          h('circle', { cx: 13, cy: 8, r: 1.4 }),
        ),
      )
    }

    const MENU_ITEMS = [
      ['showCpu', 'showCpu'],
      ['showMem', 'showMem'],
      ['showDisk', 'showDisk'],
      ['showTmp', 'showTmp'],
    ]
    const MENU_WIDTH = 176

    /** Quick on/off popover for the four meters. */
    function MeterMenu({ anchorRef, form, settings, onClose, t }) {
      const [pos, setPos] = React.useState(null)
      const [error, setError] = React.useState(null)
      const panelRef = React.useRef(null)

      const snapshot = React.useSyncExternalStore(
        React.useCallback((listener) => form.subscribe(listener), [form]),
        React.useCallback(() => form.getSnapshot(), [form]),
      )

      React.useLayoutEffect(() => {
        const button = anchorRef.current
        if (!button) return
        const rect = button.getBoundingClientRect()
        setPos({
          left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)),
          bottom: Math.max(8, window.innerHeight - rect.top + 8),
        })
      }, [anchorRef])

      React.useEffect(() => {
        const onPointerDown = (event) => {
          const panel = panelRef.current
          const button = anchorRef.current
          if (panel && panel.contains(event.target)) return
          if (button && button.contains(event.target)) return
          onClose()
        }
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKey)
        }
      }, [anchorRef, onClose])

      const source = snapshot.status === 'ready' && snapshot.value ? snapshot.value : settings
      const locked = snapshot.status === 'ready' && !snapshot.writable

      const toggle = (field) => {
        setError(null)
        const next = source[field] === false
        form
          .set(field, next)
          .then((accepted) => {
            if (!accepted) setError(t('settingsRefused'))
          })
          .catch((cause) => {
            setError(cause instanceof Error ? cause.message : String(cause))
          })
      }

      if (pos === null) return null

      return createPortal(
        h(
          'div',
          {
            ref: panelRef,
            role: 'menu',
            'aria-label': t('meters'),
            style: {
              position: 'fixed',
              left: pos.left,
              bottom: pos.bottom,
              width: MENU_WIDTH,
              zIndex: 10000,
              background: 'var(--dsw-alias-bg-overlay)',
              border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 10,
              padding: 6,
              boxShadow: '0 8px 28px rgba(0, 0, 0, 0.28)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            },
          },
          h(
            'div',
            { style: { ...LABEL, fontSize: 10, letterSpacing: '0.06em', fontWeight: 600, padding: '4px 6px 2px' } },
            t('meters'),
          ),
          MENU_ITEMS.map(([field, label]) =>
            h(
              'button',
              {
                key: field,
                type: 'button',
                role: 'menuitemcheckbox',
                'aria-checked': source[field] !== false,
                disabled: locked,
                onClick: () => toggle(field),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  width: '100%',
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: 'var(--dsw-alias-label-primary)',
                  font: 'inherit',
                  fontSize: 12,
                  cursor: locked ? 'default' : 'pointer',
                  textAlign: 'left',
                },
              },
              h('span', null, t(label)),
              h(Switch, { on: source[field] !== false }),
            ),
          ),
          error === null
            ? null
            : h(
                'div',
                { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 11, padding: '4px 6px' } },
                error,
              ),
        ),
        document.body,
      )
    }

    /** The sidebar meter; settings arrive with each poll. */
    function SystemMonitor({ wide, t, ctx }) {
      const [data, setData] = React.useState(null)
      const [menuOpen, setMenuOpen] = React.useState(false)
      const buttonRef = React.useRef(null)
      const closeMenu = React.useCallback(() => setMenuOpen(false), [])
      const forms = ctx.get('configForms')
      const ns = data && typeof data.ns === 'string' && data.ns.length > 0 ? data.ns : NS
      const form = React.useMemo(() => (forms ? forms.get(ns) : undefined), [forms, ns])
      const pollMs = normalizeRefresh(data && data.settings ? data.settings.refreshMs : undefined)

      React.useEffect(() => {
        let stopped = false
        let timer = 0
        const read = async () => {
          if (stopped || document.hidden) return
          try {
            const response = await fetch(ENDPOINT, { cache: 'no-store' })
            if (!response.ok) return
            const next = await response.json()
            if (!stopped) setData(next)
          } catch {
            // Keep the previous sample; the next tick retries.
          }
        }
        read()
        timer = window.setInterval(read, pollMs)
        const onVisibility = () => {
          if (!document.hidden) read()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          stopped = true
          window.clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [pollMs])

      const settings = data && data.settings ? data.settings : {}
      const warn = clamp(settings.warnPct === undefined ? 60 : settings.warnPct)
      const error = Math.max(warn + 1, clamp(settings.errorPct === undefined ? 85 : settings.errorPct))
      const ready = data !== null
      const cpu = ready ? clamp(data.cpu) : 0
      const mem = ready ? clamp(data.mem) : 0
      const disk = ready && data.disk ? data.disk : null
      const tmp = ready && data.tmp ? data.tmp : null

      const metrics = []
      if (settings.showCpu !== false) {
        metrics.push({ key: 'cpu', label: 'CPU', short: 'CPU', pct: cpu, text: `${Math.round(cpu)}%`, ready: ready })
      }
      if (settings.showMem !== false) {
        metrics.push({ key: 'mem', label: 'MEM', short: 'MEM', pct: mem, text: `${Math.round(mem)}%`, ready: ready })
      }
      if (settings.showDisk !== false) {
        metrics.push({
          key: 'disk',
          label: 'DISK',
          short: 'DSK',
          pct: disk ? clamp(disk.pct) : 0,
          text: freeLabel(disk),
          ready: disk !== null,
        })
      }
      if (settings.showTmp !== false) {
        metrics.push({
          key: 'tmp',
          label: 'TMP',
          short: 'TMP',
          pct: tmp ? clamp(tmp.pct) : 0,
          text: freeLabel(tmp),
          ready: tmp !== null,
        })
      }
      const menuButton = form
        ? h(MenuButton, {
            open: menuOpen,
            onClick: () => setMenuOpen((value) => !value),
            inputRef: buttonRef,
            t: t,
          })
        : null
      const menu = menuOpen && form ? h(MeterMenu, { anchorRef: buttonRef, form, settings, onClose: closeMenu, t }) : null

      if (metrics.length === 0) {
        if (!menuButton) return null
        return h(
          React.Fragment,
          null,
          wide
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    flex: '1 1 auto',
                    minWidth: 0,
                    padding: '0 6px 2px',
                  },
                },
                menuButton,
              )
            : h('div', { style: { display: 'flex', justifyContent: 'center', width: 34, padding: '2px 0' } }, menuButton),
          menu,
        )
      }

      const parts = []
      if (!ready) {
        parts.push(t('loading'))
      } else {
        if (settings.showCpu !== false) parts.push(t('tipCpu', { value: Math.round(cpu) }))
        if (settings.showMem !== false) parts.push(t('tipMem', { value: Math.round(mem) }))
        if (settings.showDisk !== false) {
          parts.push(
            disk
              ? t('tipDisk', { free: gigabytes(disk.free), total: gigabytes(disk.total) })
              : t('tipDiskMissing'),
          )
        }
        if (settings.showTmp !== false) {
          parts.push(tmp ? t('tipTmp', { free: gigabytes(tmp.free), total: gigabytes(tmp.total) }) : t('tipTmpMissing'))
        }
      }
      const title = parts.join(' · ')

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
          menuButton === null ? null : h('div', { style: { display: 'flex', justifyContent: 'center', paddingTop: 2 } }, menuButton),
          menu,
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
            alignItems: 'center',
            gap: 2,
            flex: '1 1 auto',
            minWidth: 0,
            padding: '0 6px 0 2px',
            cursor: 'default',
            userSelect: 'none',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              columnGap: 10,
              rowGap: 3,
              alignContent: 'center',
              flex: '1 1 auto',
              minWidth: 0,
            },
          },
          metrics.map((metric) =>
            h(Lane, {
              key: metric.key,
              label: metric.label,
              value: metric.pct,
              text: metric.text,
              ready: metric.ready,
              warn: warn,
              error: error,
            }),
          ),
        ),
        menuButton,
        menu,
      )
    }

    /** Controlled text field that commits on blur or Enter. */
    function TextField({ value, disabled, onCommit }) {
      const [draft, setDraft] = React.useState(String(value === undefined ? '' : value))
      React.useEffect(() => {
        setDraft(String(value === undefined ? '' : value))
      }, [value])
      const commit = () => {
        const next = draft.trim()
        if (next !== String(value === undefined ? '' : value)) onCommit(next)
      }
      return h('input', {
        type: 'text',
        style: FIELD,
        value: draft,
        disabled: disabled,
        spellCheck: false,
        onChange: (event) => setDraft(event.target.value),
        onBlur: commit,
        onKeyDown: (event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        },
      })
    }

    /** Controlled integer field with a suffix, committed on blur or Enter. */
    function NumberField({ value, min, max, suffix, disabled, onCommit }) {
      const [draft, setDraft] = React.useState(String(value === undefined ? '' : value))
      React.useEffect(() => {
        setDraft(String(value === undefined ? '' : value))
      }, [value])
      const commit = () => {
        const parsed = Number(draft)
        if (!Number.isFinite(parsed)) {
          setDraft(String(value === undefined ? '' : value))
          return
        }
        const next = Math.min(max, Math.max(min, Math.round(parsed)))
        setDraft(String(next))
        if (next !== value) onCommit(next)
      }
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8, maxWidth: 220 } },
        h('input', {
          type: 'number',
          style: FIELD,
          value: draft,
          min: min,
          max: max,
          disabled: disabled,
          onChange: (event) => setDraft(event.target.value),
          onBlur: commit,
          onKeyDown: (event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          },
        }),
        h('span', { style: { ...LABEL, fontSize: 12 } }, suffix),
      )
    }

    /** One labelled settings row. */
    function Row({ label, children }) {
      return h(
        'div',
        { style: { display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr)', alignItems: 'center', gap: 12 } },
        h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, label),
        h('div', { style: { minWidth: 0 } }, children),
      )
    }

    /** Checkbox bound to one boolean field. */
    function Check({ label, checked, disabled, onCommit }) {
      return h(
        'label',
        { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: disabled ? 'default' : 'pointer' } },
        h('input', {
          type: 'checkbox',
          checked: checked !== false,
          disabled: disabled,
          style: { accentColor: 'var(--dsw-alias-brand-primary)', margin: 0 },
          onChange: (event) => onCommit(event.target.checked),
        }),
        label,
      )
    }

    /** The Plugins → System monitor page. */
    function SettingsPage({ ctx, t }) {
      const [ns, setNs] = React.useState(NS)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let stopped = false
        fetch(ENDPOINT, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((sample) => {
            if (!stopped && sample && typeof sample.ns === 'string' && sample.ns.length > 0) setNs(sample.ns)
          })
          .catch(() => {})
        return () => {
          stopped = true
        }
      }, [])

      const form = React.useMemo(() => ctx.configForms.get(ns), [ctx, ns])
      const snapshot = React.useSyncExternalStore(
        React.useCallback((listener) => form.subscribe(listener), [form]),
        React.useCallback(() => form.getSnapshot(), [form]),
      )

      const commit = React.useCallback(
        async (field, value) => {
          setError(null)
          setBusy(true)
          try {
            const accepted = await form.set(field, value)
            if (!accepted) setError(t('settingsRefused'))
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause))
          } finally {
            setBusy(false)
          }
        },
        [form, t],
      )

      if (snapshot.status === 'loading') {
        return h('div', { style: { ...LABEL, fontSize: 13 } }, t('settingsLoading'))
      }
      if (snapshot.status === 'unavailable') {
        return h('div', { style: { ...LABEL, fontSize: 13 } }, t('settingsUnavailable'))
      }

      const value = snapshot.value || {}
      const disabled = busy || !snapshot.writable

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 660, padding: '2px' } },
        h(
          'p',
          { style: { margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' } },
          t('settingsIntro'),
        ),

        h(
          'section',
          { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h('span', { style: { ...LABEL, fontSize: 11, letterSpacing: '0.06em', fontWeight: 600 } }, t('meters')),
          h(
            'div',
            { style: { display: 'flex', flexWrap: 'wrap', gap: 18 } },
            h(Check, {
              label: t('showCpu'),
              checked: value.showCpu,
              disabled: disabled,
              onCommit: (next) => commit('showCpu', next),
            }),
            h(Check, {
              label: t('showMem'),
              checked: value.showMem,
              disabled: disabled,
              onCommit: (next) => commit('showMem', next),
            }),
            h(Check, {
              label: t('showDisk'),
              checked: value.showDisk,
              disabled: disabled,
              onCommit: (next) => commit('showDisk', next),
            }),
            h(Check, {
              label: t('showTmp'),
              checked: value.showTmp,
              disabled: disabled,
              onCommit: (next) => commit('showTmp', next),
            }),
          ),
        ),

        h(
          'section',
          { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h('span', { style: { ...LABEL, fontSize: 11, letterSpacing: '0.06em', fontWeight: 600 } }, t('polling')),
          h(
            Row,
            { label: t('refreshMs') },
            h(NumberField, {
              value: value.refreshMs,
              min: 500,
              max: 60000,
              suffix: 'ms',
              disabled: disabled,
              onCommit: (next) => commit('refreshMs', next),
            }),
          ),
        ),

        h(
          'section',
          { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h('span', { style: { ...LABEL, fontSize: 11, letterSpacing: '0.06em', fontWeight: 600 } }, t('paths')),
          h(Row, { label: t('diskPath') }, h(TextField, {
            value: value.diskPath,
            disabled: disabled,
            onCommit: (next) => commit('diskPath', next),
          })),
          h(Row, { label: t('tmpPath') }, h(TextField, {
            value: value.tmpPath,
            disabled: disabled,
            onCommit: (next) => commit('tmpPath', next),
          })),
        ),

        h(
          'section',
          { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h('span', { style: { ...LABEL, fontSize: 11, letterSpacing: '0.06em', fontWeight: 600 } }, t('thresholds')),
          h(Row, { label: t('warnPct') }, h(NumberField, {
            value: value.warnPct,
            min: 1,
            max: 99,
            suffix: '%',
            disabled: disabled,
            onCommit: (next) => commit('warnPct', next),
          })),
          h(Row, { label: t('errorPct') }, h(NumberField, {
            value: value.errorPct,
            min: 2,
            max: 100,
            suffix: '%',
            disabled: disabled,
            onCommit: (next) => commit('errorPct', next),
          })),
        ),

        error === null ? null : h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 } }, error),
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
              tipCpu: 'CPU {value}%',
              tipMem: 'memory {value}%',
              tipDisk: 'disk {free} of {total} GB free',
              tipTmp: '/tmp {free} of {total} GB free',
              tipDiskMissing: 'disk unavailable',
              tipTmpMissing: '/tmp unavailable',
              menuLabel: 'Show or hide meters',
              settingsTab: 'System monitor',
              settingsIntro:
                'Choose which meters the sidebar shows and how often it refreshes. Changes apply immediately and persist in the profile configuration.',
              settingsLoading: 'Loading configuration…',
              settingsUnavailable: 'This plugin’s configuration is not available for editing.',
              settingsRefused: 'The configuration change was refused.',
              meters: 'Meters',
              showCpu: 'CPU',
              showMem: 'Memory',
              showDisk: 'Disk',
              showTmp: '/tmp',
              polling: 'Polling',
              refreshMs: 'Refresh interval',
              paths: 'Paths',
              diskPath: 'Disk path',
              tmpPath: 'Temp path',
              thresholds: 'Alert thresholds',
              warnPct: 'Warning at',
              errorPct: 'Critical at',
            },
            zh: {
              label: 'CPU、内存与磁盘占用',
              loading: '正在读取 CPU、内存与磁盘占用…',
              tipCpu: 'CPU {value}%',
              tipMem: '内存 {value}%',
              tipDisk: '磁盘剩余 {free}/{total} GB',
              tipTmp: '/tmp 剩余 {free}/{total} GB',
              tipDiskMissing: '磁盘不可用',
              tipTmpMissing: '/tmp 不可用',
              menuLabel: '显示或隐藏指标',
              settingsTab: '系统监视器',
              settingsIntro: '选择侧边栏显示哪些指标以及刷新频率。更改立即生效并保存在配置中。',
              settingsLoading: '正在加载配置…',
              settingsUnavailable: '此插件的配置当前不可编辑。',
              settingsRefused: '配置更改被拒绝。',
              meters: '指标',
              showCpu: 'CPU',
              showMem: '内存',
              showDisk: '磁盘',
              showTmp: '/tmp',
              polling: '刷新',
              refreshMs: '刷新间隔',
              paths: '路径',
              diskPath: '磁盘路径',
              tmpPath: '临时目录',
              thresholds: '告警阈值',
              warnPct: '警告',
              errorPct: '严重',
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
            (props) => h(SystemMonitor, { wide: props.wide, t: t, ctx: ctx }),
          ),
        )

        ctx.inject(['configForms'], (child) => {
          child.slots.inject('settings.plugins.tab', () =>
            child.slots.register(
              {
                name: 'settings.plugins.tab',
                id: 'sysmon',
                order: 20,
                label: () => t('settingsTab'),
              },
              () => h(SettingsPage, { ctx: child, t: t }),
            ),
          )
        })
      },
    }
  },
})
