const path = require("path");
const express = require("express");
const WebSocket = require("ws");
const app = express();

const WS_PORT = 8888;
const HTTP_PORT = 8000;

const wsServer = new WebSocket.Server({ port: WS_PORT }, () => console.log(`WS Server is listening at ${WS_PORT}`));

let connectedClients = [];

//1. Single Camera
//ws: refer for a single connection on server side
// wsServer.on('connection', (ws, req)=>{
//     console.log('Connected');
//     connectedClients.push(ws);

//     ws.on('message', data => {
//         //forEach callback function return ws[the element of array] & i[index of array]
//         connectedClients.forEach((ws,i)=>{
//             if(ws.readyState === ws.OPEN){
//                 ws.send(data);   //data was received from ESP32 is array of binary (hexa)
//             }else{
//                 connectedClients.splice(i ,1);
//             }
//         })
//     });
// });


//2. Multiple Camera
wsServer.on("connection", (ws, req) => {
	console.log("Connected");

	ws.on("message", (data) => {
		if (data.indexOf("WEB_CLIENT") !== -1) {
			connectedClients.push(ws);
			console.log("WEB_CLIENT ADDED");
			return;                         // Khi data chi la su kien connect vao SERVER (WEB_CLIENT) thi return va chi return cho callback cua "onmessage" chu khong phai "connection"
		}                               

        // Khi message khong phai la "WEB_CLIENT" (hay la connection)
        // forEach callback function return ws[the element of array] & i[index of array]
		connectedClients.forEach((ws, i) => {
            // Chi client nao dang vao web (request 192.168.3.122:8000) thi moi nhan duoc message cua rieng no
            // Server tao cho moi client 1 "ws" de lien lac va tra du lieu cho client
            // VD: ws esp32 có ws="abc" liên tục gửi dữ liệu từ sever qua lời gọi ws.send(data). Thực ra là câu lệnh này cũng chỉ dành cho ESP32 gửi data mà thôi chứ WEB client chả gửi data gì vào socket
			if (connectedClients[i] == ws && ws.readyState === ws.OPEN) {
                // Bản chất thì mỗi ESP32 Cam gửi dữ liệu lên Server và Server đẩy xuống cho client mà thôi
                // Server gửi sang dashboard.html. Và dashboard.html phân biệt "data" thông qua ID để hiển thị lên Web cho đúng thẻ src của image (cho đúng khung mà thôi)
				ws.send(data);          
			} else {
				connectedClients.splice(i, 1);  //splice 1 element from array
			}
		});
	});

	ws.on("error", (error) => {
		console.error("WebSocket error observed: ", error);
	});
});

app.use(express.static("."));
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "./login.html")));
app.listen(HTTP_PORT, () => console.log(`HTTP server listening at ${HTTP_PORT}`));