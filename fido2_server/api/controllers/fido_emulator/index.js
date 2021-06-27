'use strict';

const HELPER_BASE = process.env.HELPER_BASE || '../../helpers/';
const Response = require(HELPER_BASE + 'response');

const rs = require('jsrsasign');
const crypto = require('crypto');
const uuidv4 = require('uuid').v4;
const fsp = require('fs').promises;
const fs = require('fs');

const FIDO_ISSUER = process.env.FIDO_ISSUER || 'FT FIDO 0200';
const FIDO_SUBJECT = process.env.FIDO_SUBJECT || 'FT FIDO P2000000000000';
const FIDO_EXPIRE = Number(process.env.FIDO_EXPIRE) || 3650;
const FIDO_EXPIRE_START = process.env.FIDO_EXPIRE_START || '210620150000Z'; // 形式：YYMMDDHHMMSSZ (UTC時間)

const FILE_BASE = process.env.THIS_BASE_PATH + '/data/fido2_device/';
const PRIV_FNAME = "privkey.pem";

var kp_cert;
var serial_no = 123456;

(async () => {
  // X509証明書の楕円暗号公開鍵ペアの作成
  if (fs.existsSync(FILE_BASE + PRIV_FNAME)) {
    var pem = await fsp.readFile(FILE_BASE + PRIV_FNAME);
    kp_cert = rs.KEYUTIL.getKey(pem.toString());
  } else {
    var kp = rs.KEYUTIL.generateKeypair('EC', 'secp256r1');
    kp_cert = kp.prvKeyObj;
    fsp.writeFile(FILE_BASE + PRIV_FNAME, rs.KEYUTIL.getPEM(kp_cert, "PKCS1PRV"));
  }
})();

exports.handler = async (event, context, callback) => {
  if (event.path == "/device/u2f_register") {
    var body = JSON.parse(event.body);
    console.log(body);

    var input = Buffer.from(body.input, 'hex');
    var result = await u2f_register(input.subarray(7, 7 + 32), input.subarray(7 + 32, 7 + 32 + 32));

    return new Response({
      result: Buffer.concat([result, Buffer.from([0x90, 0x00])]).toString('hex')
    });
  } else
    if (event.path == "/device/u2f_authenticate") {
      var body = JSON.parse(event.body);
      console.log(body);

      var input = Buffer.from(body.input, 'hex');
      try {
        var result = await u2f_authenticate(input[2], input.subarray(7, 7 + 32), input.subarray(7 + 32, 7 + 32 + 32), input.subarray(7 + 32 + 32 + 1, 7 + 32 + 32 + 1 + input[7 + 32 + 32]));
      } catch (sw) {
        return new Response({
          result: sw.toString('hex')
        });
      };

      return new Response({
        result: Buffer.concat([result, Buffer.from([0x90, 0x00])]).toString('hex')
      });
    } else
      if (event.path == "/device/u2f_version") {
        var result = await u2f_version();
        return new Response({
          result: Buffer.concat([result, Buffer.from([0x90, 0x00])]).toString('hex')
        });
      }
};

async function u2f_register(challenge, application) {
  console.log('application=', application.toString('hex'));

  // 楕円暗号公開鍵ペアの作成
  var kp = rs.KEYUTIL.generateKeypair('EC', 'secp256r1');

  var userPublicKey = Buffer.from(kp.pubKeyObj.pubKeyHex, 'hex');

  // 内部管理用のKeyIDの決定
  var uuid = Buffer.alloc(16);
  uuidv4({}, uuid);
  var key_id = uuid.toString('hex');
  console.log('key_id=' + key_id);

  await writeCertFile(key_id, {
    application: application.toString('hex'),
    privkey: rs.KEYUTIL.getPEM(kp.prvKeyObj, "PKCS1PRV"),
    counter: 0,
    created_at: new Date().getTime()
  });

  // KeyHandleの作成
  var keyHandle = Buffer.concat([uuid]);
  var keyLength = Buffer.from([keyHandle.length]);

  //サブジェクトキー識別子
  const ski = rs.KJUR.crypto.Util.hashHex(kp.pubKeyObj.pubKeyHex, 'sha1');
  const derSKI = new rs.KJUR.asn1.DEROctetString({ hex: ski });

  // X.509証明書の作成
  var cert = new rs.KJUR.asn1.x509.Certificate({
    version: 3,
    serial: { int: serial_no++ },
    issuer: { str: "/CN=" + FIDO_ISSUER },
    notbefore: FIDO_EXPIRE_START,
    notafter: toUTCString(new Date(Date.now() + FIDO_EXPIRE * 24 * 60 * 60 * 1000)),
    subject: { str: "/CN=" + FIDO_SUBJECT },
    sbjpubkey: kp.pubKeyObj, // can specify public key object or PEM string
    sigalg: "SHA256withECDSA",
    ext: [
      {
        //サブジェクトキー識別子
        extname: "subjectKeyIdentifier",
        kid: {
          hex: derSKI.getEncodedHex()
        }
      },
      {
        // FIDO U2F certificate transports extension
        extname: "1.3.6.1.4.1.45724.2.1.1",
        extn: "03020640"
      }
    ],
    cakey: kp_cert
  });
  console.log(cert.getPEM());

  var attestationCert = Buffer.from(cert.getEncodedHex(), 'hex');

  // 署名の生成
  var input = Buffer.concat([
    Buffer.from([0x00]),
    application,
    challenge,
    keyHandle,
    userPublicKey
  ]);
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(input);
  var signature = sign.sign(rs.KEYUTIL.getPEM(kp.prvKeyObj, "PKCS1PRV"));

  console.log('userPublicKey(' + userPublicKey.length + ')=' + userPublicKey.toString('hex'));
  console.log('keyHandle(' + keyHandle.length + ')=' + keyHandle.toString('hex'));
  console.log('attestationCert(' + attestationCert.length + ')=' + attestationCert.toString('hex'));
  console.log('signature(' + signature.length + ')=' + signature.toString('hex'));

  // レスポンスの生成(concat)
  return Buffer.concat([
    Buffer.from([0x05]),
    userPublicKey,
    keyLength,
    keyHandle,
    attestationCert,
    signature
  ]);
}

