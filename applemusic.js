// Requires base64-arraybuffer.js and randomstring.js to have been loaded first

var APPLE_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/2/2a/Apple_Music_logo.svg";
const APPLE_SEARCH_URL = "https://itunes.apple.com/search?term=";

let globalAppleResolve = null;

function globalAppleProcessCallback(response) {
    globalAppleResolve(response);
}

class AppleMusic {
    /**
     * 
     * @param {string} domElement The DOM element on which to construct the drop down menus
     * @param {SampledAudio} audio An audio object to which to save the samples
     * @param {function handle} successCallback A callback to call when audio is loaded
     * @param {function handle} failCallback A callback to call when something fails
     *                                       loading the audio 
    */
    constructor (domElement, audio, successCallback, failCallback) {
        this.domElement = domElement;
        this.audio = audio;
        this.successCallback = successCallback;
        this.failCallback = failCallback;
        this.setupMenu(domElement);
    }

    /**
     * Fill in a menu based on an Apple Music track response
     * @param {object} response Apple Music track response object
     */
    fillMenuSongResults(response) {
        console.log(response);
        this.songMenu.innerHTML = "";
        let items = response.results;
        let lineIdx = 1;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // Only add item to menu if there's a 30 second preview
            if ("previewUrl" in item && !(item.previewUrl === null)) {
                let s = lineIdx + ": ";
                lineIdx++;
                if ("artistName" in item) {
                    s += item.artistName + " - ";
                }
                if ("trackName" in item) {
                    s += item.trackName;
                }
                let option = document.createElement("option");
                option.innerHTML = s;
                option.setAttribute("value", item.previewUrl);
                if ("artworkUrl30" in item) {
                    option.setAttribute("data-thumbnail", item.artworkUrl30); 
                }
                this.songMenu.appendChild(option);
            }
        }
    }

    /**
     * Setup the search bar and drop down menu for song selection
     */
    setupMenu() {
        const that = this;
        let logo = document.createElement("img");
        logo.src = APPLE_LOGO_URL;
        logo.width = 50;
        let container = document.getElementById(this.domElement);

        let table = document.createElement("table");
        let tr1 = document.createElement("tr");
        let tr2 = document.createElement("tr");
        let td = document.createElement("td");
        td.appendChild(logo);
        tr1.appendChild(td);
        tr2.appendChild(document.createElement("td"));
        // Setup typing area
        td = document.createElement("td");
        this.trackInput = document.createElement("input");
        this.trackInput.setAttribute("type", "text");
        this.trackInput.setAttribute("placeholder", "Enter Apple music search");
        td.appendChild(this.trackInput);
        tr1.appendChild(td);
        td = document.createElement("td");
        let searchButton = document.createElement("button");
        searchButton.innerHTML = "Search";
        searchButton.onclick = function() {
            that.getSongData(that.trackInput.value).then(response => {
                that.fillMenuSongResults(response);
            });
        }
        td.appendChild(searchButton);
        tr2.appendChild(td);

        // Setup song selection menu
        td = document.createElement("td");
        const songMenuWrapper = document.createElement("div");
        songMenuWrapper.setAttribute("class", "select-wrapper");
        this.songMenu = document.createElement("select");
        songMenuWrapper.appendChild(this.songMenu);
        td.appendChild(songMenuWrapper);
        tr1.appendChild(td);
        td = document.createElement("td");
        let loadButton = document.createElement("button");
        loadButton.innerHTML = "Load Tune";
        loadButton.onclick = function() {
            console.log(that.songMenu);
            that.audio.loadFile(that.songMenu.value).then(function() {
                that.successCallback(that.audio);
            }).catch(function() {
                that.failCallback();
            })
        }
        td.appendChild(loadButton);
        tr2.appendChild(td);
        table.appendChild(tr1);
        table.appendChild(tr2);
        container.appendChild(table);
    }

    /**
     * Make a request for a list of tracks
     * @param {string} query Search query
     * @returns A promise that resolves to the response of this request
     */
    getSongData(query) {
        return new Promise(resolve => {
            let s = document.createElement("script");
            s.src = APPLE_SEARCH_URL + encodeURIComponent(query) + "&callback=globalAppleProcessCallback";
            document.body.appendChild(s);
            globalAppleResolve = resolve; // A hack to get callback to work
        });
    }
}