/**
 * LyricTab v6 – sidepanel.js
 *
 * Changes from v5:
 *  1. Search strategy: song-only first → song+artist → swapped
 *  2. Song field above Artist field
 *  3. Strip notification badge "(N)" from tab title
 *  4. Auto-refresh when YouTube navigates to next video
 *  5. Improved hopamchuan search: try song-only query, better link/lyric parsing
 */

const LEWDHUTAO = 'https://lyrics.lewdhutao.my.eu.org';
const HAC_BASE  = 'https://hopamchuan.com';

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const detectBar    = $('detectBar');
const detectSong   = $('detectSong');
const detectArtist = $('detectArtist');
const inputArtist  = $('inputArtist');
const inputTitle   = $('inputTitle');
const searchBtn    = $('searchBtn');
const refreshBtn   = $('refreshBtn');
const btnIntl      = $('btnIntl');
const btnViet      = $('btnViet');
const stateIdle    = $('stateIdle');
const stateLoading = $('stateLoading');
const stateError   = $('stateError');
const stateLyrics  = $('stateLyrics');
const errorMsg     = $('errorMsg');
const lyricsHero   = $('lyricsHero');
const lyricsArtist = $('lyricsArtist');
const lyricsSong   = $('lyricsSong');
const lyricsText   = $('lyricsText');
const waveform     = $('waveform');
const sourceBadge  = $('sourceBadge');
const sourceDot    = $('sourceDot');
const sourceName   = $('sourceName');
const vinylSpinner = $('vinylSpinner');
const loadingSource= $('loadingSource');
const footer       = $('footer');
const geniusLink   = $('geniusLink');
const ytLink       = $('ytLink');

let isViet = false;

// ── UI helpers ────────────────────────────────────────────────────────────────
function showOnly(...active) {
  [stateIdle, stateLoading, stateError, stateLyrics].forEach(el =>
    el.classList.toggle('visible', active.includes(el))
  );
}
const show = el => el.classList.add('visible');
const hide = el => el.classList.remove('visible');

function isVietnamese(str) {
  return /[àáâãèéêìíòóôõùúýăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(str);
}

// ── Unicode-safe word-boundary matcher ───────────────────────────────────────
function makeVietRegex(words) {
  const pat = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp('(?:^|(?<=\\s))(' + pat + ')(?=\\s|$)', 'i');
}

const SONG_WORDS = makeVietRegex([
  'của','và','hay','khi','đã','cho','với','trong','không','còn','mãi','sẽ','thì',
  'mà','rồi','đây','lại','này','đó','nếu','về','đến','thêm','hơn','lên','xuống',
  'qua','lần','một','hai','ba','ngày','đêm','mùa','lòng','tim','nhớ','buồn','vui',
  'khóc','cười','xa','gần','thật','giả','bao','nhiêu','chưa','thôi','nào','gì',
  'sao','tại','vì','nên','được','mất','hết','cả','chỉ','dù','từ','trên','dưới',
  'trước','sau','người','con','đời','năm','trăm','ngàn','cuối','đầu','mới','cũ'
]);

const VIET_GIVENNAMES = makeVietRegex([
  'hưng','tràm','phương','linh','hương','tuấn','minh','nam','lan','nga','mai',
  'thu','thảo','hoa','long','dũng','khoa','tâm','trâm','vy','ly','my','huy',
  'bảo','khang','quang','trung','việt','bình','lâm','thắng','hải','đức','tùng',
  'vân','ngân','yến','nhung','loan','dung','lý','liên','cúc','xuân','tuyết',
  'trinh','châu','ngọc','nhi','quyên','thư','diệp','kiều','hiền','hằng','thúy',
  'oanh','phượng','trúc','khải','phát','toàn','thành','khánh','duy','hậu',
  'nhân','tín','khiêm','quân','hiếu','kiên','mạnh','hùng','phong','nhật',
  'hoài','diễm','thịnh','trọng'
]);

function isArtistCluster(str) {
  return /(?:^|\s)(?:x|&|feat\.|ft\.)(?:\s|$)/i.test(str);
}

// ── Title parser ──────────────────────────────────────────────────────────────
function parseTitle(raw) {
  // FIX #3: Strip notification badge "(N)" from start, e.g. "(1) Bắt Cóc - CAM"
  let t = raw.replace(/^\(\d+\)\s*/, '').trim();

  // Strip " - YouTube" suffix
  t = t.replace(/\s*[-–]\s*YouTube\s*$/i, '').trim();

  // Strip everything after first " | "
  t = t.replace(/\s*\|.*$/s, '').trim();

  // Strip noise in brackets/parens
  t = t.replace(/\s*[\(\[][^\)\]]{0,80}(official|video|audio|lyric|lyrics|live|hd|4k|\bmv\b|m\/v|visuali[sz]er|ft\.|feat\.|prod\.|version|remix|cover|remaster|karaoke|topic|full|ost)[^\)\]]*[\)\]]/gi, '');
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/gi, '');

  // Strip bare "M/V" or "MV" at end
  t = t.replace(/\s+m\/v\s*$/i, '').replace(/\s+mv\s*$/i, '');
  t = t.trim();

  // Split on last spaced-dash " - "
  const dashRegex = /\s+[-–]\s+/g;
  const positions = [];
  let m;
  while ((m = dashRegex.exec(t)) !== null) positions.push({ idx: m.index, len: m[0].length });

  if (positions.length > 0) {
    const last  = positions[positions.length - 1];
    const left  = t.slice(0, last.idx).trim();
    const right = t.slice(last.idx + last.len).trim();

    const leftHasViet    = isVietnamese(left);
    const leftWords      = left.split(/\s+/).length;
    const rightWords     = right.split(/\s+/).length;
    const leftIsSong     = SONG_WORDS.test(left);
    const rightIsSong    = SONG_WORDS.test(right);
    const leftIsCluster  = isArtistCluster(left);
    const rightIsCluster = isArtistCluster(right);

    // Left has x/&/ft. → multi-artist credit, never flip
    if (leftIsCluster) return { artist: left, song: right };

    // Detect reversed [song] - [artist] for Vietnamese
    if (leftHasViet) {
      const rightIsArtist = VIET_GIVENNAMES.test(right) && !rightIsCluster;
      const shouldFlip =
        (leftIsSong && !rightIsSong) ||
        (leftWords > rightWords + 1) ||
        (rightIsArtist && !leftIsSong);
      if (shouldFlip) return { artist: right, song: left };
    }

    return { artist: left, song: right };
  }

  const by = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { artist: by[2].trim(), song: by[1].trim() };

  return { artist: '', song: t };
}

