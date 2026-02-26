// ── Custom Dropdown Engine ───────────────────────────────
function setupCdd(triggerId, panelId, onChange) {
    const trigger = document.getElementById(triggerId);
    const panel = document.getElementById(panelId);
    if (!trigger || !panel) return;
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('open');
        document.querySelectorAll('.cdd-panel.open').forEach(p => { p.classList.remove('open'); p.previousElementSibling.classList.remove('open'); });
        if (!isOpen) { panel.classList.add('open'); trigger.classList.add('open'); }
    });
    panel.querySelectorAll('.cdd-option').forEach(opt => {
        opt.addEventListener('click', () => {
            panel.querySelectorAll('.cdd-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            panel.classList.remove('open'); trigger.classList.remove('open');
            if (onChange) onChange(opt.dataset.val, opt.textContent.trim());
        });
    });
}
document.addEventListener('click', () => {
    document.querySelectorAll('.cdd-panel.open').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.cdd-trigger.open').forEach(t => t.classList.remove('open'));
});

// ── State ────────────────────────────────────────────────
let allData = [];
let uniqueEmojis = new Set();
let currentFilteredData = [];
let visibleCount = 50;
const ITEMS_PER_PAGE = 50;
let availableFiles = [];
let fileMeta = {};
let maxReactions = 1;
let currentCardIndex = -1; // for j/k navigation

// ── IndexedDB Cache ───────────────────────────────────────
const IDB_NAME = 'tg_csv_cache', IDB_STORE = 'csvs', IDB_VERSION = 1;
function openIDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
        req.onsuccess = e => res(e.target.result);
        req.onerror = e => rej(e);
    });
}
async function idbGet(key) {
    const db = await openIDB();
    return new Promise(res => { const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key); req.onsuccess = e => res(e.target.result); req.onerror = () => res(null); });
}
async function idbSet(key, val) {
    const db = await openIDB();
    return new Promise(res => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).put(val, key); tx.oncomplete = res; tx.onerror = res; });
}

// ── Bookmarks ────────────────────────────────────────────
const BOOKMARK_KEY = 'tg_bookmarks';
function getBookmarks() {
    try { return new Set(JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]')); }
    catch { return new Set(); }
}
function saveBookmarks(set) {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...set]));
}
function toggleBookmark(id) {
    const bm = getBookmarks();
    const sid = String(id);
    bm.has(sid) ? bm.delete(sid) : bm.add(sid);
    saveBookmarks(bm);
    // Re-render the star icon live without a full re-render
    const btn = document.querySelector(`[data-bookmark-id="${sid}"]`);
    if (btn) {
        const isNow = bm.has(sid);
        btn.classList.toggle('bookmarked', isNow);
        btn.title = isNow ? 'Remove bookmark' : 'Bookmark';
        btn.innerHTML = starSvg(isNow);
    }
    // Update filter dot
    applyFilters();
}
function starSvg(filled) {
    return filled
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffd60a" stroke="#ffd60a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
}
const copyIconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

// ── Search highlighting ───────────────────────────────────
function highlight(text, term) {
    if (!term || !text) return text || '';
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), m => `<mark class="search-highlight">${m}</mark>`);
}

// ── Animation Helper ─────────────────────────────────────
function animateNumber(el, endVal, duration, formatter) {
    if (!el) return;
    // Parse the currently visible number from text as the start value
    const visibleText = el.textContent || '';
    const parsed = parseFloat(visibleText.replace(/[^0-9.]/g, ''));
    const startVal = (!isNaN(parsed) && el._animActive) ? (el._currentAnimVal ?? parsed) : parsed || 0;
    el._currentVal = endVal;
    el._animActive = true;

    if (Math.abs(startVal - endVal) < 0.5) {
        el.textContent = formatter(endVal);
        el._currentAnimVal = endVal;
        return;
    }

    if (el._animId) cancelAnimationFrame(el._animId);

    el._currentAnimVal = startVal;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        const current = startVal + (endVal - startVal) * ease;
        el._currentAnimVal = current;
        el.textContent = formatter(current);
        if (progress < 1) {
            el._animId = requestAnimationFrame(step);
        } else {
            el._currentAnimVal = endVal;
            el.textContent = formatter(endVal);
        }
    };
    el._animId = requestAnimationFrame(step);
}

