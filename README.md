# tg-react-sort

![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)


A high-performance Telegram channel analytics tool built with Python and `Telethon`. Fetches messages from any channel, ranks them by total reactions, and launches a dark-mode web dashboard for deep engagement analysis.

> [!NOTE]
> **Personal Use**: This tool authenticates as a real Telegram user account. Ensure your usage complies with [Telegram's Terms of Service](https://telegram.org/tos). Only fetch data from channels you have legitimate access to.

## Features

- 🚀 **Incremental Sync**: Only fetches new messages since the last run — fast and API quota-friendly.
- 🔄 **Reaction Refresh**: Re-fetches reaction counts for existing messages without re-downloading content.
- 📚 **Smart Backfill**: Automatically fills historical gaps if the dataset is below your requested limit.
- 🗂️ **Batch Channels**: Process multiple channels in a single run with `--channels`.
- 👁️ **Watch Mode**: Loop indefinitely, auto-refreshing on a configurable timer.
- 📅 **Date Filtering**: Scope any fetch to a specific date window.
- ✏️ **Edit Detection**: Patches rows when Telegram messages are edited between runs.
- 🎨 **Modern UI**: Beautiful, color-coded CLI with `rich` progress bars, tables, and prompts.
- 🌐 **Web Dashboard**: Dark-mode viewer with charts, emoji filters, date picker, live search, bookmarks, and CSV export.

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/zis3c/tg-react-sort
   cd tg-react-sort
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Get your API credentials**

   Go to [my.telegram.org](https://my.telegram.org) → **API development tools** → create an app. Copy your **API ID** and **API Hash**.

   Optionally, create a `.env` file:
   ```bash
   cp .env.example .env
   # Fill in API_ID and API_HASH
   ```

## Usage

### Interactive Mode
Simply run the script without arguments:
```bash
python sort_reactions.py
```
Follow the prompts to enter your API credentials (saved for future runs) and the target channel. The web viewer launches automatically when done.

### Command Line Interface
To see all available options:
```bash
python sort_reactions.py --help
```

**Example:**
```bash
python sort_reactions.py --channel @ExampleChannel --limit 1000 --top 20
```

| Argument | Description | Default |
|----------|-------------|---------|
| `--channel` | Target channel username or link (`@channel`, `t.me/channel`) | — |
| `--channels` | Batch mode: multiple channels (repeatable) | — |
| `--limit` | Number of recent messages to fetch | `1000` |
| `--top` | Number of top messages to display in terminal | `10` |
| `--start-date` | Fetch messages from this date (`YYYY-MM-DD`) | — |
| `--end-date` | Fetch messages up to this date (`YYYY-MM-DD`) | — |
| `--refresh` | Update reaction counts on existing messages only | `False` |
| `--full` | Ignore cache — full fresh fetch, overwrites CSV | `False` |
| `--watch` | Continuous refresh loop | `False` |
| `--interval` | Minutes between `--watch` refreshes | `30` |

## How It Works

1. **Authentication**: Connects to Telegram using MTProto via your API credentials and a saved session file.
2. **Incremental Fetch**: Reads the existing CSV to find the last message ID, then only fetches newer messages.
3. **Reaction Extraction**: For each message, collects total reaction count and a per-emoji breakdown.
4. **Merge & Sort**: Merges new data with existing records, detects edits, and sorts by total reactions.
5. **Export**: Saves results to `data/<channel>.csv` and updates `files.json` for the web viewer.
6. **Web Viewer**: Launches a local HTTP server and opens the dashboard automatically in your browser.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
