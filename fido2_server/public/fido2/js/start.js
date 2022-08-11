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
        register_credId: null,
        register_counter: -1,
        registered: false,
        assertion: null,
        assertion_encode: {
            allowCredentials: []
        },
        login_credId: null,
        login_counter: -1,
        logined: false,

        pubkey: {},
        clientData: {},
        attestationObject: {},
        x5c: [],        

        pubkey2: {},
        clientData2: {},
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
                .then(response => {
                    this.pubkey = publicKeyCredentialToJSON(response);
                    console.log(this.pubkey);

                    this.clientData = JSON.parse(arrayBufferToStr(response.response.clientDataJSON));
                    this.attestationObject = CBOR.decode(response.response.attestationObject);
                    this.x5c = [];
                    if( this.attestationObject.attStmt.x5c ){
                        for (var i = 0; i < this.attestationObject.attStmt.x5c.length ; i++ ){
                            var x509 = new X509();
                            x509.readCertHex(this.ba2hex(this.attestationObject.attStmt.x5c[i]));
                            var x509params = x509.getParam();
                            console.log(x509params);
                            this.x5c.push({ x509: x509, params: x509params });
                        }
                    }

                    this.progress_open();
                    return do_post(base_url + '/attestation/result', this.pubkey)
                })
                .then((response) => {
                    this.progress_close();
                    if (response.status !== 'ok') {
                        alert(json.message);
                        return;
                    }

                    if (response.status == 'ok') {
                        this.register_credId = response.credId;
                        this.register_counter = response.counter;
                        this.registered = true;
                        this.message = '登録が完了しました。';
                    } else {
                        throw 'registration error';
                    }
                })
                .catch(error => {
                    this.progress_close();
                    alert(error);
                });
        },
        start_login: function () {
            this.logined = false;
            var param = {
                username: this.username,
            };

            this.progress_open();
            do_post(base_url + '/assertion/options', param)
                .then(json => {
                    this.progress_close();
                    console.log(json);
                    if (json.status != 'ok') {
                        alert(json.message);
                        return;
                    }

                    this.assertion_encode.challenge = json.challenge;
                    json.challenge = base64url.decode(json.challenge);

                    for (var i = 0; i < json.allowCredentials.length; i++) {
                        this.assertion_encode.allowCredentials[i] = { id: json.allowCredentials[i].id };
                        json.allowCredentials[i].id = base64url.decode(json.allowCredentials[i].id);
                    }

                    this.assertion = json;
                    this.message = 'ログインの準備ができました。';
                })
                .catch(error => {
                    this.progress_close();
                    alert(error);
                });
        },
        do_login: function () {
            return navigator.credentials.get({ publicKey: this.assertion })
                .then(response => {
                    this.pubkey2 = publicKeyCredentialToJSON(response);
                    console.log(this.pubkey2);

                    this.clientData2 = JSON.parse(arrayBufferToStr(response.response.clientDataJSON));
                    console.log(this.clientData2);
//                    this.authenticatorData = CBOR.decode(response.response.authenticatorData);
//                    console.log(this.authenticatorData);

                    this.progress_open();
                    return do_post(base_url + '/assertion/result', this.pubkey2)
                })
                .then((response) => {
                    this.progress_close();
                    if (response.status !== 'ok')
                        throw new Error(`Server responed with error. The message is: ${response.message}`);

                    if (response.status == 'ok') {
                        this.login_credId = response.credId;
                        this.login_counter = response.counter;
                        this.logined = true;
                        this.message = 'ログインが成功しました。';
                    } else {
                        throw 'login error';
                    }
                })
                .catch(error => {
                    this.progress_close();
                    alert(error);
                });
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
