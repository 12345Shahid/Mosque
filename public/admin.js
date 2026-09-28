// MosqAI - Admin & Imam Console Logic
let ws = null;
let currentSessionId = 'jumuah-live';
let sessionStatus = 'idle';
let sessionStartTime = null;
let timerInterval = null;
let mediaStream = null;
let audioContext = null;
let analyser = null;
let micInterval = null;
let isSimulating = false;

// DOM Elements
const sessionBadge = document.getElementById('session-badge');
const sessionStatusText = document.getElementById('session-status-text');
const liveTimer = document.getElementById('live-timer');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnEnd = document.getElementById('btn-end');
const btnSimulate = document.getElementById('btn-simulate');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const micLevelBar = document.getElementById('mic-level-bar');
const transcriptStream = document.getElementById('transcript-stream');
const transcriptCount = document.getElementById('transcript-count');
const attendeeCount = document.getElementById('attendee-count');
const tvCount = document.getElementById('tv-count');
const totalListenersBadge = document.getElementById('total-listeners-badge');
const languagesBreakdown = document.getElementById('languages-breakdown');
const qrCodeImg = document.getElementById('qr-code-img');
const joinLinkHref = document.getElementById('join-link-href');
const manualInput = document.getElementById('manual-input');
const btnInject = document.getElementById('btn-inject');

// Authentication elements
const authModal = document.getElementById('auth-modal');
const adminPinInput = document.getElementById('admin-pin-input');
const btnSubmitAuth = document.getElementById('btn-submit-auth');
const authErrorMsg = document.getElementById('auth-error-msg');
const btnLogout = document.getElementById('btn-logout');

let transcriptItemsCount = 0;

async function checkAuth() {
  const token = localStorage.getItem('mosq_admin_token');
  if (!token) {
    showAuthModal();
    return false;
  }
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      hideAuthModal();
      return true;
    }
  } catch (e) {
    // fallback
  }
  showAuthModal();
  return false;
}

function showAuthModal() {
  if (authModal) authModal.style.display = 'flex';
  if (adminPinInput) setTimeout(() => adminPinInput.focus(), 100);
}

function hideAuthModal() {
  if (authModal) authModal.style.display = 'none';
  if (authErrorMsg) authErrorMsg.style.display = 'none';
}

if (btnSubmitAuth) {
  btnSubmitAuth.addEventListener('click', async () => {
    const pin = adminPinInput ? adminPinInput.value : '';
    if (!pin) {
      authErrorMsg.textContent = 'Please enter the Imam Passcode.';
      authErrorMsg.style.display = 'block';
      return;
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('mosq_admin_token', data.token);
        hideAuthModal();
        init();
      } else {
        authErrorMsg.textContent = data.error || 'Incorrect passcode. Default is: mosq2026';
        authErrorMsg.style.display = 'block';
      }
    } catch (e) {
      authErrorMsg.textContent = 'Connection error: ' + e.message;
      authErrorMsg.style.display = 'block';
    }
  });
}

if (adminPinInput) {
  adminPinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnSubmitAuth.click();
    }
  });
}

if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('mosq_admin_token');
    showAuthModal();
  });
}

// Initialize Session & WebSockets
async function init() {
  const isAuthed = await checkAuth();
  if (!isAuthed) return;

  try {
    const res = await fetch('/api/session/current');
    const data = await res.json();
    currentSessionId = data.id;

    if (data.qrCodeDataUrl) {
      qrCodeImg.src = data.qrCodeDataUrl;
    }
    if (data.joinUrl) {
      joinLinkHref.href = data.joinUrl;
    }
    if (data.status === 'active') {
      setSessionActive(data.startedAt);
    }

    connectWebSocket();
  } catch (err) {
    console.error('Init failed:', err);
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      sessionId: currentSessionId,
      role: 'admin'
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'ADMIN_TRANSCRIPT') {
        appendTranscript(data);
      }

      if (data.type === 'STATS_UPDATE') {
        updateStats(data.stats);
      }

      if (data.type === 'SESSION_STATUS') {
        if (data.status === 'active') {
          setSessionActive(data.startedAt);
        } else if (data.status === 'paused') {
          setSessionPaused();
        } else if (data.status === 'ended') {
          setSessionEnded();
        }
      }
    } catch (err) {
      console.warn('WS message error:', err);
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 2000);
  };
}

