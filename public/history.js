// MosqAI - Khutbah Archives Logic
const historyContainer = document.getElementById('history-container');

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const records = await res.json();

    if (!records || records.length === 0) {
      historyContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">📂</div>
          <h3 style="margin-bottom: 0.25rem;">No Archived Khutbahs Yet</h3>
          <p style="font-size: 0.9rem;">Once an Imam ends a live khutbah from the Admin Panel, it will be automatically archived here.</p>
        </div>
      `;
      return;
    }

    historyContainer.innerHTML = '';
    records.forEach((rec, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      const durationMin = Math.round(rec.durationSeconds / 60) || 1;
      const formattedDate = new Date(rec.endedAt || rec.startedAt).toLocaleDateString([], {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
          <div>
            <h2 style="font-size: 1.25rem; font-weight: 700; color: #ffffff;">${rec.mosqueName || 'Friday Khutbah'}</h2>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">${formattedDate}</span>
          </div>
          <span class="badge badge-idle">Archived</span>
        </div>

        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1rem; background: #0f172a; padding: 0.75rem; border-radius: 8px; font-size: 0.85rem;">
          <div>⏱ Duration: <strong style="color: white;">${durationMin} mins</strong></div>
          <div>👥 Listeners: <strong style="color: white;">${rec.peakListeners || 0}</strong></div>
          <div>📜 Phrases: <strong style="color: white;">${rec.totalTranscripts || 0}</strong></div>
          <div>📖 Ayahs Detected: <strong style="color: var(--accent-gold);">${rec.totalAyahsDetected || 0}</strong></div>
        </div>

        <div>
          <button class="btn btn-secondary" onclick="toggleDetails(${idx})" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;">
            View Transcript & Translations
          </button>
        </div>

        <div id="details-${idx}" style="display: none; margin-top: 1rem; border-top: 1px solid var(--bg-card-border); padding-top: 1rem;">
          <h4 style="font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--text-secondary);">Full Transcript Record:</h4>
          <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
            ${(rec.transcripts || []).map(t => `
              <div style="background: #111e33; padding: 0.6rem; border-radius: 6px;">
                <div style="font-family: var(--font-arabic); direction: rtl; text-align: right; color: #e2e8f0; font-size: 1.1rem;">${t.arabic}</div>
                <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.2rem;">${t.translations ? (t.translations.en || '') : ''}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      historyContainer.appendChild(card);
    });
  } catch (err) {
    historyContainer.innerHTML = `<div style="color: var(--danger);">Failed to load history: ${err.message}</div>`;
  }
}

window.toggleDetails = function(idx) {
  const el = document.getElementById(`details-${idx}`);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHistory);
} else {
  loadHistory();
}
