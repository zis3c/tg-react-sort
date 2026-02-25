import asyncio
import csv
import os
import re
import subprocess
import logging
from telethon import TelegramClient
from telethon.tl.types import Message
from telethon.errors import ApiIdInvalidError, SessionExpiredError, AuthKeyError, FloodWaitError
import pandas as pd
from datetime import datetime, timezone
import json
import sys
from dotenv import load_dotenv

load_dotenv()  # load .env if present

# ── File logger (errors/warnings go to sort.log) ──────────
logging.basicConfig(
    filename='sort.log',
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
log = logging.getLogger(__name__)

# Force output to UTF-8 to prevent Windows UnicodeEncodeError with emojis
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

import click
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, IntPrompt, Confirm
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich import box

console = Console()

SESSION_FILE = 'session_name.session'
CONFIG_FILE = 'config.json'

async def run_sort(api_id, api_hash, target_channel, limit, top_n, start_date=None, end_date=None, refresh=False, full=False):
    
    def parse_date(date_str):
        if not date_str: return None
        try: return datetime.strptime(date_str, "%Y-%m-%d").date()
        except: return None
        
    s_date = parse_date(start_date)
    e_date = parse_date(end_date)
    
    # --- Incremental sync: find highest existing message ID ---
    raw_name_pre = re.sub(r'^(https?://)?(t\.me/|telegram\.me/)', '', target_channel.strip())
    raw_name_pre = raw_name_pre.lstrip('@').split('/')[0].split('?')[0]
    safe_name_pre = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_name_pre) or 'export'
    existing_csv = os.path.join('data', f'{safe_name_pre}.csv')
    min_id = 0
    existing_data = []
    if not full and os.path.exists(existing_csv):
        try:
            existing_df = pd.read_csv(existing_csv)
            if 'id' in existing_df.columns and len(existing_df) > 0:
                min_id = int(existing_df['id'].max())
                existing_data = existing_df.to_dict('records')
                console.print(f"[bold yellow]⚡ Incremental sync: found {len(existing_data)} existing messages (last ID: {min_id})[/bold yellow]")
                log.info(f"Incremental sync: {len(existing_data)} existing messages, last ID {min_id}")
        except Exception as exc:
            log.warning(f"Could not read existing CSV: {exc}")
    elif full:
        console.print(f"[bold yellow]🔁 Full fetch mode: ignoring existing data, fetching {limit} messages from scratch...[/bold yellow]")
        log.info(f"Full fetch mode for {target_channel}")
    try:
        async with TelegramClient('session_name', api_id, api_hash) as client:
            # ── REFRESH MODE ────────────────────────────────────
            if refresh and existing_data:
                console.print(f"[bold yellow]🔄 Refresh mode: updating reactions for {len(existing_data)} messages...[/bold yellow]")
                log.info(f"Refresh mode: updating {len(existing_data)} messages")
                entity = await client.get_entity(target_channel)
                ids = [int(r['id']) for r in existing_data]
                # Fetch in batches of 100 (Telegram API limit)
                updated = {}
                with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                              BarColumn(), TextColumn("[progress.percentage]{task.percentage:>3.0f}%"), console=console) as progress:
                    rtask = progress.add_task("[bold cyan]Refreshing reactions...[/bold cyan]", total=len(ids))
                    for i in range(0, len(ids), 100):
                        batch = ids[i:i+100]
                        msgs = await client.get_messages(entity, ids=batch)
                        for msg in msgs:
                            if not msg: continue
                            total_r = 0
                            details = []
                            if msg.reactions and msg.reactions.results:
                                for rxn in msg.reactions.results:
                                    cnt = rxn.count; total_r += cnt
                                    try: lbl = rxn.reaction.emoticon
                                    except AttributeError: lbl = str(rxn.reaction)
                                    details.append(f"{lbl}: {cnt}")
                            updated[msg.id] = {
                                'total_reactions': total_r,
                                'breakdown': ', '.join(details) if details else 'None',
                                'views': getattr(msg, 'views', 0) or 0,
                                'forwards': getattr(msg, 'forwards', 0) or 0,
                            }
                        progress.advance(rtask, len(batch))
                # Merge updated reactions back
                for row in existing_data:
                    rid = int(row['id'])
                    if rid in updated:
                        row.update(updated[rid])
                log.info(f"Refresh complete: updated {len(updated)} messages")
                console.print(f"[bold green]✓ Refreshed {len(updated)} messages.[/bold green]")
                # Save & return
                df_sorted = pd.DataFrame(existing_data).sort_values(by='total_reactions', ascending=False)
                raw_name = re.sub(r'^(https?://)?(t\.me/|telegram\.me/)', '', target_channel.strip())
                raw_name = raw_name.lstrip('@').split('/')[0].split('?')[0]
                safe_channel_name = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_name) or 'export'
                csv_path = os.path.join('data', f'{safe_channel_name}.csv')
                df_sorted.to_csv(csv_path, index=False)
                console.print(f"[bold green]Saved refreshed data to {csv_path}[/bold green]")
                return
        async with TelegramClient('session_name', api_id, api_hash) as client:
            data = []
            try:
                entity = await client.get_entity(target_channel)
                
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    BarColumn(),
                    TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
                    console=console,
                ) as progress:
                    fetch_label = f"Fetching new messages since ID {min_id}..." if min_id else f"Fetching last {limit} messages..."
                    task = progress.add_task(f"[bold cyan]{fetch_label}[/bold cyan]", total=limit)
                    
                    async for message in client.iter_messages(entity, limit=limit, min_id=min_id):
                        progress.advance(task)
                        
                        msg_date = message.date.date()
                        if e_date and msg_date > e_date:
                            continue
                        if s_date and msg_date < s_date:
                            progress.update(task, completed=limit) # Fill bar to 100% since we finished early
                            break
                        
                        total_reactions = 0
                        reaction_details = []
                        
                        if message.reactions and message.reactions.results:
                            for reaction in message.reactions.results:
                                count = reaction.count
                                total_reactions += count
                                try:
                                    label = reaction.reaction.emoticon
                                except AttributeError:
                                    label = str(reaction.reaction)
                                reaction_details.append(f"{label}: {count}")
                        
                        username = getattr(entity, 'username', None)
                        if username:
                            link = f"https://t.me/{username}/{message.id}"
                        else:
                            entity_id = getattr(entity, 'id', 'Unknown')
                            link = f"https://t.me/c/{entity_id}/{message.id}"

                        # Save FULL text (not truncated)
                        full_text  = message.text or ''
                        text_preview = full_text[:80].replace('\n', ' ') if full_text else '[Media/No Text]'
                        
                        now_utc = datetime.now(timezone.utc)
                        msg_dt = message.date if message.date.tzinfo else message.date.replace(tzinfo=timezone.utc)
                        hours_since = max(1, (now_utc - msg_dt).total_seconds() / 3600)
                        velocity = round(total_reactions / hours_since, 3)

                        data.append({
                            'id': message.id,
                            'date': message.date,
                            'total_reactions': total_reactions,
                            'breakdown': ", ".join(reaction_details) if reaction_details else "None",
                            'views': getattr(message, 'views', 0) or 0,
                            'forwards': getattr(message, 'forwards', 0) or 0,
                            'velocity': velocity,
                            'text': full_text,
                            'text_preview': text_preview,
                            'link': link
                        })
                            
            except ValueError:
                msg = f"Could not find channel '{target_channel}'."
                console.print(f"\n[bold red][!] Error:[/bold red] {msg}")
                log.error(msg)
                return
            except FloodWaitError as e:
                wait = e.seconds + 5
                console.print(f"[bold yellow]⏳ FloodWait: Telegram asks us to wait {e.seconds}s. Retrying in {wait}s...[/bold yellow]")
                log.warning(f"FloodWaitError: waiting {wait}s")
                await asyncio.sleep(wait)
                return
            except Exception as e:
                console.print(f"\n[bold red][!] Error fetching messages:[/bold red] {e}")
                log.error(f"Error fetching messages: {e}")
                return

            console.print(f"[bold green]✓ Fetched {len(data)} new messages.[/bold green]")
            log.info(f"Fetched {len(data)} new messages from {target_channel}")
            
            # Merge with existing data for incremental sync
            # Also patch edited messages: if a new row shares an ID with existing, update changed fields
            if existing_data:
                existing_map = {row['id']: row for row in existing_data}
                edited = 0
                for new_row in data:
                    mid = new_row['id']
                    if mid in existing_map:
                        old = existing_map[mid]
                        changed = (
                            str(old.get('total_reactions', '')) != str(new_row['total_reactions']) or
                            str(old.get('text', ''))[:100] != str(new_row.get('text', ''))[:100]
                        )
                        if changed:
                            old.update({
                                'total_reactions': new_row['total_reactions'],
                                'breakdown': new_row['breakdown'],
                                'views': new_row['views'],
                                'forwards': new_row['forwards'],
                                'velocity': new_row['velocity'],
                                'text': new_row['text'],
                                'text_preview': new_row['text_preview'],
                            })
                            edited += 1
                merged = list(existing_map.values()) + [r for r in data if r['id'] not in existing_map]
                suffix = f", {edited} edited" if edited else ""
                console.print(f"[bold green]✓ Merged: {len(merged)} total messages ({len(data)} new + {len(existing_data)} existing{suffix})[/bold green]")
                if edited: log.info(f"Edit-detection: {edited} messages had changed content and were patched")
            else:
                merged = data

            # ── Smart backfill: if we have fewer messages than limit, fetch older history ──
            if merged and len(merged) < limit:
                gap = limit - len(merged)
                oldest_id = min(int(r['id']) for r in merged)
                console.print(f"[bold yellow]📚 Backfill: fetching up to {gap} older messages (before ID {oldest_id})...[/bold yellow]")
                log.info(f"Backfill: fetching {gap} older messages before ID {oldest_id}")
                backfill_data = []
                try:
                    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                                  BarColumn(), TaskProgressColumn(), console=console) as progress:
                        btask = progress.add_task(f"[bold cyan]Backfilling {gap} messages...[/bold cyan]", total=gap)
                        async for message in client.iter_messages(entity, limit=gap, max_id=oldest_id):
                            progress.advance(btask)
                            if s_date and message.date.date() < s_date:
                                break
                            total_r = 0; details = []
                            if message.reactions and message.reactions.results:
                                for rxn in message.reactions.results:
                                    cnt = rxn.count; total_r += cnt
                                    try: lbl = rxn.reaction.emoticon
                                    except AttributeError: lbl = str(rxn.reaction)
                                    details.append(f"{lbl}: {cnt}")
                            uname = getattr(entity, 'username', None)
                            lnk = f"https://t.me/{uname}/{message.id}" if uname else f"https://t.me/c/{getattr(entity,'id','')}/{message.id}"
                            ft = message.text or ''
                            now_utc2 = datetime.now(timezone.utc)
                            mdt = message.date if message.date.tzinfo else message.date.replace(tzinfo=timezone.utc)
                            hrs = max(1, (now_utc2 - mdt).total_seconds() / 3600)
                            backfill_data.append({
                                'id': message.id, 'date': message.date,
                                'total_reactions': total_r,
                                'breakdown': ', '.join(details) if details else 'None',
                                'views': getattr(message, 'views', 0) or 0,
                                'forwards': getattr(message, 'forwards', 0) or 0,
                                'velocity': round(total_r / hrs, 3),
                                'text': ft,
                                'text_preview': ft[:80].replace('\n', ' ') if ft else '[Media/No Text]',
                                'link': lnk
                            })
                    existing_ids2 = {int(r['id']) for r in merged}
                    merged = merged + [r for r in backfill_data if int(r['id']) not in existing_ids2]
                    console.print(f"[bold green]✓ Backfilled {len(backfill_data)} older messages → {len(merged)} total[/bold green]")
                    log.info(f"Backfill complete: {len(backfill_data)} messages added, {len(merged)} total")
                except Exception as e:
                    console.print(f"[bold yellow][!] Backfill warning:[/bold yellow] {e}")
                    log.warning(f"Backfill error: {e}")

            
            if not merged:
                console.print(f"[bold yellow]No reactions found in the last {limit} messages.[/bold yellow]")
                return

            # Sort by Total Reactions
            df = pd.DataFrame(merged)
            # Backfill columns missing from old CSVs
            if 'velocity' not in df.columns:
                df['velocity'] = 0.0
            df['velocity'] = pd.to_numeric(df['velocity'], errors='coerce').fillna(0.0)
            df_sorted = df.sort_values(by='total_reactions', ascending=False)
            
            # Display Results Table
            console.print(f"\n[bold white on #2AABEE]  🏆 Top {top_n} Messages by Reactions  [/bold white on #2AABEE]\n")
            
            table = Table(box=box.MINIMAL_DOUBLE_HEAD, show_header=True, header_style="bold #2AABEE", expand=True)
            table.add_column("⭐ Reactions", style="bold yellow", justify="center", ratio=1)
            table.add_column("📝 Message Preview", style="white", ratio=4)
            table.add_column("🔗 Link", style="bold #2AABEE", justify="center", ratio=1)
            
            for index, row in df_sorted.head(top_n).iterrows():
                preview = row.get('text_preview') or row.get('text') or ''
                if not isinstance(preview, str): preview = str(preview) if preview == preview else ''
                table.add_row(
                    str(row['total_reactions']),
                    preview[:60],
                    f"[link={row['link']}]Open[/link]"
                )
                
            console.print(table)
            console.print()
                
            # Save to CSV
            # Clean channel name for safe file path
            # Handles: @channel, t.me/channel, https://t.me/channel
            raw_name = re.sub(r'^(https?://)?(t\.me/|telegram\.me/)', '', target_channel.strip())
            raw_name = raw_name.lstrip('@').split('/')[0].split('?')[0]
            safe_channel_name = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_name)
            if not safe_channel_name:
                safe_channel_name = "export"
            
            csv_filename = f"{safe_channel_name}.csv"
            csv_path = os.path.join('data', csv_filename)
            os.makedirs('data', exist_ok=True)
            
            if Confirm.ask(f"[bold cyan]Save results to data/{csv_filename}?[/bold cyan]", default=True):
                df_sorted.to_csv(csv_path, index=False)
                console.print(f"[bold green]Saved to data/{csv_filename}[/bold green]")
                
                # Update files.json — store as 'data/channel.csv' (relative to server root)
                files_json_path = 'files.json'
                existing_files = []
                if os.path.exists(files_json_path):
                    try:
                        with open(files_json_path, 'r') as f:
                            data_json = json.load(f)
                            existing_files = data_json.get('files', [])
                    except Exception:
                        pass
                
                entry = f"data/{csv_filename}"
                if entry not in existing_files:
                    existing_files.append(entry)
                
                # Store metadata (row count) for the UI dropdown
                files_meta = data_json.get('meta', {}) if os.path.exists(files_json_path) else {}
                files_meta[entry] = {'count': len(df_sorted)}
                    
                with open(files_json_path, 'w') as f:
                    json.dump({"files": existing_files, "meta": files_meta}, f, indent=2)

                # Auto-open viewer with the specific file loaded
                console.print("[bold yellow]Launching UI Viewer...[/bold yellow]")
                try:
                    import webbrowser, threading, time
                    viewer_url = f"http://localhost:8000/web/view_results.html?file={entry}"
                    # Open browser after a short delay to let the server boot
                    def open_browser():
                        time.sleep(1.2)
                        webbrowser.open(viewer_url)
                    threading.Thread(target=open_browser, daemon=True).start()
                    console.print(f"[dim]Opening: {viewer_url}[/dim]")
                    # Start the HTTP server (blocking — keeps the terminal alive)
                    subprocess.run([sys.executable, "-m", "http.server", "8000"])
                except Exception as e:
                    console.print(f"[bold red][!] Could not auto-launch viewer:[/bold red] {e}")
                    console.print(f"[dim]Manually open: http://localhost:8000/web/view_results.html?file={entry}[/dim]")

    except ApiIdInvalidError:
        console.print("\n[bold red][!] Error: The API ID/Hash combination is invalid.[/bold red]")
        console.print("[dim]Please check your credentials at https://my.telegram.org and try again.[/dim]")
    except Exception as e:
        console.print(f"\n[bold red][!] An unexpected error occurred:[/bold red] {e}")

