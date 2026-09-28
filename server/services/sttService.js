/**
 * Speech-to-Text (STT) Service
 * Integrates with Gladia Real-Time WebSocket API for Arabic speech
 * Includes built-in Khutbah speech simulation for autonomous testing and offline demo
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

// Realistic Friday Khutbah Speech Script for Demos & Testing
// Contains authentic Arabic sermon sentences + Quranic recitation
const SIMULATED_KHUTBAH_SCRIPT = [
  {
    arabic: 'إنَّ الحَمْدَ لِلَّهِ نَحْمَدُهُ وَنَسْتَعِينُهُ وَنَسْتَغْفِرُهُ',
    type: 'sermon'
  },
  {
    arabic: 'وَنَعُوذُ بِاللَّهِ مِنْ شُرُورِ أَنْفُسِنَا وَمِنْ سَيِّئَاتِ أَعْمَالِنَا',
    type: 'sermon'
  },
  {
    arabic: 'مَنْ يَهْدِهِ اللَّهُ فَلَا مُضِلَّ لَهُ، وَمَنْ يُضْلِلْ فَلَا هَادِيَ لَهُ',
    type: 'sermon'
  },
  {
    arabic: 'وَأَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ',
    type: 'sermon'
  },
  {
    // Quran Recitation: Ali 'Imran 3:102
    arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ حَقَّ تُقَاتِهِ وَلَا تَمُوتُنَّ إِلَّا وَأَنتُم مُّسْلِمُونَ',
    type: 'quran'
  },
  {
    arabic: 'أَيُّهَا الإِخْوَةُ الكِرَامُ، اتَّقُوا اللَّهَ تَعَالَى وَاعْلَمُوا أَنَّ الحَيَاةَ الدُّنْيَا دَارُ امْتِحَانٍ',
    type: 'sermon'
  },
  {
    arabic: 'وَإِنَّ الصَّبْرَ عَلَى الطَّاعَةِ وَعَنِ المَعْصِيَةِ مِفْتَاحُ الفَرَجِ وَالرِّضَا',
    type: 'sermon'
  },
  {
    // Quran Recitation: Ash-Sharh 94:5-6
    arabic: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا، إِنَّ مَعَ الْعُسْرِ يُسْرًا',
    type: 'quran'
  },
  {
    arabic: 'فَاسْتَغْفِرُوا اللَّهَ يَغْفِرْ لَكُمْ، إِنَّهُ هُوَ الغَفُورُ الرَّحِيمُ',
    type: 'sermon'
  },
  {
    // Quran Recitation: Al-Ahzab 33:70
    arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ وَقُولُوا قَوْلًا سَدِيدًا',
    type: 'quran'
  },
  {
    arabic: 'اللَّهُمَّ اغْفِرْ لِلْمُسْلِمِينَ وَالْمُسْلِمَاتِ، الأَحْيَاءِ مِنْهُمْ وَالأَمْوَاتِ',
    type: 'dua'
  }
];

class STTService extends EventEmitter {
  constructor(apiKey, deepgramKey) {
    super();
    const isPlaceholder = (k) => !k || k.includes('your_') || k.includes('placeholder') || k.trim() === '';
    this.deepgramKey = isPlaceholder(deepgramKey || process.env.DEEPGRAM_API_KEY) ? '' : (deepgramKey || process.env.DEEPGRAM_API_KEY);
    this.gladiaKey = isPlaceholder(apiKey || process.env.GLADIA_API_KEY) ? '' : (apiKey || process.env.GLADIA_API_KEY);
    
    this.deepgramWs = null;
    this.gladiaWs = null;
    this.isConnected = false;
    this.simulationInterval = null;
    this.simulationIndex = 0;
  }

  /**
   * Initializes the primary real-time STT engine
   */
  async initSession() {
    if (this.deepgramKey) {
      this.initDeepgramSession();
    } else if (this.gladiaKey) {
      this.initGladiaSession();
    } else {
      console.log('[STT] Operating in simulation & local mic relay mode (real API key not set or is placeholder).');
    }
  }

  /**
   * Deepgram Nova-3 Real-Time Arabic Streaming WebSocket
   */
  initDeepgramSession() {
    try {
      const dgUrl = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=ar&smart_format=true&punctuate=true&interim_results=true';
      console.log('[STT] Connecting to Deepgram Nova-3 Real-Time Arabic Stream...');

      this.deepgramWs = new WebSocket(dgUrl, {
        headers: {
          Authorization: `Token ${this.deepgramKey}`
        }
      });

      this.deepgramWs.on('open', () => {
        console.log('[STT] Deepgram Nova-3 Arabic Live Stream CONNECTED and ready!');
        this.isConnected = true;
      });

      this.deepgramWs.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'Results' && parsed.channel?.alternatives?.[0]) {
            const alt = parsed.channel.alternatives[0];
            const text = alt.transcript ? alt.transcript.trim() : '';
            const isFinal = parsed.is_final || parsed.speech_final || false;

            if (text.length > 0 && isFinal) {
              console.log(`[STT -> Deepgram Nova-3] Transcribed: "${text}"`);
              this.emit('transcript', {
                text,
                isFinal: true,
                confidence: alt.confidence,
                source: 'deepgram'
              });
            }
          }
        } catch (err) {
          console.error('[STT] Error parsing Deepgram message:', err.message);
        }
      });

      this.deepgramWs.on('error', (err) => {
        console.warn('[STT] Deepgram WebSocket error:', err.message);
      });

      this.deepgramWs.on('close', () => {
        console.log('[STT] Deepgram WebSocket closed. Will reconnect when audio arrives.');
        this.isConnected = false;
      });
    } catch (err) {
      console.error('[STT] Deepgram connection failed:', err.message);
    }
  }

  /**
   * Gladia Real-Time WebSocket (Secondary)
   */
  initGladiaSession() {
    try {
      const gladiaUrl = 'wss://api.gladia.io/v2/live';
      this.gladiaWs = new WebSocket(gladiaUrl, {
        headers: {
          'x-gladia-key': this.gladiaKey
        }
      });

      this.gladiaWs.on('open', () => {
        console.log('[STT] Connected to Gladia Realtime API');
        this.isConnected = true;

        const configMsg = {
          type: 'start_session',
          data: {
            encoding: 'wav/pcm',
            sample_rate: 16000,
            bit_depth: 16,
            channels: 1,
            language_config: {
              languages: ['ar'],
              code_switching: true
            }
          }
        };
        this.gladiaWs.send(JSON.stringify(configMsg));
      });

      this.gladiaWs.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'transcript' && parsed.data) {
            const isFinal = parsed.data.is_final || false;
            const text = parsed.data.utterance ? parsed.data.utterance.text : '';
            if (text && text.trim().length > 0) {
              this.emit('transcript', {
                text: text.trim(),
                isFinal,
                source: 'gladia'
              });
            }
          }
        } catch (err) {
          console.error('[STT] Error parsing Gladia message:', err.message);
        }
      });

      this.gladiaWs.on('close', () => {
        this.isConnected = false;
      });
    } catch (err) {
      console.error('[STT] Gladia initialization failed:', err.message);
    }
  }

  /**
   * Forwards live raw audio chunks (PCM / WebM / Opus) from Imam's mic to the active STT engine
   */
  sendAudioChunk(buffer) {
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      this.deepgramWs.send(buffer);
      return;
    } else if (this.deepgramKey && (!this.deepgramWs || this.deepgramWs.readyState === WebSocket.CLOSED)) {
      this.initDeepgramSession();
    }

    if (this.gladiaWs && this.gladiaWs.readyState === WebSocket.OPEN) {
      this.gladiaWs.send(buffer);
    }
  }

  /**
   * Starts simulated khutbah stream (for demos, autonomous tests, or masjids without live audio feed)
   * @param {number} intervalMs - Interval between phrases in ms (default: 4500ms)
   */
  startSimulation(intervalMs = 4500) {
    this.stopSimulation();
    this.simulationIndex = 0;
    console.log('[STT] Starting Realistic Khutbah Audio & Speech Simulation...');

    const emitNext = () => {
      if (this.simulationIndex >= SIMULATED_KHUTBAH_SCRIPT.length) {
        this.simulationIndex = 0; // loop seamlessly for demos
      }

      const item = SIMULATED_KHUTBAH_SCRIPT[this.simulationIndex++];
      this.emit('transcript', {
        text: item.arabic,
        isFinal: true,
        source: 'simulator',
        speechType: item.type
      });
    };

    // Emit first line immediately
    emitNext();
    this.simulationInterval = setInterval(emitNext, intervalMs);
  }

  stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      console.log('[STT] Stopped Khutbah Simulation.');
    }
  }

  destroy() {
    this.stopSimulation();
    if (this.gladiaWs) {
      this.gladiaWs.close();
      this.gladiaWs = null;
    }
  }
}

module.exports = {
  STTService,
  SIMULATED_KHUTBAH_SCRIPT
};
