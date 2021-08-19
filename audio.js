/**
 * Convert a note number to a frequency in hz (with 440 A as 0)
 * 
 * @param {int} p Note number 
 */
function noteNum2Freq(p) {
  return 440*Math.pow(2, p/12);
}

/**
 * 
 * @param {int} win Window length
 * @param {int} sr The sample rate, in hz 
 * @param {float} minFreq The center of the minimum mel bin, in hz 
 * @param {float} maxFreq The center of the maximum mel bin, in hz
 * @param {int} nBins The number of mel bins to use
 * 
 * @return A (N/2+1) x nBins array with the triangular mel filterbank
 */
function getMelFilterbank(win, sr, minFreq, maxFreq, nBins) {
    K = win/2+1;
    /*
    bins = np.logspace(np.log10(min_freq), np.log10(max_freq), n_bins+2)*win_length/sr
    bins = np.array(np.round(bins), dtype=int)
    Mel = np.zeros((n_bins, K))
    for i in range(n_bins):
        i1 = bins[i]
        i2 = bins[i+1]
        if i1 == i2:
            i2 += 1
        i3 = bins[i+2]
        if i3 <= i2:
            i3 = i2+1
        tri = np.zeros(K)
        tri[i1:i2] = np.linspace(0, 1, i2-i1)
        tri[i2:i3] = np.linspace(1, 0, i3-i2)
        Mel[i, :] = tri
    return Mel
    */
}

/**
 * Download audio samples as a wave file
 * @param {array} samples Array of audio samples
 * @param {int} sr Sample rate
 */
function downloadSamples(samples, sr) {
    let audio = new Float32Array(samples);
    // get WAV file bytes and audio params of your audio source
    const wavBytes = getWavBytes(audio.buffer, {
      isFloat: true,       // floating point or 16-bit integer
      numChannels: 1,
      sampleRate: sr,
    })
    const wav = new Blob([wavBytes], {type: 'audio/wav'});
    // Create download link and append to DOM
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(wav);
    a.style.display = 'none';
    a.download = 'audio.wav';
    document.body.appendChild(a);
    a.click();
}


class SampledAudio {
  constructor() {
    this.mediaRecorder = null;
    this.audio = null;
    this.recorder = null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();

    this.audioBlob = null;
    this.samples = [];
    this.sr = 44100;

    // Handles for stop/start buttons
    this.startButton = null;
    this.stopButton = null;
  }

  /**
   * 
   * @param {string} startButtonStr DOM element name of start button
   * @param {string} stopButtonStr DOM element name of stop button
   */
  startRecording(startButtonStr, stopButtonStr) {
    let that = this;
    this.recorder = new Promise(resolve => {
      this.startButton = document.getElementById(startButtonStr);
      this.stopButton = document.getElementById(stopButtonStr);
      const startButton = this.startButton;
      const stopButton = this.stopButton;
      startButton.disabled = true;
      stopButton.disabled = false;
      let chunks = [];
    
      navigator.mediaDevices.getUserMedia({ audio: true }).then(
        function(stream) {
          that.mediaRecorder = new MediaRecorder(stream);
          that.mediaRecorder.addEventListener("dataavailable", event => {
            chunks.push(event.data);
          });
          that.mediaRecorder.addEventListener("stop", () => {
            resolve(chunks);
          })
          that.mediaRecorder.start();
        }
      );
    })
  }

  /**
   * Stop recording and set the samples
   * @returns A promise for when the samples have been set
   */
  stopRecording() {
    if (!(this.startButton === null || this.stopButton === null)) {
      const startButton = this.startButton;
      const stopButton = this.stopButton;
      startButton.disabled = false;
      stopButton.disabled = true;
      
      let that = this;
      this.mediaRecorder.stop();
      return new Promise(resolve => {
        that.recorder.then(chunks => {
          that.audioBlob = new Blob(chunks, {type:'audio/mp3'});
          const audioUrl = URL.createObjectURL(that.audioBlob);
          that.audio = new Audio(audioUrl);
          that.audioBlob.arrayBuffer().then(
            buffer => {
              that.audioContext.decodeAudioData(buffer, function(buff) {
                that.sr = buff.sampleRate;
                that.samples= buff.getChannelData(0);
                resolve();
              });
            }
          );
        });
      });
    }
  }

