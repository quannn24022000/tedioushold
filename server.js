const path = require("path");
const express = require("express");
const WebSocket = require("ws");
const fs = require("fs");
const { parse } = require("path");
const app = express();
const nodemailer = require('nodemailer')

const WS_PORT = 8888;
const HTTP_PORT = 8000;

//I. KHỞI TẠO
//1. Tạo socket
const wsServer = new WebSocket.Server({ port: WS_PORT }, () => console.log(`WS Server is listening at ${WS_PORT}`));

//2. Tạo biến lưu trữ
let connectedClients = [];							// Biến lưu trữ số web client đang connect đến socket (pc, mobile...)
let iscam1fresh = 1;								// Check xem có cần tạo folder để chứa frame cho cam 1 hay không
let iscam2fresh = 1;								
let cam1database = [];								// Mảng các chuỗi lưu trữ thời gian lưu ảnh => giúp lưu trữ lại thứ tự để xuất ảnh ra
let cam2database = [];
var cam1flag = 0; 									// Cờ đánh dấu khi review action "cam1flag = 0" tức là không gửi data liên tục cho client để client xem lại. "cam1flag = 1" tức là lục 
													// trong database đã có 1 dải frame (VD từ 1h->2h) và gửi liên tục cho client xem lại
var cam2flag = 0;
let cam1count = -1;									// Định danh index trong mảng database để duyệt tìm khi có trigger xem lại (review). Được parse từ time gửi từ client
let cam2count = -1;
let filename = "";
let detector = 1;									// detector = 1 => Kich hoat lai thoi gian gui email lan tiep theo la sau 20p

//3. Function để gửi email cảnh báo khi có detect
async function warning_email_handler(filename, camera) {
  // SMTP config
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", 
    port: 587,
    auth: {
      user: "quan.nn24022000dzs@gmail.com", // Your Email address
      pass: "rjnzrfvxglzcdfqe",			    // Your Email password
    },
  }); // Send the email
  let info = await transporter.sendMail({
    from: '"Nguyen Nhat Quan" <foo@example.com>',
    to: "quan.nn24022000@gmail.com", 		// Test email address
    subject: "Secure Camera System",
    text: "Detection from secure camera system",
	html: '<h3>Dear!</h3>'
	+     '<h3>Currently, the security camera identification system is detecting someone unsafe intrusion. The system sends you a picture of that person, hopefully it will ensure the safety of your home</h3>'
	+     '<h3>Thank you and hope everything will be fine</h3>',
	attachments: [{   						// stream as an attachment
		filename: filename,
		content: fs.createReadStream(filename)
	}],
  });
  console.log("Message sent: %s", info.messageId); // Output message ID
}


//II. RELOAD DATABASE
//1. Reload database từ file backup.txt trong trường hợp trước đó tắt server, mất nguồn điện...
fs.readFile('/home/nhatquan/Videos/backup/backupcam1.txt','utf8', (err, data)=>{
	if(data.length == 0)
		cam1database = []
	else
	{
		cam1database = data.split(",")
		iscam1fresh = 0;
	}	
})

fs.readFile('/home/nhatquan/Videos/backup/backupcam2.txt','utf8', (err, data)=>{
	if(data.length == 0)
		cam2database = []
	else
	{
		cam2database = data.split(",")
		iscam2fresh = 0;
	}
})

//2. Liên tục đọc database để lưu backup trong trường hợp tháo cam, mất nguồn điện, tắt server
setInterval(()=>
{
	// Nếu database không rỗng thì tiến hành lưu mảng vào file dữ liệu
	if(cam1database.length != 0) 
		fs.writeFile("/home/nhatquan/Videos/backup/backupcam1.txt", cam1database.toString(), (err,data)=>{});
	if(cam2database.length != 0) 
		fs.writeFile("/home/nhatquan/Videos/backup/backupcam2.txt", cam2database.toString(), (err,data)=>{});
},3000)

//3. Reset lại bộ nhớ khi lưu trữ đủ 2 tiếng
setInterval(()=>
{
	console.log("REFRESH")
	iscam1fresh = 1;
	iscam2fresh = 1;
	cam1database = [];
	cam2database = [];
	fs.rm("/home/nhatquan/Videos/server/camera1", { recursive: true, force: true }, (err) => {console.log("error camera 1 remove database = "+ err)})
	fs.rm("/home/nhatquan/Videos/server/camera2", { recursive: true, force: true }, (err) => {console.log("error camera 1 remove database = "+ err)})
},7200000)

//4. Sau 20p kể từ lần cuối cùng gửi email thì kích hoạt lại hệ thống gửi email
setInterval(()=>{
	detector = 1;
},1200000)

