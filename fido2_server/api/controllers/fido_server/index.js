'use strict';

const HELPER_BASE = process.env.HELPER_BASE || '../../helpers/';
const Response = require(HELPER_BASE + 'response');

const base64url = require('base64url');
const crypto    = require('crypto');
const { Fido2Lib } = require("fido2-lib");
const fsp = require('fs').promises;

const FIDO_RP_NAME = process.env.FIDO_RP_NAME || "Sample FIDO Host";
const FIDO_ORIGIN = process.env.FIDO_ORIGIN || "https://�yFIDO�T�[�o�̃z�X�g���z";

const FILE_BASE = process.env.THIS_BASE_PATH + '/data/fido2_server/';

var f2l = new Fido2Lib({
  rpName: FIDO_RP_NAME
});

exports.handler = async (event, context, callback) => {
  if( event.path == '/assertion/options'){
    var body = JSON.parse(event.body);
    console.log(body);

    let username = body.username;
    if( !checkAlnum(username) )
      throw "Wrong username";

    var user = await readCertFile(username);

    if(!user || !user.registered) {
      return new Response({
        'status': 'failed',
        'message': `Username ${username} does not exist`
      });
    }

    var authnOptions = await f2l.assertionOptions();
    authnOptions.challenge = base64url.encode(authnOptions.challenge);

    let allowCredentials = [];
    for(let authr of user.attestation) {
        allowCredentials.push({
          type: 'public-key',
          id: authr.credId,
          transports: ['usb', 'nfc', 'ble']
        })
    }
    authnOptions.allowCredentials = allowCredentials;
    console.log(authnOptions);

    context.req.session.challenge = authnOptions.challenge;
    context.req.session.username  = username;

    authnOptions.status = 'ok';

    return new Response(authnOptions);
  }else
  if( event.path == '/assertion/result'){
    var body = JSON.parse(event.body);
    console.log(body);

    var username = context.req.session.username;
    if (!checkAlnum(username))
      throw "Wrong username";

    var user = await readCertFile(username);
    if (!user || !user.registered) {
      return new Response({
        'status': 'failed',
        'message': `Username ${username} does not exist`
      });
    }

    var attestation = null;
    for (var i = 0; i < user.attestation.length ; i++ ){
      if (user.attestation[i].credId == body.id ){
        attestation = user.attestation[i];
        break;
      }
    }
    if( !attestation ){
      return new Response({
        'status': 'failed',
        'message': 'key is not found.'
      });
    }

    var assertionExpectations = {
      challenge: context.req.session.challenge,
      origin: FIDO_ORIGIN,
      factor: "either",
      publicKey: attestation.publickey,
      prevCounter: attestation.counter,
      userHandle: null
    };

    body.rawId = new Uint8Array(base64url.toBuffer(body.rawId)).buffer;
    var authnResult = await f2l.assertionResult(body, assertionExpectations);
    console.log(authnResult);

    if(authnResult.audit.complete) {
      attestation.counter = authnResult.authnrData.get('counter');
      user.lastauthed_at = new Date().getTime();
      await writeCertFile(username, user);

      return new Response({
        'status': 'ok',
        credId: body.id,
        counter: attestation.counter
      });
    } else {
      return new Response({
        'status': 'failed',
        'message': 'Can not authenticate signature!'
      });
    }
  }else
  if( event.path == '/attestation/options'){
    var body = JSON.parse(event.body);
    console.log(body);

    let username = body.username;
    if (!checkAlnum(username))
      throw "Wrong username";

    var user = await readCertFile(username);
    if (user && user.registered) {
      return new Response({
        'status': 'failed',
        'message': `Username ${username} already exists`
      });
    }

    var id = randomBase64URLBuffer();

    var registrationOptions = await f2l.attestationOptions();
    registrationOptions.challenge = base64url.encode(registrationOptions.challenge);
    registrationOptions.user.id = id;
    registrationOptions.user.name = username;
    registrationOptions.user.displayName = username;
    console.log(registrationOptions);

    user = {
      name: username,
      registered: false,
      id: id,
      attestation: [],
      created_at: new Date().getTime()
    };
    await writeCertFile(username, user);

    context.req.session.challenge = registrationOptions.challenge;
    context.req.session.username = username;

    registrationOptions.status = 'ok';

    return new Response(registrationOptions);
  }else
  if( event.path == '/attestation/result'){
    var body = JSON.parse(event.body);
    console.log(body);

    var attestationExpectations = {
        challenge: context.req.session.challenge,
        origin: FIDO_ORIGIN,
        factor: "either"
    };
    body.rawId = new Uint8Array(base64url.toBuffer(body.rawId)).buffer;
    var regResult = await f2l.attestationResult(body, attestationExpectations);
    console.log(regResult);

    var credId = base64url.encode(regResult.authnrData.get('credId'));
    var counter = regResult.authnrData.get('counter');

    var username = context.req.session.username;
    if (!checkAlnum(username))
      throw "Wrong username";

    var user = await readCertFile(username);
    if (!user) {
      return new Response({
        'status': 'failed',
        'message': `Username ${username} does not exist`
      });
    }

    user.attestation.push({ 
        publickey : regResult.authnrData.get('credentialPublicKeyPem'),
        counter : counter,
        fmt: regResult.authnrData.get('fmt'),
        credId : credId
    });

    if(regResult.audit.complete) {
      user.registered = true
      await writeCertFile(username, user);

      return new Response({
        'status': 'ok',
        credId: credId,
        counter: counter
      });
    } else {
      return new Response({
        'status': 'failed',
        'message': 'Can not authenticate signature!'
      });
    }
  }
};

function randomBase64URLBuffer(len){
  len = len || 32;

  let buff = crypto.randomBytes(len);

  return base64url(buff);
}

function checkAlnum(str) {
  var ret = str.match(/([a-z]|[A-Z]|[0-9])/gi);
  return (ret.length == str.length)
}

async function readCertFile(uuid) {
  try{
    var file = await fsp.readFile(FILE_BASE + uuid + '.json', 'utf8');
    return JSON.parse(file);
  }catch(error){
    console.log(error);
    return null;
  }
}

async function writeCertFile(uuid, cert) {
  await fsp.writeFile(FILE_BASE + uuid + '.json', JSON.stringify(cert, null, 2), 'utf8');
}