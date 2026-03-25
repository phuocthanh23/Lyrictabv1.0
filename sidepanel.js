/**
 * LyricTab v4 – sidepanel.js
 *
 * Source chain:
 *   1. lrclib.net            — fast, no key, community DB
 *   2. LewdHuTao/Musixmatch  — 14M+ songs, strong Vpop coverage
 *   3. LewdHuTao/YouTube     — catches what Musixmatch misses (especially VN)
 *   4. lyrics.ovh            — EN fallback only
 */

const LEWDHUTAO = 'https://lyrics.lewdhutao.my.eu.org';

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

function parseTitle(raw) {
  let t = raw.replace(/\s*[-–]\s*YouTube\s*$/i, '').trim();
  t = t.replace(/\s*[\(\[][^\)\]]{0,60}(official|video|audio|lyric|lyrics|live|hd|4k|mv|m\/v|visuali[sz]er|ft\.|feat\.|prod\.|version|remix|cover|remaster|karaoke|topic|full)[^\)\]]*[\)\]]/gi, '');
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/gi, '').trim();

  const dash = t.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (dash) return { artist: dash[1].trim(), song: dash[2].trim() };

  const by = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { artist: by[2].trim(), song: by[1].trim() };

  const pipe = t.match(/^(.+?)\s*\|\s*(.+)$/);
  if (pipe) {
    const a = pipe[1].trim(), b = pipe[2].trim();
    return a.length <= b.length ? { artist: a, song: b } : { artist: b, song: a };
  }

  return { artist: '', song: t };
}

// ── Source 1: lrclib.net ──────────────────────────────────────────────────────
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

// ── Source 2: LewdHuTao / Musixmatch ─────────────────────────────────────────
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

// ── Source 3: LewdHuTao / YouTube Music ──────────────────────────────────────
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

// ── Source 4: lyrics.ovh ─────────────────────────────────────────────────────
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

  loadingSource.textContent = 'lrclib.net…';
  result = await fetchLrclib(artist, song);

  if (!result) {
    loadingSource.textContent = 'Musixmatch…';
    result = await fetchLewdMusixmatch(artist, song);
  }

  if (!result) {
    loadingSource.textContent = 'YouTube Music…';
    result = await fetchLewdYoutube(artist, song);
  }

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

    sourceDot.className   = `source-dot${result.source === 'lyrics.ovh' ? ' fallback' : ''}`;
    sourceName.textContent = result.source;
    show(sourceBadge);

    geniusLink.href = `https://genius.com/search?q=${encodeURIComponent(`${artist} ${song}`)}`;
    showOnly(stateLyrics);
    show(footer);
  } else {
    const vietLinks = isViet
      ? `<br><br>Try <a href="https://www.nhaccuatui.com/tim-kiem?s=${encodeURIComponent(song)}" target="_blank" style="color:var(--viet)">Nhaccuatui ↗</a> or <a href="https://genius.com/search?q=${encodeURIComponent(`${artist} ${song}`)}" target="_blank" style="color:var(--accent)">Genius ↗</a>`
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
