// MosqAI - Live TV Split-Screen Display Script
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session') || 'jumuah-live';
let ws = null;
let lastDisplayTimestamp = null;

const mosqueNameEl = document.getElementById('mosque-name');
const liveBadge = document.getElementById('live-badge');
const liveText = document.getElementById('live-text');
const clockEl = document.getElementById('clock');
const waitingEl = document.getElementById('waiting');
const splitScreen = document.getElementById('split-screen');
const arabicTextEl = document.getElementById('arabic-text');
const translatedTextEl = document.getElementById('translated-text');
const langIndicatorEl = document.getElementById('lang-indicator');
const ayahBanner = document.getElementById('ayah-banner');
const ayahRefEl = document.getElementById('ayah-reference');
const ayahArabicEl = document.getElementById('ayah-arabic');
const ayahTransEl = document.getElementById('ayah-translation');
const qrImg = document.getElementById('qr-img');
const waitingQrImg = document.getElementById('waiting-qr-img');
const joinUrlText = document.getElementById('join-url-text');

// Clock
setInterval(() => {
  clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);
clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function setLive(isLive, label) {
  if (isLive) {
    liveBadge.className = 'live-badge';
    liveText.textContent = label || 'LIVE';
  } else {
    liveBadge.className = 'live-badge idle';
    liveText.textContent = label || 'WAITING';
  }
}

function showSplitScreen() {
  waitingEl.style.display = 'none';
  splitScreen.classList.add('visible');
}

function showWaiting() {
  waitingEl.style.display = 'flex';
  splitScreen.classList.remove('visible');
}

function renderSubtitle({ arabic, translated, ayah, language }) {
  showSplitScreen();

  if (ayah) {
    // Quran ayah — show full-screen overlay
    arabicTextEl.textContent = '';
    translatedTextEl.textContent = '';
    ayahBanner.classList.add('visible');

    const ref = ayah.reference || `${ayah.surahNameEnglish || 'Quran'} (${ayah.surahNumber || ''}:${ayah.ayahNumber || ''})`;
    ayahRefEl.textContent = ref;
    ayahArabicEl.textContent = ayah.arabicUthmani || arabic || '';
    const trans = (ayah.translations && (ayah.translations.en || Object.values(ayah.translations)[0])) || ayah.translation || translated || '';
    ayahTransEl.textContent = `"${trans}"`;
    ayahArabicEl.classList.add('fade-in');
    ayahTransEl.classList.add('fade-in');
    setTimeout(() => {
      ayahArabicEl.classList.remove('fade-in');
      ayahTransEl.classList.remove('fade-in');
    }, 600);
  } else {
    // Standard speech — split screen
    ayahBanner.classList.remove('visible');
    arabicTextEl.textContent = arabic || '';
    translatedTextEl.textContent = translated || '';
    arabicTextEl.classList.add('fade-in');
    translatedTextEl.classList.add('fade-in');
    setTimeout(() => {
      arabicTextEl.classList.remove('fade-in');
      translatedTextEl.classList.remove('fade-in');
    }, 600);
  }
}

async function init() {
  try {
    const res = await fetch(`/api/session/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.mosqueName) mosqueNameEl.textContent = data.mosqueName;
      if (data.qrCodeDataUrl) {
        qrImg.src = data.qrCodeDataUrl;
        waitingQrImg.src = data.qrCodeDataUrl;
      }
      if (data.joinUrl) joinUrlText.textContent = data.joinUrl.replace('https://', '');
      if (data.status === 'active') setLive(true);
    }
  } catch (e) {}

  connectWebSocket();
  startFeedSync();
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', sessionId, role: 'tv' }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'SESSION_STATUS') {
        if (data.status === 'active') setLive(true, 'LIVE');
        else if (data.status === 'paused') setLive(false, 'PAUSED');
        else if (data.status === 'ended') { setLive(false, 'CONCLUDED'); showWaiting(); }
      }
      if (data.type === 'LIVE_SUBTITLE') {
        lastDisplayTimestamp = data.timestamp;
        renderSubtitle(data);
      }
    } catch (e) {}
  };

  ws.onclose = () => setTimeout(connectWebSocket, 2000);
}

function startFeedSync() {
  setInterval(async () => {
    try {
      const url = `/api/session/${sessionId}/feed${lastDisplayTimestamp ? `?since=${encodeURIComponent(lastDisplayTimestamp)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'active') setLive(true, 'LIVE');
      if (data.transcripts && data.transcripts.length > 0) {
        const latest = data.transcripts[data.transcripts.length - 1];
        if (latest.timestamp !== lastDisplayTimestamp) {
          lastDisplayTimestamp = latest.timestamp;
          renderSubtitle({
            arabic: latest.arabic,
            translated: (latest.translations && latest.translations.en) || latest.arabic,
            ayah: latest.ayah
          });
        }
      }
    } catch (e) {}
  }, 2000);
}

function toggleFullscreen() {
  const btn = document.getElementById('btn-fullscreen');
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    btn.textContent = '⛶ Exit Fullscreen';
  } else {
    document.exitFullscreen();
    btn.textContent = '⛶ Fullscreen';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else { init(); }