//III. XỬ LÝ CHO CAMERA
/*1. Single Camera
- ws: refer for a single connection on server side => ws: đại diện cho connnection phía server side
- "connection": bản thân connection là một event mặc định của websocket. Sự kiện này xảy ra khi một client connect vào websocket server
- "message": message event is fired when data is received through a WebSocket và cũng là 1 default event

wsServer.on('connection', (ws, req)=>{
	// ws: đại diện connection từ phía server side!

    console.log('Connected');
    connectedClients.push(ws);

	// ws phía server side lắng nghe và nếu có data thì forward tới các ws array khác.
    ws.on('message', data => {
        // forEach callback function return ws[the element of array] & i[index of array] phía server side
        
		connectedClients.forEach((ws,i)=>{
            if(ws.readyState === ws.OPEN){
                ws.send(data);   						// data was received from ESP32 is array of binary (hexa)
														// note that: ws stand for client so data from ESP32 client to websocket server
            }else{
                connectedClients.splice(i ,1);			// remove client which not ready 
            }
        })
    });
});*/


//2. Multiple Camera
/* @brief: Có 2 loại client mà server sẽ nhận được các message request.
	- Web client: Chỉ đơn giản là truy cập vào 192.168.3.122:8000 connect vào server và được server phản hồi request bằng trang login.html
	- ESP32 client: Liên tục gửi message là các frame cho phía server. Và expect cho client này là chỉ forward frames cho server mà không nhận action từ server => Sẽ không được push vào array nhận frames từ server nữa
	
	Các phase trong quá trình handle như sau:
		Step 1: Server được khởi tạo và liên tục lắng nghe request từ client
		Step 2: 
			- TH1: - Với bất kì một client nào là web client đều connect đến server và gửi bản tin "WEB_CLIENT" nhờ đây mà server sẽ nhận biết được đâu là web client và đâu là esp32 client
				   Ở trường hợp này đơn giản là Server sẽ so sánh bản tin nhận được nếu là WEB_CLIENT thì lập tức push "ws" vào một mảng (ws đại diện cho websocket client mà server dùng để định danh cho client và ws này định danh từ phía server)
				   Việc lưu trữ này khá quan trọng để  Server biết được sẽ gửi message đến đúng web client đang request
				   VD: Có 2 web client là arr[0]= điện thoại và arr[1]=laptop (0,1 là định danh được push vào mảng) và khi đó server dùng 1 vòng forEach (function (currentvalue= "ws", currentindex="i")) sẽ duyệt qua kể cả laptop hay điện thoại và so sánh 
				   nếu ws = 0 send tất cả message từ ESP32-1 và ESP32-2 sang điện thoại. Ngược lại là 1 thì send hết message sang laptop [Lúc này không thể phân biệt được bản tin nào là của ESP32-1 và bản tin nào của ESP32-2 => Công việc này do file html xử lý]
			- TH2: - Với client là ESP32-1 hoặc ESP32-2. Những client này sẽ không được push vào array vì bản chất là không cần lưu giữ lại định danh vì ta chỉ cần Server trả lại message cho webclient. Còn đối với ESP client chỉ đơn giản là Server liên tục nhận 
				   message và gửi tới TẤT CẢ WEB CLIENT. ESP32 thì lại liện tục gửi message
				   !Note: một khi ESP32 connected thì nó đang hoạt động liên tục ở ws.on("messsage"). Trừ khi rút khỏi nguồn thì ESP32 lập tức disconnect. Và thường quá trình của mình thì ESP32 luôn luôn connect. Chỉ có web client thì thường xuyên thay đổi connect
				   và disconnect
				   - ESP32 được lập trình với chế độ plug and play tức là bản thân việc rút ra cắm vào sẽ ngay lập tức capture frames và gửi cho server. Điều này phía server sẽ detect được việc ESP32 request connection mới. 
		Step 3: Với webclient đã disconnect (readyState != OPEN) sẽ được remove khỏi array

	@Rule: 
		   - ESP32-1 và ESP32-2 liên tục gửi message đến server mà không cần nhận lại message nào cả (ESP32 client không được push vào mảng để nhận frame mà chỉ gửi frame)
		   - Server liên tục nhận message từ ESP32-1 và ESP32-2 (là các frame) mà không phân biệt là bản tin từ phía ESP client nào. Các frame được gửi lên sẽ được đánh dấu bởi trường minor version bởi code phía ESP32
		   - Server liên tục gửi message đến tất cả các Web client đang connect nhờ vào việc Server ghi nhớ các Web client bằng 1 mảng và kiểm tra sự hoạt động của client đó (xem có còn connect hay không)
		   - Web client liên tục nhận message từ Server và xử lý xem là bản tin của ESP32 nào và phân tách đưa lên <img> tag phía client (dashboard.html). Phân biệt bởi minor version
*/

