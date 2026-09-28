/**
 * Real-Time Text-to-Speech (TTS) Service
 * Streams spoken audio to attendees listening through earbuds
 * Integrates with Cartesia AI Sonic-2 (sub-90ms latency)
 * Includes lightweight audio buffer generator for offline/autonomous testing
 *
 * Model: sonic-2 (replaces sunsetted sonic-multilingual)
 * API Version: 2025-04-16
 */

// Cartesia recommended voice IDs per language locale
const CARTESIA_VOICE_MAP = {
  en: '79a125e8-cd45-4c13-8a67-188112f4dd22', // Conversational British/English male
  fr: 'ab7c61f5-3610-45dd-a450-911145632266',
  zh: 'e90c6678-f0d3-4767-9183-7d06d5228469',
  tr: '134e1837-dd87-4b77-aa9f-7e8c07e05fc8',
  ur: '79a125e8-cd45-4c13-8a67-188112f4dd22',
  bn: '79a125e8-cd45-4c13-8a67-188112f4dd22'
};

class TTSService {
  constructor(apiKey) {
    const isPlaceholder = (k) => !k || k.includes('your_') || k.includes('placeholder') || k.trim() === '';
    this.apiKey = isPlaceholder(apiKey || process.env.CARTESIA_API_KEY) ? '' : (apiKey || process.env.CARTESIA_API_KEY);
  }

  /**
   * Generates low-latency audio buffer for the given translated text
   * @param {string} text - Translated text to vocalize
   * @param {string} language - Target language code (e.g. 'en', 'bn')
   * @returns {Promise<{ audioBase64: string, format: string, durationMs: number }>}
   */
  async generateSpeech(text, language = 'en') {
    if (!text || text.trim().length === 0) return null;

    // If Cartesia API key is provided, use Sonic API
    if (this.apiKey) {
      try {
        const voiceId = CARTESIA_VOICE_MAP[language] || CARTESIA_VOICE_MAP.en;
        const response = await fetch('https://api.cartesia.ai/tts/bytes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'Cartesia-Version': '2025-04-16'
          },
          body: JSON.stringify({
            model_id: 'sonic-2',
            transcript: text,
            voice: {
              mode: 'id',
              id: voiceId
            },
            output_format: {
              container: 'wav',
              sample_rate: 24000,
              encoding: 'pcm_f32le'  // float32 required by sonic-2
            }
          })
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          return {
            audioBase64: buffer.toString('base64'),
            format: 'audio/wav',
            // pcm_f32le = 4 bytes/sample, 24000 samples/sec, mono
            durationMs: Math.round((buffer.length / (24000 * 4)) * 1000)
          };
        } else {
          const errText = await response.text();
          console.warn(`[TTS] Cartesia sonic-2 responded with status ${response.status}: ${errText.substring(0, 120)}`);
        }
      } catch (err) {
        console.warn(`[TTS] Cartesia speech generation failed: ${err.message}`);
      }
    }

    // High-performance autonomous test / fallback audio synthesizer (valid PCM WAV header + gentle harmonic chime)
    return this.generateSyntheticAudioBuffer(text, language);
  }

  /**
   * Generates a valid RIFF/WAV audio buffer containing a pleasant subtle tone
   * Allows the frontend Web Audio API player to receive real audio bytes autonomously
   */
  generateSyntheticAudioBuffer(text, language) {
    const sampleRate = 16000;
    const durationSeconds = Math.max(0.6, Math.min(text.length * 0.05, 3.0));
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataSize = numSamples * 2; // 16-bit mono
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    const buffer = Buffer.alloc(totalSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(totalSize - 8, 4);
    buffer.write('WAVE', 8);

    // fmt subchunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size
    buffer.writeUInt16LE(1, 20);  // PCM format
    buffer.writeUInt16LE(1, 22);  // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
    buffer.writeUInt16LE(2, 32);  // Block align
    buffer.writeUInt16LE(16, 34); // Bits per sample

    // data subchunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Generate gentle harmonic audio wave for real earbud playback
    const freq = language === 'ar' ? 440 : 520;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Exponential decay envelope
      const envelope = Math.exp(-3 * (t / durationSeconds));
      const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.25 * 32767;
      buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
    }

    return {
      audioBase64: buffer.toString('base64'),
      format: 'audio/wav',
      durationMs: Math.round(durationSeconds * 1000),
      isSynthetic: true
    };
  }
}

module.exports = {
  TTSService,
  CARTESIA_VOICE_MAP
};
