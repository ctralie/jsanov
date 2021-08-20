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
    // Step 1: Compute mel-spaced bin locations
    let a = Math.exp(Math.log(maxFreq/minFreq)/(nBins+1));
    let bins = [minFreq*win/sr];
    for (let i = 1; i < nBins+2; i++) {
      bins[i] = bins[i-1]*a;
    }
    for (let i = 0; i < nBins+2; i++) {
      bins[i] = Math.round(bins[i]);
    }
    // Step 2: Compute each row of the mel filterbank
    // Allocate filterbank first
    let Mel = [];
    for (let i = 0; i < K; i++) {
      Mel.push(new Float32Array(nBins));
    }
    // Now fill it in
    for (let i = 0; i < nBins; i++) {
      let i1 = bins[i];
      let i2 = bins[i+1];
      if (i1 == i2) {
        i2++;
      }
      let i3 = bins[i+2];
      if (i3 <= i2) {
        i3 = i2 + 1;
      }
      let m = 1/(i2-i1);
      for (let k = i1; k < i2; k++) {
        Mel[k][i] = m*(k-i1);
      }
      m = -1/(i3-i2);
      for (let k = i2; k < i3; k++) {
        Mel[k][i] = 1 + m*(k-i2);
      }
    }
    return Mel;
}

/**
 * Compute the spectrogram of a set of audio samples
 * @param {array} samples Audio samples
 * @param {int} win Window length
 * @param {int} hop hop length
 * @param {boolean} useDb Whether to use dB
 * @returns promise that resolves to the specgrogram
 */
