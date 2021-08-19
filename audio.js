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
  stopRecording() {
    if (!(this.startButton === null || this.stopButton === null)) {
      const startButton = this.startButton;
      const stopButton = this.stopButton;
      startButton.disabled = false;
      stopButton.disabled = true;
      
      let that = this;
      this.mediaRecorder.stop();
      this.recorder.then(chunks => {
        that.audioBlob = new Blob(chunks, {type:'audio/mp3'});
        const audioUrl = URL.createObjectURL(audioBlob);
        that.audio = new Audio(audioUrl);
        // Now plot and make reversed audio
        that.audioBlob.arrayBuffer().then(
          buffer => {
            that.audioContext.decodeAudioData(buffer, function(buff) {
              sr = buff.sampleRate;
              that.samples= buff.getChannelData(0);
            });
          }
        );
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

  getSTFT(win, hop) {

  }


}