  /**
   * Load in the samples from an audio file
   * @param {string} path Path to audio file
   * @returns A promise for when the samples have been loaded and set
   */
  loadFile(path) {
    let that = this;
    return new Promise(resolve => {
      $.get(path, function(data) {
        that.audioContext.decodeAudioData(data, function(buff) {
          that.setSamples(buff.getChannelData(0), buff.sampleRate);
          resolve();
        });
      }, "arraybuffer");
    });
  }

  /**
   * Create an audio object for a set of samples, and overwrite
   * the sample rate to be sr
   * 
   * @param {array} samples List of audio samples
   * @param {int} sr Sample rate
   */
  setSamples(samples, sr) {
    this.samples = samples;
    this.sr = sr;
    let audio = new Float32Array(samples);
    const wavBytes = getWavBytes(audio.buffer, {
      isFloat: true,       // floating point or 16-bit integer
      numChannels: 1,
      sampleRate: this.sr,
    })
    this.audioBlob = new Blob([wavBytes], {type: 'audio/wav'});
    const audioUrl = URL.createObjectURL(this.audioBlob);
    this.audio = new Audio(audioUrl);
  }

  /**
   * Play the audio
   */
  playAudio() {
    this.audio.play();
  }

  /**
   * Download the audio as a WAV
   */
  downloadAudio() {
    downloadSamples(this.samples, this.sr);
  }

  /**
   * Plot the audio waveform using plotly
   * 
   * @param {string} plotName name of plotting element
   */
  plotAudio(plotName) {
    let xs = [];
    let ys = [];
    for (let i = 0; i < this.samples.length; i++) {
      xs.push(i/sr);
      ys.push(this.samples[i]);
    }
    let plot = {x:xs, y:ys}
    let layout = {title:"Audio samples",
                  xaxis:{title:"Time (Seconds)"},
                  autosize: false,
                  width: 800,
                  height: 400};
    Plotly.newPlot(plotName, [plot], layout);
  }

  /**
   * Compute the spectrogram for the current audio samples
   * @param {int} win Window length (assumed to be even)
   * @param {int} hop Hop length
   * @param {boolean} useDb If true, use dB.  If false, use amplitude
   * @returns Promise that resolves to the spectrogram
   */
  getSpectrogram(win, hop, useDb) {
    let that = this;
    if (useDb === undefined) {
      useDb = false;
    }
    return new Promise(resolve => {
      let swin = win/2+1;
      const fft = new FFTJS(win);
      let W = Math.floor(1+(that.samples.length-win)/hop);
      let S = [];
      for (let i = 0; i < W; i++) {
        let x = that.samples.slice(i*hop, i*hop+win);
        let s = fft.createComplexArray();
        fft.realTransform(s, x);
        let Si = new Float32Array(swin);
        for (let k = 0; k < swin; k++) {
          Si[k] = s[k*2]*s[k*2] + s[k*2+1]*s[k*2+1];
          if (useDb) {
            Si[k] = 10*Math.log10(Si[k]);
          }
          else {
            Si[k] = Math.sqrt(Si[k]);
          }
        }
        S.push(Si);
      }
      resolve(S);
    });
  }

  /**
   * Compute a basic audio novelty function based on a spectrogram
   * @param {int} win Window length (assumed to be even)
   * @param {int} hop Hop length
   * @returns Promise that resolves to the audio novelty function
   */
  getNovfn(win, hop) {
    return new Promise(resolve => {
      this.getSpectrogram(win, hop, true).then(Sdb => {
        let novfn = new Float32Array(Sdb.length-1);
        for (let i = 0; i < novfn.length; i++) {
          for (let k = 0; k < Sdb[i].length; k++) {
            let diff = Sdb[i+1][k] - Sdb[i][k];
            if (diff > 0) {
              novfn[i] += diff;
            }
          }
        }
        resolve(novfn);
      });
    });
  }

}