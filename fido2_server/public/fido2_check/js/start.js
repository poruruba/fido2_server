'use strict';

//const vConsole = new VConsole();
//window.datgui = new dat.GUI();

const base_url = "https://【FIDOサーバのホスト名】";

var vue_options = {
    el: "#top",
    mixins: [mixins_bootstrap],
    data: {
        message: "",
        username: 'test',
        attestation: null,
        attestation_encode: {
            user: {}
        },
        pubkey: {},
        clientData: {},
        attestationObject: {},
        x5c: [],
        registered: false,
    },
    computed: {
    },
    methods: {
        start_register: function () {
            this.registered = false;
            var param = {
                username: this.username
            };
            this.progress_open();
            do_post(base_url + '/attestation/options', param)
                .then(json => {
                    this.progress_close();
                    console.log(json);
                    if (json.status != 'ok') {
                        alert(json.message);
                        return;
                    }

                    this.attestation_encode.challenge = json.challenge;
                    this.attestation_encode.user.id = json.user.id;

                    json.challenge = base64url.decode(json.challenge);
                    json.user.id = base64url.decode(json.user.id);

                    this.attestation = json;
                    this.message = '登録の準備ができました。';
                })
                .catch(error => {
                    this.progress_close();
                    alert(error);
                });
        },
        do_register: function () {
            return navigator.credentials.create({ publicKey: this.attestation })
                .then(async response => {
                    console.log(response);
                    this.pubkey = publicKeyCredentialToJSON(response);

                    this.clientData = JSON.parse(arrayBufferToStr(response.response.clientDataJSON));
                    this.attestationObject = CBOR.decode(response.response.attestationObject);
                    this.x5c = [];
                    for (var i = 0; i < this.attestationObject.attStmt.x5c.length ; i++ ){
                        var x509 = new X509();
                        x509.readCertHex(this.ba2hex(this.attestationObject.attStmt.x5c[i]));
                        var x509params = x509.getParam();
                        console.log(x509params);
                        this.x5c.push({ x509: x509, params: x509params });
                    }

                    this.registered = true;
                    this.message = 'デバイス情報を取得しました。';
                })
                .catch(error => {
                    this.progress_close();
                    alert(error);
                });
        },
        x509_save: function (x509) {
            var blob = new Blob([new Uint8Array(this.hex2ba(x509.hex))], { type: "octet/stream" });
            var url = window.URL.createObjectURL(blob);

            var a = document.createElement("a");
            a.href = url;
            a.target = '_blank';
            a.download = "x509.der";
            a.click();
            window.URL.revokeObjectURL(url);
        },
        pubkey_save: function (text) {
            var blob = new Blob([text], { type: "text/plan" });
            var url = window.URL.createObjectURL(blob);

            var a = document.createElement("a");
            a.href = url;
            a.target = '_blank';
            a.download = "pubkey.pem";
            a.click();
            window.URL.revokeObjectURL(url);
        }
    },
    created: function(){
    },
    mounted: function(){
        proc_load();
    }
};
vue_add_data(vue_options, { progress_title: '' }); // for progress-dialog
vue_add_global_components(components_bootstrap);
vue_add_global_components(components_utils);

/* add additional components */
  
window.vue = new Vue( vue_options );

function do_post(url, body) {
    //    const headers = new Headers( { "Content-Type" : "application/json; charset=utf-8" } );
    const headers = new Headers({ "Content-Type": "application/json" });

    return fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(body),
        headers: headers
    })
        .then((response) => {
            if (!response.ok)
                throw 'status is not 200.';
            return response.json();
        });
}

function publicKeyCredentialToJSON(pubKeyCred) {
    if (pubKeyCred instanceof Array) {
        let arr = [];
        for (let i of pubKeyCred)
            arr.push(publicKeyCredentialToJSON(i));

        return arr
    }

    if (pubKeyCred instanceof ArrayBuffer) {
        return base64url.encode(pubKeyCred)
    }

    if (pubKeyCred instanceof Object) {
        let obj = {};

        for (let key in pubKeyCred) {
            obj[key] = publicKeyCredentialToJSON(pubKeyCred[key]);
        }

        return obj
    }

    return pubKeyCred
}

function arrayBufferToStr(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}
