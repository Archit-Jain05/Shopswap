#!/usr/bin/env node
// shopswap: Multi-Account Switcher for Shopify CLI (swaps its config folders).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// where Shopify CLI keeps its shopify-cli-*-nodejs folders (env-paths conventions)
export const roaming = process.env.APPDATA ?? (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Preferences') : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'))
// on Windows env-paths nests the config in a Config/ subfolder, elsewhere it doesn't
const cfgDir = process.env.APPDATA ? ['Config'] : []
const home = process.env.SHOPSWAP_HOME ?? path.join(os.homedir(), '.shopswap')
const indexFile = path.join(home, 'accounts.json') // { active: name|null, accounts: [name, ...] }
const isCli = d => /^shopify-cli-.*-nodejs$/.test(d)

const live = () => fs.readdirSync(roaming).filter(isCli)
export const prof = n => path.join(home, n)
export const load = () => {
  const s = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { active: null, accounts: [] }
  s.labels ??= {} // store handle -> manual name
  return s
}
export const show = (s, h) => (s.labels[h] ? `${s.labels[h]} (${h})` : h)
const store = s => { fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(indexFile, JSON.stringify(s, null, 1)) }

const storeCfg = dir => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'shopify-cli-store-nodejs', ...cfgDir, 'config.json'), 'utf8')) } catch { return {} }
}

// shops this snapshot has sessions for, e.g. ["my-store"]
export function shops(dir) {
  return Object.keys(storeCfg(dir)).map(k => k.split('::')[1]?.replace('.myshopify.com', '')).filter(Boolean)
}

// [{ user, exp }] for every saved store login; the user id is what identifies an account
const ts = v => (typeof v === 'number' ? v : Date.parse(v)) || 0
const sessions = dir => Object.values(storeCfg(dir)).flatMap(v => Object.entries(v.sessionsByUserId ?? {}).map(([user, x]) => ({ user, exp: ts(x.expiresAt) })))
const newest = dir => Math.max(0, ...sessions(dir).map(x => x.exp))

function snapshot(name) {
  fs.rmSync(prof(name), { recursive: true, force: true })
  fs.mkdirSync(prof(name), { recursive: true })
  for (const d of live()) fs.cpSync(path.join(roaming, d), path.join(prof(name), d), { recursive: true })
}

function restore(name) {
  for (const d of live()) fs.rmSync(path.join(roaming, d), { recursive: true, force: true })
  for (const d of fs.readdirSync(prof(name))) fs.cpSync(path.join(prof(name), d), path.join(roaming, d), { recursive: true })
}

// <num|name> -> name
function resolve(s, ref) {
  if (/^\d+$/.test(ref) && s.accounts[ref - 1]) return s.accounts[ref - 1]
  if (s.accounts.includes(ref)) return ref
  throw new Error(`no account "${ref}" (try: shopswap list)`)
}

const HELP = `usage: shopswap <command> [args] [options]

Multi-Account Switcher for Shopify CLI

Commands:
  shopswap help                       show this help
  shopswap list                       list managed accounts
  shopswap status                     show current account
  shopswap switch                     rotate to the next account
  shopswap switch <num|name>          switch to a specific account
  shopswap add [name]                 add the current account
  shopswap remove <num|name>          remove an account
  shopswap name <store> <label>       give a store a manual name (--unset to clear)
  shopswap tui                        interactive dashboard (also: bare shopswap)
  shopswap purge                      remove all shopswap data`

export function run([cmd, ref, ...rest]) {
  const s = load()
  switch (cmd) {
    case 'help': case '-h': case '--help': return HELP
    case 'list': {
      if (!s.accounts.length) return 'no accounts yet — log in with `shopify auth login`, then `shopswap add`'
      return s.accounts.map((n, i) => `${n === s.active ? '*' : ' '} ${i + 1}: ${n}  (${shops(prof(n)).map(h => show(s, h)).join(', ') || 'no stores'})`).join('\n')
    }
    case 'status': return s.active ? `current: ${s.accounts.indexOf(s.active) + 1}: ${s.active}` : 'current: (none managed)'
    case 'add': {
      // same account = every user in the live login is already saved in one account's snapshot
      const users = new Set(sessions(roaming).map(x => x.user))
      const have = n => { const u = new Set(sessions(prof(n)).map(x => x.user)); return [...users].every(x => u.has(x)) }
      const match = users.size && [s.active, ...s.accounts].find(n => s.accounts.includes(n) && have(n))
      if (match) {
        if (ref && ref !== match) throw new Error(`this login is already saved as "${match}"`)
        const num = s.accounts.indexOf(match) + 1
        if (newest(roaming) <= newest(prof(match))) { s.active = match; store(s); return `${num}: ${match} is already added and its credentials are current` }
        snapshot(match); s.active = match; store(s)
        return `updated ${num}: ${match} (credentials refreshed)`
      }
      // a fresh login keeps the old account's stores in the config, so skip handles already used as names
      const auto = ref ?? shops(roaming).find(h => !s.accounts.includes(h)) ?? s.active ?? `account-${s.accounts.length + 1}`
      const had = s.accounts.includes(auto)
      if (had && auto !== s.active) throw new Error(`"${auto}" is a different account — pick another name: shopswap add <name>`)
      snapshot(auto)
      if (!had) s.accounts.push(auto)
      s.active = auto; store(s)
      return `${had ? 'updated' : 'added'} ${s.accounts.indexOf(auto) + 1}: ${auto}`
    }
    case 'switch': {
      if (!s.accounts.length) throw new Error('no accounts yet (try: shopswap add)')
      const target = ref ? resolve(s, ref) : s.accounts[(s.accounts.indexOf(s.active) + 1) % s.accounts.length]
      if (target === s.active) return `already on ${target}`
      if (s.active) snapshot(s.active)
      restore(target); s.active = target; store(s)
      return `switched to ${s.accounts.indexOf(target) + 1}: ${target}`
    }
    case 'remove': {
      if (!ref) throw new Error('usage: shopswap remove <num|name>')
      const n = resolve(s, ref)
      fs.rmSync(prof(n), { recursive: true, force: true })
      s.accounts = s.accounts.filter(a => a !== n)
      if (s.active === n) s.active = null
      store(s); return `removed ${n}`
    }
    case 'name': {
      const h = ref?.replace(/\.myshopify\.com$/, '')
      const label = rest.join(' ').trim()
      if (!h || !label) throw new Error('usage: shopswap name <store> <label|--unset>')
      if (![...s.accounts.flatMap(n => shops(prof(n))), ...shops(roaming)].includes(h)) throw new Error(`unknown store "${h}" (try: shopswap list)`)
      if (label === '--unset') delete s.labels[h]; else s.labels[h] = label
      store(s); return label === '--unset' ? `cleared name for ${h}` : `${h} is now "${label}"`
    }
    case 'purge': fs.rmSync(home, { recursive: true, force: true }); return 'removed all shopswap data'
    case undefined: throw new Error("no command given — try 'shopswap help'")
    default: throw new Error(`unknown command "${cmd}" — try 'shopswap help'`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const fail = e => { console.error(`shopswap: error: ${e.message}`); process.exit(1) }
  try {
    // no await: tui.mjs imports this file back, so awaiting here would deadlock
    if ((!args.length || args[0] === 'tui') && process.stdin.isTTY) import('./tui.mjs').then(m => m.tui()).catch(fail)
    else console.log(args[0] === 'tui' ? (() => { throw new Error('tui needs an interactive terminal') })() : run(args))
  } catch (e) { fail(e) }
}