wsServer.on("connection", (ws, req) => {
	
	// A. WEB CLIENT
	// 1. Send image
	ws.on("message", (data) => {
		//1. Lắng nghe connect từ web client
		// NOTE: Chỉ có các WEB CLIENT mới được push vào mảng để forward ảnh đi. Còn ESP32 CLIENT chỉ được Server action là nhận ảnh và không được push vào array

		if (data.indexOf("webclient") !== -1) 
		{
			//1.1 Doi voi cac clien request page (192.168.3.122:8000) chi don gian la push vao ARR va return ve
			connectedClients.push(ws);
			console.log("Web client connected");
			//1.2 Kích hoạt active cho việc gửi email cảnh báo chu kì 20p một lần nếu nhận diện được khuôn mặt
			if(detector == 1)
			{
				console.log("Allow dectect handle");
				ws.send("activehandle");
			}
			return;                         
		}

		//2. Khi trace được ảnh từ camera nào có người thì lập tức gửi email và set lại deactive email system!
		//2.1 Detection từ camera 1 
		if (data.indexOf("capturetrace1") !== -1) 
		{
			filename = "/home/nhatquan/Videos/server/camera1/"+ cam1database[cam1database.length-5] +".jpeg"
			console.log("System Detect Warning From Camera 1!!!!!")
			warning_email_handler(filename).catch(console.error);
			detector = 0;
			return;                         
		}

		//2.2 Detection từ camera 2 
		if (data.indexOf("capturetrace2") !== -1) 
		{
			filename = "/home/nhatquan/Videos/server/camera2/"+ cam2database[cam2database.length-5] +".jpeg"
			console.log("System Detect Warning From Camera 2!!!!!")
			warning_email_handler(filename).catch(console.error);
			detector = 0;
			return;                         
		}

		//3. Get signal of time review from web client (dashboard.html) and send frame from that time to web client
		//3.1 Review camera 1
		if( data.indexOf("cctv1") !== -1)
		{
			cam1count = -1;
			strtime = data.toString().split(".")[0];
			strhour = data.toString().split(":")[0];
			strmin = data.toString().split(":")[1];
			strsec = data.toString().split(":")[2];
			for(let i = 0; i < cam1database.length; i++)
			{
				if((parseInt(strhour) == parseInt(cam1database[i].split(":")[0])) && (parseInt(cam1database[i].split(":")[1]) == parseInt(strmin)) && (parseInt(cam1database[i].split(":")[2]) >= parseInt(strsec)))
				{
					cam1count = i;
					break;
				}			
			}
			console.log("CAM1 from frame = "+ cam1count)

			if(cam1count == -1)
			{
				// Gửi đi giá trị cam1database[0] có 2 trường hợp và điều này đánh dấu giúp client biết là do không có database hay là database có nhưng input ngoài khoảng thời gian 
				// TH1: cam1database[0] = "undefined" => Data base không có gì
				// TH2: cam1database[0] không nằm trong dải thời gian được lưu trữ => báo cho client có thể review từ mấy giờ (VD: xem 14h nhưng database lưu từ 16h)
				ws.send("cam1counterror."+ cam1database[0]);
				console.log("Dont have any frame database for Camera1")
				cam1flag = 0;
				return;
			}
			
			cam1flag = 1;

			// Khi "cam1flag == 1" tức là đã tìm kiếm được dải frame để chuyển đi review. Khi đó sẽ phát lại với tốc độ 100ms/1 frame 
			setInterval(()=>{
				if(cam1flag == 1)
				{
					cam1count++;
					fs.readFile("/home/nhatquan/Videos/server/camera1/"+ cam1database[cam1count] +".jpeg", (err, data)=>{
						if(data != undefined)
						{
							data[12] = 3;							// "3" là định danh cho camera 1 ở page review. index 12 = minor version
							ws.send(data);	
						}
						else										
						{
							// database = "undefined" không có gì reset flag để không gửi nữa và camcount = -1 khi hết ảnh 					
							// Xảy ra khi rút camera (camera không ghi hình nữa). Nhưng việc xem lại vẫn diễn ra cho đến khi hết database
							cam1flag = 0;
							cam1count = -1;
						}
					})
				}
			}, 100);		// 100ms / 1frame
			return;
		}

		//3.2 Review camera 2
		if( data.indexOf("cctv2") !== -1)
		{
			cam2count = -1;
			strtime = data.toString().split(".")[0];
			strhour = data.toString().split(":")[0];
			strmin = data.toString().split(":")[1];
			strsec = data.toString().split(":")[2];
			for(let i = 0; i < cam2database.length; i++)
			{
				if((parseInt(strhour) == parseInt(cam2database[i].split(":")[0])) && (parseInt(cam2database[i].split(":")[1]) == parseInt(strmin)) && (parseInt(cam2database[i].split(":")[2]) >= parseInt(strsec)))
				{
					cam2count = i;
					break;
				}			
			}
			console.log("CAM2 from frame = "+ cam2count)

			if(cam2count == -1)
			{
				ws.send("cam2counterror."+ cam1database[0]);
				console.log("Dont have any frame database for Camera2")
				cam2flag = 0;
				return;
			}

			cam2flag = 1;
			setInterval(()=>{
				if(cam2flag == 1)
				{
					cam2count++;
					fs.readFile("/home/nhatquan/Videos/server/camera2/"+ cam2database[cam2count] +".jpeg", (err, data)=>{
						if(data != undefined)
						{
							data[12] = 4;
							ws.send(data);	
						}
						else 
						{
							cam2flag = 0;
							cam2count = -1;
						}
					})
				}
			}, 100);
			return;
		}

		// B. ESP32 CLIENT
		// 1. Khi nhận message (các frame) từ ESP32 client thì save image file vào local storage (folder camera1 cho cam1 và camera2 cho cam2) dựa vào data[12] = minor version
		// "data" chính là các biến chứa frame được gửi từ ESP32 lên cho server. "data" được lưu vào folder và được stream đến web client
		// "ESP32 Client send frame" ==> "Server Web Socket"  ==> "Web Client"
		if(data[12] == 1)
		{
			//a. Check xem database có gì hay không nếu đã có folder chứa frame thì chứng tỏ iscam1fresh = 0 và lúc này cần ghi tất cả các frames vào folder đã có
			if(iscam1fresh == 0)
			{
				var moment = new Date();
				var dir = moment.getHours()+":"+ moment.getMinutes()+":" + moment.getSeconds()+":" + moment.getMilliseconds();
				fs.writeFile("/home/nhatquan/Videos/server/camera1/"+ dir +".jpeg", data, ()=>{});
				cam1database.push(dir)
			}

			//b. Check xem database có gì hay không nếu không có gì thì chứng tỏ iscam1fresh = 1 và lúc này cần tạo folder chứa tất cả các frames
			if (iscam1fresh == 1)
			{
				fs.mkdir("/home/nhatquan/Videos/server/camera1", { recursive: true }, (err) => {console.log("Create database for camera 1 with error = "+ err)})
				iscam1fresh = 0;
			}
		}
		if (data[12] == 2)
		{
			if(iscam2fresh == 0)
			{
				var moment = new Date();
				var dir = moment.getHours()+":"+ moment.getMinutes()+":" + moment.getSeconds()+":" + moment.getMilliseconds();
				fs.writeFile("/home/nhatquan/Videos/server/camera2/"+ dir +".jpeg", data, ()=>{});
				cam2database.push(dir)
			}
			if (iscam2fresh == 1)
			{
				fs.mkdir("/home/nhatquan/Videos/server/camera2", { recursive: true }, (err) => {console.log("Create database for camera 2 with error = "+ err)})
				iscam2fresh = 0;
			}
		}


		// 5. Gửi STREAM đến tất cả các Web client đang lắng nghe
        // Khi message khong phai la "WEB_CLIENT" (hay la connection). Thi tat ca cac message (ke ca la cua ESP32-1 hay ESP32-2) se duoc gui toi "ws" (tuc la WEB client) tuong ung dang connect request vao Server. 
		// Sau do phia html (client) se tu xu ly message xem la cua ESP32-1 hay ESP32-2 de hien thi len dung khung
        
		// a. forEach callback function return ws[the element of array] & i[index of array]
		// "connectedClients" là array mà định danh các WEB CLIENT đã connect vào socket. Khi đó định danh "ws" thể hiện cho các web client từ phía server.
		connectedClients.forEach((ws, i) => {
            // Chi các WEB CLIENT nao dang vao web (request 192.168.3.122:8000) thi moi nhan duoc message cua rieng no được đặc trưng bởi "ws" phía Server
            // Server tao cho moi client 1 "ws" de lien lac va tra du lieu cho client
			if (connectedClients[i] == ws && ws.readyState === ws.OPEN) 
			{
                //b. Các ws phía server đặc trưng cho các web client sau khi nhận được "data"chính là frame mà ESP32 client đang đẩy lên liên tục được gửi cho phía client
				// => Lúc này chúng ta có một dòng streaming thực sự 
				ws.send(data);          
			} 
			else 
			{
				//c. splice 1 element from array. "splice(start,count)"
				connectedClients.splice(i, 1);  
			}
		});
	});

	ws.on("error", (error) => {
		console.error("WebSocket error observed: ", error);
	});
});

app.use(express.static("."));
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "./views/login.html")));
app.listen(HTTP_PORT, () => console.log(`HTTP server listening at ${HTTP_PORT}`));