// ── Background relay for hopamchuan ──────────────────────────────────────────
function bgFetch(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_HOPAMCHUAN', url }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.ok) return reject(new Error(resp?.error || 'fetch failed'));
      resolve(resp.html);
    });
  });
}

// ── Parse hopamchuan song page → clean lyrics ─────────────────────────────────
function parseHopamchuanLyrics(html) {
  // The lyrics+chords appear as raw text with markers like *[*Am*]*
  // We scan for the largest block containing these markers

  // Strategy 1: find pre tag
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let rawText = '';

  const preEl = doc.querySelector('pre.song-content, pre.hopam-content, .song-content pre, #song-content');
  if (preEl) rawText = preEl.textContent;

  if (!rawText) {
    const allPres = doc.querySelectorAll('pre');
    for (const pre of allPres) {
      if (pre.textContent.includes('*[*') && pre.textContent.length > 100) {
        rawText = pre.textContent;
        break;
      }
    }
  }

  // Strategy 2: scan raw HTML for chord marker blocks
  if (!rawText) {
    // Look for the block between the chord toolbar and the version list
    const chordBlockMatch = html.match(/tone\s*\*\[\*[A-Za-z#b]+\*\]\*([\s\S]+?)(?:Danh sách hợp âm|Phiên bản khác|##)/);
    if (chordBlockMatch) rawText = chordBlockMatch[1];
  }

  if (!rawText) {
    // Fallback: find any large text block with *[* markers
    const allDivs = doc.querySelectorAll('div');
    let best = '';
    for (const div of allDivs) {
      const text = div.innerHTML;
      if (text.includes('*[*') && text.length > best.length && text.length < 80000) {
        best = div.textContent;
      }
    }
    rawText = best;
  }

  if (!rawText) return null;

  // Strip chord markers: *[*Am*]*, *[*C#m*]*, *[*Dmaj7*]*, etc.
  let lyrics = rawText
    .replace(/\*\[\*[^\]]*\]\*/g, '')
    .replace(/\[[^\]]{1,10}\]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Clean up
  lyrics = lyrics
    .split('\n')
    .map(l => l.trim())
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))  // collapse blank lines
    .join('\n')
    .trim();

  return lyrics.length > 50 ? lyrics : null;
}

