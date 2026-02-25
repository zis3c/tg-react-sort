# tg-react-sort — Capabilities & Awareness

## 1. What This Tool Does

tg-react-sort is a high-speed Telegram channel analytics tool. It is capable of fetching thousands of messages from any public Telegram channel in seconds.

It works by connecting directly to Telegram's MTProto API as a real user account. It automatically fetches every message, counts the total reactions (including a full emoji breakdown), records views and forwards, and calculates a "velocity" score (reactions per hour). All of this is saved to a CSV file and loaded into a dark-mode web dashboard with charts, filters, and keyword analysis.

Because it operates as a legitimate Telegram user (not a scraper or bot), it can access any public channel — and any private channel the account is a member of — without triggering spam filters.

---

## 2. What Channel Owners Should Know

If you run a Telegram channel and are concerned about your message data being collected by tools like this, here is what you should understand.

### A. Public Channels Have No Protection
- Any public Telegram channel (`@username`) can be read by any Telegram account.
- Reaction counts, message text, views, and forwards are all publicly visible through the API. There is no way to hide this data from authenticated users.

### B. Make Your Channel Private *(Most Effective)*
- Go to your channel settings and set it to **Private**.
- **Why it works:** Private channels require an invite link or admin approval to join. This tool can only access private channels it is already a member of. A new account cannot join without your approval.

### C. Restrict Forwarding
- In channel settings, enable **"Restrict Saving Content"**.
- **Why it works:** While this does not block API access, it signals that the channel owner does not consent to content redistribution. It also disables the forwarding count visible in the API for some clients.

### D. Monitor Suspicious Members
- If you see unknown accounts joining your private channel, remove them.
- **Why it works:** This tool requires an authenticated Telegram account. If that account is removed from the channel, it immediately loses all access.

---

## Summary

This tool only works on channels accessible to the authenticated Telegram account. Public channels are always accessible. Private channels can be protected by controlling membership. Reaction and view data on public content is always visible through Telegram's official API and cannot be hidden from authenticated users.
