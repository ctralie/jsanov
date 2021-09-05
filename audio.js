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

/**
 * Convert a list of floating point samples into a mp3 binary
 * @param {array} samples An array of floating points samples in the range [-1, 1]
 * @param {int} sr Sample rate
 * @param {int} kbps Kilobits per second
 * 
 * @return A Uint8Array with the binary data for the mp3 file
 */
function getMP3Binary(samples, sr, kbps) {
  if (kbps === undefined) {
    kbps = 128;
  }
  let samples16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    samples16[i] = Math.round(samples[i]*32767);
  }
  let mp3encoder = new lamejs.Mp3Encoder(1, sr, kbps);
  let part1 = mp3encoder.encodeBuffer(samples16);
  let part2 = mp3encoder.flush(); // End part of mp3
  let res = new Uint8Array(part1.length + part2.length);
  for (let i = 0; i < part1.length; i++) {
    res[i] = part1[i];
  }
  for (let i = 0; i < part2.length; i++) {
    res[part1.length+i] = part2[i];
  }
  return res;
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
   * Create a URL out of the audio samples of wav type and connect
   * it to an HTML5 Audio DOM element
   * @param {DOM Element} audioPlayer DOM element handle to an audio player
   */
  connectAudioPlayer(audioPlayer) {
    let a = new Float32Array(this.samples);
    // get WAV file bytes and audio params of your audio source
    const wavBytes = getWavBytes(a.buffer, {
        isFloat: true,       // floating point or 16-bit integer
        numChannels: 1,
        sampleRate: audio.sr,
    })
    const wav = new Blob([wavBytes], {type: 'audio/wav'});
    audioPlayer.src = window.URL.createObjectURL(wav);
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
   * Set the audio samples based on an array buffer
   * @param {ArrayBuffer} data Array buffer with audio data
   * @returns 
   */
  setSamplesAudioBuffer(data) {
    let that = this;
    return new Promise(resolve => {
      that.audioContext.decodeAudioData(data, function(buff) {
        that.setSamples(buff.getChannelData(0), buff.sampleRate);
        resolve();
      });
    });
  }

  /**
   * Load in the samples from an audio file
   * @param {string} path Path to audio file
   * @returns A promise for when the samples have been loaded and set
   */
  loadFile(path) {
    let that = this;
    return new Promise((resolve, reject) => {
      $.get(path, function(data) {
        that.audioContext.decodeAudioData(data, function(buff) {
          that.setSamples(buff.getChannelData(0), buff.sampleRate);
          resolve();
        });
      }, "arraybuffer")
      .fail(() => {
        reject();
      });
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
    if (useDb === undefined) {
      useDb = false;
    }
    return getSpectrogram(this.samples, win, hop, useDb);
  }

  /**
   * Compute a basic audio novelty function based on a spectrogram
   * @param {int} win Window length (assumed to be even)
   * @param {int} hop Hop length
   
   * @returns A promise that resolves to the {S: spectrogram, novfn:audio novelty function}
   */
  getNovfn(win, hop) {
    return getNovfn(this.samples, win, hop);
  }

  /**
    Implement the superflux audio novelty function, as described in [1]
    [1] "Maximum Filter Vibrato Suppresion for Onset Detection," 
            Sebastian Boeck, Gerhard Widmer, DAFX 2013
   * @param {int} win Window length between frames in the stft
   * @param {int} hop Hop length between frames in the stft
   * @param {int} maxWin Amount by which to apply a maximum filter (default 3)
   * @param {int} mu The gap between windows to compare (default 1)
   * @param {int} Gamma An offset to add to the log spectrogram; log10(|S| + Gamma) (default 10)
   * 
   * @returns A promise that resolves to the {S: spectrogram, novfn:audio novelty function}
   */
  getSuperfluxNovfn(win, hop, maxWin, mu, Gamma) {
    return getSuperfluxNovfn(this.samples, this.sr, win, hop, maxWin, mu, Gamma);
  }

}