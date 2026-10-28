# shopswap

Save and switch the **store logins** of [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) with one command, and see which stores you're logged in to. Modelled on the `cswap` account switcher for Claude Code. Zero dependencies.

## Do you need this?

Shopify CLI 4.x already keeps store logins (`shopify store auth`) **side by side**, so one machine can be logged in to several stores at once. You then pick the store per command with `--store <handle>.myshopify.com`, and no switching is needed.

shopswap is useful when you want to:

- **Keep clients separate:** `switch` removes other clients' store logins from the machine, so a mistyped `--store` can't touch their store.
- **Save and restore logins** without a browser sign-in each time.
- **See what's logged in**, with your own names for each store, in a terminal dashboard.

Main-account logins (the one `shopify theme`, `app` and `organization` commands use) are a separate thing. `shopify auth login` has its own `--alias` option, which may already support several accounts. **shopswap has not been tested against it.** If you have two main accounts, check that first.

```
$ shopswap list
* 1: agency-main  (Client A (a-store), Client B (b-store))
  2: personal     (My Shop (my-shop))

$ shopswap switch 2
switched to 2: personal
```

## How it works

Shopify CLI keeps its login state in a few `shopify-cli-*-nodejs` config folders. shopswap snapshots those folders into `~/.shopswap/<account>/` and restores them on `switch`. Before leaving an account it re-saves it, so refreshed tokens are never lost.

An "account" is identified by the Shopify user IDs inside the saved store logins, so adding the same login twice never creates a duplicate.

## Install

Requires Node.js 18+ and Shopify CLI.

```sh
git clone https://github.com/Archit-Jain05/Shopswap.git
cd Shopswap
npm link          # puts `shopswap` on your PATH
```

Or run it directly with `node shopswap.mjs`. The repo also includes `shopswap.cmd` and a `shopswap` shell shim; add the folder to your PATH if you prefer that to `npm link`.

## Usage

```
shopswap help                    show help
shopswap list                    list managed accounts (* marks the active one)
shopswap status                  show current account
shopswap switch                  rotate to the next account
shopswap switch <num|name>       switch to a specific account
shopswap add [name]              save the current login
shopswap remove <num|name>       remove a saved account
shopswap name <store> <label>    give a store a display name (--unset to clear)
shopswap tui                     interactive dashboard (also: bare `shopswap`)
shopswap purge                   delete all shopswap data
```

### Adding a second account

```sh
shopswap add                 # save the account you're logged in to now
shopify auth login           # log in as the other account
shopswap add                 # save it as account 2
shopswap switch 1            # jump back, no re-login
```

`add` behaviour:

| Situation | Result |
|---|---|
| Same login, credentials not newer | reports "already added", no changes |
| Same login, newer credentials | refreshes the saved copy |
| Same login, different name given | refused |
| A user ID not saved yet | added as a new account |

### Dashboard

Run `shopswap` in a terminal for a full-screen view. Stores are listed under their account.

| Key | Action |
|---|---|
| `↑` `↓` / `j` `k` | select a store |
| `n` | rename the highlighted store (type, then `enter`; empty clears) |
| `enter` | switch to the highlighted store's account |
| `a` | add the current login |
| `d` | remove the highlighted store's account (asks to confirm) |
| `q` / `esc` | quit |

Store names are display-only. You still use the real `.myshopify.com` handle with `shopify ... --store`.

## Where data lives

- Shopify CLI's live config: `%APPDATA%` on Windows, `~/Library/Preferences` on macOS, `$XDG_CONFIG_HOME` or `~/.config` on Linux.
- shopswap's data: `~/.shopswap/` (override with `SHOPSWAP_HOME`).

## Security

- Saved snapshots contain **access and refresh tokens in plain text**, exactly like Shopify CLI's own config. Anyone who can read `~/.shopswap` can act as those accounts.
- Never commit, sync or share `~/.shopswap`.
- Don't run `switch` while a `shopify` command is running.
- `switch` overwrites Shopify CLI's live config with the target account's snapshot. Run `shopswap add` for a new login **before** switching away, or the unsaved login is replaced.
- `remove` and `purge` delete only shopswap's copies, never the live config.

## Limitations

- Built and tested against Shopify CLI 4.9.x, where store logins are kept per store in one file. `switch` swaps the whole set of saved store logins. It was verified with two real stores: after a switch, the CLI could reach only the stores in that account.
- A saved account holds whatever logins were live when you ran `add`. If you want strict per-client separation, log in to one client at a time and run `add` right after each login.
- The main-account login and its `--alias` sessions are untested (see above). Please open an issue with your CLI version if you find out how they behave.
- Developed and tested on Windows. The macOS and Linux config paths follow Shopify CLI's conventions but are untested. Reports welcome.
- Only the `shopify-cli-*-nodejs` folders are managed. Environment-variable credentials (`SHOPIFY_CLI_THEME_TOKEN` and similar) are not touched.

## Tests

```sh
npm test
```

Runs against fake accounts in a temp directory and never touches your real config.

## License

MIT
