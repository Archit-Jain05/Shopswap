// Interactive dashboard for shopswap (alt screen, no dependencies).
import readline from 'node:readline'
import { run, load, shops, prof, show } from './shopswap.mjs'

const BG = 233, SEL = 237
const GREY = 245, DIM = 242, TEXT = 188, ACCENT = 173, OK = 108
const HINT = '↑↓ select · enter switch · a add current · n name store · d remove · q quit'

// segs: [[fg, text, bold?], ...] -> one full-width line on background bg
function line(segs, cols, bg = BG) {
  let used = 0
  const body = segs.map(([fg, t, b]) => { used += [...t].length; return `\x1b[${b ? '1;' : ''}38;5;${fg};48;5;${bg}m${t}` }).join('')
  return body + `\x1b[48;5;${bg}m${' '.repeat(Math.max(0, cols - used))}\x1b[0m`
}

export function frame(st, cols = 80, rows = 24) {
  const L = load()
  const { accounts, active } = L
  const out = [line([], cols)]
  if (!accounts.length) {
    out.push(line([[GREY, '   no accounts yet — log in with `shopify auth login`, then press a']], cols))
  }
  accounts.forEach((n, i) => {
    const bg = i === st.sel ? SEL : BG
    const s = shops(prof(n))
    out.push(line([[ACCENT, i === st.sel ? '  ▸' : '   '], [i === st.sel ? TEXT : GREY, ` ${i + 1}  `, true], [TEXT, n], [GREY, s.length ? `  [${s.map(h => show(L, h)).join(', ')}]` : '  [no stores]']], cols, bg))
    out.push(line(n === active ? [[0, '       '], [ACCENT, '● active', true]] : [[DIM, '       idle']], cols, bg))
    out.push(line([], cols))
  })
  while (out.length < rows - 3) out.push(line([], cols))
  out.push(line([[st.err ? 167 : OK, '   ' + (st.input != null ? `${st.prompt}${st.input}▏` : st.confirm ? `remove ${accounts[st.sel]}? (y/n)` : st.msg ?? '')]], cols))
  out.push(line([[DIM, '   ' + HINT]], cols))
  return out.slice(0, rows).join('\r\n')
}

// returns false to quit
export function onKey(st, key, ch) {
  const { accounts } = load()
  const act = f => { try { st.msg = f(); st.err = false } catch (e) { st.msg = e.message; st.err = true } }
  if (st.input != null) { // typing a store name
    if (key === 'return') {
      const hs = shops(prof(accounts[st.sel])), text = st.input.trim()
      act(() => {
        if (hs.length === 1) return run(['name', hs[0], text || '--unset'])
        const [h, ...r] = text.split(/\s+/)
        return run(['name', h, ...(r.length ? r : ['--unset'])])
      })
      st.input = null
    } else if (key === 'escape') st.input = null
    else if (key === 'backspace') st.input = st.input.slice(0, -1)
    else if (ch && ch >= ' ' && ch !== '\x7f') st.input += ch
    return true
  }
  if (st.confirm) {
    if (key === 'y') act(() => run(['remove', String(st.sel + 1)]))
    st.confirm = false; st.sel = Math.max(0, Math.min(st.sel, load().accounts.length - 1))
    return true
  }
  st.msg = null
  if (key === 'q' || key === 'escape' || key === 'ctrl-c') return false
  if ((key === 'down' || key === 'j') && accounts.length) st.sel = (st.sel + 1) % accounts.length
  else if ((key === 'up' || key === 'k') && accounts.length) st.sel = (st.sel - 1 + accounts.length) % accounts.length
  else if (key === 'return' && accounts.length) act(() => run(['switch', String(st.sel + 1)]))
  else if (key === 'a') act(() => { const m = run(['add']); st.sel = load().accounts.length - 1; return m })
  else if (key === 'n' && accounts.length) {
    const hs = shops(prof(accounts[st.sel]))
    if (!hs.length) { st.msg = 'this account has no stores to name'; st.err = true }
    else { st.input = ''; st.prompt = hs.length === 1 ? `name for ${hs[0]}: ` : `<store> <name> (${hs.join(', ')}): ` }
  }
  else if (key === 'd' && accounts.length) st.confirm = true
  return true
}

export function tui() {
  const o = process.stdout
  const st = { sel: Math.max(0, load().accounts.indexOf(load().active)) }
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
