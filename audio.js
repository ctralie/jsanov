/**
 * Convert a note number to a frequency in hz (with 440 A as 0)
 * 
 * @param {int} p Note number 
 */
function noteNum2Freq(p) {
  return 440*Math.pow(2, p/12);
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
    this.audioPromise = null;

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
    this.audioPromise = null;
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
  stopRecording() {
    if (!(this.startButton === null || this.stopButton === null)) {
      const startButton = this.startButton;
      const stopButton = this.stopButton;
      startButton.disabled = false;
      stopButton.disabled = true;
      
      let that = this;
      this.mediaRecorder.stop();
      this.audioPromise = new Promise(resolve => {
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
   * Create an audio object for a set of samples, and overwrite
   * the sample rate to be sr
   * 
   * @param {array} samples List of audio samples
   * @param {int} sr Sample rate
   */
  setSamples(samples, sr) {
    this.audioPromise = null;
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
   */
  getSpectrogram(win, hop) {
    let that = this;
    return new Promise(resolve => {
      function process() {
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
            Si[k] = Math.sqrt(s[k*2]*s[k*2] + s[k*2+1]*s[k*2+1]);
          }
          S.push(Si);
        }
        resolve(S);
      }
      if (!that.audioPromise === null) {
        process();
      }
      else {
        that.audioPromise.then(process);
      }
    });
  }


}