class RichHelpCommand(click.Command):
    def format_help(self, ctx, formatter):
        console.print()
        console.print("[bold magenta]Telegram Reactions Sorter[/bold magenta]\n")
        console.print("[bold cyan]Usage:[/bold cyan] [white]python sort_reactions.py [OPTIONS][/white]\n")
        
        table = Table(box=None, padding=(0, 2), expand=False, show_header=False)
        table.add_column("Option", style="bold green")
        table.add_column("Description", style="white")
        table.add_column("Default", style="dim")

        for param in self.get_params(ctx):
            name = "--" + param.name.replace("_", "-")
            if param.secondary_opts:
                 name += ", " + ", ".join(param.secondary_opts)
            
            help_text = param.help or ""
            default = f"(default: {param.default})" if param.default is not None and str(param.default) != "None" else ""
            table.add_row(name, help_text, default)
            
        console.print("[bold yellow]Options:[/bold yellow]")
        console.print(table)

@click.command(cls=RichHelpCommand)
@click.option('--channel', help='Target channel username or link (e.g., @telegram)')
@click.option('--channels', multiple=True, help='Batch mode: multiple channels (e.g., --channels @a --channels @b)')
@click.option('--limit', default=1000, help='How many recent messages to fetch from the channel', type=int)
@click.option('--top', default=10, help='How many top messages to display', type=int)
@click.option('--start-date', default=None, help='Fetch messages starting from this date (YYYY-MM-DD)')
@click.option('--end-date', default=None, help='Fetch messages up to this date (YYYY-MM-DD)')
@click.option('--refresh', is_flag=True, default=False, help='Re-fetch reactions for all existing messages without re-downloading content')
@click.option('--full', is_flag=True, default=False, help='Ignore existing data and do a full fresh fetch (overwrites CSV)')
@click.option('--watch', is_flag=True, default=False, help='Loop indefinitely, re-fetching on a timer')
@click.option('--interval', default=30, type=int, help='Minutes between --watch refreshes (default: 30)')
def main(channel, channels, limit, top, start_date, end_date, refresh, full, watch, interval):
    """Telegram Reactions Sorter"""
    
    # Interactive mode if channel is not provided
    if not channel:
        console.print(r"""[bold #2AABEE]
╺━┓╻┏━┓┏━┓┏━╸   ╺┳╸┏━╸┏━┓┏━┓┏━┓╺┳╸┏━┓┏━╸┏━┓┏━╸╺┳╸
┏━┛┃┗━┓╺━┫┃      ┃ ┃╺┓┗━┓┃ ┃┣┳┛ ┃ ┣┳┛┣╸ ┣━┫┃   ┃ 
┗━╸╹┗━┛┗━┛┗━╸    ╹ ┗━┛┗━┛┗━┛╹┗╸ ╹ ╹┗╸┗━╸╹ ╹┗━╸ ╹ 
[/bold #2AABEE]""")

    # --- Session Handling ---
    api_id = None
    api_hash = None
    use_existing_session = False
    
    if os.path.exists(SESSION_FILE):
        console.print("[*] A saved session was found.", style="bold yellow")
        choice = Prompt.ask("Do you want to (r)euse it or start (n)ew?", choices=["r", "n"], default="r")
        if choice == 'r':
            use_existing_session = True
            console.print("[*] Using existing session.", style="bold green")
        elif choice == 'n':
            os.remove(SESSION_FILE)
            if os.path.exists(CONFIG_FILE):
                os.remove(CONFIG_FILE)
            console.print("[*] Old session deleted. Please enter new credentials.", style="bold cyan")

    # Load from config if reusing session
    if use_existing_session and os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
                api_id = config.get('API_ID')
                api_hash = config.get('API_HASH')
        except Exception as e:
            console.print(f"[bold red][!] Error reading config file:[/bold red] {e}")

    # If missing credentials
    if not api_id or not api_hash:
        if use_existing_session:
             console.print("[*] API credentials not found in config. Please re-enter them.", style="bold yellow")
        while not api_id:
            api_id_in = Prompt.ask("Enter your API ID")
            if not api_id_in:
                console.print("[bold red][!] Error:[/bold red] API ID cannot be empty.")
                continue
            if not api_id_in.isdigit():
                console.print("[bold red][!] Error:[/bold red] API ID must be a numeric value.")
                continue
            api_id = int(api_id_in)

        while not api_hash:
            api_hash_in = Prompt.ask("Enter your API Hash")
            if not api_hash_in:
                console.print("[bold red][!] Error:[/bold red] API Hash cannot be empty.")
                continue
            api_hash = api_hash_in
            
        # Save credentials
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump({'API_ID': api_id, 'API_HASH': api_hash}, f)
        except Exception as e:
            console.print(f"[bold red][!] Error saving config file:[/bold red] {e}")

    # If not provided via CLI args, prompt for it
    if not channel:
        console.print()
        
        console.print(Panel(
            "[dim]Please provide the details for the channel you want to analyze.[/dim]",
            title="[bold #2AABEE]🔍 Scan Configuration[/bold #2AABEE]",
            border_style="#2AABEE",
            expand=False
        ))
        
        console.print()
        while True:
            channel = Prompt.ask("   [bold cyan]▶ Target Channel[/bold cyan] (username/link)")
            if channel.strip():
                break
            console.print("   [bold red][!] Error:[/bold red] Channel cannot be empty.")
            
        limit = IntPrompt.ask("   [bold cyan]▶ Recent Messages to Fetch[/bold cyan]", default=limit)
        console.print()

    # Build list of channels to process
    all_channels = list(channels) if channels else []
    if channel:
        all_channels.insert(0, channel)

    try:
        if watch:
            import time as _time
            console.print(f"[bold cyan]👁 Watch mode: refreshing every {interval} min. Ctrl+C to stop.[/bold cyan]")
            while True:
                for ch in (all_channels or [channel]):
                    if ch:
                        asyncio.run(run_sort(api_id, api_hash, ch, limit, top, start_date, end_date, refresh=True, full=False))
                console.print(f"[dim]Next refresh in {interval} min... (Ctrl+C to stop)[/dim]")
                for remaining in range(interval * 60, 0, -1):
                    console.print(f"  ⏱ {remaining // 60}m {remaining % 60}s remaining...", end="\r")
                    _time.sleep(1)
                console.print()
        else:
            for ch in (all_channels or [channel]):
                if ch:
                    asyncio.run(run_sort(api_id, api_hash, ch, limit, top, start_date, end_date, refresh=refresh, full=full))
                elif not all_channels:
                    asyncio.run(run_sort(api_id, api_hash, channel, limit, top, start_date, end_date, refresh=refresh, full=full))
                    break
    except (SessionExpiredError, AuthKeyError):
        console.print("\n[bold red][!] Session expired or invalid.[/bold red] Deleting saved session...")
        for f in [SESSION_FILE, CONFIG_FILE]:
            if os.path.exists(f):
                os.remove(f)
        console.print("[bold yellow][*] Please re-run the script to authenticate with fresh credentials.[/bold yellow]")

if __name__ == '__main__':
    try:
        main(standalone_mode=False)
    except click.exceptions.Abort:
         console.print("\n[bold red][!] Aborted![/bold red]")
    except click.exceptions.UsageError as e:
         console.print(f"\n[bold red]Error:[/bold red] {e.message}")
         if e.ctx:
             console.print(f"[dim]{e.ctx.get_help()}[/dim]")
         else:
             console.print("[dim]Run 'python sort_reactions.py --help' for usage information.[/dim]")
    except KeyboardInterrupt:
        console.print("\n[bold red][!] Aborted![/bold red]")
    except EOFError:
        console.print("\n[bold red][!] Aborted! (Input stream closed)[/bold red]")
    except Exception as e:
         console.print(f"\n[bold red]Unexpected Error:[/bold red] {e}")
