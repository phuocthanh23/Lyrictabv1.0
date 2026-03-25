/**
 * LyricTab v5 – sidepanel.js
 *
 * Source chain:
 *   1. hopamchuan.com  — VN mode first (largest Vietnamese chord/lyrics site)
 *   2. lrclib.net      — fast, community DB
 *   3. LewdHuTao/Musixmatch  — 14M+ songs
 *   4. LewdHuTao/YouTube     — YouTube Music
 *   5. lyrics.ovh      — EN fallback only
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

// Unicode-safe word-boundary matcher for Vietnamese text
function makeVietRegex(words) {
  const pat = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp('(?:^|(?<=\\s))(' + pat + ')(?=\\s|$)', 'i');
}

// Words strongly indicating a song title phrase (not a personal name)
const SONG_WORDS = makeVietRegex([
  'của','và','hay','khi','đã','cho','với','trong','không','còn','mãi','sẽ','thì',
  'mà','rồi','đây','lại','này','đó','nếu','về','đến','thêm','hơn','lên','xuống',
  'qua','lần','một','hai','ba','ngày','đêm','mùa','lòng','tim','nhớ','buồn','vui',
  'khóc','cười','xa','gần','thật','giả','bao','nhiêu','chưa','thôi','nào','gì',
  'sao','tại','vì','nên','được','mất','hết','cả','chỉ','dù','từ','trên','dưới',
  'trước','sau','người','con','đời','năm','trăm','ngàn','cuối','đầu','mới','cũ'
]);

// Common Vietnamese given names (last syllable of a person's full name)
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

// Does the string contain a multi-artist collaboration marker?
// "Artist1 x Artist2", "Artist ft. Feature", "Artist & Artist2"
function isArtistCluster(str) {
  return /(?:^|\s)(?:x|&|feat\.|ft\.)(?:\s|$)/i.test(str);
}

function parseTitle(raw) {
  // 1. Strip " - YouTube" suffix
  let t = raw.replace(/\s*[-–]\s*YouTube\s*$/i, '').trim();

  // 2. Strip EVERYTHING after the first " | " — always a suffix label
  //    e.g. "Artist - Song | Official MV"         →  "Artist - Song"
  //    e.g. "Artist x Artist - Song | Visualizer" →  "Artist x Artist - Song"
  t = t.replace(/\s*\|.*$/s, '').trim();

  // 3. Strip noise inside brackets/parens
  t = t.replace(/\s*[\(\[][^\)\]]{0,80}(official|video|audio|lyric|lyrics|live|hd|4k|\bmv\b|m\/v|visuali[sz]er|ft\.|feat\.|prod\.|version|remix|cover|remaster|karaoke|topic|full|ost)[^\)\]]*[\)\]]/gi, '');
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/gi, '');

  // 4. Strip bare "M/V" or "MV" at end of title (not inside brackets)
  t = t.replace(/\s+m\/v\s*$/i, '').replace(/\s+mv\s*$/i, '');
  t = t.trim();

  // 5. Split on spaced dash " - " — use the LAST occurrence.
  //    This preserves dashes inside artist names like "Sơn Tùng M-TP"
  //    since those dashes have no surrounding spaces.
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
    const leftIsCluster  = isArtistCluster(left);   // e.g. "Artist1 x Artist2"
    const rightIsCluster = isArtistCluster(right);  // e.g. "Song ft. Featured" — song+feature

    // Rule 1: LEFT has x/&/ft. → it's a multi-artist credit, never flip
    //   "PHƯƠNG MỸ CHI x DTAP - HAI ĐỨA TRẺ ft. SUBOI" → left=artists, right=song ✓
    //   "Yanbi ft. Mr.T - Thu Cuối" → left=artists, right=song ✓
    if (leftIsCluster) return { artist: left, song: right };

    // Rule 2: RIGHT has ft./x → right = "SongName ft. Feature", so it's the song side.
    //   Don't use ft./x on the right as an artist flip signal.

    // Rule 3: Detect reversed [song] - [artist] for Vietnamese titles
    if (leftHasViet) {
      // Only treat right as an artist name if it does NOT itself contain ft./x
      const rightIsArtist = VIET_GIVENNAMES.test(right) && !rightIsCluster;
      const shouldFlip =
        (leftIsSong && !rightIsSong) ||      // song-like words on left only
        (leftWords > rightWords + 1) ||      // left is clearly a longer phrase
        (rightIsArtist && !leftIsSong);      // right ends in a known given name, left doesn't
      if (shouldFlip) return { artist: right, song: left };
    }

    // Default: left = artist, right = song
    return { artist: left, song: right };
  }

  // 6. "Song by Artist"
  const by = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { artist: by[2].trim(), song: by[1].trim() };

  // 7. No separator — whole thing is the song
  return { artist: '', song: t };
}

// ── Relay fetch via background service worker (for hopamchuan CORS) ───────────
function bgFetch(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_HOPAMCHUAN', url }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.ok) return reject(new Error(resp?.error || 'fetch failed'));
      resolve(resp.html);
    });
  });
}

// ── Parse hopamchuan HTML → clean lyrics ──────────────────────────────────────
function parseHopamchuanLyrics(html) {
  // Extract the song content block — it lives between the chord display area
  // The lyrics+chords look like: *[*Am*]*Lời bài hát *[*F*]*tiếp theo
  // We need the full pre-formatted text section
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Try to find the main song content area
  // hopamchuan wraps lyrics in a <pre> or a specific div with class containing "song"
  let rawText = '';

  // Strategy 1: look for pre tag with song content
  const preEl = doc.querySelector('pre.song-content, pre.hopam-content, .song-content pre, #song-content');
  if (preEl) rawText = preEl.textContent;

  // Strategy 2: find by text pattern — large block containing *[*chord*]* markers
  if (!rawText) {
    const allPres = doc.querySelectorAll('pre');
    for (const pre of allPres) {
      if (pre.textContent.includes('*[*') && pre.textContent.length > 100) {
        rawText = pre.textContent;
        break;
      }
    }
  }

  // Strategy 3: scan all divs for the chord pattern
  if (!rawText) {
    const allDivs = doc.querySelectorAll('div');
    for (const div of allDivs) {
      const text = div.innerHTML;
      if (text.includes('*[*') && text.length > 200 && text.length < 50000) {
        rawText = div.textContent;
        break;
      }
    }
  }

  // Strategy 4: regex search the raw HTML directly for the lyric block
  if (!rawText) {
    // The lyrics in the raw HTML are formatted like: *[*Am*]*Word word *[*F*]*more words
    const match = html.match(/(\*\[\*[A-G][^\n]{0,200}\n[\s\S]{200,}?)(?=<\/pre>|<div class="song-relate)/);
    if (match) rawText = match[1];
  }

  if (!rawText) return null;

  // Strip chord markers: *[*Am*]*, *[*C#m*]*, *[*Dmaj7*]*, etc.
  let lyrics = rawText
    .replace(/\*\[\*[^\]]*\]\*/g, '')   // remove *[*Chord*]*
    .replace(/\[[^\]]{1,8}\]/g, '')     // remove remaining [Am] style markers
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Clean up whitespace — collapse 3+ newlines to 2, trim each line
  lyrics = lyrics
    .split('\n')
    .map(l => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return lyrics.length > 30 ? lyrics : null;
}

