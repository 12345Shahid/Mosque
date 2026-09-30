// MosqAI - Attendee 3-Step Flow
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session') || 'jumuah-live';
let currentLanguage = urlParams.get('lang') || null;
let ws = null;
let isAudioEnabled = false;
let audioCtx = null;
const audioQueue = [];
let isPlayingAudio = false;
const renderedTimestamps = new Set();
let lastSyncTime = null;

// DOM
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const btnJoin = document.getElementById('btn-join');
const btnConfirmLang = document.getElementById('btn-confirm-lang');
const btnChangeLang = document.getElementById('btn-change-lang');
const btnAudio = document.getElementById('btn-audio');
const liveFeed = document.getElementById('live-feed');
const feedWaiting = document.getElementById('feed-waiting');
const audioTitle = document.getElementById('audio-title');
const audioSub = document.getElementById('audio-sub');
const waveform = document.getElementById('waveform');
const listeningLabel = document.getElementById('listening-label');
const s1MosqueName = document.getElementById('s1-mosque-name');
const s3MosqueName = document.getElementById('s3-mosque-name');

const LANG_NAMES = { en: 'English', bn: 'Bengali', ur: 'Urdu', fr: 'French', zh: 'Chinese', tr: 'Turkish' };

// ── STEP 1: Join button
btnJoin.addEventListener('click', () => {
  // If lang already in URL, skip step 2
  if (currentLanguage) {
    showStep(3);
    initLiveSession();
  } else {
    showStep(2);
  }
});

// ── STEP 2: Language card selection
let selectedLang = null;
document.querySelectorAll('.lang-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.lang-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedLang = card.dataset.lang;
    btnConfirmLang.disabled = false;
  });
});

btnConfirmLang.addEventListener('click', () => {
  if (!selectedLang) return;
  currentLanguage = selectedLang;
  showStep(3);
  initLiveSession();
});

// ── STEP 3: Change language
btnChangeLang.addEventListener('click', () => {
  showStep(2);
});

// ── AUDIO TOGGLE
btnAudio.addEventListener('click', async () => {
  if (!isAudioEnabled) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      isAudioEnabled = true;
      btnAudio.className = 'btn-audio stop';
      btnAudio.textContent = '⏹ Stop';
      audioTitle.textContent = '🔊 Audio: Live';
      audioSub.textContent = `Streaming in ${LANG_NAMES[currentLanguage] || currentLanguage}`;
    } catch (err) {
      alert('Could not start audio: ' + err.message);
    }
  } else {
    isAudioEnabled = false;
    btnAudio.className = 'btn-audio play';
    btnAudio.textContent = '▶ Play';
    audioTitle.textContent = '🎧 Audio: Off';
    audioSub.textContent = 'Tap to hear translated speech';
  }
});

function showStep(n) {
  step1.classList.remove('active');
  step2.classList.remove('active');
  step3.classList.remove('active');
  document.getElementById('step' + n).classList.add('active');
}

async function initLiveSession() {
  // Fetch mosque name
  try {
    const res = await fetch(`/api/session/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.mosqueName) {
        s1MosqueName.innerHTML = `<span>${data.mosqueName.split(' ')[0]}</span> ${data.mosqueName.split(' ').slice(1).join(' ')}`;
        s3MosqueName.textContent = data.mosqueName;
      }
    }
  } catch (e) {}

  connectWebSocket();
  startFeedSync();
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      sessionId,
      role: 'attendee',
      language: currentLanguage || 'en'
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'LIVE_SUBTITLE') {
        const key = data.timestamp || `${data.arabic}_${Date.now()}`;
        if (!renderedTimestamps.has(key)) {
          renderedTimestamps.add(key);
          renderCard(data);
          activateWaveform();
          if (isAudioEnabled) {
            if (data.audio && data.audio.audioBase64) queueAudio(data.audio.audioBase64);
            else if (data.translated) speakFallback(data.translated, currentLanguage);
          }
        }
      }
    } catch (e) {}
  };

  ws.onclose = () => setTimeout(connectWebSocket, 2000);
}

// Polling fallback (works even on serverless)
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
          if (!renderedTimestamps.has(item.timestamp)) {
            renderedTimestamps.add(item.timestamp);
            const translated = (item.translations && item.translations[currentLanguage || 'en']) ||
                               (item.translations && item.translations.en) || item.arabic;
            renderCard({ arabic: item.arabic, translated, ayah: item.ayah, timestamp: item.timestamp });
            activateWaveform();
            if (isAudioEnabled && translated) speakFallback(translated, currentLanguage);
          }
        });
      }
    } catch (e) {}
  }, 2000);
}

function activateWaveform() {
  waveform.classList.remove('idle');
  listeningLabel.textContent = 'Listening...';
  clearTimeout(waveform._idleTimer);
  waveform._idleTimer = setTimeout(() => {
    waveform.classList.add('idle');
    listeningLabel.textContent = 'Waiting for Imam to speak...';
  }, 6000);
}

function renderCard({ arabic, translated, ayah, timestamp }) {
  if (feedWaiting) feedWaiting.style.display = 'none';

  // Remove latest class from previous
  const prevLatest = liveFeed.querySelector('.trans-card.latest');
  if (prevLatest) prevLatest.classList.remove('latest');

  const card = document.createElement('div');

  if (ayah) {
    card.className = 'ayah-card';
    const ref = ayah.reference || `Quran (${ayah.surahNumber}:${ayah.ayahNumber})`;
    const trans = (ayah.translations && (ayah.translations[currentLanguage] || ayah.translations.en)) || ayah.translation || translated || '';
    card.innerHTML = `
      <div class="ayah-header">
        <span class="ayah-pill">📖 Holy Quran</span>
        <span class="ayah-ref">${ref}</span>
      </div>
      <div class="ayah-arabic">${ayah.arabicUthmani || arabic}</div>
      <div class="ayah-trans">"${trans}"</div>
    `;
  } else {
    card.className = 'trans-card latest';
    const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    card.innerHTML = `
      <div class="card-time">${timeStr}</div>
      <div class="card-arabic">${arabic}</div>
      <div class="card-translated">${translated}</div>
    `;
  }

  liveFeed.appendChild(card);
  liveFeed.scrollTop = liveFeed.scrollHeight;
}

// Audio queue
function queueAudio(base64Data) {
  audioQueue.push(base64Data);
  if (!isPlayingAudio) playNextAudio();
}

async function playNextAudio() {
  if (!audioQueue.length || !isAudioEnabled) { isPlayingAudio = false; return; }
  isPlayingAudio = true;
  const b64 = audioQueue.shift();
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await audioCtx.decodeAudioData(bytes.buffer);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.onended = playNextAudio;
    src.start(0);
  } catch (e) { playNextAudio(); }
}

function speakFallback(text, lang) {
  if (!('speechSynthesis' in window)) return;
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang || 'en';
  window.speechSynthesis.speak(utt);
}

// Auto-start if lang in URL
if (currentLanguage) {
  showStep(1); // show landing first so they can click join
}