async function u2f_authenticate(control, challenge, application, keyHandle) {
  console.log('control=', control);
  console.log('application=', application.toString('hex'));

  var userPresence = Buffer.from([0x01]);

  // 内部管理用のKeyIDの抽出
  var key_id = keyHandle.slice(0, 16).toString('hex');
  console.log('key_id=' + key_id);
  if (!checkAlnum(key_id)) {
    console.log('key_id invalid')
    throw Buffer.from([0x6a, 0x80]);
  }

  var cert = await readCertFile(key_id);
  if (!cert) {
    console.log('key_id not found');
    throw Buffer.from([0x6a, 0x80]);
  }

  if (cert.application.toLowerCase() != application.toString('hex').toLowerCase()) {
    console.log('application mismatch');
    throw Buffer.from([0x6a, 0x80]);
  }

  if (control == 0x07) {
    throw Buffer.from([0x69, 0x85]);
  }

  // 署名回数カウンタのインクリメント
  cert.counter++;
  cert.lastauthed_at = new Date().getTime();
  await writeCertFile(key_id, cert);
  console.log('counter=' + cert.counter);
  var counter = Buffer.from([(cert.counter >> 24) & 0xff, (cert.counter >> 16) & 0xff, (cert.counter >> 8) & 0xff, cert.counter & 0xff])

  // 署名生成
  var input = Buffer.concat([
    application,
    userPresence,
    counter,
    challenge
  ]);
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(input);
  var signature = sign.sign(cert.privkey);

  console.log('input(' + input.length + ')=' + input.toString('hex'));
  console.log('sigunature(' + signature.length + ')=' + signature.toString('hex'));

  // verify sample code
  /*
    const verify = crypto.createVerify('RSA-SHA256')
    verify.write(input)
    verify.end();
  
    var result =  verify.verify(
      privateKey.asPublic().toPEM(),
      signature
    );
    console.log('verify result=' + result);
  */

  // レスポンスの生成(concat)
  return Buffer.concat([
    userPresence,
    counter,
    signature
  ]);
}

async function u2f_version() {
  var version = Buffer.from('U2F_V2');
  return Promise.resolve(version);
}

function toUTCString(date) {
  var year = date.getUTCFullYear();
  var month = date.getUTCMonth() + 1;
  var day = date.getUTCDate();
  var hour = date.getUTCHours();
  var minutes = date.getUTCMinutes();
  var seconds = date.getUTCSeconds();

  return to2d(year % 100) + to2d(month) + to2d(day) + to2d(hour) + to2d(minutes) + to2d(seconds) + "Z";
}

function to2d(num) {
  if (num < 10)
    return '0' + String(num);
  else
    return String(num);
}

function checkAlnum(str) {
  var ret = str.match(/([a-z]|[A-Z]|[0-9])/gi);
  return (ret.length == str.length)
}

async function readCertFile(uuid) {
  try {
    var file = await fsp.readFile(FILE_BASE + uuid + '.json', 'utf8');
    return JSON.parse(file);
  } catch (error) {
    console.log(error);
    return null;
  }
}

async function writeCertFile(uuid, cert) {
  await fsp.writeFile(FILE_BASE + uuid + '.json', JSON.stringify(cert, null, 2), 'utf8');
}
