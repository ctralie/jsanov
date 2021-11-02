
/**  Online Beat Tracking via Bayes Filtering on Bar/Pointer Model  **/

class OnlineBeat {
  /**
   * Setup a uniform initial probability distribution for online
   * Bayes beat tracking
   * 
   * @param {SampledAudio} audio Audio object that will hold samples
   * @param {int} hop Hop Length
   * @param {int} fac Number of adjacent novelty function samples that are
   *                  averaged together into one novelty step
   * @param {float} lam Lambda for tempo transition at beat boundaries
   *                    (Default 80)
   * @param {int} minBPM Minimum tempo in beats per minute (default 40)
   * @param {int} maxBPM Maximum tempo in beats per minute (default 200)
   * @param {float} gamma Inner transition probability (default 0.03)
   * @returns 
   */
  constructor(audio, hop, fac, lam, minBPM, maxBPM, gamma) {
    this.audio = audio;
    this.hop = hop;
    this.fac = fac;
    if (lam === undefined) {
      lam = 80;
    }
    if (minBPM === undefined) {
      minBPM = 40;
    }
    if (maxBPM === undefined) {
      maxBPM = 200;
    }
    if (gamma === undefined) {
      gamma = 0.03;
    }
    // Step 1: Initialize probability mass function
    const delta = hop*fac/audio.sr;
    let M1 = Math.floor(60/(delta*minBPM));
    let M2 = Math.floor(60/(delta*maxBPM));
    let Ms = [];
    let N = 0;
    for (let M = M2; M <= M1; M++) {
      Ms.push(M);
      N += M;
    }
    let f = [];
    for (let M = M2; M <= M1; M++) {
      let fM = [];
      for (let k = 0; k < M; k++) {
        fM.push(1/N);
      }
      f.push(fM);
    }
    // Step 2: Initialize tempo transition table
    N = M1-M2+1;
    let btrans = [];
    for (let i = 0; i < N; i++) {
      btrans[i] = [];
    }
    for (let i = 0; i < N; i++) {
      for (let j = i; j < N; j++) {
        btrans[i][j] = Math.exp(-lam*Math.abs(Ms[i]/Ms[j] - 1))
        btrans[j][i] = btrans[i][j];
      }
    }
    this.f = f;
    this.Ms = Ms;
    this.btrans = btrans;
    this.maxNov = 150;
    this.phase = 0;
    this.maxEnergy = 1;
    this.energy = 0;
    this.gamma = gamma;
  }

  /**
   * Perform an in-place filtering of beat phase/tempo state probabilities
   * @param {float} nov Novelty function observation to incorporate
   */
  filter(nov) {
    if (nov > this.maxNov) {
      this.maxNov = nov;
    }
    const N = this.Ms.length; // How many discrete tempo levels there are

    // Step 1: Do transition probabilities
    let g = [];
    for (let i = 0; i < N; i++) {
      let gM = this.f[i].slice(0, this.f[i].length-1);
      // Do beat positions
      let bProb = 0;
      for (let j = 0; j < N; j++) {
        bProb += this.btrans[i][j]*this.f[j][this.f[j].length-1];
      }
      gM.unshift(bProb);
      g.push(gM);
    }

    // Step 2: Do measurement probabilities
    let pBeat = nov/this.maxNov;
    let norm = 0;
    let meanPhase = 0;
    for (let i = 0; i < N; i++) {
      // Do non beat positions
      for (let k = 1; k < g[i].length; k++) {
        g[i][k] *= this.gamma;
        norm += g[i][k];
        meanPhase += g[i][k]*(2*Math.abs(0.5-k/g[i].length));
      }
      // Beat position
      g[i][0] *= pBeat;
      norm += g[i][0];
      meanPhase += g[i][0];
    }

    // Step 3: Normalize and save to f
    this.phase = meanPhase/norm;
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < g[i].length; k++) {
        this.f[i][k] = g[i][k]/norm;
      }
    }
  }


  /**
   * @param {string} startButtonStr DOM element name of start button
   * @param {string} stopButtonStr DOM element name of stop button
   * @param {int} win Window length of FFT
   * @param {int} mu The gap between windows to compare (default 1)
   * @param {int} Gamma An offset to add to the log spectrogram; log10(|S| + Gamma) 
   *                    (default 10)
   * @param {function} phaseCallback A function to callback every time a 
   *                                 new phase is available (optional)
  */
  startRecording(startButtonStr, stopButtonStr, win, mu, Gamma, phaseCallback) {
    if (mu === undefined) {
      mu = 3;
    }
    if (Gamma === undefined) {
      Gamma = 1;
    }
    this.maxNov = 150;
    this.maxEnergy = 1;
    this.win = win;
    this.mu = mu;
    this.Gamma = Gamma;
    this.phaseCallback = phaseCallback;
    this.swin = win/2+1;
    this.fft = new FFTJS(win);
    this.M = getMelFilterbank(win, this.audio.sr, 27.5, Math.min(16000, this.audio.sr/2), 138);
    this.S = [];
    this.novfn = [];
    this.audio.startRecordingRealtime(startButtonStr, stopButtonStr, this.hop, this.processChunk.bind(this));
  }

  processChunk() {
    const that = this;
    const audio = this.audio;
    const hop = this.hop;
    const win = this.win;
    const S = this.S;
    if (audio.samples.length >= win) {
      // Do FFT on most recent window length chunk
      let idx = (audio.samples.length-win)/hop;
      let Si = {"finished":false, "vals":[]};
      S[idx] = Si;
      let p = new Promise(function(resolve) {
        // Wait until last frame has finished processing, if there is one,
        // to make sure they come in in order
        if (idx > 0) {
          if (!S[idx-1].finished) {
            S[idx-1].promise.then(finalizeChunk(idx, resolve).bind(that));
          }
          else {
            that.finalizeChunk(idx, resolve);
          }
        }
        else {
          that.finalizeChunk(idx, resolve);
        }
      });
      Si["promise"] = p;
    }
  }

  finalizeChunk(idx, resolve) {
    const mu = this.mu;
    const Gamma = this.Gamma;
    const hop = this.hop;
    const win = this.win;
    const swin = this.swin;
    const novfn = this.novfn;
    const fac = this.fac;
    const S = this.S;
    let x = this.audio.samples.slice(idx*hop, idx*hop+win);
    let s = this.fft.createComplexArray();
    this.fft.realTransform(s, x);
    let Si = new Float32Array(swin);
    let energyChunk = 0;
    for (let k = 0; k < this.swin; k++) {
      let ek = s[k*2]*s[k*2] + s[k*2+1]*s[k*2+1];
      energyChunk += ek;
      Si[k] = Math.log(ek + Gamma);
    }
    if (energyChunk > this.maxEnergy) {
      this.maxEnergy = energyChunk;
    }
    this.energy = energyChunk/this.maxEnergy;
    Si = numeric.dot(Si, this.M);
    this.S[idx].finished = true;
    this.S[idx].vals = Si;
    if (idx > mu) {
      let nov = 0;
      for (let k = 0; k < Si.length; k++) {
        let diff = Si[k] - S[idx-mu].vals[k];
        if (diff > 0) {
          nov += diff;
        }
      }
      novfn.push(nov);
      if (novfn.length > fac && novfn.length%fac == 0) {
        // Time for a new filter
        nov = 0;
        for (let k = 0; k < fac; k++) {
          nov += novfn[novfn.length-fac+k];
        }
        this.filter(nov);
        if (!(this.phaseCallback === undefined)) {
          this.phaseCallback(this.phase);
        }
      }
    }
    resolve();
  }
}