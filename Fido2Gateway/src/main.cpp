#include <M5StickC.h>
#include <SPI.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include "BLE2902.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#define LGFX_AUTODETECT
#include <LovyanGFX.hpp>

const char *endpoint_u2f_register = "http://【FIDOサーバのホスト名】:10080/device/u2f_register";
const char *endpoint_u2f_authenticate = "http://【FIDOサーバのホスト名】:10080/device/u2f_authenticate";
const char *endpoint_u2f_version = "http://【FIDOサーバのホスト名】:10080/device/u2f_version";

#define SERVICE_UUID_fido BLEUUID((uint16_t)0xfffd)
#define CHARACTERISTIC_UUID_fidoControlPoint "F1D0FFF1-DEAA-ECEE-B42F-C9BA7ED623BB"
#define CHARACTERISTIC_UUID_fidoStatus "F1D0FFF2-DEAA-ECEE-B42F-C9BA7ED623BB"
#define CHARACTERISTIC_UUID_fidoControlPointLength "F1D0FFF3-DEAA-ECEE-B42F-C9BA7ED623BB"
#define CHARACTERISTIC_UUID_fidoServiceRevisionBitfield "F1D0FFF4-DEAA-ECEE-B42F-C9BA7ED623BB"
#define CHARACTERISTIC_UUID_fidoServiceRevision BLEUUID((uint16_t)0x2A28)

#define SERVICE_UUID_DeviceInfo BLEUUID((uint16_t)0x180a)
#define CHARACTERISTIC_UUID_ManufacturerName BLEUUID((uint16_t)0x2A29)
#define CHARACTERISTIC_UUID_ModelNumber BLEUUID((uint16_t)0x2A24)
#define CHARACTERISTIC_UUID_FirmwareRevision BLEUUID((uint16_t)0x2A26)

#define DEVICE_NAME "Fido2Gateway"
#define BLE_PASSKEY 123456
#define DISCONNECT_WAIT 3000

static LGFX lcd;

bool connected = false;

const char *wifi_ssid = "【WiFiアクセスポイントのSSID】";
const char *wifi_password = "【WiFiアクセスポイントのパスワード】";

const int capacity = JSON_OBJECT_SIZE(10);
StaticJsonDocument<capacity> json_request;
char json_buffer[2048];
unsigned short recv_len = 0;
unsigned short expected_len = 0;
unsigned char expected_slot = 0;
unsigned char recv_buffer[2048];

#define PACKET_BUFFER_SIZE 20

BLECharacteristic *pCharacteristic_fidoControlPoint;
BLECharacteristic *pCharacteristic_fidoStatus;
BLECharacteristic *pCharacteristic_fidoControlPointLength;
BLECharacteristic *pCharacteristic_fidoServiceRevisionBitfield;
BLECharacteristic *pCharacteristic_fidoServiceRevision;

uint8_t value_fidoControlPoint[PACKET_BUFFER_SIZE] = {0x00};
uint8_t value_fidoStatus[PACKET_BUFFER_SIZE] = {0x00};
uint8_t value_fidoControlPointLength[2] = {(PACKET_BUFFER_SIZE >> 8) & 0xff, PACKET_BUFFER_SIZE}; /* Length PACKET_BUFFER_SIZE */
uint8_t value_fidoServiceRevisionBitfield[1] = {0x80};                                            /* Version 1.1 */
uint8_t value_fidoServiceRevision[3] = {0x31, 0x2e, 0x30};                                        /* "1.0" */

uint8_t value_appearance[2] = {0x40, 0x03};

BLEAdvertising *g_pAdvertising = NULL;

void dump_bin(const uint8_t *p_bin, unsigned short len)
{
  for (unsigned short i = 0; i < len; i++)
  {
    Serial.print(p_bin[i], HEX);
    Serial.print(" ");
  }
}

void lcd_println(const char* p_message, bool clear = true){
  if( clear ){
    lcd.fillScreen();
    lcd.setCursor(0, 0);
  }

  lcd.println(p_message);
}

char toC(unsigned char bin)
{
  if (bin >= 0 && bin <= 9)
    return '0' + bin;
  if (bin >= 0x0a && bin <= 0x0f)
    return 'a' + bin - 10;
  return '0';
}