// ── hopamchuan: search then fetch song ────────────────────────────────────────
async function searchHopamchuan(query) {
  const searchUrl = `${HAC_BASE}/?q=${encodeURIComponent(query)}`;
  const searchHtml = await bgFetch(searchUrl);
  const parser = new DOMParser();
  const doc = parser.parseFromString(searchHtml, 'text/html');

  // Find all song links — must match /song/{id}/{slug}/
  // Exclude management/admin links and "all versions" links
  const links = doc.querySelectorAll('a[href*="/song/"]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    if (
      /\/song\/\d+\/[^/?]+\/?$/.test(href) &&
      !href.includes('/all/') &&
      !href.includes('/create') &&
      !href.includes('/approve/') &&
      !href.includes('/manage/')
    ) {
      return href.startsWith('http') ? href : `${HAC_BASE}${href}`;
    }
  }
  return null;
}

// ── Source 1: hopamchuan.com ──────────────────────────────────────────────────
async function fetchHopamchuan(artist, song) {
  try {
    // Search with song+artist to avoid same-name song collisions
    const query = artist ? `${song} ${artist}` : song;
    const songUrl = await searchHopamchuan(query);
    if (!songUrl) return null;

    const songHtml = await bgFetch(songUrl);
    const lyrics = parseHopamchuanLyrics(songHtml);

    if (lyrics) return { lyrics, source: 'hopamchuan.com', url: songUrl };
  } catch (_) {}
  return null;
}

// ── Source 2: lrclib.net ──────────────────────────────────────────────────────
async function fetchLrclib(artist, song) {
  if (artist) {
    try {
      const res = await fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(song)}`
      );
      if (res.ok) {
        const d = await res.json();
        if (d.plainLyrics) return { lyrics: d.plainLyrics, source: 'lrclib.net' };
      }
    } catch (_) {}
  }
  try {
    const q = encodeURIComponent(artist ? `${artist} ${song}` : song);
    const res = await fetch(`https://lrclib.net/api/search?q=${q}`);
    if (res.ok) {
      const results = await res.json();
      const best = Array.isArray(results) && results.find(r => r.plainLyrics);
      if (best && best.plainLyrics) return { lyrics: best.plainLyrics, source: 'lrclib.net' };
    }
  } catch (_) {}
  return null;
}

// ── Source 3: LewdHuTao / Musixmatch ─────────────────────────────────────────
async function fetchLewdMusixmatch(artist, song) {
  try {
    const params = new URLSearchParams({ title: song });
    if (artist) params.set('artist', artist);
    const res = await fetch(`${LEWDHUTAO}/v2/musixmatch/lyrics?${params}`);
    if (res.ok) {
      const d = await res.json();
      const lyrics = d && d.data && d.data.lyrics && d.data.lyrics.trim();
      if (lyrics) return { lyrics, source: 'Musixmatch' };
    }
  } catch (_) {}
  return null;
}

// ── Source 4: LewdHuTao / YouTube Music ──────────────────────────────────────
async function fetchLewdYoutube(artist, song) {
  try {
    const params = new URLSearchParams({ title: song });
    if (artist) params.set('artist', artist);
    const res = await fetch(`${LEWDHUTAO}/v2/youtube/lyrics?${params}`);
    if (res.ok) {
      const d = await res.json();
      const lyrics = d && d.data && d.data.lyrics && d.data.lyrics.trim();
      if (lyrics) return { lyrics, source: 'YouTube Music' };
    }
  } catch (_) {}
  return null;
}

