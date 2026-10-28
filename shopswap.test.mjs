// node shopswap.test.mjs — round-trips two fake accounts in a temp dir
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shopswap-'))
process.env.APPDATA = path.join(tmp, 'roaming')
process.env.SHOPSWAP_HOME = path.join(tmp, 'home')
fs.mkdirSync(process.env.APPDATA)
const { run } = await import('./shopswap.mjs')

const f = path.join(process.env.APPDATA, 'shopify-cli-store-nodejs', 'Config', 'config.json')
const cfg = (who, shops, exp = 1) => JSON.stringify({ ...Object.fromEntries(shops.map(([shop, user]) => [`h::${shop}.myshopify.com`, { sessionsByUserId: { [user]: { expiresAt: exp } } }])), who })
const login = (who, shop, exp, user = who[0]) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, cfg(who, [[shop, user]], exp)) }
const who = () => JSON.parse(fs.readFileSync(f, 'utf8')).who

login('A', 'shop-a'); assert.match(run(['add']), /added 1: shop-a/)
login('B', 'shop-b'); assert.match(run(['add']), /added 2: shop-b/)
assert.match(run(['list']), /\* 2: shop-b/)
run(['switch', '1']); assert.equal(who(), 'A')
login('A-refreshed', 'shop-a'); run(['switch', 'shop-b']); assert.equal(who(), 'B')
run(['switch']); assert.equal(who(), 'A-refreshed', 'rotate wraps and keeps refreshed tokens')
assert.match(run(['status']), /1: shop-a/)
run(['remove', '2']); assert.doesNotMatch(run(['list']), /shop-b/)
assert.throws(() => run(['switch', '9']), /no account/)
console.log('ok')

// tui: pure render + key handling (no terminal needed)
const { frame, onKey } = await import('./tui.mjs')
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '')
run(['purge']); login('A', 'shop-a'); run(['add', 'one']); login('B', 'shop-b'); run(['add', 'two'])
const st = { sel: 0 }
let out = strip(frame(st, 80, 20))
assert.match(out, /1 {2}one/); assert.match(out, /2 {2}two/); assert.match(out, /● active/)
onKey(st, 'down'); assert.equal(st.sel, 1)
assert.match(run(['name', 'shop-b.myshopify.com', 'Client', 'Store']), /"Client Store"/)
assert.match(run(['list']), /Client Store \(shop-b\)/)
assert.throws(() => run(['name', 'nope', 'x']), /unknown store/)
onKey(st, 'n'); for (const c of 'My Shop') onKey(st, c === ' ' ? 'space' : c, c); onKey(st, 'return')
assert.match(strip(frame(st, 80, 20)), /My Shop \(shop-b\)/)
onKey(st, 'n'); onKey(st, 'return'); assert.doesNotMatch(run(['list']), /My Shop/) // empty = clear
onKey(st, 'up'); onKey(st, 'return'); assert.equal(run(['status']), 'current: 1: one')
onKey(st, 'd'); assert.ok(st.confirm); onKey(st, 'y'); assert.doesNotMatch(run(['list']), /one/)
assert.equal(onKey(st, 'q'), false)
console.log('tui ok')

// duplicate protection: same user never becomes a second account; newer credentials refresh it
run(['purge']); login('A', 'shop-a'); assert.match(run(['add']), /added 1: shop-a/)
assert.match(run(['add']), /already added and its credentials are current/)
assert.equal(run(['list']).split('\n').length, 1, 'same login twice must not create a 2nd account')
login('A2', 'shop-a', 99, 'A'); assert.match(run(['add']), /updated 1: shop-a \(credentials refreshed\)/)
assert.throws(() => run(['add', 'other']), /already saved as "shop-a"/)
// login B on top of A's leftovers = a genuinely new user -> new account
fs.writeFileSync(f, cfg('B', [['shop-a', 'A'], ['shop-b', 'B']], 99))
assert.match(run(['add']), /added 2: shop-b/)
assert.match(run(['add']), /already added/)
fs.writeFileSync(f, cfg('B2', [['shop-a', 'A'], ['shop-b', 'B']], 500))
assert.match(run(['add']), /updated 2: shop-b/)
console.log('dedupe ok')

// one account, two stores: the highlighted store is renamed directly (select, n, type, enter)
run(['purge']); fs.writeFileSync(f, cfg('A', [['shop-a', 'A'], ['shop-b', 'A']])); run(['add'])
const st2 = { sel: 0 }
assert.match(strip(frame(st2, 80, 20)), /▸ shop-a/)
onKey(st2, 'down'); assert.match(strip(frame(st2, 80, 20)), /▸ shop-b/)
onKey(st2, 'n'); assert.equal(st2.target, 'shop-b'); assert.match(strip(frame(st2, 80, 20)), /name for shop-b: /)
for (const c of 'Asmaan') onKey(st2, c, c); onKey(st2, 'return')
assert.match(run(['list']), /shop-a, Asmaan \(shop-b\)/)
assert.match(strip(frame(st2, 80, 20)), /▸ Asmaan \(shop-b\)/, 'dashboard shows the new name on the same row')
onKey(st2, 'up'); onKey(st2, 'n'); for (const c of 'First') onKey(st2, c, c); onKey(st2, 'return')
assert.match(run(['list']), /First \(shop-a\), Asmaan \(shop-b\)/)
console.log('store rename ok')

// whoami lists live + saved logins and never leaks token fields
fs.writeFileSync(f, JSON.stringify({ 'h::shop-a.myshopify.com': { sessionsByUserId: { A: { accessToken: 'SECRET-TOKEN', expiresAt: Date.now() + 5 * 36e5, associatedUser: { email: 'a@example.com' } } } } }))
const who2 = run(['whoami'])
assert.match(who2, /live .*:\n {2}shop-a {2}a@example\.com {2}valid [45]h/)
assert.match(who2, /1: .*\(saved\):/)
assert.doesNotMatch(who2, /SECRET-TOKEN/)
console.log('whoami ok')
