#include "esp_camera.h" #include <WiFi.h> #include <ArduinoWebsockets.h> #define CAMERA_MODEL_AI_THINKER #include "camera_pins.h"

const char* ssid = "Tầng 3"; const char* password = "66668888"; const char* websocket_server_host = "192.168.3.122"; const uint16_t websocket_server_port = 8888;

using namespace websockets; WebsocketsClient client; bool isWebSocketConnected;

void onEventsCallback(WebsocketsEvent event, String data){ if(event == WebsocketsEvent::ConnectionOpened){ Serial.println("Connection Opened"); isWebSocketConnected = true; }else if(event == WebsocketsEvent::ConnectionClosed){ Serial.println("Connection Closed"); webSocketRestart(); } }

void setup() { isWebSocketConnected = false; Serial.begin(115200); Serial.println();

camera_config_t config; config.ledc_channel = LEDC_CHANNEL_0; config.ledc_timer = LEDC_TIMER_0; config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM; config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM; config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM; config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM; config.pin_xclk = XCLK_GPIO_NUM; config.pin_pclk = PCLK_GPIO_NUM; config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM; config.pin_sscb_sda = SIOD_GPIO_NUM; config.pin_sscb_scl = SIOC_GPIO_NUM; config.pin_pwdn = PWDN_GPIO_NUM; config.pin_reset = RESET_GPIO_NUM; config.xclk_freq_hz = 10000000; config.pixel_format = PIXFORMAT_JPEG; config.frame_size = FRAMESIZE_CIF; config.jpeg_quality = 10; config.fb_count = 2;

// camera init esp_err_t err = esp_camera_init(&config); if (err != ESP_OK) { Serial.printf("Camera init failed with error 0x%x", err); return; }

WiFi.begin(ssid, password);

while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); } Serial.println(""); Serial.println("WiFi connected");

client.onEvent(onEventsCallback); webSocketConnect(); }

void webSocketRestart(){ while(!client.connect(websocket_server_host, websocket_server_port, "/")){ delay(500); Serial.print("."); } ESP.restart(); }

void webSocketConnect(){ while(!client.connect(websocket_server_host, websocket_server_port, "/")){ delay(500); Serial.print("."); } Serial.println("Websocket Connected!"); }

void loop() {

if(client.available()){ client.poll(); }

if(!isWebSocketConnected) return;

camera_fb_t *fb = esp_camera_fb_get(); if(!fb){ Serial.println("Camera capture failed"); esp_camera_fb_return(fb); return; }

if(fb->format != PIXFORMAT_JPEG){ Serial.println("Non-JPEG data not implemented"); return; }

// Distinguished IP Camerra [0x01] // typedef struct _JFIFHeader // { // BYTE SOI[2]; /* 00h Start of Image Marker / // BYTE APP0[2]; / 02h Application Use Marker / // BYTE Length[2]; / 04h Length of APP0 Field / // BYTE Identifier[5]; / 06h "JFIF" (zero terminated) Id String / // BYTE Version[2]; / 07h JFIF Format Revision / // BYTE Units; / 09h Units used for Resolution / // BYTE Xdensity[2]; / 0Ah Horizontal Resolution / // BYTE Ydensity[2]; / 0Ch Vertical Resolution / // BYTE XThumbnail; / 0Eh Horizontal Pixel Count / // BYTE YThumbnail; / 0Fh Vertical Pixel Count */ // } JFIFHEAD;

fb->buf[12] = 0x02; client.sendBinary((const char*) fb->buf, fb->len); esp_camera_fb_return(fb); }
