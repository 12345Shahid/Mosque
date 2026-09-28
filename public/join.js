// MosqAI - Attendee Mobile View & Earbud Streaming Script
let ws = null;
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session') || 'jumuah-live';
let currentLanguage = urlParams.get('lang') || 'en';

const mobileMosqueName = document.getElementById('mobile-mosque-name');
const langSelect = document.getElementById('lang-select');
const btnToggleAudio = document.getElementById('btn-toggle-audio');
const audioIcon = document.getElementById('audio-icon');
const audioStatusTitle = document.getElementById('audio-status-title');
const audioStatusDesc = document.getElementById('audio-status-desc');
const mobileFeed = document.getElementById('mobile-feed');
const mobileWaiting = document.getElementById('mobile-waiting');

// Web Audio API Context & Queue for Earbuds
let audioCtx = null;
let isAudioEnabled = false;
const audioQueue = [];
let isPlayingAudio = false;

// Initialize
async function init() {
  langSelect.value = currentLanguage;

  try {
    const res = await fetch(`/api/session/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.mosqueName) mobileMosqueName.textContent = data.mosqueName;
    }
  } catch (err) {
    console.warn('Session fetch failed:', err);
  }

  connectWebSocket();
  startFeedSync();
}

const renderedTimestamps = new Set();
let lastSyncTime = null;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      sessionId: sessionId,
      role: 'attendee',
      language: currentLanguage
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'LIVE_SUBTITLE') {
        const itemKey = data.timestamp || `${data.arabic}_${Date.now()}`;
        if (!renderedTimestamps.has(itemKey)) {
          renderedTimestamps.add(itemKey);
          renderAttendeeSubtitle(data);

          // If audio buffer is provided and user has earbuds enabled, queue audio
          if (isAudioEnabled) {
            if (data.audio && data.audio.audioBase64) {
              queueAudio(data.audio.audioBase64);
            } else if (data.translated) {
              speakLocalFallback(data.translated, currentLanguage);
            }
          }
        }
      }
    } catch (err) {
      console.warn('WS Attendee parse error:', err);
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 2000);
  };
}

// Background synchronization fallback for serverless edge instances
function startFeedSync() {
  setInterval(async () => {
    try {
      const url = `/api/session/${sessionId}/feed${lastSyncTime ? `?since=${encodeURIComponent(lastSyncTime)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data.serverTime) lastSyncTime = data.serverTime;

      if (data.transcripts && data.transcripts.length > 0) {
        data.transcripts.forEach(item => {
          const itemKey = item.timestamp;
          if (!renderedTimestamps.has(itemKey)) {
            renderedTimestamps.add(itemKey);
            const translated = (item.translations && item.translations[currentLanguage]) || 
                               (item.translations && item.translations.en) || 
                               item.arabic;
            renderAttendeeSubtitle({
              arabic: item.arabic,
              translated: translated,
              ayah: item.ayah,
              timestamp: item.timestamp
            });
            if (isAudioEnabled && translated) {
              speakLocalFallback(translated, currentLanguage);
            }
          }
        });
      }
    } catch (e) {
      // quiet fallback
    }
  }, 2000);
}

// Handle Language Switch
langSelect.addEventListener('change', () => {
  currentLanguage = langSelect.value;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'CHANGE_LANGUAGE',
      language: currentLanguage
    }));
  }
});

// Render incoming translation / Ayah on mobile screen
function renderAttendeeSubtitle({ arabic, translated, ayah, timestamp }) {
  if (mobileWaiting) mobileWaiting.style.display = 'none';

  const itemWrapper = document.createElement('div');

  if (ayah) {
    itemWrapper.className = 'ayah-card';
    itemWrapper.innerHTML = `
      <div class="ayah-header">
        <span class="ayah-badge">📖 Holy Quran</span>
        <span style="font-size: 0.8rem; font-weight: 600; color: var(--accent-gold);">${ayah.reference}</span>
      </div>
      <div class="ayah-arabic" style="font-size: 1.45rem;">${ayah.arabicUthmani}</div>
      <div class="ayah-translation" style="font-size: 0.95rem;">"${ayah.translation || translated}"</div>
    `;
  } else {
    itemWrapper.className = 'speech-bubble latest';
    itemWrapper.innerHTML = `
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.2rem;">
        ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div class="arabic-text" style="font-size: 1.15rem;">${arabic}</div>
      <div class="translated-text" style="font-size: 1.05rem;">${translated}</div>
    `;
  }

  // Remove latest highlight from earlier elements
  const prevLatest = mobileFeed.querySelector('.speech-bubble.latest');
  if (prevLatest && !ayah) prevLatest.classList.remove('latest');

  mobileFeed.appendChild(itemWrapper);
  mobileFeed.scrollTop = mobileFeed.scrollHeight;
}

// Audio Player & Earbuds Controls
btnToggleAudio.addEventListener('click', async () => {
  if (!isAudioEnabled) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      isAudioEnabled = true;
      btnToggleAudio.textContent = '⏸ Mute Voice';
      btnToggleAudio.className = 'btn btn-secondary';
      audioIcon.textContent = '🔊';
      audioStatusTitle.textContent = 'Earbuds: Live Listening';
      audioStatusDesc.textContent = `Streaming speech in ${langSelect.options[langSelect.selectedIndex].text}`;
    } catch (err) {
      alert('Could not start audio context: ' + err.message);
    }
  } else {
    isAudioEnabled = false;
    btnToggleAudio.textContent = '▶ Listen Live';
    btnToggleAudio.className = 'btn btn-accent';
    audioIcon.textContent = '🎧';
    audioStatusTitle.textContent = 'Earbud Audio: Muted';
    audioStatusDesc.textContent = 'Tap to resume voice streaming';
  }
});

// Audio Queue & Web Audio API Player
function queueAudio(base64Data) {
  audioQueue.push(base64Data);
  if (!isPlayingAudio) {
    playNextAudio();
  }
}

async function playNextAudio() {
  if (audioQueue.length === 0 || !isAudioEnabled) {
    isPlayingAudio = false;
    return;
  }

  isPlayingAudio = true;
  const base64Data = audioQueue.shift();

  try {
    const binary = atob(base64Data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    source.onended = () => {
      playNextAudio();
    };

    source.start(0);
  } catch (err) {
    console.warn('Audio decode error, moving to next:', err.message);
    playNextAudio();
  }
}

// Client-side Web Speech fallback for offline/local testing
function speakLocalFallback(text, lang) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