unsigned char tohex(char c)
{
  if (c >= '0' && c <= '9')
    return c - '0';
  if (c >= 'a' && c <= 'f')
    return c - 'a' + 10;
  if (c >= 'F' && c <= 'F')
    return c - 'A' + 10;

  return 0;
}

long parse_hex(const char *p_hex, unsigned char *p_bin)
{
  int index = 0;
  while (p_hex[index * 2] != '\0')
  {
    p_bin[index] = tohex(p_hex[index * 2]) << 4;
    p_bin[index] |= tohex(p_hex[index * 2 + 1]);
    index++;
  }

  return index;
}

std::string create_string(const unsigned char *p_bin, unsigned short len)
{
  std::string str = "";
  for (int i = 0; i < len; i++)
  {
    str += toC((p_bin[i] >> 4) & 0x0f);
    str += toC(p_bin[i] & 0x0f);
  }

  return str;
}

class MyCallbacks : public BLEServerCallbacks
{
  void onConnect(BLEServer *pServer)
  {
    connected = true;
    Serial.println("Connected\n");
    lcd_println("BLE Connected");
  }

  void onDisconnect(BLEServer *pServer)
  {
    connected = false;
    BLE2902 *desc = (BLE2902 *)pCharacteristic_fidoStatus->getDescriptorByUUID(BLEUUID((uint16_t)0x2902));
    desc->setNotifications(false);
    Serial.println("Disconnected\n");
    lcd_println("BLE Disconnected");

    g_pAdvertising->stop();
    delay(DISCONNECT_WAIT);
    g_pAdvertising->start();
    lcd_println("BLE Advertising");
  }
};

class MySecurity : public BLESecurityCallbacks
{
  bool onConfirmPIN(uint32_t pin)
  {
    Serial.println("onConfirmPIN number:");
    Serial.println(pin);
    return false;
  }

  uint32_t onPassKeyRequest()
  {
    Serial.println("onPassKeyRequest");
    return BLE_PASSKEY;
  }

  void onPassKeyNotify(uint32_t pass_key)
  {
    // ペアリング時のPINの表示
    Serial.println("onPassKeyNotify number");
//    Serial.println(pass_key);
  }

  bool onSecurityRequest()
  {
    /* ペアリング要否 */
    Serial.println("onSecurityRequest");
    return true;
  }

