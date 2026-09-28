// MosqAI - Live TV / Projector Display Script
let ws = null;
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session') || 'jumuah-live';

const tvMosqueName = document.getElementById('tv-mosque-name');
const tvWaiting = document.getElementById('tv-waiting');
const tvSpeechBox = document.getElementById('tv-speech-box');
const tvArabicText = document.getElementById('tv-arabic-text');
const tvTranslatedText = document.getElementById('tv-translated-text');
const tvAyahCard = document.getElementById('tv-ayah-card');
const tvAyahRef = document.getElementById('tv-ayah-ref');
const tvAyahArabic = document.getElementById('tv-ayah-arabic');
const tvAyahTrans = document.getElementById('tv-ayah-trans');
const tvClock = document.getElementById('tv-clock');
const btnFullscreen = document.getElementById('btn-fullscreen');

function updateClock() {
  const now = new Date();
  tvClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

async function init() {
  try {
    const res = await fetch(`/api/session/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.mosqueName) tvMosqueName.textContent = data.mosqueName;
      if (data.qrCodeDataUrl) {
        const tvQrImg = document.getElementById('tv-qr-img');
        if (tvQrImg) tvQrImg.src = data.qrCodeDataUrl;
      }
      if (data.status === 'active') {
        setTvLiveStatus(true);
      }
    }
  } catch (err) {
    console.warn('Could not fetch session metadata:', err);
  }

  connectWebSocket();
  startDisplayFeedSync();
}

function setTvLiveStatus(isLive, label = 'LIVE KHUTBAH') {
  const badge = document.getElementById('tv-status-badge');
  const text = document.getElementById('tv-status-text');
  if (!badge || !text) return;
  if (isLive) {
    badge.className = 'badge badge-live';
    text.textContent = label;
  } else {
    badge.className = 'badge badge-idle';
    text.textContent = label;
  }
}

let lastDisplayTimestamp = null;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      sessionId: sessionId,
      role: 'tv'
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'SESSION_STATUS') {
        if (data.status === 'active') {
          setTvLiveStatus(true, 'LIVE KHUTBAH');
        } else if (data.status === 'paused') {
          setTvLiveStatus(false, 'PAUSED');
        } else if (data.status === 'ended') {
          setTvLiveStatus(false, 'CONCLUDED');
          tvWaiting.style.display = 'block';
          tvSpeechBox.style.display = 'none';
          tvAyahCard.style.display = 'none';
        }
      }

      if (data.type === 'LIVE_SUBTITLE') {
        lastDisplayTimestamp = data.timestamp;
        renderSubtitle(data);
      }
    } catch (err) {
      console.warn('Error reading display subtitle:', err);
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 2000);
  };
}

// Background sync fallback for multi-device serverless synchronization
function startDisplayFeedSync() {
  setInterval(async () => {
    try {
      const url = `/api/session/${sessionId}/feed${lastDisplayTimestamp ? `?since=${encodeURIComponent(lastDisplayTimestamp)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'active') {
        setTvLiveStatus(true, 'LIVE KHUTBAH');
      }

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
    } catch (e) {
      // quiet fallback
    }
  }, 2000);
}

function renderSubtitle({ arabic, translated, ayah }) {
  if (tvWaiting) tvWaiting.style.display = 'none';

  if (ayah) {
    // Show Sacred Ayah Showcase Card
    tvSpeechBox.style.display = 'none';
    tvAyahCard.style.display = 'block';

    const refText = ayah.reference || `${ayah.surahNameEnglish || 'Holy Quran'} (${ayah.surahNumber || ''}:${ayah.ayahNumber || ''})`;
    tvAyahRef.textContent = refText;
    tvAyahArabic.textContent = ayah.arabicUthmani || ayah.arabic || arabic;
    const transText = (ayah.translations && (ayah.translations.en || Object.values(ayah.translations)[0])) || ayah.translation || translated || '';
    tvAyahTrans.textContent = `"${transText}"`;
  } else {
    // Show standard large dual-language subtitle
    tvAyahCard.style.display = 'none';
    tvSpeechBox.style.display = 'block';

    tvArabicText.textContent = arabic || '';
    tvTranslatedText.textContent = translated || '';
  }
}

// Fullscreen toggle for TV hall display
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn(`Fullscreen error: ${err.message}`);
    });
    btnFullscreen.textContent = '⛶ Exit Fullscreen';
  } else {
    document.exitFullscreen();
    btnFullscreen.textContent = '⛶ Fullscreen';
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
