const path = require("path");
const express = require("express");
const WebSocket = require("ws");
const fs = require("fs");
const app = express();

const WS_PORT = 8888;
const HTTP_PORT = 8000;

const wsServer = new WebSocket.Server({ port: WS_PORT }, () => console.log(`WS Server is listening at ${WS_PORT}`));

let connectedClients = [];
let iscam1fresh = 1;
let iscam2fresh = 1;
let timecount = 0;
let count = 0;

setInterval(()=>
{
	timecount ++;
	if(timecount == 50000)
	{
		console.log("REFRESH")
		iscam1fresh = 1;
		iscam2fresh = 1;
		fs.rm("/home/nhatquan/Videos/server/camera1", { recursive: true, force: true }, (err) => {console.log("error camera 1 remove database = "+ err)})
		fs.rm("/home/nhatquan/Videos/server/camera2", { recursive: true, force: true }, (err) => {console.log("error camera 1 remove database = "+ err)})
		timecount = 0;
	}
},1000)

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
/* @brief: Có 2 loại client mà server sẽ nhận được các message request.
	- Web client: Chỉ đơn giản là truy cập vào 192.168.3.122:8000 connect vào server và được server phản hồi request bằng trang login.html
	- ESP32 client: Liên tục gửi message là các frame cho phía server.
	Các phase trong quá trình handle như sau:
		Step 1: Server được khởi tạo và liên tục lắng nghe request từ client
		Step 2: 
			- TH1: Với bất kì một client nào là web client đều connect đến server và gửi bản tin "WEB_CLIENT" nhờ đây mà server sẽ nhận biết được đâu là web client và đâu là esp32 client
				   Ở trường hợp này đơn giản là Server sẽ so sánh bản tin nhận được nếu là WEB_CLIENT thì lập tức push "ws" vào một mảng (ws đại diện cho websocket client mà server dùng để định danh cho client)
				   Việc lưu trữ này khá quan trọng để  Server biết được sẽ gửi message đến đúng web client đang request
				   VD: Có 2 web client là arr[0]= điện thoại và arr[1]=laptop (0,1 là định danh được push vào mảng) và khi đó server dùng 1 vòng forEach (function (currentvalue= "ws", currentindex="i")) sẽ duyệt qua kể cả laptop hay điện thoại và so sánh 
				   nếu ws = 0 send tất cả message từ ESP32-1 và ESP32-2 sang điện thoại. Ngược lại là 1 thì send hết message sang laptop [Lúc này không thể phân biệt được bản tin nào là của ESP32-1 và bản tin nào của ESP32-2 => Công việc này do file html xử lý]
			- TH2: Với client là ESP32-1 hoặc ESP32-2. Những client này sẽ không được push vào array vì bản chất là không cần lưu giữ lại định danh vì ta chỉ cần Server trả lại message cho webclient. Còn đối với ESP client chỉ đơn giản là Server liên tục nhận 
				   message và gửi tới TẤT CẢ WEB CLIENT. ESP32 thì lại liện tục gửi message
				   !Note: một khi ESP32 connected thì nó đang hoạt động liên tục ở ws.on("messsage"). Trừ khi rút khỏi nguồn thì ESP32 lập tức disconnect. Và thường quá trình của mình thì ESP32 luôn luôn connect. Chỉ có web client thì thường xuyên thay đổi connect
				   và disconnect
		Step 3: Với webclient đã disconnect (readyState != OPEN) sẽ được remove khỏi array

	@Rule: 
		   ESP32-1 và ESP32-2 liên tục gửi message đến server mà không cần nhận lại message nào cả
		   Server liên tục nhận message từ ESP32-1 và ESP32-2 (là các frame) mà không phân biệt là bản tin từ phía ESP client nào
		   Server liên tục gửi message đến tất cả các Web client đang connect nhờ vào việc Server ghi nhớ các Web client bằng 1 mảng và kiểm tra sự hoạt động của client đó (xem có còn connect hay không)
		   Web client liên tục nhận message từ Server và xử lý xem là bản tin của ESP32 nào và phân tách đưa lên <img> tag phía client (dashboard.html)
*/

wsServer.on("connection", (ws, req) => {
	console.log("Connected");
	// //1. Send image
	// setInterval(()=>{
	// 	count++;
	// 	fs.readFile("/home/nhatquan/Videos/server/"+ count +".jpeg", (err, data)=>{
	// 		console.log(data)
	// 		ws.send(data);
	// 	})
	// },100)

	ws.on("message", (data) => {
		if (data.indexOf("WEB_CLIENT") !== -1) 
		{
			// Doi voi cac clien request page (192.168.3.122:8000) chi don gian la push vao ARR va return ve
			connectedClients.push(ws);
			console.log("Web client connected");
			// Khi data chi la su kien connect vao SERVER (WEB_CLIENT) thi return va chi return cho callback cua "onmessage" chu khong phai "connection"
			return;                         
		}  

		// Save image file to local storage
		if(data[12] == 1)
		{
			if(iscam1fresh == 1)
			{
				fs.mkdir("/home/nhatquan/Videos/server/camera1", { recursive: true }, (err) => {console.log("Create database for camera 1 with error = "+ err)})
				iscam1fresh = 0;
			}
			else
			{
				var moment = new Date();
				fs.writeFile("/home/nhatquan/Videos/server/camera1/"+ moment.getHours()+":"+ moment.getMinutes()+":" + moment.getSeconds()+":" + moment.getMilliseconds()+":" +".jpeg", data, ()=>{});
			}
		}
		else if (data[12] == 2)
		{
			if(iscam2fresh == 1)
			{
				fs.mkdir("/home/nhatquan/Videos/server/camera2", { recursive: true }, (err) => {console.log("Create database for camera 2 with error = "+ err)})
				iscam2fresh = 0;
			}
			else
			{
				var moment = new Date();
				fs.writeFile("/home/nhatquan/Videos/server/camera2/"+ moment.getHours()+":"+ moment.getMinutes()+":" + moment.getSeconds()+":" + moment.getMilliseconds()+":" +".jpeg", data, ()=>{});
			}
		}

        // Khi message khong phai la "WEB_CLIENT" (hay la connection). Thi tat ca cac message (ke ca la cua ESP32-1 hay ESP32-2) se duoc gui toi "ws" (tuc la WEB client) tuong ung dang connect request vao Server. 
		// Sau do phia html (client) se tu xu ly message xem la cua ESP32-1 hay ESP32-2 de hien thi len dung khung
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