// Transcript UI rendering
function appendTranscript({ arabic, translations, ayah, timestamp }) {
  if (transcriptItemsCount === 0) {
    transcriptStream.innerHTML = '';
  }

  transcriptItemsCount++;
  transcriptCount.textContent = `${transcriptItemsCount} phrases`;

  const itemWrapper = document.createElement('div');

  if (ayah) {
    // Reverent Quran Ayah Card
    itemWrapper.className = 'ayah-card';
    itemWrapper.innerHTML = `
      <div class="ayah-header">
        <span class="ayah-badge">📖 Quran Detected (${ayah.confidence}% match)</span>
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--accent-gold);">${ayah.reference}</span>
      </div>
      <div class="ayah-arabic">${ayah.arabicUthmani}</div>
      <div class="ayah-translation">"${ayah.translations.en || ''}"</div>
      ${ayah.translations.ur ? `<div style="font-size: 0.95rem; color: #cbd5e1; direction: rtl; text-align: right; margin-top: 0.35rem;">${ayah.translations.ur}</div>` : ''}
    `;
  } else {
    // Regular Sermon Speech Bubble
    itemWrapper.className = 'speech-bubble latest';
    const primaryTrans = translations.en || Object.values(translations)[0] || '';
    itemWrapper.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
        <span>Khutbah Speech</span>
        <span>${new Date(timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="arabic-text">${arabic}</div>
      <div class="translated-text">${primaryTrans}</div>
      ${translations.bn ? `<div style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.25rem;">Bengali: ${translations.bn}</div>` : ''}
    `;
  }

  // Remove latest highlight from previous elements
  const prevLatest = transcriptStream.querySelector('.speech-bubble.latest');
  if (prevLatest && !ayah) prevLatest.classList.remove('latest');

  transcriptStream.appendChild(itemWrapper);
  transcriptStream.scrollTop = transcriptStream.scrollHeight;
}

function updateStats(stats) {
  if (!stats) return;
  attendeeCount.textContent = stats.totalAttendees || 0;
  tvCount.textContent = stats.tvDisplays || 0;
  totalListenersBadge.textContent = `${stats.totalAttendees || 0} Listeners`;

  languagesBreakdown.innerHTML = '';
  const counts = stats.languageCounts || {};
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    languagesBreakdown.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">None active yet</span>';
  } else {
    entries.forEach(([lang, num]) => {
      const tag = document.createElement('span');
      tag.style.cssText = 'background: #334155; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;';
      tag.textContent = `${lang.toUpperCase()}: ${num}`;
      languagesBreakdown.appendChild(tag);
    });
  }
}

// Timer and State Handlers
function setSessionActive(startedAt) {
  sessionStatus = 'active';
  sessionBadge.className = 'badge badge-live';
  sessionStatusText.textContent = 'LIVE KHUTBAH';
  btnStart.disabled = true;
  btnPause.disabled = false;
  btnEnd.disabled = false;

  sessionStartTime = startedAt ? new Date(startedAt) : new Date();
  if (!timerInterval) {
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }
}

function setSessionPaused() {
  sessionStatus = 'paused';
  sessionBadge.className = 'badge badge-idle';
  sessionStatusText.textContent = 'PAUSED';
  btnStart.disabled = false;
  btnPause.disabled = true;
  btnEnd.disabled = false;
}

function setSessionEnded() {
  sessionStatus = 'ended';
  sessionBadge.className = 'badge badge-idle';
  sessionStatusText.textContent = 'ENDED';
  btnStart.disabled = false;
  btnPause.disabled = true;
  btnEnd.disabled = true;
  btnSimulate.textContent = '⚡ Simulate Live Khutbah Demo';
  isSimulating = false;

  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  if (!sessionStartTime) return;
  const elapsed = Math.floor((new Date() - sessionStartTime) / 1000);
  const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');
  liveTimer.textContent = `${hrs}:${mins}:${secs}`;
}

// Button Listeners
btnStart.addEventListener('click', async () => {
  await fetch(`/api/session/${currentSessionId}/start`, { method: 'POST' });
});

btnPause.addEventListener('click', async () => {
  await fetch(`/api/session/${currentSessionId}/pause`, { method: 'POST' });
});

btnEnd.addEventListener('click', async () => {
  if (confirm('Are you sure you want to end and archive this Khutbah session?')) {
    await fetch(`/api/session/${currentSessionId}/end`, { method: 'POST' });
  }
});

btnSimulate.addEventListener('click', async () => {
  if (!isSimulating) {
    await fetch(`/api/session/${currentSessionId}/simulate/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalMs: 3800 })
    });
    isSimulating = true;
    btnSimulate.textContent = '⏹ Stop Simulation';
    btnSimulate.className = 'btn btn-danger';
  } else {
    await fetch(`/api/session/${currentSessionId}/simulate/stop`, { method: 'POST' });
    isSimulating = false;
    btnSimulate.textContent = '⚡ Simulate Live Khutbah Demo';
    btnSimulate.className = 'btn btn-accent';
  }
});

