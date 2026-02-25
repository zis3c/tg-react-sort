<div align="center">

```
╺━┓╻┏━┓┏━┓┏━╸   ╺┳╸┏━╸┏━┓┏━┓┏━┓╺┳╸┏━┓┏━╸┏━┓┏━╸╺┳╸
┏━┛┃┗━┓╺━┫┃      ┃ ┃╺┓┗━┓┃ ┃┣┳┛ ┃ ┣┳┛┣╸ ┣━┫┃   ┃ 
┗━╸╹┗━┛┗━┛┗━╸    ╹ ┗━┛┗━┛┗━┛╹┗╸ ╹ ╹┗╸┗━╸╹ ╹┗━╸ ╹ 
```

# tg-react-sort

**Fetch, sort, and visualise Telegram channel messages by reaction count.**

A Python CLI + local web viewer that connects to any Telegram channel via the official MTProto API, ranks every post by total reactions, and opens a sleek dark-mode analytics dashboard right in your browser.

[![Python](https://img.shields.io/badge/Python-3.9%2B-blue?logo=python&logoColor=white)](https://python.org)
[![Telethon](https://img.shields.io/badge/Telethon-MTProto-26A5E4?logo=telegram&logoColor=white)](https://docs.telethon.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## ✨ Features

### 🖥️ CLI (`sort_reactions.py`)
| Feature | Description |
|---|---|
| **Incremental sync** | Only fetches new messages since the last run — fast & quota-friendly |
| **Full fetch mode** | `--full` flag to ignore cache and re-download everything from scratch |
| **Reaction refresh** | `--refresh` updates reaction counts on existing messages without re-downloading text |
| **Smart backfill** | Automatically fills historical gaps if the dataset is still below your `--limit` |
| **Batch channels** | `--channels @a --channels @b` to process multiple targets in one run |
| **Watch mode** | `--watch --interval 30` loops indefinitely, refreshing on a timer |
| **Date filtering** | `--start-date` / `--end-date` to scope the fetch window |
| **Edit detection** | Patches rows when Telegram messages are edited between runs |
| **FloodWait handling** | Gracefully waits and retries on Telegram rate-limit errors |
| **Rich terminal UI** | Full-colour progress bars, tables, and prompts powered by Rich |

### 🌐 Web Viewer (`web/`)
| Feature | Description |
|---|---|
| **Message cards** | Dark-mode cards with full text, emoji pills, views, forwards & relative timestamps |
| **Multi-sort** | Most Reactions · Most Recent · Oldest First · Best Ratio · ⚡ Fastest Rising |
| **Emoji filter** | Filter by any specific reaction emoji |
| **Date range picker** | Custom calendar widget with quick presets (This Week · Last 30 Days · Most Viral · Top 10) |
| **Live search** | Instant full-text search across all loaded messages |
| **Bookmark / Starred** | Star messages and toggle a starred-only view (persisted in localStorage) |
| **Analytics charts** | Reactions over time · Emoji breakdown · Velocity distribution · Top 10 · Keywords · Activity Heatmap |
| **KPI bar** | Live stats: total reactions, message count, top emoji, peak day |
| **CSV export** | One-click export of current filtered results |
| **Skeleton loaders** | Smooth shimmer placeholders while data loads |
| **Responsive** | Mobile-friendly layout with collapsible filter drawer |
| **Keyboard shortcuts** | `?` key opens the full shortcut overlay |
| **Multi-channel** | Dropdown to switch between multiple imported channels |

---

## 📁 Project Structure

```
tg-react-sort/
├── sort_reactions.py    # Main CLI — fetch, sort, export
├── requirements.txt     # Python dependencies
├── .env.example         # Credentials template
├── config.json          # Saved API credentials (auto-created, gitignored)
├── files.json           # Registry of imported CSV datasets (auto-updated)
├── data/                # Exported CSVs (one per channel)
│   └── channel_name.csv
└── web/                 # Browser-based viewer
    ├── view_results.html
    ├── app.js
    └── styles.css
```

---

## 🚀 Quick Start

### 1. Clone & install

```bash
git clone https://github.com/your-username/tg-react-sort.git
cd tg-react-sort
pip install -r requirements.txt
```

### 2. Get your Telegram API credentials

1. Go to [my.telegram.org](https://my.telegram.org) and log in
2. Click **API development tools**
3. Create an app — copy your **API ID** and **API Hash**

Optionally, create a `.env` file from the template:

```bash
cp .env.example .env
# Then edit .env and fill in API_ID and API_HASH
```

> Credentials are also saved interactively to `config.json` on first run.

### 3. Run the CLI

```bash
# Interactive mode (guided prompts)
python sort_reactions.py

# Or pass arguments directly
python sort_reactions.py --channel @durov --limit 500 --top 20
```

After fetching, the viewer opens automatically at `http://localhost:8000/web/view_results.html`.

---

## 🛠️ CLI Reference

```
python sort_reactions.py [OPTIONS]
```

| Option | Default | Description |
|---|---|---|
| `--channel TEXT` | — | Target channel username or link (`@channel`, `t.me/channel`) |
| `--channels TEXT` | — | Multiple channels for batch mode (repeatable) |
| `--limit INT` | `1000` | Max messages to fetch per channel |
| `--top INT` | `10` | Top N messages to display in terminal |
| `--start-date YYYY-MM-DD` | — | Fetch messages from this date onwards |
| `--end-date YYYY-MM-DD` | — | Fetch messages up to this date |
| `--refresh` | `False` | Re-fetch reaction counts for existing messages only |
| `--full` | `False` | Ignore cache — full fresh fetch (overwrites CSV) |
| `--watch` | `False` | Continuous refresh loop |
| `--interval INT` | `30` | Minutes between `--watch` refreshes |

### Examples

```bash
# Fetch last 1,000 messages from a channel
python sort_reactions.py --channel @ExampleChannel

# Full re-fetch with 5,000 messages, show top 50 in terminal
python sort_reactions.py --channel @ExampleChannel --limit 5000 --top 50 --full

# Only update reaction counts (no new message download)
python sort_reactions.py --channel @ExampleChannel --refresh

# Fetch posts within a date window
python sort_reactions.py --channel @ExampleChannel --start-date 2024-01-01 --end-date 2024-06-30

# Batch multiple channels at once
python sort_reactions.py --channels @ChannelA --channels @ChannelB --limit 500

# Auto-refresh every 15 minutes
python sort_reactions.py --channel @ExampleChannel --watch --interval 15
```

---

## 📊 Web Viewer

After a successful export, the viewer launches automatically. You can also open it manually:

```bash
python -m http.server 8000
# Then visit: http://localhost:8000/web/view_results.html
```

Use the **channel dropdown** in the filter drawer to switch between datasets.

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `telethon` | Telegram MTProto client |
| `pandas` | CSV read/write and data merging |
| `rich` | Terminal UI (progress, tables, prompts) |
| `click` | CLI argument parsing |
| `python-dotenv` | `.env` file support |

Web viewer uses CDN-loaded libraries: **Tailwind CSS**, **PapaParse**, **Chart.js** — no build step required.

---

## 🔒 Security Notes

- **Never commit `config.json` or `.env`** — they contain your personal API credentials.
- Both are already listed in `.gitignore`.
- Session files (`*.session`) are also gitignored — treat them like passwords.
- This tool reads channel data only; it does not send messages or modify anything.

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
Made with ❤️ using <a href="https://docs.telethon.dev">Telethon</a> + <a href="https://github.com/Textualize/rich">Rich</a>
</div>