// ── Source 5: lyrics.ovh (EN only) ───────────────────────────────────────────
async function fetchLyricsOvh(artist, song) {
  if (!artist) return null;
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`
    );
    const d = await res.json();
    if (d.lyrics && d.lyrics.trim()) return { lyrics: d.lyrics.trim(), source: 'lyrics.ovh' };
  } catch (_) {}
  return null;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
// Search with song+artist together for all sources to avoid wrong-song matches
// (many songs share the same title; the artist is the disambiguator)
async function fetchLyrics(artist, song) {
  showOnly(stateLoading);
  hide(footer);
  hide(sourceBadge);
  vinylSpinner.className = `vinyl ${isViet ? 'viet' : 'intl'}`;

  let result = null;

  // VN mode: hopamchuan first (song+artist)
  if (isViet) {
    loadingSource.textContent = 'hopamchuan.com…';
    result = await fetchHopamchuan(artist, song);
  }

  // lrclib — song + artist
  if (!result) {
    loadingSource.textContent = 'lrclib.net…';
    result = await fetchLrclib(artist, song);
  }

  // Musixmatch — song + artist
  if (!result) {
    loadingSource.textContent = 'Musixmatch…';
    result = await fetchLewdMusixmatch(artist, song);
  }

  // YouTube Music — song + artist
  if (!result) {
    loadingSource.textContent = 'YouTube Music…';
    result = await fetchLewdYoutube(artist, song);
  }

  // EN fallback
  if (!result && !isViet) {
    loadingSource.textContent = 'lyrics.ovh…';
    result = await fetchLyricsOvh(artist, song);
  }

  if (result) {
    const mode = isViet ? 'viet' : 'intl';
    lyricsArtist.textContent = artist || 'Unknown Artist';
    lyricsArtist.className   = `lyrics-hero-artist ${mode}`;
    lyricsSong.textContent   = song;
    lyricsText.textContent   = result.lyrics;
    lyricsHero.className     = `lyrics-hero${isViet ? ' viet' : ''}`;

    waveform.querySelectorAll('.waveform-bar').forEach(b => {
      b.className = `waveform-bar ${mode}`;
    });

    const isFallback = result.source === 'lyrics.ovh';
    const isHac      = result.source === 'hopamchuan.com';
    sourceDot.className    = `source-dot${isFallback ? ' fallback' : isHac ? ' hac' : ''}`;
    sourceName.textContent = result.source;
    show(sourceBadge);

    if (result.url) {
      geniusLink.textContent = 'hopamchuan ↗';
      geniusLink.href        = result.url;
    } else {
      geniusLink.textContent = 'Genius ↗';
      geniusLink.href = `https://genius.com/search?q=${encodeURIComponent(`${artist} ${song}`)}`;
    }

    showOnly(stateLyrics);
    show(footer);
  } else {
    const vietLinks = isViet
      ? `<br><br>Try <a href="${HAC_BASE}/?q=${encodeURIComponent(song)}" target="_blank" style="color:var(--viet)">Hopamchuan ↗</a> or <a href="https://www.nhaccuatui.com/tim-kiem?s=${encodeURIComponent(song)}" target="_blank" style="color:var(--viet)">Nhaccuatui ↗</a>`
      : '';
    errorMsg.innerHTML = `No lyrics found for <em>"${song}"</em>${artist ? ` by ${artist}` : ''}.${vietLinks}`;
    showOnly(stateError);
  }
}

// ── Tab detection ─────────────────────────────────────────────────────────────
async function detectAndLoad() {
  showOnly(stateLoading);
  loadingSource.textContent = 'Reading tab…';

  let tab = null;
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active && active.url && active.url.includes('youtube.com/watch')) {
      tab = active;
    } else {
      const all = await chrome.tabs.query({ currentWindow: true });
      tab = all.find(t => t.url && t.url.includes('youtube.com/watch')) || null;
    }
  } catch (_) {}

  if (!tab) { showOnly(stateIdle); return; }

  ytLink.href = tab.url || '#';
  const parsed = parseTitle(tab.title || '');

  if (isVietnamese(tab.title || '') && !isViet) setMode(true);

  detectSong.textContent   = parsed.song || tab.title || 'Unknown';
  detectArtist.textContent = parsed.artist ? `by ${parsed.artist}` : '';
  detectArtist.className   = `detect-artist${isViet ? ' viet' : ''}`;
  detectBar.className      = `detect-bar visible${isViet ? ' viet-mode' : ''}`;

  inputTitle.value  = parsed.song;
  inputArtist.value = parsed.artist;

  if (parsed.song) {
    await fetchLyrics(parsed.artist, parsed.song);
  } else {
    errorMsg.innerHTML = "Couldn't parse a song name from this video title. Edit the fields above.";
    showOnly(stateError);
  }
}

// ── FIX #4: Listen for YouTube navigation from background ────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'YT_NAVIGATED') {
    // Small delay to let YouTube update the tab title
    setTimeout(detectAndLoad, 1500);
  }
});

// ── Language toggle ───────────────────────────────────────────────────────────
function setMode(viet) {
  isViet = viet;
  btnViet.classList.toggle('active', viet);
  btnIntl.classList.toggle('active', !viet);
  searchBtn.classList.toggle('viet', viet);
  [inputArtist, inputTitle].forEach(i => i.classList.toggle('viet', viet));
  inputArtist.placeholder = viet ? 'e.g. Sơn Tùng M-TP' : 'e.g. Radiohead';
  inputTitle.placeholder  = viet ? 'e.g. Muộn Rồi Mà Sao Còn' : 'e.g. Creep';
}

btnIntl.addEventListener('click', () => setMode(false));
btnViet.addEventListener('click', () => setMode(true));

searchBtn.addEventListener('click', () => {
  const artist = inputArtist.value.trim();
  const song   = inputTitle.value.trim();
  if (!song) { errorMsg.innerHTML = 'Please enter a song title.'; showOnly(stateError); return; }
  fetchLyrics(artist, song);
});

[inputArtist, inputTitle].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') searchBtn.click(); })
);

refreshBtn.addEventListener('click', detectAndLoad);

detectAndLoad();