btnInject.addEventListener('click', async () => {
  const text = manualInput.value.trim();
  if (!text) return;
  await fetch(`/api/session/${currentSessionId}/inject-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  manualInput.value = '';
});

manualInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnInject.click();
});

// Live Microphone streaming & Deepgram Audio Pipeline
let mediaRecorder = null;

btnToggleMic.addEventListener('click', async () => {
  if (!mediaStream) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      btnToggleMic.textContent = '🛑 Stop Live Mic';
      btnToggleMic.className = 'btn btn-danger';

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      micInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((acc, v) => acc + v, 0);
        const avg = sum / dataArray.length;
        micLevelBar.style.width = `${Math.min(avg * 2, 100)}%`;
      }, 100);

      // Stream live audio chunks to Deepgram STT
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
        mediaRecorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
            const buffer = await e.data.arrayBuffer();
            ws.send(buffer);
          }
        };
        mediaRecorder.start(250); // 250ms chunks for low-latency live STT
      } catch (recErr) {
        console.warn('MediaRecorder not available, relying on speech recognition:', recErr.message);
      }

      // Web Speech API fallback for local live speech recognition
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'ar-SA';

        recognition.onresult = (evt) => {
          const transcript = evt.results[evt.results.length - 1][0].transcript;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'DIRECT_SPEECH',
              text: transcript
            }));
          }
        };

        recognition.start();
      }
    } catch (err) {
      alert('Could not access microphone: ' + err.message);
    }
  } else {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
    clearInterval(micInterval);
    micLevelBar.style.width = '0%';
    btnToggleMic.textContent = '🎤 Enable Live Mic';
    btnToggleMic.className = 'btn btn-secondary';
  }
});

// ============================================================================
// Custom Khutbah Streamer & Live Congregation Simulator
// ============================================================================
const customKhutbahText = document.getElementById('custom-khutbah-text');
const customKhutbahStatus = document.getElementById('custom-khutbah-status');
const khutbahPacing = document.getElementById('khutbah-pacing');
const btnDeliverKhutbah = document.getElementById('btn-deliver-khutbah');
const btnNextPhrase = document.getElementById('btn-next-phrase');
const btnStopKhutbah = document.getElementById('btn-stop-khutbah');
const teleprompterBox = document.getElementById('teleprompter-box');
const teleprompterProgress = document.getElementById('teleprompter-progress');
const teleprompterCurrent = document.getElementById('teleprompter-current');
const khutbahAudioFile = document.getElementById('khutbah-audio-file');
const audioFilePlayer = document.getElementById('audio-file-player');
const audioFileStatus = document.getElementById('audio-file-status');

const btnTplTaqwa = document.getElementById('btn-tpl-taqwa');
const btnTplEase = document.getElementById('btn-tpl-ease');
const btnTplCharacter = document.getElementById('btn-tpl-character');

const KHUTBAH_TEMPLATES = {
  taqwa: `الحمد لله نحمده ونستعينه ونستغفره، ونعوذ بالله من شرور أنفسنا.
يا أيها الذين آمنوا اتقوا الله حق تقاته ولا تموتن إلا وأنتم مسلمون.
إن أصدق الحديث كتاب الله، وخير الهدي هدي محمد صلى الله عليه وسلم.
فاتقوا الله عباد الله، واعلموا أن تقوى الله هي النجاة في الدنيا والآخرة.
بارك الله لي ولكم في القرآن العظيم، ونفعني وإياكم بما فيه من الآيات والذكر الحكيم.`,

  ease: `الحمد لله رب العالمين، والصلاة والسلام على رسوله الكريم.
أيها المسلمون، إن مع العسر يسرا، وإن دوام الحال من المحال.
فإن مع العسر يسرا، إن مع العسر يسرا.
فاصبروا واحتسبوا، وتوكلوا على الحي الذي لا يموت.
نسأل الله تعالى أن يفرج كروبنا وكروب المسلمين في كل مكان.`,

  character: `الحمد لله الذي ألف بين قلوبنا فأصبحنا بنعمته إخوانا.
يا أيها الناس اتقوا ربكم الذي خلقكم من نفس واحدة.
المسلم أخو المسلم، لا يظلمه ولا يسلمه ولا يخذله.
إنما بعثت لأتمم مكارم الأخلاق، فأحسنوا إن الله يحب المحسنين.
أقول قولي هذا وأستغفر الله العظيم لي ولكم فاستغفروه إنه هو الغفور الرحيم.`
};

if (btnTplTaqwa) {
  btnTplTaqwa.addEventListener('click', () => {
    customKhutbahText.value = KHUTBAH_TEMPLATES.taqwa;
    customKhutbahStatus.textContent = "Template 1 (Taqwa & Ali 'Imran) Loaded";
  });
}

if (btnTplEase) {
  btnTplEase.addEventListener('click', () => {
    customKhutbahText.value = KHUTBAH_TEMPLATES.ease;
    customKhutbahStatus.textContent = 'Template 2 (Ash-Sharh) Loaded';
  });
}

if (btnTplCharacter) {
  btnTplCharacter.addEventListener('click', () => {
    customKhutbahText.value = KHUTBAH_TEMPLATES.character;
    customKhutbahStatus.textContent = 'Template 3 (Brotherhood) Loaded';
  });
}

let deliveryQueue = [];
let deliveryIndex = 0;
let deliveryTimer = null;
let isDelivering = false;

function parseKhutbahPhrases(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const phrases = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/([.،؟!]+)/);
    let buffer = '';
    for (const part of parts) {
      if (/^[.،؟!\s]+$/.test(part)) {
        buffer += part;
        if (buffer.trim().length > 3) {
          phrases.push(buffer.trim());
          buffer = '';
        }
      } else {
        if (buffer.trim().length > 0) {
          phrases.push(buffer.trim());
          buffer = '';
        }
        buffer = part;
      }
    }
    if (buffer.trim().length > 0) {
      phrases.push(buffer.trim());
    }
  }
  return phrases.filter(p => p && p.length > 2);
}

async function deliverCurrentPhrase() {
  if (deliveryIndex >= deliveryQueue.length) {
    stopKhutbahDelivery(true);
    return;
  }

  const phrase = deliveryQueue[deliveryIndex];
  const phraseNum = deliveryIndex + 1;
  const total = deliveryQueue.length;

  teleprompterProgress.textContent = `Sentence ${phraseNum} of ${total}`;
  teleprompterCurrent.textContent = phrase;
  customKhutbahStatus.textContent = `Delivering sentence ${phraseNum}/${total}...`;

  try {
    await fetch(`/api/session/${currentSessionId}/inject-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: phrase })
    });
  } catch (err) {
    console.warn('Failed delivering phrase:', err.message);
  }

  deliveryIndex++;

  if (deliveryIndex >= deliveryQueue.length) {
    setTimeout(() => {
      stopKhutbahDelivery(true);
    }, 2000);
    return;
  }

  const pacing = khutbahPacing.value;
  if (pacing !== 'manual' && isDelivering) {
    const ms = parseInt(pacing, 10) || 5000;
    deliveryTimer = setTimeout(deliverCurrentPhrase, ms);
  }
}

