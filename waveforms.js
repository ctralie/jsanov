function swap(arr, i, j) {
    let temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
}

class Waveform {
    constructor() {
        this.rows = []; // Table rows which hold amplitude slider and removal button
        this.sr = 44100;
        this.noteDict = {};
        this.setupMenu();
    }

    setupMenu() {
        // Step 1: Setup note number chooser
        const noteNumMenu = document.getElementById("NoteNumber");
        const noteTrans = {"A":"Bb", "Bb":"B", "B":"C", "C":"C#", "C#":"D", "D":"Eb", "Eb":"E", "E":"F", "F":"F#", "F#":"G", "G":"G#", "G#":"A"};
        let note = "A";
        for (let p = -36; p < 36; p++) {
            let octave = 4 + Math.floor(p/12);
            //<option value = "ExamplePhotos/awkwafina.jpg">Awkwafina</option>
            let option = document.createElement("Option");
            option.setAttribute("value", p);
            option.innerHTML = note + octave;
            this.noteDict[p] = note + octave;
            noteNumMenu.appendChild(option);
            note = noteTrans[note];
        }
        noteNumMenu.value = 0;
    }
    
    addMenuNote() {
        const noteNumMenu = document.getElementById("NoteNumber");
        const ampSlider = document.getElementById("ampSlider");
        let p = parseInt(noteNumMenu.value);
        let freq = noteNum2Freq(p);
        const freqTable = document.getElementById("freqTable");
        let row = document.createElement("tr");
        // Note name
        let col = document.createElement("td");
        col.innerHTML = this.noteDict[p];
        row.appendChild(col);
        // Note frequency
        col = document.createElement("td");
        col.innerHTML = freq.toFixed(2) + " hz";
        row.appendChild(col);
        // Amplitude slider
        col = document.createElement("td");
        let slider = document.createElement("input");
        slider.setAttribute("class", "slider");
        slider.setAttribute("type", "range");
        slider.setAttribute("min", "0");
        slider.setAttribute("max", "100");
        slider.setAttribute("value", ampSlider.value);
        slider.addEventListener('change', this.plotWaveform.bind(this));
        col.appendChild(slider);
        row.appendChild(col);
        row.idx = this.rows.length;
        // Remove button
        //<button id = "play" onclick="playAudio()">▶️ Play Audio</button>
        let button = document.createElement("button");
        button.innerHTML = "Remove Note";
        button.row = row;
        let that = this;
        button.onclick = function() {
            // Swap this row with the last row
            swap(that.rows, this.row.idx, that.rows.length-1);
            that.rows[this.row.idx].button.row.idx = this.row.idx;
            // Pop back last row
            this.row.remove();
            that.rows.pop();
            that.plotWaveform();
        };
        col = document.createElement("td");
        col.appendChild(button);
        row.appendChild(col);

        freqTable.appendChild(row);
        this.rows.push({"slider":slider, "button":button, "freq":freq, "str":this.noteDict[p]});
        this.plotWaveform();
    }


    /**
     * Make a waveform out of a set of frequency/amplitude pairs
     * @param {int} sr Sample rate
     * @param {int} N Number of samples
     */
    makeWaveform(sr, N) {
        let samples = new Float32Array(N);
        for (let k = 0; k < this.rows.length; k++) {
            const freq = this.rows[k].freq;
            const amp = parseFloat(this.rows[k].slider.value);
            for (let i = 0; i < N; i++) {
                samples[i] += amp*Math.cos(2*Math.PI*freq*i/sr);
            }
        }
        // Normalize audio
        let max = 0;
        for (let i = 0; i < N; i++) {
            max = Math.max(max, Math.abs(samples[i]));
        }
        for (let i = 0; i < N; i++) {
            samples[i] /= max;
        }
        return samples;
    }

    /**
     * Plot a small snippet of the waveform to visualize
     */
    plotWaveform() {
        let samples = this.makeWaveform(this.sr, Math.floor(this.sr/8));
        let xs = [];
        let ys = [];
        for (let i = 0; i < samples.length; i++) {
          xs.push(i/sr);
          ys.push(samples[i]);
        }
        let plot = {x:xs, y:ys}
        let layout = {title:"Audio samples",
                    xaxis:{title:"Time (Seconds)"},
                    autosize: false,
                    width: 800,
                    height: 400};
        Plotly.newPlot("audioPlot", [plot], layout);
      }
}