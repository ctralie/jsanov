// Requires base64-arraybuffer.js and randomstring.js to have been loaded first

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
     */
    constructor (domElement, clientID, redirectURI) {
        this.clientID = clientID;
        this.redirectURI = redirectURI;
        this.accessToken = "";
        let code = findGetParameter("code");
        this.hasCode = false;
        if (code === null) {
            document.cookie = randomstring.generate(128);
        }
        else {
            this.hasCode = true;
            this.tokenPromise = this.makeTokenRequest(code);
            this.tokenLoaded = false;
        }
        this.setupMenu(domElement);
    }

    /**
     * Setup the spotify login button, search bar, and drop down menu
     * for song selection
     * @param {*} domElement 
     */
    setupMenu(domElement) {
        let container = document.getElementById(domElement);
        container.innerHTML = "";
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
        const that;
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
        return new Promise((resolve, reject) => {
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
        });
    }

    populateMenu(response) {

    }

    getSongData(query) {
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
            const url = "https://api.spotify.com/v1/search?query=" + encodeURIComponent(query) + "&offset=0&limit=20&type=track&access_token="+that.accessToken;
            $.ajax({
                url: url,
            }).done(function(response) {
                resolve(response);
            });
        });
    }
}