// ── Relative Time Helper ─────────────────────────────────
function timeAgo(dateObj) {
    if (!dateObj || isNaN(dateObj)) return '';
    const secs = Math.floor((Date.now() - dateObj.getTime()) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    const days = Math.floor(secs / 86400);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

// ── URL Filter State ─────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
let targetCsv = urlParams.get('file');

function pushFilterState() {
    const params = new URLSearchParams(window.location.search);
    const term = document.getElementById('searchInput').value;
    const emoji = document.querySelector('#emojiPanel .cdd-option.selected')?.dataset.val || '';
    const sort = document.querySelector('#sortPanel .cdd-option.selected')?.dataset.val || 'reactions';
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const starred = document.getElementById('starredToggle')?.classList.contains('active') ? '1' : '';

    term ? params.set('q', term) : params.delete('q');
    emoji ? params.set('emoji', emoji) : params.delete('emoji');
    sort !== 'reactions' ? params.set('sort', sort) : params.delete('sort');
    start ? params.set('from', start) : params.delete('from');
    end ? params.set('to', end) : params.delete('to');
    starred ? params.set('starred', '1') : params.delete('starred');

    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    history.replaceState(null, '', newUrl);
}

function restoreFilterState() {
    const q = urlParams.get('q');
    const emoji = urlParams.get('emoji');
    const sort = urlParams.get('sort');
    const from = urlParams.get('from');
    const to = urlParams.get('to');
    const starred = urlParams.get('starred');

    if (q) document.getElementById('searchInput').value = q;
    if (from) document.getElementById('startDate').value = from;
    if (to) document.getElementById('endDate').value = to;
    if (starred && document.getElementById('starredToggle')) {
        document.getElementById('starredToggle').classList.add('active');
    }
    window._restoreEmoji = emoji;
    window._restoreSort = sort;
}

// ── File Dropdown ────────────────────────────────────────
fetch(`../files.json?_=${Date.now()}`)
    .then(res => res.json())
    .then(data => {
        availableFiles = data.files || [];
        fileMeta = data.meta || {};
        if (!targetCsv) targetCsv = availableFiles.length > 0 ? availableFiles[0] : 'data/results.csv';
        _lastKnownCount = fileMeta[targetCsv]?.count || 0;
        populateFileDropdown();
        loadCSVData();
    })
    .catch(() => {
        if (!targetCsv) targetCsv = 'data/results.csv';
        loadCSVData();
    });

// ── Auto-Refresh Polling ──────────────────────────────────
// Polls files.json every 60s; shows blue dot if count changed for current file
let _lastKnownCount = 0;
function _pollNewData() {
    fetch(`../files.json?_=${Date.now()}`)
        .then(r => r.json())
        .then(data => {
            const meta = data.meta || {};
            const newCount = meta[targetCsv]?.count || 0;
            if (_lastKnownCount && newCount > _lastKnownCount) {
                const dot = document.getElementById('newDataDot');
                if (dot) { dot.classList.remove('hidden', 'shrink-away'); }
            }
            if (newCount) _lastKnownCount = newCount;
        })
        .catch(() => { });
}
setInterval(_pollNewData, 60000);

function loadFreshData() {
    const dot = document.getElementById('newDataDot');
    if (dot) {
        dot.classList.add('shrink-away');
        setTimeout(() => dot.classList.add('hidden'), 450);
    }
    // Bust IndexedDB cache for current file so next load fetches fresh
    const count = fileMeta[targetCsv]?.count || 0;
    const oldKey = `csv:${targetCsv}:${count}`;
    openIDB().then(db => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(oldKey);
        tx.oncomplete = () => {
            fetch(`../files.json?_=${Date.now()}`).then(r => r.json()).then(data => {
                fileMeta = data.meta || {};
                _lastKnownCount = fileMeta[targetCsv]?.count || 0;
                loadCSVData();
            }).catch(() => loadCSVData());
        };
    });
}
function populateFileDropdown() {
    const container = document.getElementById('channelSelectContainer');
    if (availableFiles.length === 0) return;

    const optionsHtml = availableFiles.map(f => {
        const label = f.replace('data/', '').replace('.csv', '');
        const count = fileMeta[f]?.count;
        return `<div class="cdd-option ${f === targetCsv ? 'selected' : ''}" data-val="${f}">${label}${count ? ` (${count.toLocaleString()})` : ''}</div>`;
    }).join('');

    const currentLabel = (() => {
        const label = (targetCsv || availableFiles[0]).replace('data/', '').replace('.csv', '');
        const count = fileMeta[targetCsv]?.count;
        return count ? `${label} (${count.toLocaleString()})` : label;
    })();

    container.innerHTML = `
        <div class="cdd accent" id="channelCdd">
            <div class="cdd-trigger" id="channelTrigger">
                <span id="channelLabel">${currentLabel}</span>
                <svg class="cdd-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div class="cdd-panel" id="channelPanel">${optionsHtml}</div>
        </div>`;
    setupCdd('channelTrigger', 'channelPanel', (val) => {
        const p = new URLSearchParams(window.location.search);
        p.set('file', val); window.location.search = p.toString();
    });
}

// ── CSV Loading ──────────────────────────────────────────
async function loadCSVData() {
    // Include row count in key — if Python saves more rows, files.json count changes,
    // the key changes, and the browser fetches fresh automatically.
    const count = fileMeta[targetCsv]?.count || 0;
    const cacheKey = `csv:${targetCsv}:${count}`;
    const cached = await idbGet(cacheKey);
    if (cached && count > 0) {
        console.log('[Cache] HIT:', targetCsv, `(${count} rows)`);
        parseCSVText(cached);
    } else {
        const res = await fetch('../' + targetCsv + '?_=' + Date.now()).catch(() => null);
        if (!res || !res.ok) { showError(`Error loading ${targetCsv}: File might not exist yet.`); return; }
        const text = await res.text();
        if (count > 0) await idbSet(cacheKey, text); // only cache if count is known
        parseCSVText(text);
    }
}

function parseCSVText(csvText) {
    Papa.parse(csvText, {
        header: true, skipEmptyLines: true,
        complete(results) {
            if (results.data && results.data.length > 0) {
                allData = results.data
                    .filter(row => row.id !== undefined)
                    .map(row => {
                        const reactionsMap = {};
                        if (row.breakdown) {
                            row.breakdown.split(', ').forEach(part => {
                                const [emoji, count] = part.split(':').map(s => s.trim());
                                if (emoji) reactionsMap[emoji] = parseInt(count || 0);
                            });
                        }
                        const views = parseInt(row.views || 0);
                        const forwards = parseInt(row.forwards || 0);
                        const total_r = parseInt(row.total_reactions || 0);
                        const now = Date.now();
                        const dateObj = new Date(row.date);
                        const hoursSince = Math.max(1, (now - dateObj.getTime()) / 3600000);
                        const velocity = +(total_r / hoursSince).toFixed(3);
                        return {
                            ...row,
                            total_reactions: total_r,
                            views, forwards, velocity,
                            ratio: views > 0 ? +((total_r / views) * 100).toFixed(2) : 0,
                            dateObj,
                            reactionsMap
                        };
                    });

                maxReactions = Math.max(...allData.map(m => m.total_reactions), 1);
                extractEmojis(allData);
                populateEmojiFilter();
                restoreFilterState();
                applyFilters();
                // Permalink: open modal if ?msg=ID is in URL
                const msgId = urlParams.get('msg');
                if (msgId) {
                    const target = allData.find(m => String(m.id) === String(msgId));
                    if (target) {
                        const slug = targetCsv ? targetCsv.replace('data/', '').replace('.csv', '').replace(/^@/, '') : '';
                        const link = target.id && slug ? `https://t.me/${slug}/${target.id}` : (target.link || '#');
                        setTimeout(() => openMsgModal(target, '', slug, link), 300);
                    }
                }
            } else {
                showError(`No valid data found in ${targetCsv}`);
            }
        },
        error() { showError(`Error loading ${targetCsv}: File might not exist yet.`); }
    });
}

function extractEmojis(data) {
    data.forEach(msg => Object.keys(msg.reactionsMap).forEach(e => uniqueEmojis.add(e)));
}

function populateEmojiFilter() {
    const panel = document.getElementById('emojiPanel');
    const sortedEmojis = Array.from(uniqueEmojis).sort();
    let html = `<div class="cdd-option selected" data-val="">All Emojis</div>`;
    sortedEmojis.forEach(e => { html += `<div class="cdd-option" data-val="${e}">${e}</div>`; });
    panel.innerHTML = html;

    setupCdd('emojiTrigger', 'emojiPanel', (val, label) => {
        document.getElementById('emojiLabel').textContent = label;
        applyFilters();
    });

    if (window._restoreEmoji) {
        const opt = panel.querySelector(`[data-val="${window._restoreEmoji}"]`);
        if (opt) {
            panel.querySelectorAll('.cdd-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            document.getElementById('emojiLabel').textContent = opt.textContent.trim();
        }
    }
    if (window._restoreSort) {
        const sortOpt = document.querySelector(`#sortPanel [data-val="${window._restoreSort}"]`);
        if (sortOpt) {
            document.querySelectorAll('#sortPanel .cdd-option').forEach(o => o.classList.remove('selected'));
            sortOpt.classList.add('selected');
            document.getElementById('sortLabel').textContent = sortOpt.textContent.trim();
        }
    }
    // Restore drawer state from last session
    if (localStorage.getItem(DRAWER_KEY) === 'open') {
        const drawer = document.getElementById('filterDrawer');
        const btn = document.getElementById('filtersToggle');
        if (drawer && !drawer.classList.contains('open')) {
            drawer.classList.add('open'); btn?.classList.add('open');
            drawer.style.overflow = 'visible';
        }
    }
}

function showError(msg) {
    document.getElementById('messageList').innerHTML =
        `<div class="flex flex-col items-center justify-center pt-20">
            <div class="text-red-400 font-medium mb-2">⚠️ ${msg}</div>
            <div class="text-sm text-gray-500">Run python sort_reactions.py to generate data.</div>
        </div>`;
}

// ── Event Listeners ──────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');

setupCdd('sortTrigger', 'sortPanel', (val, label) => {
    document.getElementById('sortLabel').textContent = label;
    applyFilters();
});

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
searchInput.addEventListener('input', debounce(applyFilters, 300));
[startDate, endDate].forEach(el => el.addEventListener('change', applyFilters));

// Starred toggle
document.getElementById('starredToggle')?.addEventListener('click', function () {
    this.classList.toggle('active');
    applyFilters();
});

// ── Filter Drawer ────────────────────────────────────────
const DRAWER_KEY = 'tg_drawer';
function toggleFilterDrawer() {
    const drawer = document.getElementById('filterDrawer');
    const btn = document.getElementById('filtersToggle');
    const isOpen = drawer.classList.contains('open');
    drawer.style.overflow = 'hidden';
    if (isOpen) {
        drawer.classList.remove('open'); btn.classList.remove('open');
        localStorage.setItem(DRAWER_KEY, 'closed');
    } else {
        drawer.classList.add('open'); btn.classList.add('open');
        localStorage.setItem(DRAWER_KEY, 'open');
        drawer.addEventListener('transitionend', function h() {
            if (drawer.classList.contains('open')) drawer.style.overflow = 'visible';
            drawer.removeEventListener('transitionend', h);
        });
    }
}

function clearAllFilters() {
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('#emojiPanel .cdd-option').forEach(o => o.classList.remove('selected'));
    const allEmoji = document.querySelector('#emojiPanel .cdd-option');
    if (allEmoji) { allEmoji.classList.add('selected'); document.getElementById('emojiLabel').textContent = 'All Emojis'; }
    document.querySelectorAll('#sortPanel .cdd-option').forEach(o => o.classList.remove('selected'));
    const firstSort = document.querySelector('#sortPanel .cdd-option');
    if (firstSort) { firstSort.classList.add('selected'); document.getElementById('sortLabel').textContent = firstSort.textContent; }
    document.getElementById('starredToggle')?.classList.remove('active');
    document.getElementById('drpClear') && document.getElementById('drpClear').click();
    // Deactivate all preset chips
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    applyFilters();
}

// ── Filters & Sorting ────────────────────────────────────
function applyFilters() {
    const term = searchInput.value.toLowerCase();
    const selectedEmojiOpt = document.querySelector('#emojiPanel .cdd-option.selected');
    const selectedEmoji = selectedEmojiOpt?.dataset.val || '';
    const selectedSortOpt = document.querySelector('#sortPanel .cdd-option.selected');
    const sortCriteria = selectedSortOpt?.dataset.val || 'reactions';
    const start = startDate.value ? new Date(startDate.value) : null;
    const end = endDate.value ? new Date(endDate.value) : null;
    if (end) end.setHours(23, 59, 59, 999);
    const showStarred = document.getElementById('starredToggle')?.classList.contains('active');
    const bookmarks = showStarred ? getBookmarks() : null;

    let filtered = allData.filter(msg => {
        const matchText = (msg.text || '').toLowerCase().includes(term);
        const matchEmoji = selectedEmoji ? (msg.reactionsMap[selectedEmoji] !== undefined) : true;
        let matchDate = true;
        if (start && msg.dateObj < start) matchDate = false;
        if (end && msg.dateObj > end) matchDate = false;
        const matchStar = bookmarks ? bookmarks.has(String(msg.id)) : true;
        return matchText && matchEmoji && matchDate && matchStar;
    });

    filtered.sort((a, b) => {
        if (selectedEmoji) {
            const diff = (b.reactionsMap[selectedEmoji] || 0) - (a.reactionsMap[selectedEmoji] || 0);
            if (diff !== 0) return diff;
        }
        if (sortCriteria === 'reactions') return b.total_reactions - a.total_reactions;
        if (sortCriteria === 'recent') return b.dateObj - a.dateObj;
        if (sortCriteria === 'oldest') return a.dateObj - b.dateObj;
        if (sortCriteria === 'ratio') return b.ratio - a.ratio;
        if (sortCriteria === 'velocity') return b.velocity - a.velocity;
        return 0;
    });

    currentFilteredData = filtered;
    // Update count display: "X of Y results"
    const totalAll = allData.length;
    const shown = filtered.length;
    const countEl = document.getElementById('countDisplay');
    if (countEl) {
        const isFiltered = shown < totalAll;
        animateNumber(countEl, shown, 600, v => {
            const currentShown = Math.round(v);
            return isFiltered
                ? `${currentShown.toLocaleString()} / ${totalAll.toLocaleString()}`
                : `${currentShown.toLocaleString()} msgs`;
        });
        countEl.title = isFiltered ? `${shown} results matching filters out of ${totalAll} total` : `${totalAll} messages`;
    }

    const hasFilter = searchInput.value || selectedEmojiOpt?.dataset.val ||
        (selectedSortOpt?.dataset.val !== 'reactions') || startDate.value || endDate.value || showStarred;
    document.getElementById('filterDot').classList.toggle('hidden', !hasFilter);

    // Refresh view state and stats
    const iv = window.location.hash.slice(1) || 'list';
    setView(iv === 'chart' ? 'chart' : 'list');

    visibleCount = ITEMS_PER_PAGE;
    updateStats(currentFilteredData);
    renderMessages();
    pushFilterState();
}

const DOM_CAP = 150;
const DOM_RECYCLE = 50;

function renderMessages() {
    const container = document.getElementById('messageList');
    const countDisplay = document.getElementById('countDisplay');
    const selectedEmojiOpt = document.querySelector('#emojiPanel .cdd-option.selected');
    const selectedEmoji = selectedEmojiOpt?.dataset.val || '';
    const searchTerm = searchInput.value;
    const bookmarks = getBookmarks();

    // Count display is animated by applyFilters() — do not overwrite it here

    // ── Smart empty state
    if (currentFilteredData.length === 0) {
        let hint = 'No messages match your filters.';
        let removeFn = '';
        const selEmoji = document.querySelector('#emojiPanel .cdd-option.selected')?.dataset.val || '';
        if (searchInput.value) {
            hint = `No messages contain <strong>&ldquo;${searchInput.value}&rdquo;</strong>.`;
            removeFn = `document.getElementById('searchInput').value=''; applyFilters();`;
        } else if (selEmoji) {
            hint = `No messages have the <strong>${selEmoji}</strong> reaction.`;
            removeFn = `document.querySelectorAll('#emojiPanel .cdd-option').forEach(o=>o.classList.remove('selected')); document.querySelector('#emojiPanel .cdd-option').classList.add('selected'); document.getElementById('emojiLabel').textContent='All Emojis'; applyFilters();`;
        } else if (startDate.value || endDate.value) {
            hint = 'No messages found in the selected date range.';
            removeFn = `document.getElementById('drpClear').click();`;
        } else if (document.getElementById('starredToggle')?.classList.contains('active')) {
            hint = 'You have no bookmarked messages.';
            removeFn = `document.getElementById('starredToggle').classList.remove('active'); applyFilters();`;
        }
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center pt-20 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-4 opacity-40"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <p class="text-sm text-center px-4">${hint}</p>
                ${removeFn ? `<button class="empty-remove-btn" onclick="${removeFn}">Remove filter &times;</button>` : ''}
            </div>`;
        return;
    }

    const dataToRender = currentFilteredData.slice(0, visibleCount);
    const messagesHtml = dataToRender.map(msg => {
        let reactionItems = [];
        if (msg.breakdown) {
            reactionItems = msg.breakdown.split(', ').map(r => {
                const [emoji, count] = r.split(':').map(s => s.trim());
                return { emoji, count };
            });
            if (selectedEmoji) {
                reactionItems.sort((a, b) => a.emoji === selectedEmoji ? -1 : b.emoji === selectedEmoji ? 1 : 0);
            }
        }

        // Limit emojis drawn to avoid layout blowout (render max 7 + a remainder pill)
        const MAX_EMOJI_RENDER = 7;
        const visibleReactions = reactionItems.slice(0, MAX_EMOJI_RENDER);
        const hiddenCount = reactionItems.length - MAX_EMOJI_RENDER;

        let reactionsHtml = visibleReactions.map(item => `
            <div class="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-full text-xs font-medium text-gray-300 border border-white/5 transition-colors cursor-default ${item.emoji === selectedEmoji ? 'border-tg-accent/50 bg-tg-accent/15 text-tg-accent' : ''}">
                <span>${item.emoji}</span>
                <span class="text-gray-500 ${item.emoji === selectedEmoji ? 'text-tg-accent font-bold' : ''}">${item.count}</span>
            </div>`).join('');

        if (hiddenCount > 0) {
            reactionsHtml += `
            <div class="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-full text-[10px] font-medium text-gray-500 border border-white/5 cursor-default" title="${hiddenCount} more reaction types">
                +${hiddenCount}
            </div>`;
        }

        const fullDateStr = msg.dateObj.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const relTime = timeAgo(msg.dateObj);
        const fullText = msg.text || '';
        const channelSlug = targetCsv ? targetCsv.replace('data/', '').replace('.csv', '').replace(/^@/, '') : '';
        const tgLink = msg.id && channelSlug ? `https://t.me/${channelSlug}/${msg.id}` : (msg.link || '#');
        const isBookmarked = bookmarks.has(String(msg.id));

        // Views/ratio badge (only if views data exists)
        const hasMeta = msg.views > 0;
        const velPart = msg.velocity > 0.05
            ? `<span title="Reactions per hour since post" class="text-orange-400/80">⚡ ${msg.velocity} rxn/hr</span>`
            : '';
        const metaHtml = hasMeta
            ? `<div class="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                <span title="Views">👁 ${msg.views.toLocaleString()}</span>
                <span title="Forwards">↗ ${msg.forwards.toLocaleString()}</span>
                <span title="Reaction rate" class="text-tg-accent/80">${msg.ratio}% rate</span>
                ${velPart}
               </div>`
            : velPart ? `<div class="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500">${velPart}</div>` : '';

        const displayText = highlight(fullText, searchTerm) || "<span class='italic opacity-50'>[Media/No Text]</span>";


        const seenIds = getSeenIds();
        const isUnseen = !seenIds.has(String(msg.id));

        return `
        <div class="list-card-premium msg-card mb-4 relative group ${isUnseen ? 'unread-card' : ''}" data-msg-id="${msg.id}" onclick="openMsgModal(${JSON.stringify(msg).replace(/"/g, '&quot;')}, '${searchTerm.replace(/'/g, "\\'")}',' ${channelSlug}', '${tgLink}')">
            ${isUnseen ? `<span class="unread-indicator"></span>` : ''}
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs font-bold text-tg-accent tracking-wide uppercase opacity-90 shrink-0">${channelSlug || 'Telegram'}</span>
                    <span class="text-[10px] text-gray-500 font-medium truncate" title="${fullDateStr}">${relTime}</span>
                </div>
            </div>
            <div class="msg-body text-[14px] leading-6 text-gray-200 font-normal tracking-wide">${displayText}</div>
            ${metaHtml}
            <div class="flex flex-wrap items-center justify-between mt-3 pt-3 border-t border-white/5 gap-y-3">
                <div class="flex flex-wrap items-center gap-2">
                    ${reactionsHtml}
                </div>
                <div class="flex items-center gap-2 ml-auto shrink-0">
                    <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-bookmark-id="${msg.id}" onclick="event.stopPropagation(); toggleBookmark('${msg.id}')" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">${starSvg(isBookmarked)}</button>
                    <div class="flex items-center gap-1.5 bg-tg-accent/10 px-3 py-1 rounded-lg">
                        <span class="text-xs font-bold text-tg-accent">Total: ${msg.total_reactions.toLocaleString()}</span>
                    </div>
                    <a href="${tgLink}" target="_blank" onclick="event.stopPropagation()" class="flex items-center gap-1 text-[11px] text-gray-600 hover:text-tg-accent transition-colors" title="Open in Telegram">
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        Open
                    </a>
                </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = messagesHtml;

    // Ensure modal exists
    if (!document.getElementById('msgModal')) {
        const m = document.createElement('div');
        m.id = 'msgModal';
        m.innerHTML = `
            <div id="msgModalBackdrop" class="modal-backdrop" onclick="closeMsgModal()"></div>
            <div id="msgModalBox" class="modal-box">
                <div class="modal-header">
                    <div id="modalMeta" class="flex items-center gap-2"></div>
                    <div class="flex items-center gap-2">
                        <button id="modalCopyBtn" class="modal-close-btn" title="Copy message text">${copyIconSvg}</button>
                        <button onclick="closeMsgModal()" class="modal-close-btn" title="Close">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
                <div id="modalBody" class="modal-body"></div>
                <div id="modalReactions" class="modal-reactions"></div>
                <div id="modalFooter" class="modal-footer"></div>
            </div>`;
        document.body.appendChild(m);
    }


    // ── Infinite scroll with DOM cap ─────────────────────
    const sentinel = document.createElement('div');
    container.appendChild(sentinel);
    if (visibleCount < currentFilteredData.length) {
        const obs = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) return;
            obs.disconnect();
            visibleCount += ITEMS_PER_PAGE;
            if (visibleCount > DOM_CAP) {
                const cards = [...container.querySelectorAll('.msg-card')];
                const toTrim = cards.slice(0, DOM_RECYCLE);
                const trimH = toTrim.reduce((h, c) => h + c.offsetHeight + 16, 0);
                toTrim.forEach(c => c.remove());
                let spacer = container.querySelector('.dom-spacer');
                if (!spacer) { spacer = document.createElement('div'); spacer.className = 'dom-spacer'; container.prepend(spacer); }
                spacer.style.height = (parseInt(spacer.style.height || '0') + trimH) + 'px';
            }
            renderMessages();
        }, { rootMargin: '200px' });
        obs.observe(sentinel);
    }
}

// ── Filter Presets ────────────────────────────────────────
function applyPreset(preset) {
    const chips = document.querySelectorAll('.preset-chip');
    const clickedChip = document.querySelector(`.preset-chip[data-preset="${preset}"]`);
    const wasActive = clickedChip?.classList.contains('active');
    chips.forEach(c => c.classList.remove('active'));
    if (wasActive) { clearAllFilters(); return; }
    clickedChip?.classList.add('active');

    // Reset to clean slate
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('#emojiPanel .cdd-option').forEach(o => o.classList.remove('selected'));
    const allEmoji = document.querySelector('#emojiPanel .cdd-option');
    if (allEmoji) { allEmoji.classList.add('selected'); document.getElementById('emojiLabel').textContent = 'All Emojis'; }
    document.getElementById('starredToggle')?.classList.remove('active');
    document.getElementById('drpClear')?.click();

    const fmt = d => d.toISOString().slice(0, 10);
    const now = new Date();

    if (preset === 'week') {
        const from = new Date(now); from.setDate(now.getDate() - 7);
        document.getElementById('startDate').value = fmt(from);
        document.getElementById('startDate').dispatchEvent(new Event('change'));
    } else if (preset === 'month') {
        const from = new Date(now); from.setDate(now.getDate() - 30);
        document.getElementById('startDate').value = fmt(from);
        document.getElementById('startDate').dispatchEvent(new Event('change'));
    } else if (preset === 'viral') {
        const sortOpt = document.querySelector('#sortPanel [data-val="ratio"]');
        if (sortOpt) {
            document.querySelectorAll('#sortPanel .cdd-option').forEach(o => o.classList.remove('selected'));
            sortOpt.classList.add('selected');
            document.getElementById('sortLabel').textContent = sortOpt.textContent.trim();
        }
        applyFilters();
        return;
    } else if (preset === 'top10') {
        applyFilters();
        visibleCount = 10;
        renderMessages();
        return;
    }
    applyFilters();
}

// ── Date Range Picker ────────────────────────────────────
(function () {
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    let curYear, curMonth, pickStart = null, pickEnd = null, picking = false;

    const trigger = document.getElementById('drpTrigger');
    const cal = document.getElementById('drpCal');
    const monthLbl = document.getElementById('drpMonthLabel');
    const grid = document.getElementById('drpGrid');
    const rangeLbl = document.getElementById('drpRangeLabel');
    const clearBtn = document.getElementById('drpClear');
    const inStart = document.getElementById('startDate');
    const inEnd = document.getElementById('endDate');
    const drpLabel = document.getElementById('drpLabel');
    const now = new Date();
    curYear = now.getFullYear(); curMonth = now.getMonth();

    function fmt(d) { return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; }
    function fmtD(d) { return d ? `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}` : ''; }

    if (inStart.value) { pickStart = new Date(inStart.value); picking = false; }
    if (inEnd.value) { pickEnd = new Date(inEnd.value); }

    function renderCal() {
        monthLbl.textContent = `${MONTHS[curMonth]} ${curYear}`;
        let html = DAYS.map(d => `<div class="drp-dow">${d}</div>`).join('');
        const first = new Date(curYear, curMonth, 1).getDay();
        const days = new Date(curYear, curMonth + 1, 0).getDate();
        const tStr = fmt(now);
        for (let i = 0; i < first; i++) html += `<div class="drp-day empty"></div>`;
        for (let d = 1; d <= days; d++) {
            const date = new Date(curYear, curMonth, d), dStr = fmt(date);
            let cls = 'drp-day';
            if (dStr === tStr) cls += ' today';
            if (pickStart && dStr === fmt(pickStart)) cls += ' start';
            if (pickEnd && dStr === fmt(pickEnd)) cls += ' end';
            if (pickStart && pickEnd && date > pickStart && date < pickEnd) cls += ' in-range';
            html += `<div class="${cls}" data-date="${dStr}">${d}</div>`;
        }
        grid.innerHTML = html;
        grid.querySelectorAll('.drp-day:not(.empty)').forEach(el => {
            el.addEventListener('click', () => {
                const d = new Date(el.dataset.date);
                if (!picking || (pickStart && d < pickStart)) { pickStart = d; pickEnd = null; picking = true; rangeLbl.textContent = 'End: pick a date'; }
                else { pickEnd = d; picking = false; rangeLbl.textContent = `${fmtD(pickStart)} → ${fmtD(pickEnd)}`; cal.classList.remove('open'); trigger.classList.remove('open'); updateInputs(); }
                updateTrigger(); renderCal();
            });
            el.addEventListener('mouseenter', () => {
                if (picking && pickStart) {
                    const hd = new Date(el.dataset.date);
                    grid.querySelectorAll('.drp-day').forEach(dd => dd.classList.remove('in-range'));
                    if (hd > pickStart) grid.querySelectorAll('.drp-day:not(.empty)').forEach(dd => { const d2 = new Date(dd.dataset.date); if (d2 > pickStart && d2 < hd) dd.classList.add('in-range'); });
                }
            });
        });
    }
    function updateTrigger() {
        if (pickStart) { trigger.classList.add('active'); drpLabel.textContent = pickEnd ? `${fmtD(pickStart)} → ${fmtD(pickEnd)}` : `From ${fmtD(pickStart)}`; }
        else { trigger.classList.remove('active'); drpLabel.textContent = 'Date Range'; }
    }
    updateTrigger();
    function updateInputs() { inStart.value = fmt(pickStart) || ''; inEnd.value = fmt(pickEnd) || ''; inStart.dispatchEvent(new Event('change')); }

    trigger.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = cal.classList.contains('open');
        document.querySelectorAll('.cdd-panel.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.cdd-trigger.open').forEach(t => t.classList.remove('open'));
        if (isOpen) { cal.classList.remove('open'); trigger.classList.remove('open'); }
        else { renderCal(); cal.classList.add('open'); trigger.classList.add('open'); rangeLbl.textContent = pickStart && !pickEnd ? 'End: pick a date' : pickStart ? `${fmtD(pickStart)} → ${fmtD(pickEnd)}` : 'Click to pick start date'; }
    });
    document.getElementById('drpPrev').addEventListener('click', e => { e.stopPropagation(); curMonth--; if (curMonth < 0) { curMonth = 11; curYear--; } renderCal(); });
    document.getElementById('drpNext').addEventListener('click', e => { e.stopPropagation(); curMonth++; if (curMonth > 11) { curMonth = 0; curYear++; } renderCal(); });
    clearBtn.addEventListener('click', e => { e.stopPropagation(); pickStart = pickEnd = null; picking = false; updateTrigger(); updateInputs(); renderCal(); rangeLbl.textContent = 'Click to pick start date'; });
    document.addEventListener('click', () => { cal.classList.remove('open'); trigger.classList.remove('open'); });
    cal.addEventListener('click', e => e.stopPropagation());
})();

// ── Message Modal ─────────────────────────────────────────
function openMsgModal(msg, searchTerm, channelSlug, tgLink) {
    const modal = document.getElementById('msgModal');
    const backdrop = document.getElementById('msgModalBackdrop');
    const box = document.getElementById('msgModalBox');
    if (!modal) return;

    const dateStr = msg.dateObj
        ? new Date(msg.dateObj).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : (msg.date || '');

    const bookmarks = getBookmarks();
    const isBookmarked = bookmarks.has(String(msg.id));

    // Mark as seen + immediately clear the unread dot/ring from the card DOM
    markSeen(msg.id);
    const seenCard = document.querySelector(`.msg-card[data-msg-id="${msg.id}"]`);
    if (seenCard) {
        // Remove the blue ring
        seenCard.classList.remove('ring-1', 'ring-tg-accent/30');
        // Fade out and remove the dot span
        const dot = seenCard.querySelector('span.bg-tg-accent.opacity-90');
        if (dot) {
            dot.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            dot.style.opacity = '0';
            dot.style.transform = 'scale(0)';
            setTimeout(() => dot.remove(), 320);
        }
    }
    // Find index in current filtered data for prev/next nav
    const currentIdx = currentFilteredData.findIndex(m => String(m.id) === String(msg.id));

    document.getElementById('modalMeta').innerHTML = `
        <span class="text-xs font-bold text-tg-accent tracking-wide uppercase">${(channelSlug || 'Telegram').trim()}</span>
        <span class="text-[11px] text-gray-500">${dateStr}</span>
        ${currentIdx >= 0 ? `<span class="text-[10px] text-gray-600">${currentIdx + 1} / ${currentFilteredData.length}</span>` : ''}`;

    // Full highlighted text
    const fullText = msg.text || '';
    const displayText = highlight(fullText, searchTerm) || "<span class='italic text-gray-500'>[Media / No Text]</span>";
    document.getElementById('modalBody').innerHTML = displayText;

    // Reactions
    let rxnHtml = '';
    if (msg.breakdown) {
        rxnHtml = msg.breakdown.split(', ').map(r => {
            const [emoji, count] = r.split(':').map(s => s.trim());
            return `<div class="flex items-center gap-1.5 bg-[#2c2c2e] px-2.5 py-1 rounded-full text-xs font-medium text-gray-300 border border-white/5">
                <span>${emoji}</span><span class="text-gray-500">${count}</span>
            </div>`;
        }).join('');
    }
    document.getElementById('modalReactions').innerHTML = rxnHtml;

    // Footer: views + link + bookmark
    const metaStr = msg.views > 0
        ? `<span class="text-[11px] text-gray-500">👁 ${Number(msg.views).toLocaleString()}</span>
           <span class="text-[11px] text-gray-500">↗ ${Number(msg.forwards).toLocaleString()}</span>
           <span class="text-[11px] text-tg-accent/80">${msg.ratio}% rate</span>`
        : '';
    document.getElementById('modalFooter').innerHTML = `
        <div class="flex items-center gap-3">${metaStr}</div>
        <div class="flex items-center gap-2">
            <button id="modalPrevBtn" class="modal-close-btn" title="Previous (←)" ${currentIdx <= 0 ? 'disabled style="opacity:0.3;cursor:default"' : ''} onclick="(()=>{ const m=currentFilteredData[${currentIdx - 1}]; if(m){ const sl=targetCsv?targetCsv.replace('data/','').replace('.csv',''):''; openMsgModal(m,'',sl,m.link||'#'); }})()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
            <button id="modalNextBtn" class="modal-close-btn" title="Next (→)" ${currentIdx >= currentFilteredData.length - 1 ? 'disabled style="opacity:0.3;cursor:default"' : ''} onclick="(()=>{ const m=currentFilteredData[${currentIdx + 1}]; if(m){ const sl=targetCsv?targetCsv.replace('data/','').replace('.csv',''):''; openMsgModal(m,'',sl,m.link||'#'); }})()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
            <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" id="modalBookmarkBtn" onclick="toggleBookmark('${msg.id}'); this.classList.toggle('bookmarked'); this.innerHTML = getBookmarks().has('${msg.id}') ? starSvg(true) : starSvg(false);" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">${starSvg(isBookmarked)}</button>
            <div class="flex items-center gap-1.5 bg-tg-accent/10 px-3 py-1 rounded-lg"><span class="text-xs font-bold text-tg-accent">Total: ${msg.total_reactions}</span></div>
            <a href="${tgLink}" target="_blank" class="flex items-center gap-1.5 px-3 py-1.5 bg-tg-accent text-white text-xs font-semibold rounded-lg hover:bg-blue-500 transition-colors">Open in Telegram <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>
        </div>`;

    // Copy button in header
    const checkSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#30d158" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    document.getElementById('modalCopyBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(msg.text || '').then(() => {
            const btn = document.getElementById('modalCopyBtn');
            if (btn) { btn.innerHTML = checkSvg; setTimeout(() => { btn.innerHTML = copyIconSvg; }, 1500); }
        });
    });

    modal.classList.add('open');
    // Push permalink to URL
    const purl = new URLSearchParams(window.location.search); purl.set('msg', msg.id);
    history.pushState({ msg: msg.id }, '', `${window.location.pathname}?${purl.toString()}`);
    // Compensate scrollbar width to prevent layout shift/shake (body + fixed header)
    const sw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = sw + 'px';
    const hdr = document.querySelector('header');
    if (hdr) hdr.style.paddingRight = sw + 'px';
    requestAnimationFrame(() => { backdrop.classList.add('visible'); box.classList.add('visible'); });
}

function closeMsgModal() {
    const modal = document.getElementById('msgModal');
    const backdrop = document.getElementById('msgModalBackdrop');
    const box = document.getElementById('msgModalBox');
    if (!modal) return;
    backdrop.classList.remove('visible'); box.classList.remove('visible');
    // Remove ?msg= from URL
    const purl = new URLSearchParams(window.location.search); purl.delete('msg');
    history.replaceState(null, '', `${window.location.pathname}?${purl.toString()}`);
    setTimeout(() => {
        modal.classList.remove('open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        const hdr = document.querySelector('header');
        if (hdr) hdr.style.paddingRight = '';
    }, 230);
}

// ── j/k Card Navigation ────────────────────────────────────
function getCards() { return [...document.querySelectorAll('#messageList .msg-card')]; }
function selectCard(idx) {
    const cards = getCards();
    cards.forEach(c => c.style.outline = '');
    currentCardIndex = Math.max(0, Math.min(idx, cards.length - 1));
    const card = cards[currentCardIndex];
    if (!card) return;
    card.style.outline = '2px solid rgba(10,132,255,0.7)';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Keyboard Shortcuts ───────────────────────────────────
document.addEventListener('keydown', e => {
    if (document.activeElement.tagName === 'INPUT') return;
    const modalOpen = document.getElementById('msgModal')?.classList.contains('open');
    if (e.key === '/') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    if (e.key === '?') { e.preventDefault(); toggleShortcutOverlay(); }
    if (e.key === 'Escape') {
        if (document.getElementById('shortcutOverlay')) { document.getElementById('shortcutOverlay').remove(); return; }
        if (modalOpen) { closeMsgModal(); return; }
        clearAllFilters(); searchInput.blur(); document.querySelectorAll('.cdd-panel.open,.cdd-trigger.open').forEach(el => el.classList.remove('open'));
    }
    if (modalOpen) {
        if (e.key === 'ArrowRight') { document.getElementById('modalNextBtn')?.click(); }
        if (e.key === 'ArrowLeft') { document.getElementById('modalPrevBtn')?.click(); }
        return;
    }
    if (e.key === 'j') { selectCard(currentCardIndex + 1); }
    if (e.key === 'k') { selectCard(currentCardIndex - 1); }
    if (e.key === 'Enter' && currentCardIndex >= 0) { getCards()[currentCardIndex]?.click(); }
});

// ── Back-to-top Button ───────────────────────────────────
(function () {
    const btn = document.createElement('button');
    btn.id = 'backToTop';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
    btn.title = 'Back to top';
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });
})();

// ── Seen Tracker ─────────────────────────────────────────
const SEEN_KEY = 'tg_seen';
function getSeenIds() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
    catch { return new Set(); }
}
function markSeen(id) {
    const s = getSeenIds(); s.add(String(id));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
}

// ── Export Filtered CSV ───────────────────────────────────
function exportFilteredCSV() {
    if (!currentFilteredData.length) return;
    const cols = Object.keys(currentFilteredData[0]).filter(k => k !== 'reactionsMap' && k !== 'dateObj');
    const rows = [cols.join(','), ...currentFilteredData.map(m =>
        cols.map(c => { const v = m[c] === undefined ? '' : String(m[c]); return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')
    )];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `export_filtered_${Date.now()}.csv`; a.click();
}

// ── Keyboard Shortcut Overlay ─────────────────────────────
function toggleShortcutOverlay() {
    let el = document.getElementById('shortcutOverlay');
    if (el) { el.remove(); return; }
    el = document.createElement('div'); el.id = 'shortcutOverlay';
    el.innerHTML = `
        <div class="shortcut-box">
            <div class="flex justify-between items-center mb-4">
                <span class="text-sm font-semibold text-white">Keyboard Shortcuts</span>
                <button onclick="toggleShortcutOverlay()" class="text-gray-500 hover:text-white text-lg leading-none">&times;</button>
            </div>
            ${[['/', 'Focus search'], ['j', 'Next card'], ['k', 'Prev card'], ['Enter', 'Open card modal'], ['← →', 'Prev/next in modal'], ['Esc', 'Close modal / clear filters'], ['?', 'Toggle this overlay']].map(([k, d]) =>
        `<div class="flex justify-between items-center py-1.5 border-b border-white/5">
                    <span class="text-xs text-gray-400">${d}</span>
                    <kbd class="text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded font-mono">${k}</kbd>
                </div>`).join('')}
        </div>`;
    el.onclick = e => { if (e.target === el) el.remove(); };
    document.body.appendChild(el);
}


// ── Stats ────────────────────────────────────────────────
function updateStats(data) {
    if (!data.length) return;
    const totalR = data.reduce((s, m) => s + m.total_reactions, 0);
    const avg = data.length ? totalR / data.length : 0;
    const et = {}; data.forEach(m => Object.entries(m.reactionsMap).forEach(([e, c]) => { et[e] = (et[e] || 0) + c; }));
    const [topEmoji, topEmojiCount] = Object.entries(et).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const dc = {}; data.forEach(m => { const d = m.date?.slice(0, 10); if (d) dc[d] = (dc[d] || 0) + 1; });
    const [topDay, topDayN] = Object.entries(dc).sort((a, b) => b[1] - a[1])[0] || ['—', 0];

    const dur = 600;

    animateNumber(document.getElementById('statTotalReactions'), totalR, dur, v => Math.round(v).toLocaleString());
    animateNumber(document.getElementById('statMsgCount'), data.length, dur, v => Math.round(v).toLocaleString());
    animateNumber(document.getElementById('statAvg'), avg, dur, v => `avg ${v.toFixed(1)} reactions`);

    document.getElementById('statTopEmoji').textContent = topEmoji;
    animateNumber(document.getElementById('statTopEmojiCount'), topEmojiCount, dur, v => Math.round(v).toLocaleString() + ' total');

    document.getElementById('statTopDay').textContent = topDay !== '—' ? new Date(topDay + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    animateNumber(document.getElementById('statTopDayCount'), topDayN, dur, v => { const n = Math.round(v); return n > 0 ? n + ' msgs' : ''; });
}

// ── View Toggle ──────────────────────────────────────────
function setView(mode) {
    if (mode !== 'list' && mode !== 'chart') mode = 'list';
    if (window.location.hash !== `#${mode}`) window.history.replaceState(null, '', `#${mode}`);
    const list = document.getElementById('messageList');
    const chart = document.getElementById('chartPanel');
    document.getElementById('btnList').classList.toggle('active', mode === 'list');
    document.getElementById('btnChart').classList.toggle('active', mode === 'chart');
    if (mode === 'chart') { list.classList.add('hidden'); chart.classList.remove('hidden'); renderCharts(currentFilteredData); }
    else { chart.classList.add('hidden'); list.classList.remove('hidden'); }
}

// ── Charts ───────────────────────────────────────────────
const C = {
    blue: '#0a84ff', green: '#30d158', orange: '#ff9f0a',
    red: '#ff453a', purple: '#bf5af2', cyan: '#64d2ff',
    yellow: '#ffd60a', pink: '#ff6b6b',
};
const COLORS = Object.values(C);
const TICK = { color: '#8e8e93', font: { size: 10, family: 'Inter, sans-serif', weight: '500' } };
const GRID = { color: 'rgba(255,255,255,0.03)', drawBorder: false, tickLength: 8 };
const CHART_BASE = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeOutQuart' },
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(20,20,22,0.95)',
            titleColor: '#ffffff', titleFont: { size: 13, family: 'Inter', weight: '600' },
            bodyColor: '#a1a1aa', bodyFont: { size: 12, family: 'Inter' },
            borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
            padding: 12, cornerRadius: 8,
            boxPadding: 6, usePointStyle: true
        }
    },
    scales: {
        x: { ticks: TICK, grid: GRID },
        y: { ticks: TICK, grid: { ...GRID, color: 'rgba(255,255,255,0.02)' } },
    }
};