  void onAuthenticationComplete(esp_ble_auth_cmpl_t cmpl)
  {
    Serial.println("onAuthenticationComplete");
    if (cmpl.success)
    {
      // ペアリング完了
      Serial.println("auth success");
      lcd_println("Auth Success");
    }
    else
    {
      // ペアリング失敗
      Serial.println("auth failed");
      lcd_println("Auth Failed");
    }
  }
};

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks
{
  void onWrite(BLECharacteristic *pCharacteristic)
  {
    Serial.print("onWrite : ");

    uint8_t *value = pCharacteristic->getData();
    std::string str = pCharacteristic->getValue();
    dump_bin(value, str.length());
    Serial.println("");

    if (expected_len > 0 && value[0] != expected_slot)
      expected_len = 0;

    if (expected_len == 0)
    {
      if (value[0] != 0x83)
        return;
      recv_len = 0;
      expected_len = (value[1] << 8) | value[2];
      memmove(&recv_buffer[recv_len], &value[3], str.length() - 3);
      recv_len += str.length() - 3;
      expected_slot = 0;
      if (recv_len < expected_len)
        return;
    }
    else
    {
      memmove(&recv_buffer[recv_len], &value[1], str.length() - 1);
      recv_len += str.length() - 1;
      expected_slot++;
      if (recv_len < expected_len)
        return;
    }
    expected_len = 0;

    HTTPClient http;
    switch (recv_buffer[1])
    {
    case 0x01:
      http.begin(endpoint_u2f_register);
      lcd_println("processing u2f_register");
      break;
    case 0x02:
      http.begin(endpoint_u2f_authenticate);
      lcd_println("processing u2f_authenticate");
      break;
    case 0x03:
      http.begin(endpoint_u2f_version);
      lcd_println("processing u2f_version");
      break;
    default:
      Serial.println("Unknown INS");
      lcd_println("unknown INS");
      return;
    }

    http.addHeader("Content-Type", "application/json");

    json_request["input"] = create_string(&recv_buffer[0], recv_len).c_str();
    serializeJson(json_request, json_buffer, sizeof(json_buffer));

    Serial.println("http.POST");
    int status_code = http.POST((uint8_t *)json_buffer, strlen(json_buffer));
    Serial.printf("status_code=%d\r\n", status_code);
    if (status_code == 200)
    {
      Stream *resp = http.getStreamPtr();

      DynamicJsonDocument json_response(2048);
      deserializeJson(json_response, *resp);
      /*
      serializeJson(json_response, Serial);
      Serial.println("");
*/

      const char *result = json_response["result"];
      //      Serial.println(result);
      unsigned short len = parse_hex(result, recv_buffer);

      int offset = 0;
      int slot = 0;
      int packet_size = 0;
      do
      {
        if (offset == 0)
        {
          value_fidoStatus[0] = 0x83;
          value_fidoStatus[1] = (len >> 8) & 0xff;
          value_fidoStatus[2] = len & 0xff;
          packet_size = len - offset;
          if (packet_size > (PACKET_BUFFER_SIZE - 3))
            packet_size = PACKET_BUFFER_SIZE - 3;
          memmove(&value_fidoStatus[3], &recv_buffer[offset], packet_size);

          Serial.print("Notify : ");
          dump_bin(value_fidoStatus, packet_size + 3);
          Serial.println("");

          pCharacteristic_fidoStatus->setValue(value_fidoStatus, packet_size + 3);
          pCharacteristic_fidoStatus->notify(true);

          offset += packet_size;
          packet_size += 3;
        }
        else
        {
          value_fidoStatus[0] = slot++;
          packet_size = len - offset;
          if (packet_size > (PACKET_BUFFER_SIZE - 1))
            packet_size = PACKET_BUFFER_SIZE - 1;
          memmove(&value_fidoStatus[1], &recv_buffer[offset], packet_size);

          Serial.print("Notify : ");
          dump_bin(value_fidoStatus, packet_size + 1);
          Serial.println("");

          pCharacteristic_fidoStatus->setValue(value_fidoStatus, packet_size + 1);
          pCharacteristic_fidoStatus->notify(true);

          offset += packet_size;
          packet_size += 1;
        }
      } while (packet_size >= PACKET_BUFFER_SIZE);
    }

    http.end();
    lcd_println("process end", false);
  }
};

