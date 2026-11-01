# Coinkeep

A calm, private money tracker for my phone (personal use). Log what you spend in two taps, see what's **safe to spend** after savings and upcoming bills, split each paycheck into savings goals, and keep an eye on monthly budgets.

- **Everything stays on your phone.** No account, no server, no tracking. It works fully offline.
- **Moroccan dirham (MAD) only.** Amounts are stored as whole centimes, so totals never drift.
- **Installable.** Add it to your Android home screen and it opens like a normal app.

Built with Vite, React 18, TypeScript, Tailwind CSS, Dexie (IndexedDB), Recharts and vite-plugin-pwa.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 22.12 or newer (the LTS download is fine).

```bash
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173).

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the unit tests (money formatting, safe-to-spend, budgets, paycheck splits, bill dates, backup round-trip…). |
| `npm run build` | Type-checks and builds the production site into `dist/`. |
| `npm run preview` | Serves the built `dist/` folder locally, with offline support, to try the real thing. |
| `npm run icons` | Regenerates the PNG app icons from `public/icon.svg` (only needed if you change the icon). |

> The offline/install features only work in the built version (`npm run build` then `npm run preview`), not in `npm run dev`.

---

## Publish (GitHub Pages)

The app is served from the `gh-pages` branch of this repository at **https://alae-herrak.github.io/coinkeep/**.

To publish a new version:

```bash
npm run deploy
```

This builds the app for the `/coinkeep/` path and force-pushes the result to `gh-pages`. GitHub updates the site within a minute or two, and the installed app then offers **"New version available — Reload"**.

---

## Install it on your Android phone

1. Open **https://alae-herrak.github.io/coinkeep/** in **Chrome**.
2. Tap the **⋮** menu → **Add to home screen** → **Install**. (Chrome may also show an "Install app" banner by itself.)
3. Coinkeep now has its own icon and opens full-screen, without the browser bar. It works with no internet connection.

Tips:

- **Long-press the icon** for shortcuts: **Add expense** and **Log paycheck**.
- After `npm run deploy`, the app shows **"New version available — Reload"**. Nothing reloads by itself, so you never lose what you were typing.
- The first time it opens, Coinkeep asks the browser to keep its storage permanently. You can check the result in **More → Settings → Backup & data → Storage status**.

---

## Your data, backups and why they matter

Coinkeep has no server. Your accounts, transactions and goals live **only in this browser on this phone** (in its IndexedDB storage). That's what keeps it private. It also means **nobody can recover your data for you**. You lose it if:

- you uninstall the app, or clear Chrome's data/storage for the site,
- your phone is lost, broken or reset,
- the app moves to a different address. Data belongs to one exact address, so data saved at `alae-herrak.github.io/coinkeep/` would **not** be visible if the repository were renamed or the app hosted somewhere else.

**A backup file is your only safety net.** Make one regularly, and always before changing phones or moving the app to a new address.

### Make a backup

**More → Settings → Backup & data → Back up your data**

- **Save to Drive, email…** opens Android's share sheet, so you can send the file straight to Google Drive, Gmail, WhatsApp and so on.
- **Download backup file** saves `coinkeep-backup-YYYY-MM-DD.json` to your Downloads.

The file contains all your accounts, categories, transactions, goals, bills and paycheck templates. Your PIN and theme are not included. Keep it somewhere other than the phone itself. If you haven't backed up for 30 days, Home shows a gentle reminder.

### Restore a backup

**More → Settings → Backup & data → Restore from a backup → Choose backup file**

1. Pick a Coinkeep backup file.
2. Coinkeep checks the whole file first. If anything is wrong (not a Coinkeep file, cut off, edited by hand), it tells you what and **changes nothing**.
3. If the file is fine, you see what's in it (date and counts) and what it will replace. A **Back up current data first** button is right there.
4. Tap **Replace my data**. Everything is swapped in one go, and you get an **Undo** button for a few seconds in case you picked the wrong file.

### Spreadsheet export

**Export transactions (CSV)** gives you a file for Excel or Google Sheets: date, type, amount, category, account, destination account (for transfers), note. It's for looking at your numbers. It is **not a backup** and can't be imported back.

### About the PIN lock

The optional PIN (**Settings → PIN lock**) hides the app when it opens and after 30 seconds in the background. It is a **privacy screen, not encryption**: someone with full access to the phone's browser data could still read it. If you forget the PIN, the only way back in is to erase the app's data and restore a backup. One more reason to keep backups.

---

## Project layout

```
src/
  lib/        money formatting & parsing, dates, PIN hashing, files, theme
  db/         Dexie schema (versioned), types, seed categories
  domain/     pure logic: safe-to-spend, budgets, paycheck allocation, bills, insights
  data/       database writes: transactions, goals, bills, backup/restore, CSV
  hooks/      live queries for screens
  components/ UI pieces (sheets, keypad, cards…)
  screens/    one file per screen
public/       app icons (generated from icon.svg)
scripts/      icon generator, deploy script
```
