// Requires base64-arraybuffer.js and randomstring.js to have been loaded first

const SPOTIFY_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Spotify_logo_vertical_black.jpg/1200px-Spotify_logo_vertical_black.jpg";

// https://www.valentinog.com/blog/challenge/
function generateCodeChallenge(codeVerifier) {
    return new Promise(resolve => {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = window.crypto.subtle.digest("SHA-256", data).then(
            digest => {
                const base64Digest = b64arraybuffer.encode(digest);
                // you can extract this replacing code to a function
                resolve(base64Digest
                    .replace(/\+/g, "-")
                    .replace(/\//g, "_")
                    .replace(/=/g, ""));
            }
        );
    });
}

function findGetParameter(parameterName) {
    let result = null,
        tmp = [];
    location.search
        .substr(1)
        .split("&")
        .forEach(function (item) {
            tmp = item.split("=");
            if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
        });
    return result;
}

class Spotify {
    /**
     * 
     * @param {string} domElement The DOM element on which to construct the 
     *                            Spotify login and drop down menus
     * @param {string} clientID Spotify client_id for this app
     * @param {string} redirectURI Where to redirect after login
     * @param {SampledAudio} audio An audio object to which to save the samples
     * @param {function handle} successCallback A callback to call when audio is loaded
     * @param {function handle} failCallback A callback to call when something fails
     *                                       loading the audio 
    */
    constructor (domElement, clientID, redirectURI, audio, successCallback, failCallback) {
        this.domElement = domElement;
        this.clientID = clientID;
        this.redirectURI = redirectURI;
        this.audio = audio;
        this.successCallback = successCallback;
        this.failCallback = failCallback;
        this.accessToken = "";
        let code = findGetParameter("code");
        this.hasCode = false;
        if (code === null) {
            document.cookie = randomstring.generate(128);
            this.setupMenu(domElement);
        }
        else {
            this.hasCode = true;
            this.tokenPromise = this.makeTokenRequest(code);
            this.tokenLoaded = false;
        }
    }

    /**
     * Fill in a menu based on a Spotify track response
     * @param {object} response Spotify track response object
     */
    fillMenuSongResults(response) {
        console.log(response);
        this.songMenu.innerHTML = "";
        let items = response.tracks.items;
        let lineIdx = 1;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // Only add item to menu if there's a 30 second preview
            if ("preview_url" in item && !(item.preview_url === null)) {
                let s = lineIdx + ": ";
                lineIdx++;
                if ("artists" in item) {
                    let sartist = "";
                    for (let k = 0; k < item.artists.length; k++) {
                        const artist = item.artists[k];
                        if ("name" in artist) {
                            sartist += artist.name + ", ";
                        }
                    }
                    s += sartist.slice(0, -2) + " - ";
                }
                if ("name" in item) {
                    s += item.name;
                }
                let option = document.createElement("option");
                option.innerHTML = s;
                option.setAttribute("value", item.preview_url);
                console.log(item);
                console.log(item.preview_url);
                this.songMenu.appendChild(option);
            }
        }
    }

    /**
     * Setup the spotify login button, search bar, and drop down menu
     * for song selection
     */
    setupMenu() {
        const that = this;
        let logo = document.createElement("img");
        logo.src = SPOTIFY_LOGO_URL;
        logo.width = 50;
        let container = document.getElementById(this.domElement);
        if (this.hasCode) {
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
            this.trackInput.setAttribute("placeholder", "Enter spotify search");
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
        else {
            let loginButton = document.createElement("button");
            loginButton.appendChild(logo);
            loginButton.style = "width:50px;height:60px;padding:0px";
            loginButton.onclick = this.login.bind(this);
            container.appendChild(loginButton);
        }
    }

    /**
     * Make the code request for a login
     * @param {string} base64Digest Encoded code test
     */
    makeCodeRequest(base64Digest) {
        const url = "https://accounts.spotify.com/authorize?"
        + "client_id=" + this.clientID
        + "&response_type=code&code_challenge_method=S256&code_challenge=" + base64Digest
            +"&redirect_uri="+encodeURIComponent(redirectURI)
            +"&scope=" + encodeURIComponent(' ');
        document.location.href = url; // Redirect to login URL
    }

    /**
     * Log into Spotify
     */
    login() {
        const that = this;
        generateCodeChallenge(document.cookie).then(base64Digest => {
            that.makeCodeRequest(base64Digest);
        });
    }

    /**
     * Make a request for a temporary access token after a user has logged in
     * @param {string} code Code returned from login
     * @returns A promise.  When this promise resolves, the accessToken field
     *          of this object will contain the access code
     */
    makeTokenRequest(code) {
        const that = this;
        new Promise((resolve, reject) => {
            let data = {
                client_id: that.clientID,
                grant_type: "authorization_code",
                code: code,
                redirect_uri: that.redirectURI,
                code_verifier: document.cookie
            }
            let Url = "https://accounts.spotify.com/api/token"
            function parseResp(e) {
                let resp = JSON.parse(e.responseText);
                if ("access_token" in resp) {
                    that.accessToken = resp.access_token;
                    that.tokenLoaded = true;
                    resolve();
                }
                else {
                    reject(e.responseText);
                }
            }
            $.ajax({
                url: Url,
                type: "POST",
                dataType: "application/x-www-form-urlencoded",
                data: data,
                success: parseResp,
                error: parseResp
            })
        // Once token has been obtained we can show spotify stuff to the user
        }).then(this.setupMenu.bind(this)); 
    }

    /**
     * Make a request for a list of tracks
     * @param {string} query Search query
     * @param {int} limit How many tracks to return (default 100)
     * @returns A promise that resolves to the response of this request
     */
    getSongData(query, limit) {
        if (limit === undefined) {
            limit = 20;
        }
        const that = this;
        return new Promise(resolve => {
            if (!that.tokenLoaded) {
                if (!that.hasCode) {
                    alert("Need to login to spotify first!");
                }
                else {
                    that.tokenPromise.then(function() {
                        // Chain through response promise if we need to 
                        // retry once the token's ready
                        that.getSongData(query).then(response => {
                            resolve(response);
                        })
                    });
                }
            }
            const url = "https://api.spotify.com/v1/search?query=" + encodeURIComponent(query) + "&offset=0&limit="+limit+"&type=track";
            $.ajax({
                url: url,
                type:"get",
                dataType: "json",
                headers:{"Authorization":"Bearer " + that.accessToken}
            }).done(function(response) {
                resolve(response);
            });
        });
    }
}