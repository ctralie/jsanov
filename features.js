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
 * Compute the Hann window
 * @param {int} N Length of window
 * @returns Array with window
 */
function hannWindow(N) {
  let window = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    window[i] = 0.5*(1 - Math.cos(2*Math.PI*i/N));
  }
  return window;
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
 * Compute the power in each window, appealing to Parseval's theorem
 * by summing the square of every element
 * @param {2D Array} S Magnitude spectrogram with N windows
 * 
 * @return An array with N power samples
 */
function getSpectrogramPower(S) {
  const N = S.length;
  let res = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let power = 0;
    for (let k = 0; k < S[i].length; k++) {
      power += S[i][k]*S[i][k];
    }
    res[i] = power;
  }
  return res
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
 * Fast autocorrelation based on the Wiener-Khinchin Theorem, which allows us
 * to use the fast fourier transform of the input to compute the autocorrelation
 * @param {array} x A time series
 */
function autocorr(x) {
  let pad = x.length*2;
  const N = Math.pow(2, Math.ceil(Math.log2(pad)));
  let xpad = new Float32Array(N);
  for (let i = 0; i < x.length; i++) {
    xpad[i] = x[i];
  }
  const fft = new FFTJS(N);
  xpad = fft.toComplexArray(xpad);
  let s = fft.createComplexArray();
  fft.transform(s, xpad);
  for (let i = 0; i < s.length; i += 2) {
    s[i] = s[i]*s[i] + s[i+1]*s[i+1];
    s[i+1] = 0;
  }
  let sinv = fft.createComplexArray();
  fft.inverseTransform(sinv, s);
  let res = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    res[i] = sinv[i*2];
  }
  return res;
}


/**
 *  Compute the DFT, resampled to coincide with the samples in 
 *  the autocorrelation
 * @param {array} x Signal on which to compute the warped DFT
 */
function getDFTWarped(x) {
  const N = x.length;
  const fft = new FFTJS(N);
  let s = fft.createComplexArray();
  fft.realTransform(s, x);
  let f = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    f[i] = Math.sqrt(s[i*2]*s[i*2] + s[i*2+1]*s[i*2+1]);
  }
  let ret = new Float32Array(N);
  ret[0] = 0;
  for (let T = 2; T < N; T++) {
    const fT = N/T;
    const i1 = Math.floor(fT)
    const i2 = Math.ceil(fT)
    const t = fT - i1
    ret[T] = t*f[i2] + (1-t)*f[i1];
  }
  return ret;
}

/**
 *  Estimate the tempo, in bpm, based on a combination of a warped
 *  DFT and the autocorrelation of a novelty function, as described in 
 *  section 3.1.1 of [1]
 *  [1] "Template-Based Estimation of Time-Varying Tempo." Geoffroy Peeters.
 *          EURASIP Journal on Advances in Signal Processing
 * @param {array} novfn The novelty function (length N)
 * @param {int} hop Hop length, in audio samples, between the samples in the audio
 *                  novelty function
 * @param {int} sr Sample rate of the audio
 * @param {float} maxPossible Max possible tempo, in bpm
 * 
 * @return {
 *  'strength': An array (length N) of the product of the ACF and warped DFT,
 *  'bpm': An array (length N) of corresponding beats per minute,
 *  'maxBpm': The maximum likelihood tempo, in beats per minute
 * }
 */
function getACDFDFTTempo(novfn, hop, sr, maxPossible) {
  if (maxPossible === undefined) {
    maxPossible = 400;
  }
  // Compute max to normalize to prevent overflow
  let maxnov = 0;
  for (let i = 0; i < novfn.length; i++) {
    if (novfn[i] > maxnov) {
      maxnov = novfn[i];
    } 
  }
  let novnorm = new Float32Array(novfn.length);
  // Compute mean
  let mean = 0;
  for (let i = 0; i < novfn.length; i++) {
    novnorm[i] = novfn[i] / maxnov;
    mean += novnorm[i];
  }
  mean /= novfn.length;
  const N = Math.pow(2, Math.ceil(Math.log2(novfn.length)));
  let y = new Float32Array(N);
  for (let i = 0; i < novfn.length; i++) {
    y[i] = novnorm[i];
  }
  let r = autocorr(y);
  for (let i = 0; i < novfn.length; i++) {
    y[i] -= mean;
  }
  let f = getDFTWarped(y);
  let strength = new Float32Array(N);
  let bpm = new Float32Array(N);
  let maxIdx = 0;
  for (let i = 0; i < N; i++) {
    if (i > 0) {
      bpm[i] = sr*60/(i*hop);
      if (bpm[i] < maxPossible) {
        strength[i] = r[i]*f[i];
        if (strength[i] > strength[maxIdx]) {
          maxIdx = i;
        }
      }
      else {
        strength[i] = 0;
      }
    }
  }
  const maxBpm = bpm[maxIdx];
  strength.reverse();
  bpm.reverse();
  return {"strength":strength, "bpm":bpm, "maxBpm":maxBpm};
}

/**
 * Return the k highest tempos
 * @param {array} bpm Beats per minute
 * @param {array} strength Beat strength
 * @param {int} K Number of tempos to take
 */
function getKHighestTempos(bpm, strength, K) {
  let revargsort = arr => arr.map((v, i) => [v, i]).
                          sort(function(a, b){return b[0]-a[0]})
                          .map(a => a[1]);
  // Need to convert to regular array from typed array to apply function
  // array mapping
  let order = revargsort(Array.from(strength, (x) => parseFloat(x))); 
  let tempos = [];
  let maxIdx = 0;
  for (let i = 0; i < strength.length; i++) {
    if (strength[i] > strength[maxIdx]) {
      maxIdx = i;
    }
  }
  for (let i = 0; i < K; i++) {
    tempos[i] = bpm[order[i]];
  }
  return tempos;
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
    if (weight > 0) {
      centroid[i] = sum/weight;
    }
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