async function startKhutbahDelivery() {
  const text = customKhutbahText.value.trim();
  if (!text) {
    alert('Please enter or select a Khutbah text first!');
    return;
  }

  deliveryQueue = parseKhutbahPhrases(text);
  if (deliveryQueue.length === 0) {
    alert('Could not find sentences in the entered text.');
    return;
  }

  if (sessionStatus !== 'active') {
    try {
      const res = await fetch(`/api/session/${currentSessionId}/start`, { method: 'POST' });
      if (res.ok) setSessionActive();
    } catch (e) {
      console.warn('Could not auto-start session:', e);
    }
  }

  isDelivering = true;
  deliveryIndex = 0;

  btnDeliverKhutbah.style.display = 'none';
  btnStopKhutbah.style.display = 'inline-block';
  btnNextPhrase.style.display = 'inline-block';
  teleprompterBox.style.display = 'block';

  deliverCurrentPhrase();
}

function stopKhutbahDelivery(isCompleted = false) {
  isDelivering = false;
  if (deliveryTimer) {
    clearTimeout(deliveryTimer);
    deliveryTimer = null;
  }

  btnDeliverKhutbah.style.display = 'inline-block';
  btnStopKhutbah.style.display = 'none';
  btnNextPhrase.style.display = 'none';

  if (isCompleted) {
    customKhutbahStatus.textContent = 'Khutbah Completed! (All phrases delivered)';
    teleprompterProgress.textContent = 'Completed';
    teleprompterCurrent.textContent = '✨ الحمد لله - Khutbah Finished Successfully.';
  } else {
    customKhutbahStatus.textContent = 'Delivery Stopped';
    teleprompterBox.style.display = 'none';
  }
}

if (btnDeliverKhutbah) btnDeliverKhutbah.addEventListener('click', startKhutbahDelivery);
if (btnStopKhutbah) btnStopKhutbah.addEventListener('click', () => stopKhutbahDelivery(false));
if (btnNextPhrase) {
  btnNextPhrase.addEventListener('click', () => {
    if (deliveryTimer) clearTimeout(deliveryTimer);
    deliverCurrentPhrase();
  });
}

// Audio File handler
if (khutbahAudioFile) {
  khutbahAudioFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    audioFilePlayer.src = objectUrl;
    audioFilePlayer.style.display = 'block';
    audioFileStatus.style.display = 'block';
    audioFileStatus.textContent = `🎵 Loaded: "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB). Play through speakers with Live Mic active for full real-voice testing!`;
  });
}

// Initialize safely across all document states
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
