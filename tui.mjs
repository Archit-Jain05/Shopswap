// Interactive dashboard for shopswap (alt screen, no dependencies).
import readline from 'node:readline'
import { run, load, shops, prof, show } from './shopswap.mjs'

const BG = 233, SEL = 237
const GREY = 245, DIM = 242, TEXT = 188, ACCENT = 173, OK = 108
const HINT = '↑↓ select store · n rename · enter switch to its account · a add current · d remove account · q quit'

// segs: [[fg, text, bold?], ...] -> one full-width line on background bg
function line(segs, cols, bg = BG) {
  let used = 0
  const body = segs.map(([fg, t, b]) => { used += [...t].length; return `\x1b[${b ? '1;' : ''}38;5;${fg};48;5;${bg}m${t}` }).join('')
  return body + `\x1b[48;5;${bg}m${' '.repeat(Math.max(0, cols - used))}\x1b[0m`
}

// selectable rows: one per store, grouped by account (an account with no stores gets one placeholder row)
const rowsOf = L => L.accounts.flatMap((n, i) => { const hs = shops(prof(n)); return hs.length ? hs.map(h => ({ n, i, h })) : [{ n, i, h: null }] })

export function frame(st, cols = 80, rows = 24) {
  const L = load()
  const out = [line([], cols)]
  if (!L.accounts.length) out.push(line([[GREY, '   no accounts yet — log in with `shopify auth login`, then press a']], cols))
  let last = -1
  rowsOf(L).forEach((r, k) => {
    if (r.i !== last) {
      if (last >= 0) out.push(line([], cols))
      out.push(line([[GREY, `  ${r.i + 1}  `, true], [TEXT, r.n], ...(r.n === L.active ? [[ACCENT, '  ● active', true]] : [])], cols))
      last = r.i
    }
    const on = k === st.sel
    out.push(line([[ACCENT, on ? '    ▸ ' : '      '], [on ? TEXT : GREY, r.h ? show(L, r.h) : '(no stores)', on]], cols, on ? SEL : BG))
  })
  while (out.length < rows - 2) out.push(line([], cols))
  const status = st.input != null ? `${st.prompt}${st.input}▏` : st.confirm ? `remove account ${st.confirm}? (y/n)` : st.msg ?? ''
  out.push(line([[st.err ? 167 : OK, '   ' + status]], cols))
  out.push(line([[DIM, '   ' + HINT]], cols))
  return out.slice(0, rows).join('\r\n')
}

// returns false to quit
export function onKey(st, key, ch) {
  const L = load(), rows = rowsOf(L), row = rows[st.sel]
  const act = f => { try { st.msg = f(); st.err = false } catch (e) { st.msg = e.message; st.err = true } }
  if (st.input != null) { // typing the new name for the highlighted store
    if (key === 'return') {
      act(() => run(['name', st.target, st.input.trim() || '--unset']))
      st.input = null
    } else if (key === 'escape') st.input = null
    else if (key === 'backspace') st.input = st.input.slice(0, -1)
    else if (ch && ch >= ' ' && ch !== '\x7f') st.input += ch
    return true
  }
  if (st.confirm) {
    if (key === 'y') act(() => run(['remove', st.confirm]))
    st.confirm = null; st.sel = Math.max(0, Math.min(st.sel, rowsOf(load()).length - 1))
    return true
  }
  st.msg = null
  if (key === 'q' || key === 'escape' || key === 'ctrl-c') return false
  if ((key === 'down' || key === 'j') && rows.length) st.sel = (st.sel + 1) % rows.length
  else if ((key === 'up' || key === 'k') && rows.length) st.sel = (st.sel - 1 + rows.length) % rows.length
  else if (key === 'return' && row) act(() => run(['switch', String(row.i + 1)]))
  else if (key === 'a') act(() => { const m = run(['add']); st.sel = Math.max(0, rowsOf(load()).findIndex(r => r.n === load().active)); return m })
  else if (key === 'n' && row) {
    if (!row.h) { st.msg = 'this account has no stores to name'; st.err = true }
    else { st.target = row.h; st.input = ''; st.prompt = `name for ${row.h}: ` }
  }
  else if (key === 'd' && row) st.confirm = row.n
  return true
}

export function tui() {
  const o = process.stdout
  const L = load()
  const st = { sel: Math.max(0, rowsOf(L).findIndex(r => r.n === L.active)) }
  const draw = () => o.write('\x1b[H' + frame(st, o.columns, o.rows))
  const done = () => { o.write('\x1b[?25h\x1b[?1049l'); process.stdin.setRawMode(false); process.exit(0) }
  o.write('\x1b[?1049h\x1b[?25l')
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.on('keypress', (ch, k) => {
    const key = k?.ctrl && k.name === 'c' ? 'ctrl-c' : (k?.name ?? ch)
    if (!onKey(st, key, ch)) return done()
    draw()
  })
  o.on('resize', draw)
  draw()
}