// ── Source 1: hopamchuan.com ──────────────────────────────────────────────────
async function fetchHopamchuan(artist, song) {
  try {
    // Build search query: artist + song title
    const query = artist ? `${song} ${artist}` : song;
    const searchUrl = `${HAC_BASE}/?q=${encodeURIComponent(query)}`;

    const searchHtml = await bgFetch(searchUrl);
    const parser = new DOMParser();
    const searchDoc = parser.parseFromString(searchHtml, 'text/html');

    // Find first song link matching pattern /song/{id}/{slug}/
    const links = searchDoc.querySelectorAll('a[href*="/song/"]');
    let songUrl = null;

    for (const link of links) {
      const href = link.getAttribute('href');
      if (/\/song\/\d+\/[^/]+\/?$/.test(href) && !href.includes('/all/') && !href.includes('/create')) {
        songUrl = href.startsWith('http') ? href : `${HAC_BASE}${href}`;
        break;
      }
    }

    if (!songUrl) return null;

    const songHtml = await bgFetch(songUrl);
    const lyrics = parseHopamchuanLyrics(songHtml);

    if (lyrics) {
      return {
        lyrics,
        source: 'hopamchuan.com',
        url: songUrl
      };
    }
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

// ── Source 5: lyrics.ovh ─────────────────────────────────────────────────────
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
async function fetchLyrics(artist, song) {
  showOnly(stateLoading);
  hide(footer);
  hide(sourceBadge);
  vinylSpinner.className = `vinyl ${isViet ? 'viet' : 'intl'}`;

  let result = null;

  // VN mode: try hopamchuan first — best Vietnamese coverage
  if (isViet) {
    loadingSource.textContent = 'hopamchuan.com…';
    result = await fetchHopamchuan(artist, song);
  }

  // lrclib — fast, good for both
  if (!result) {
    loadingSource.textContent = 'lrclib.net…';
    result = await fetchLrclib(artist, song);
  }

  // LewdHuTao Musixmatch
  if (!result) {
    loadingSource.textContent = 'Musixmatch…';
    result = await fetchLewdMusixmatch(artist, song);
  }

  // LewdHuTao YouTube Music
  if (!result) {
    loadingSource.textContent = 'YouTube Music…';
    result = await fetchLewdYoutube(artist, song);
  }

  // EN-only fallback: also try hopamchuan for non-VN songs (it has some)
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

    // Footer links
    geniusLink.href = `https://genius.com/search?q=${encodeURIComponent(`${artist} ${song}`)}`;
    // If we found it on hopamchuan, link directly
    if (result.url) {
      geniusLink.textContent = 'hopamchuan ↗';
      geniusLink.href        = result.url;
    } else {
      geniusLink.textContent = 'Genius ↗';
    }

    showOnly(stateLyrics);
    show(footer);
  } else {
    const vietLinks = isViet
      ? `<br><br>Try <a href="https://hopamchuan.com/?q=${encodeURIComponent(song)}" target="_blank" style="color:var(--viet)">Hopamchuan ↗</a> or <a href="https://www.nhaccuatui.com/tim-kiem?s=${encodeURIComponent(song)}" target="_blank" style="color:var(--viet)">Nhaccuatui ↗</a>`
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

  inputArtist.value = parsed.artist;
  inputTitle.value  = parsed.song;

  if (parsed.song) {
    await fetchLyrics(parsed.artist, parsed.song);
  } else {
    errorMsg.innerHTML = "Couldn't parse a song name from this video title. Edit the fields above.";
    showOnly(stateError);
  }
}

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
