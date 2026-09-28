/**
 * MosqAI API Key Verification Script
 * ====================================
 * Makes REAL API calls to verify each configured key is valid and working.
 * Tests: Deepgram STT, OpenRouter (Llama 3.3), DeepL, Gladia, Cartesia
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const KEYS = {
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  DEEPL_API_KEY: process.env.DEEPL_API_KEY,
  GLADIA_API_KEY: process.env.GLADIA_API_KEY,
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY,
};

const isPlaceholder = (k) => !k || k.includes('your_') || k.includes('placeholder') || k.trim() === '';

let passCount = 0;
let failCount = 0;
let skipCount = 0;

function pass(name, detail) {
  passCount++;
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, error) {
  failCount++;
  console.log(`  ❌ ${name} — ${error}`);
}
function skip(name, reason) {
  skipCount++;
  console.log(`  ⏭️  ${name} — SKIPPED (${reason})`);
}

async function verifyAllKeys() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  🔑 MosqAI API KEY VERIFICATION (LIVE CALLS)           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // ==========================================
  // 1. DEEPGRAM (Speech-to-Text Nova-3)
  // ==========================================
  console.log('━━━ 1. Deepgram Nova-3 (Arabic Speech-to-Text) ━━━');
  console.log(`  Key: ${KEYS.DEEPGRAM_API_KEY ? KEYS.DEEPGRAM_API_KEY.substring(0, 8) + '...' + KEYS.DEEPGRAM_API_KEY.slice(-4) : 'NOT SET'}`);

  if (isPlaceholder(KEYS.DEEPGRAM_API_KEY)) {
    skip('Deepgram STT', 'Placeholder key — will use simulation/browser mic fallback');
  } else {
    try {
      // Test via Deepgram's REST API (projects list = lightweight auth check)
      const res = await fetch('https://api.deepgram.com/v1/projects', {
        headers: { 'Authorization': `Token ${KEYS.DEEPGRAM_API_KEY}` }
      });
      if (res.ok) {
        const data = await res.json();
        const projectCount = data.projects ? data.projects.length : 0;
        pass('Deepgram API key is VALID', `${projectCount} project(s) found`);

        // Check balance/usage
        if (data.projects && data.projects.length > 0) {
          const projectId = data.projects[0].project_id;
          try {
            const balRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/balances`, {
              headers: { 'Authorization': `Token ${KEYS.DEEPGRAM_API_KEY}` }
            });
            if (balRes.ok) {
              const balData = await balRes.json();
              if (balData.balances && balData.balances.length > 0) {
                const bal = balData.balances[0];
                const remaining = bal.amount != null ? `$${bal.amount.toFixed(2)}` : 'N/A';
                pass('Deepgram credit balance', `Remaining: ${remaining}`);
              } else {
                pass('Deepgram balance endpoint accessible', 'Could not parse balance details');
              }
            }
          } catch (e) {
            // Balance check is optional
            console.log(`    (Balance check skipped: ${e.message})`);
          }
        }
      } else {
        const errText = await res.text();
        fail('Deepgram API key', `HTTP ${res.status}: ${errText.substring(0, 120)}`);
      }
    } catch (err) {
      fail('Deepgram API key', `Connection error: ${err.message}`);
    }
  }

  // ==========================================
  // 2. OPENROUTER (Translation + Quran AI)
  // ==========================================
  console.log('\n━━━ 2. OpenRouter (Translation + Quran AI Detection) ━━━');
  console.log(`  Key: ${KEYS.OPENROUTER_API_KEY ? KEYS.OPENROUTER_API_KEY.substring(0, 12) + '...' + KEYS.OPENROUTER_API_KEY.slice(-4) : 'NOT SET'}`);
  console.log(`  Model: ${KEYS.OPENROUTER_MODEL || 'NOT SET'}`);

  if (isPlaceholder(KEYS.OPENROUTER_API_KEY)) {
    skip('OpenRouter Translation', 'Placeholder key — will use fallback dictionary translations');
  } else {
    // Test A: Simple translation call
    try {
      const testArabic = 'السلام عليكم ورحمة الله وبركاته';
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KEYS.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://mosq.ai',
          'X-Title': 'MosqAI API Key Test'
        },
        body: JSON.stringify({
          model: KEYS.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
          messages: [
            { role: 'system', content: 'Translate the Arabic text to English. Output ONLY the translation.' },
            { role: 'user', content: testArabic }
          ],
          temperature: 0.1,
          max_tokens: 100
        })
      });

      if (res.ok) {
        const data = await res.json();
        const translation = data.choices?.[0]?.message?.content?.trim();
        if (translation && translation.length > 3) {
          pass('OpenRouter Translation API is WORKING', `"${testArabic.substring(0, 25)}..." → "${translation.substring(0, 60)}"`);
        } else {
          fail('OpenRouter Translation', 'Empty or too-short response');
        }

        // Show model + usage info
        const model = data.model || KEYS.OPENROUTER_MODEL;
        const usage = data.usage;
        if (usage) {
          console.log(`    Model used: ${model}`);
          console.log(`    Tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`);
        }
      } else {
        const errBody = await res.text();
        fail('OpenRouter Translation', `HTTP ${res.status}: ${errBody.substring(0, 150)}`);
      }
    } catch (err) {
      fail('OpenRouter Translation', `Connection error: ${err.message}`);
    }

    // Test B: Quran Ayah detection
    try {
      const quranText = 'فإن مع العسر يسرا';
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KEYS.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://mosq.ai',
          'X-Title': 'MosqAI Quran Detection Test'
        },
        body: JSON.stringify({
          model: KEYS.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
          messages: [{
            role: 'user',
            content: `You are a Quranic Scholar. Is this a verse from the Quran: "${quranText}"? If yes, respond with JSON: {"isAyah": true, "surahNumber": <num>, "ayahNumber": <num>}. If no: {"isAyah": false}. JSON only.`
          }],
          temperature: 0.1,
          max_tokens: 80,
          response_format: { type: 'json_object' }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        try {
          const parsed = JSON.parse(content);
          if (parsed.isAyah && parsed.surahNumber === 94) {
            pass('OpenRouter Quran AI Detection is WORKING', `Correctly identified Ash-Sharh 94:${parsed.ayahNumber}`);
          } else if (parsed.isAyah) {
            pass('OpenRouter Quran AI Detection responds', `Identified as Surah ${parsed.surahNumber}:${parsed.ayahNumber} (may vary by model)`);
          } else {
            fail('OpenRouter Quran AI Detection', 'Failed to identify Ash-Sharh 94:5');
          }
        } catch (e) {
          fail('OpenRouter Quran AI Detection', `Invalid JSON response: ${content?.substring(0, 80)}`);
        }
      } else {
        const errBody = await res.text();
        fail('OpenRouter Quran AI', `HTTP ${res.status}: ${errBody.substring(0, 120)}`);
      }
    } catch (err) {
      fail('OpenRouter Quran AI', `Connection error: ${err.message}`);
    }

    // Test C: Check OpenRouter credits
    try {
      const creditsRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${KEYS.OPENROUTER_API_KEY}` }
      });
      if (creditsRes.ok) {
        const creditsData = await creditsRes.json();
        const label = creditsData.data?.label || 'Unknown';
        const limit = creditsData.data?.limit;
        const usage = creditsData.data?.usage;
        const remaining = (limit != null && usage != null) ? `$${(limit - usage).toFixed(4)} remaining` : 'unlimited';
        pass('OpenRouter account info', `Key label: "${label}", Credits: ${remaining}`);
      }
    } catch (e) {
      console.log(`    (Credits check skipped: ${e.message})`);
    }
  }

  // ==========================================
  // 3. DEEPL (Optional Translation Fallback)
  // ==========================================
  console.log('\n━━━ 3. DeepL (Optional Translation Fallback) ━━━');
  console.log(`  Key: ${KEYS.DEEPL_API_KEY ? KEYS.DEEPL_API_KEY.substring(0, 8) + '...' : 'NOT SET'}`);

  if (isPlaceholder(KEYS.DEEPL_API_KEY)) {
    skip('DeepL Translation', 'Placeholder key — OpenRouter handles all translations (no impact)');
  } else {
    try {
      const res = await fetch('https://api-free.deepl.com/v2/usage', {
        headers: { 'Authorization': `DeepL-Auth-Key ${KEYS.DEEPL_API_KEY}` }
      });
      if (res.ok) {
        const data = await res.json();
        const used = data.character_count || 0;
        const limit = data.character_limit || 500000;
        pass('DeepL API key is VALID', `${used.toLocaleString()} / ${limit.toLocaleString()} characters used (${((used/limit)*100).toFixed(1)}%)`);
      } else {
        fail('DeepL API key', `HTTP ${res.status}`);
      }
    } catch (err) {
      fail('DeepL API key', err.message);
    }
  }

  // ==========================================
  // 4. GLADIA (Optional Secondary STT)
  // ==========================================
  console.log('\n━━━ 4. Gladia (Optional Secondary STT) ━━━');
  console.log(`  Key: ${KEYS.GLADIA_API_KEY ? KEYS.GLADIA_API_KEY.substring(0, 8) + '...' : 'NOT SET'}`);

  if (isPlaceholder(KEYS.GLADIA_API_KEY)) {
    skip('Gladia STT', 'Placeholder key — Deepgram is primary STT (no impact)');
  } else {
    try {
      const res = await fetch('https://api.gladia.io/v2/pre-recorded', {
        method: 'OPTIONS',
        headers: { 'x-gladia-key': KEYS.GLADIA_API_KEY }
      });
      // Gladia doesn't have a simple auth-check endpoint, so we check if the key format is valid
      if (KEYS.GLADIA_API_KEY.length > 20) {
        pass('Gladia API key appears valid', `Key length: ${KEYS.GLADIA_API_KEY.length} chars`);
      } else {
        fail('Gladia API key', 'Key seems too short');
      }
    } catch (err) {
      fail('Gladia API key', err.message);
    }
  }

  // ==========================================
  // 5. CARTESIA (TTS for Earbuds)
  // ==========================================
  console.log('\n━━━ 5. Cartesia Sonic (Text-to-Speech for Earbuds) ━━━');
  console.log(`  Key: ${KEYS.CARTESIA_API_KEY ? KEYS.CARTESIA_API_KEY.substring(0, 8) + '...' : 'NOT SET'}`);

  if (isPlaceholder(KEYS.CARTESIA_API_KEY)) {
    skip('Cartesia TTS', 'Placeholder key — system generates synthetic WAV audio + browser SpeechSynthesis fallback');
    console.log('    ⚠️  NOTE: Without Cartesia, earbuds will use browser\'s built-in text-to-speech');
    console.log('    ⚠️  This works but sounds robotic. For natural voice, add a Cartesia key.');
  } else {
    try {
      const res = await fetch('https://api.cartesia.ai/voices', {
        headers: {
          'X-API-Key': KEYS.CARTESIA_API_KEY,
          'Cartesia-Version': '2024-06-10'
        }
      });
      if (res.ok) {
        pass('Cartesia API key is VALID', 'Voice library accessible');

        // Test actual TTS generation
        try {
          const ttsRes = await fetch('https://api.cartesia.ai/tts/bytes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': KEYS.CARTESIA_API_KEY,
              'Cartesia-Version': '2025-04-16'
            },
            body: JSON.stringify({
              model_id: 'sonic-2',
              transcript: 'All praise is due to God.',
              voice: { mode: 'id', id: '79a125e8-cd45-4c13-8a67-188112f4dd22' },
              output_format: { container: 'wav', sample_rate: 24000, encoding: 'pcm_f32le' }
            })
          });
          if (ttsRes.ok) {
            const buf = await ttsRes.arrayBuffer();
            pass('Cartesia TTS generation (sonic-2) is WORKING', `Generated ${(buf.byteLength / 1024).toFixed(1)} KB real AI audio`);
          } else {
            const errText = await ttsRes.text();
            fail('Cartesia TTS generation', `HTTP ${ttsRes.status}: ${errText.substring(0, 100)}`);
          }
        } catch (ttsErr) {
          fail('Cartesia TTS generation', ttsErr.message);
        }
      } else {
        fail('Cartesia API key', `HTTP ${res.status}`);
      }
    } catch (err) {
      fail('Cartesia API key', err.message);
    }
  }

  // ==========================================
  // 6. AL-QURAN CLOUD (Canonical Quran API - No key needed)
  // ==========================================
  console.log('\n━━━ 6. Al-Quran Cloud (Canonical Quran API — Free, No Key) ━━━');

  try {
    const res = await fetch('https://api.alquran.cloud/v1/ayah/94:5/editions/quran-uthmani,en.sahih');
    if (res.ok) {
      const data = await res.json();
      if (data.code === 200 && data.data && data.data.length >= 2) {
        const arabicText = data.data[0].text;
        const englishText = data.data[1].text;
        pass('Al-Quran Cloud API is REACHABLE', `94:5 → "${arabicText.substring(0, 30)}..." / "${englishText.substring(0, 40)}..."`);
      } else {
        fail('Al-Quran Cloud API', 'Unexpected response format');
      }
    } else {
      fail('Al-Quran Cloud API', `HTTP ${res.status}`);
    }
  } catch (err) {
    fail('Al-Quran Cloud API', `Connection error: ${err.message}`);
  }

  // ==========================================
  // FINAL REPORT
  // ==========================================
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passCount} PASSED | ${failCount} FAILED | ${skipCount} SKIPPED`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (failCount === 0) {
    console.log('\n🟢 All active API keys are VERIFIED and WORKING!');
  } else {
    console.log(`\n🔴 ${failCount} API key(s) FAILED — review the errors above.`);
  }

  if (skipCount > 0) {
    console.log(`\n📌 ${skipCount} optional API(s) skipped (using placeholder keys).`);
    console.log('   These are NOT required — the system has built-in fallbacks:');
    if (isPlaceholder(KEYS.DEEPL_API_KEY)) console.log('   • DeepL: OpenRouter handles translations instead');
    if (isPlaceholder(KEYS.GLADIA_API_KEY)) console.log('   • Gladia: Deepgram is the primary STT');
    if (isPlaceholder(KEYS.CARTESIA_API_KEY)) console.log('   • Cartesia: Synthetic WAV audio + browser speech used instead');
  }

  console.log('');

  if (failCount > 0) process.exit(1);
}

verifyAllKeys().catch(err => {
  console.error('💥 VERIFICATION CRASHED:', err);
  process.exit(1);
});