let chartInstances = {};
function destroyChart(k) { if (chartInstances[k]) { chartInstances[k].destroy(); delete chartInstances[k]; } }

function renderCharts(data) {
    if (!data.length) return;

    // ── Summary Pills ─────────────────────────────────────
    const totalR = data.reduce((s, m) => s + m.total_reactions, 0);
    const avg = data.length ? totalR / data.length : 0;
    const etMap = {}; data.forEach(m => Object.entries(m.reactionsMap).forEach(([e, c]) => { etMap[e] = (etMap[e] || 0) + c; }));
    const [topE] = Object.entries(etMap).sort((a, b) => b[1] - a[1])[0] || ['—'];
    const dcMap = {}; data.forEach(m => { const d = m.date?.slice(0, 10); if (d) dcMap[d] = (dcMap[d] || 0) + 1; });
    const [peakDay, peakN] = Object.entries(dcMap).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const peakLabel = peakDay !== '—' ? new Date(peakDay + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

    const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));

    animateNumber(document.getElementById('chartSummaryTotal'), totalR, 600, v => fmt(v));
    animateNumber(document.getElementById('chartSummaryAvg'), avg, 600, v => v.toFixed(1));

    const peakEl = document.getElementById('chartSummaryPeak');
    if (peakEl) peakEl.textContent = peakDay !== '—' ? `${peakLabel} · ${peakN} msgs` : '—';
    const topEEl = document.getElementById('chartSummaryTop');
    if (topEEl) topEEl.textContent = topE;


    // ── Reactions Over Time ───────────────────────────────
    destroyChart('time');
    const byDay = {}; data.forEach(m => { const d = m.date?.slice(0, 10); if (d) { if (!byDay[d]) byDay[d] = 0; byDay[d] += m.total_reactions; } });
    const dk = Object.keys(byDay).sort();
    const dv = dk.map(d => byDay[d]);
    const peakVal = Math.max(...dv);
    const peakDate = dk[dv.indexOf(peakVal)];
    const peakBadgeEl = document.getElementById('chartTimePeak');
    if (peakBadgeEl && peakDate) peakBadgeEl.textContent = `Peak ${new Date(peakDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${peakVal.toLocaleString()}`;

    const timeCanvas = document.getElementById('chartTime');
    chartInstances.time = new Chart(timeCanvas, {
        type: 'line',
        data: {
            labels: dk.map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
            datasets: [{
                data: dv, borderColor: C.blue,
                backgroundColor: ctx => {
                    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.chartArea?.bottom || 300);
                    g.addColorStop(0, 'rgba(10,132,255,0.25)');
                    g.addColorStop(1, 'rgba(10,132,255,0)');
                    return g;
                },
                borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 6,
                pointHoverBackgroundColor: '#fff', pointHoverBorderColor: C.blue,
                pointHoverBorderWidth: 2, tension: 0.45, fill: true
            }]
        },
        plugins: [{
            id: 'crosshair',
            afterDraw(chart) {
                const { ctx, chartArea, tooltip } = chart;
                if (!tooltip || !tooltip._active || !tooltip._active.length) return;
                const x = tooltip._active[0].element.x;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(10,132,255,0.35)';
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                // Dot at axis
                ctx.beginPath();
                ctx.arc(x, chartArea.bottom, 3, 0, Math.PI * 2);
                ctx.fillStyle = C.blue;
                ctx.fill();
                ctx.restore();
            }
        }],
        options: {
            onClick: (e, elements) => {
                if (!elements.length) return;
                const dateStr = dk[elements[0].index];
                document.getElementById('startDate').value = dateStr;
                document.getElementById('endDate').value = dateStr;
                // Update date picker labels if applicable
                if (window.updateDrpVisuals) window.updateDrpVisuals();
                applyFilters();
                setView('list');
                document.getElementById('messageList').scrollIntoView({ behavior: 'smooth' });
            },
            ...CHART_BASE,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                ...CHART_BASE.plugins,
                tooltip: {
                    ...CHART_BASE.plugins.tooltip,
                    mode: 'index', intersect: false,
                    callbacks: {
                        title: ctx => ctx[0]?.label || '',
                        label: ctx => ` ${ctx.parsed.y.toLocaleString()} reactions`,
                    }
                }
            }
        }
    });

    // ── Emoji Breakdown ───────────────────────────────────
    destroyChart('emoji');
    const topEmojis = Object.entries(etMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topEmojiLabel = topEmojis[0]?.[0] || '';
    const topEmojiTotal = topEmojis[0]?.[1] || 0;
    chartInstances.emoji = new Chart(document.getElementById('chartEmoji'), {
        type: 'doughnut',
        data: {
            labels: topEmojis.map(([e]) => e),
            datasets: [{ data: topEmojis.map(([, c]) => c), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 8 }]
        },
        plugins: [{
            id: 'centerText',
            afterDraw(chart) {
                const { ctx, chartArea } = chart;
                const cx = (chartArea.left + chartArea.right) / 2;
                const cy = (chartArea.top + chartArea.bottom) / 2;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Big emoji
                ctx.font = '28px Inter, sans-serif';
                ctx.fillText(topEmojiLabel, cx, cy - 12);
                // Count below
                ctx.font = '600 11px Inter, sans-serif';
                ctx.fillStyle = '#8e8e93';
                ctx.fillText(topEmojiTotal.toLocaleString(), cx, cy + 14);
                ctx.restore();
            }
        }],
        options: {
            onClick: (e, elements, chart) => {
                if (!elements.length) return;
                const clickedEmoji = chart.data.labels[elements[0].index];
                const emojiPanel = document.getElementById('emojiPanel');
                if (emojiPanel) {
                    emojiPanel.querySelectorAll('.cdd-option').forEach(o => o.classList.remove('selected'));
                    const opt = Array.from(emojiPanel.querySelectorAll('.cdd-option')).find(o => o.dataset.val === clickedEmoji);
                    if (opt) {
                        opt.classList.add('selected');
                        document.getElementById('emojiLabel').textContent = clickedEmoji;
                    }
                }
                applyFilters();
                setView('list');
                document.getElementById('messageList').scrollIntoView({ behavior: 'smooth' });
            },
            responsive: true, maintainAspectRatio: false,
            animation: CHART_BASE.animation, cutout: '65%',
            plugins: {
                legend: {
                    display: true, position: 'bottom',
                    labels: { color: '#8e8e93', font: { size: 11, family: 'Inter, sans-serif' }, boxWidth: 10, padding: 14 }
                },
                tooltip: { ...CHART_BASE.plugins.tooltip, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()}` } }
            }
        }
    });

    // ── Velocity Distribution ─────────────────────────────
    destroyChart('velocity');
    const buckets = ['0–0.1', '0.1–0.5', '0.5–1', '1–5', '5–20', '20+'];
    const velCounts = [0, 0, 0, 0, 0, 0];
    data.forEach(m => {
        const v = m.velocity || 0;
        if (v < 0.1) velCounts[0]++;
        else if (v < 0.5) velCounts[1]++;
        else if (v < 1) velCounts[2]++;
        else if (v < 5) velCounts[3]++;
        else if (v < 20) velCounts[4]++;
        else velCounts[5]++;
    });
    const velPeakIdx = velCounts.indexOf(Math.max(...velCounts));
    const velBadgeEl = document.getElementById('chartVelPeak');
    if (velBadgeEl) velBadgeEl.textContent = `Most: ${buckets[velPeakIdx]} rxn/hr (${velCounts[velPeakIdx]} msgs)`;

    chartInstances.velocity = new Chart(document.getElementById('chartVelocity'), {
        type: 'bar',
        data: {
            labels: buckets,
            datasets: [{
                data: velCounts,
                backgroundColor: velCounts.map((_, i) => i === velPeakIdx ? C.orange : 'rgba(10,132,255,0.3)'),
                hoverBackgroundColor: velCounts.map((_, i) => i === velPeakIdx ? '#ffb340' : 'rgba(10,132,255,0.6)'),
                borderRadius: 4, borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            ...CHART_BASE,
            layout: { padding: { top: 4, bottom: 4, left: 0, right: 8 } },
            scales: {
                x: { ticks: TICK, grid: GRID, beginAtZero: true },
                y: { bounds: 'ticks', ticks: { ...TICK, font: { size: 10, family: 'Inter, sans-serif' } }, grid: { display: false } }
            },
            plugins: {
                ...CHART_BASE.plugins,
                tooltip: { ...CHART_BASE.plugins.tooltip, callbacks: { label: ctx => ` ${ctx.parsed.x} messages` } }
            }
        }
    });

    // ── Top 10 Messages ───────────────────────────────────
    destroyChart('top');
    const top10 = [...data].sort((a, b) => b.total_reactions - a.total_reactions).slice(0, 10);
    chartInstances.top = new Chart(document.getElementById('chartTop'), {
        type: 'bar',
        data: {
            labels: top10.map(m => m.text ? m.text.slice(0, 45) + (m.text.length > 45 ? '…' : '') : `#${m.id}`),
            datasets: [{
                data: top10.map(m => m.total_reactions),
                backgroundColor: top10.map((_, i) => i === 0 ? C.blue : 'rgba(10,132,255,0.2)'),
                hoverBackgroundColor: top10.map((_, i) => i === 0 ? '#409cff' : 'rgba(10,132,255,0.5)'),
                borderRadius: 4, borderSkipped: false, barPercentage: 0.7
            }]
        },
        options: {
            onClick: (e, elements) => {
                if (!elements.length) return;
                const msg = top10[elements[0].index];
                const channelSlug = targetCsv ? targetCsv.replace('data/', '').replace('.csv', '').replace(/^@/, '') : '';
                const tgLink = msg.id && channelSlug ? `https://t.me/${channelSlug}/${msg.id}` : (msg.link || '#');
                openMsgModal(msg, searchInput.value, channelSlug, tgLink);
            },
            indexAxis: 'y', ...CHART_BASE,
            scales: {
                x: { ticks: TICK, grid: GRID },
                y: { ticks: { ...TICK, font: { size: 9, family: 'Inter, sans-serif' } }, grid: { display: false } }
            },
            plugins: {
                ...CHART_BASE.plugins,
                tooltip: {
                    ...CHART_BASE.plugins.tooltip, callbacks: {
                        title: ctx => top10[ctx[0].dataIndex]?.text?.slice(0, 80) || '',
                        label: ctx => ` ${ctx.parsed.x.toLocaleString()} reactions`
                    }
                }
            }
        }
    });

    // ── Top Keywords ──────────────────────────────────────
    destroyChart('keywords');
    const stopWords = new Set(['the', 'and', 'to', 'of', 'a', 'in', 'is', 'that', 'for', 'it', 'on', 'with', 'as', 'this', 'was', 'at', 'by', 'an', 'be', 'from', 'or', 'are', 'we', 'you', 'not', 'but', 'what', 'all', 'were', 'when', 'how', 'can', 'if', 'out', 'about', 'up', 'so', 'has', 'who', 'they', 'will', 'more', 'which', 'one', 'have', 'would', 'their', 'just', 'like', 'do', 'there', 'been', 'only', 'your', 'our', 'some', 'these', 'than', 'any', 'then', 'also', 'into', 'could', 'very']);
    const wordScores = {};
    data.forEach(m => {
        if (!m.text) return;
        const words = m.text.toLowerCase().match(/\b[a-z0-9]{3,}\b/g);
        if (!words) return;
        const seenInMsg = new Set();
        words.forEach(w => {
            if (stopWords.has(w) || /^https?/.test(w) || /^www/.test(w) || /^\d+$/.test(w)) return;
            if (seenInMsg.has(w)) return;
            seenInMsg.add(w);
            wordScores[w] = (wordScores[w] || 0) + m.total_reactions;
        });
    });
    const topWords = Object.entries(wordScores).sort((a, b) => b[1] - a[1]).slice(0, 10);

    chartInstances.keywords = new Chart(document.getElementById('chartKeywords'), {
        type: 'bar',
        data: {
            labels: topWords.map(w => w[0]),
            datasets: [{
                data: topWords.map(w => w[1]),
                backgroundColor: topWords.map((_, i) => i === 0 ? C.purple : 'rgba(191,90,242,0.2)'),
                hoverBackgroundColor: topWords.map((_, i) => i === 0 ? '#d488fa' : 'rgba(191,90,242,0.5)'),
                borderRadius: 4, borderSkipped: false, barPercentage: 0.7
            }]
        },
        options: {
            onClick: (e, elements, chart) => {
                if (!elements.length) return;
                const word = chart.data.labels[elements[0].index];
                document.getElementById('searchInput').value = word;
                applyFilters();
                setView('list');
                document.getElementById('messageList').scrollIntoView({ behavior: 'smooth' });
            },
            indexAxis: 'y', ...CHART_BASE,
            scales: {
                x: { ticks: TICK, grid: GRID },
                y: { ticks: { ...TICK, font: { size: 10, family: 'Inter, sans-serif' } }, grid: { display: false } }
            },
            plugins: {
                ...CHART_BASE.plugins,
                tooltip: {
                    ...CHART_BASE.plugins.tooltip, callbacks: {
                        label: ctx => ` ${ctx.parsed.x.toLocaleString()} reactions`
                    }
                }
            }
        }
    });

    // ── Activity Heatmap ──────────────────────────────────
    destroyChart('heatmap');
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
    data.forEach(m => { const d = m.dateObj; if (!isNaN(d)) matrix[d.getDay()][d.getHours()] += m.total_reactions; });
    const maxV = Math.max(...matrix.flat()) || 1;
    const pts = [];
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++)
        if (matrix[d][h] > 0) pts.push({ x: h, y: d, r: Math.max(3, Math.round((matrix[d][h] / maxV) * 16)) });

    chartInstances.heatmap = new Chart(document.getElementById('chartHeatmap'), {
        type: 'bubble',
        data: {
            datasets: [{
                data: pts,
                backgroundColor: pts.map(p => `rgba(10,132,255,${0.2 + 0.8 * (p.r / 16)})`),
                borderColor: pts.map(p => `rgba(10,132,255,${0.3 + 0.7 * (p.r / 16)})`),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: CHART_BASE.animation,
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...CHART_BASE.plugins.tooltip, callbacks: {
                        label: ctx => { const p = ctx.raw; return `${DOW[p.y]} ${String(p.x).padStart(2, '0')}:00 — ${matrix[p.y][p.x].toLocaleString()} reactions`; }
                    }
                }
            },
            scales: {
                x: {
                    min: -0.5, max: 23.5,
                    ticks: { ...TICK, stepSize: 1, callback: v => (Number.isInteger(v) && v % 4 === 0) ? `${v}:00` : '' },
                    grid: GRID
                },
                y: {
                    min: -0.5, max: 6.5,
                    afterBuildTicks: axis => { axis.ticks = [0, 1, 2, 3, 4, 5, 6].map(v => ({ value: v })); },
                    ticks: { ...TICK, autoSkip: false, callback: v => DOW[v] ?? '' },
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }
                }
            }
        }
    });
}