function getSpectrogram(samples, win, hop, useDb) {
  return new Promise(resolve => {
    let swin = win/2+1;
    const fft = new FFTJS(win);
    let W = Math.floor(1+(samples.length-win)/hop);
    let S = [];
    for (let i = 0; i < W; i++) {
      let x = samples.slice(i*hop, i*hop+win);
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
 * Compute a naive audio novelty function of a set of audio samples
 * @param {array} samples Audio samples
 * @param {int} win Window length
 * @param {int} hop hop length
 * @param {boolean} useDb Whether to use dB
 * @returns A promise that resolves to the {S: spectrogram, novfn:audio novelty function}
 */
function getNovfn(samples, win, hop) {
  return new Promise(resolve => {
    getSpectrogram(samples, win, hop, true).then(Sdb => {
      let novfn = new Float32Array(Sdb.length-1);
      for (let i = 0; i < novfn.length; i++) {
        for (let k = 0; k < Sdb[i].length; k++) {
          let diff = Sdb[i+1][k] - Sdb[i][k];
          if (diff > 0) {
            novfn[i] += diff;
          }
        }
      }
      resolve({S:S, novfn:novfn});
    });
  });
}

/**
  Implement the superflux audio novelty function, as described in [1]
  [1] "Maximum Filter Vibrato Suppresion for Onset Detection," 
          Sebastian Boeck, Gerhard Widmer, DAFX 2013
 * @param {array} samples Audio samples
 * @param {int} sr Audio sample rate
 * @param {int} win Window length between frames in the stft
 * @param {int} hop Hop length between frames in the stft
 * @param {int} maxWin Amount by which to apply a maximum filter (default 3)
 * @param {int} mu The gap between windows to compare (default 1)
 * @param {int} Gamma An offset to add to the log spectrogram; log10(|S| + Gamma) (default 10)
 * @returns A promise that resolves to the {S: spectrogram, novfn:audio novelty function}
 */
function getSuperfluxNovfn(samples, sr, win, hop, maxWin, mu, Gamma) {
  if (maxWin === undefined) {
    maxWin = 1;
  }
  if (mu === undefined) {
    mu = 3;
  }
  if (Gamma === undefined) {
    Gamma = 1;
  }
  return new Promise(resolve => {
    getSpectrogram(samples, win, hop, false).then(S => {
      let M = getMelFilterbank(win, sr, 27.5, Math.min(16000, sr/2), 138);
      S = numeric.dot(S, M);
      for (let i = 0; i < S.length; i++) {
        for (let j = 0; j < S[i].length; j++) {
          S[i][j] = Math.log10(S[i][j] + Gamma);
        }
      }
      let novfn = new Float32Array(S.length-mu);
      for (let i = 0; i < novfn.length; i++) {
        for (let k = 0; k < S[i].length; k++) {
          let diff = S[i+mu][k] - S[i][k];
          if (diff > 0) {
            novfn[i] += diff;
          }
        }
      }
      resolve({S:S, novfn:novfn});
    });
  });
}


/**
 * An implementation of dynamic programming beat tracking
 * @param {array} novfn An audio novelty function
 * @param {int} sr Sample rate
 * @param {int} hop Hop length used in the STFT to construct novfn
 * @param {float} tempo The estimated tempo, in beats per minute
 * @param {float} alpha The penalty for tempo deviation
 * 
 * @returns Beat locations, in units of hop length, of each beat
 */
function getBeats(novfn, sr, hop, tempo, alpha) {
    let N = novfn.length;
    let backlink = new Int32Array(N);
    let cscore = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      cscore[i] = novfn[i];
    }
    let period = Math.floor((60*sr/hop)/tempo);
    let i1 = Math.floor(-2*period);
    let i2 = Math.floor(-period/2);
    let txcost = new Float32Array(i2-i1+1);
    for (let i = 0; i < i2-i1+1; i++) {
      txcost[i] = -alpha*Math.pow(Math.log(-(i1+i)/period), 2);
    }
    let scorecands = new Float32Array(txcost.length);
    // prange = np.arange(i1, i2+1)
    let idxcscore = 0;
    for (let i = -i1+1; i < N; i++) {
      //timerange = i + prange
      // Search over all possible predecessors and
      // apply transition weighting
      let idx = 0;
      for (let k = 0; k < scorecands.length; k++) {
        scorecands[k] = txcost[k] + cscore[i1+i+k];
        // Find the best predecessor beat
        if (scorecands[k] > scorecands[idx]) {
          idx = k;
        }
      }
      // Add on local score
      cscore[i] = scorecands[idx] + novfn[i];
      // Store backtrace
      backlink[i] = i + i1 + idx;
      // Compute best cumulative score
      if (cscore[i] > cscore[idxcscore]) {
        idxcscore = i;
      }
    }
    // Start backtrace from best cumulative score
    beats = [idxcscore];
    while (backlink[beats[beats.length-1]] != beats[beats.length-1]) {
      beats.push(backlink[beats[beats.length-1]]);
    }
    beats.reverse();
    return beats;
}

/**
 * Convert beats into a triangle function
 * @param {array} novfn Novelty function, in intervals of hop length
 * @param {array} beats Beat locations, in units of hop length, of each beat
 */
function getRampBeats(novfn, beats) {
  let ret = new Float32Array(novfn.length);
  for (let i = 0; i < beats.length-1; i++) {
    let i1 = beats[i];
    let i2 = beats[i+1];
    for (let k = i1; k < i2; k++) {
      ret[k] = 1-2*Math.min(k-i1, i2-k)/(i2-i1);
    }
  }
  return ret;
}

/**
 * Compute the spectral centroid of each frame of a spectrogram
 * @param {2D Array} S Magnitude spectrogram
 */
function getSpectralCentroid(S) {
  let centroid = new Float32Array(S.length);
  for (let i = 0; i < S.length; i++) {
    let weight = 0;
    let sum = 0;
    for (let j = 0; j < S[i].length; j++) {
      sum += j*S[i][j];
      weight += S[i][j];
    }
    centroid[i] = sum/weight;
  }
  return centroid;
}

/**
 * Compute the spectral roloff of each frame of a spectrogram
 * @param {2D Array} S Magnitude spectrogram
 */
 function getSpectralRoloff(S) {
  let roloff = new Float32Array(S.length);
  for (let i = 0; i < S.length; i++) {
    let totalMag = 0;
    for (let j = 0; j < S[i].length; j++) {
      totalMag += S[i][j];
    }
    let mag = 0;
    for (let j = 0; j < S[i].length; j++) {
      let nextMag = mag + S[i][j];
      if (mag < 0.85*totalMag && nextMag >= 0.85*totalMag) {
        roloff[i] = j;
        break;
      }
      mag = nextMag;
    }
  }
  return roloff;
}