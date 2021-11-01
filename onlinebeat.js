
/**  Online Beat Tracking via Bayes Filtering on Bar/Pointer Model  **/

class OnlineBeat {
  /**
   * Setup a uniform initial probability distribution for online
   * Bayes beat tracking
   * 
   * @param {SampledAudio} audio Audio object that will hold samples
   * @param {int} hop Hop Length
   * @param {int} fac Downsampling factor
   * @param {float} lam Lambda for tempo transition at beat boundaries
   *                    (Default 80)
   * @param {int} minBPM Minimum tempo in beats per minute (default 40)
   * @param {int} maxBPM Maximum tempo in beats per minute (default 200)
   * @param {float} gamma Inner transition probability (default 0.03)
   * @returns 
   */
  constructor(audio, hop, fac, lam, minBPM, maxBPM, gamma) {
    this.audio = audio;
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
    this.max = 150;
    this.phase = 0;
    this.gamma = gamma;
  }

  /**
   * Perform an in-place filtering of beat phase/tempo state probabilities
   */
  filter(nov) {
    if (nov > this.max) {
      this.max = nov;
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
    let pBeat = nov/this.max;
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

}