void taskServer(void *)
{
  BLEDevice::init(DEVICE_NAME);
  /* ESP_BLE_SEC_ENCRYPT_MITM, ESP_BLE_SEC_ENCRYPT */
  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT_MITM);
  BLEDevice::setSecurityCallbacks(new MySecurity());

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyCallbacks());

  BLESecurity *pSecurity = new BLESecurity();
  pSecurity->setKeySize(16);
  //  pSecurity->setStaticPIN(BLE_PASSKEY);

  /* ESP_LE_AUTH_NO_BOND, ESP_LE_AUTH_BOND, ESP_LE_AUTH_REQ_MITM */
  //  pSecurity->setAuthenticationMode(ESP_LE_AUTH_REQ_MITM);
  pSecurity->setAuthenticationMode(ESP_LE_AUTH_BOND);

  /* for fixed passkey */
  uint32_t passkey = BLE_PASSKEY;
  esp_ble_gap_set_security_param(ESP_BLE_SM_SET_STATIC_PASSKEY, &passkey, sizeof(uint32_t));

  /* ESP_IO_CAP_IN, ESP_IO_CAP_OUT, ESP_IO_CAP_KBDISP */
  pSecurity->setCapability(ESP_IO_CAP_OUT);
  //  pSecurity->setCapability(ESP_IO_CAP_IN);
  pSecurity->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);

  BLEService *pService = pServer->createService(SERVICE_UUID_fido);

  pCharacteristic_fidoControlPoint = pService->createCharacteristic(
      CHARACTERISTIC_UUID_fidoControlPoint,
      BLECharacteristic::PROPERTY_WRITE);
  pCharacteristic_fidoControlPoint->setAccessPermissions(ESP_GATT_PERM_WRITE /* ESP_GATT_PERM_WRITE_ENCRYPTED */);
  pCharacteristic_fidoControlPoint->setValue(value_fidoControlPoint, sizeof(value_fidoControlPoint));
  pCharacteristic_fidoControlPoint->setCallbacks(new MyCharacteristicCallbacks());

  pCharacteristic_fidoStatus = pService->createCharacteristic(
      CHARACTERISTIC_UUID_fidoStatus,
      BLECharacteristic::PROPERTY_NOTIFY);
  pCharacteristic_fidoStatus->addDescriptor(new BLE2902());

  pCharacteristic_fidoControlPointLength = pService->createCharacteristic(
      CHARACTERISTIC_UUID_fidoControlPointLength,
      BLECharacteristic::PROPERTY_READ);
  pCharacteristic_fidoControlPointLength->setAccessPermissions(ESP_GATT_PERM_READ);
  pCharacteristic_fidoControlPointLength->setValue(value_fidoControlPointLength, sizeof(value_fidoControlPointLength));

  pCharacteristic_fidoServiceRevisionBitfield = pService->createCharacteristic(
      CHARACTERISTIC_UUID_fidoServiceRevisionBitfield,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  pCharacteristic_fidoServiceRevisionBitfield->setAccessPermissions(ESP_GATT_PERM_READ | ESP_GATT_PERM_WRITE);
  pCharacteristic_fidoServiceRevisionBitfield->setValue(value_fidoServiceRevisionBitfield, sizeof(value_fidoServiceRevisionBitfield));

  pCharacteristic_fidoServiceRevision = pService->createCharacteristic(
      CHARACTERISTIC_UUID_fidoServiceRevision,
      BLECharacteristic::PROPERTY_READ);
  pCharacteristic_fidoServiceRevision->setAccessPermissions(ESP_GATT_PERM_READ);
  pCharacteristic_fidoServiceRevision->setValue(value_fidoServiceRevision, sizeof(value_fidoServiceRevision));

  pService->start();

  BLECharacteristic *pCharacteristic;

  BLEService *pService_DeviceInfo = pServer->createService(SERVICE_UUID_DeviceInfo);

  pCharacteristic = pService_DeviceInfo->createCharacteristic(
      CHARACTERISTIC_UUID_ManufacturerName,
      BLECharacteristic::PROPERTY_READ);
  pCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ);
  pCharacteristic->setValue("SampleModel");

  pCharacteristic = pService_DeviceInfo->createCharacteristic(
      CHARACTERISTIC_UUID_ModelNumber,
      BLECharacteristic::PROPERTY_READ);
  pCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ);
  pCharacteristic->setValue("M1.0");

  pCharacteristic = pService_DeviceInfo->createCharacteristic(
      CHARACTERISTIC_UUID_FirmwareRevision,
      BLECharacteristic::PROPERTY_READ);
  pCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ);
  pCharacteristic->setValue("F1.0");

  pService_DeviceInfo->start();

  g_pAdvertising = pServer->getAdvertising();
  g_pAdvertising->addServiceUUID(SERVICE_UUID_fido);
  g_pAdvertising->start();

  lcd_println("BLE Advertising");

  vTaskDelay(portMAX_DELAY); //delay(portMAX_DELAY);
}

void setup()
{
  Serial.begin(115200);
  Serial.println("Starting setup");

  lcd.init();
  lcd.setRotation(1);
  lcd.setBrightness(128);
  lcd.fillScreen();
  lcd.setTextSize(2);

  WiFi.begin(wifi_ssid, wifi_password);
  Serial.println("Connecting to Wifi AP...");
  lcd_println("WiFi Connecting");
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(1000);
    Serial.print(".");
  }
  Serial.println(WiFi.localIP());
  lcd_println("WiFi Connected", false);

  Serial.println("Starting BLE work!");
  xTaskCreate(taskServer, "server", 20000, NULL, 5, NULL);
}

void loop()
{
  if (connected)
  {
    // do something
  }
}
