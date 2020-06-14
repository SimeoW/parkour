let express = require('express');
let app = express();
let http = require('http').createServer(app);
let io = require('socket.io')(http);
let sanitizeHtml = require('sanitize-html');

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html');
});
app.get('/parkour', (req, res) => {
	res.sendFile(__dirname + '/parkour/index.html');
});
app.get('/skyboxes/:file', (req, res) => {
	res.sendFile(__dirname + '/parkour/skyboxes/' + req.params.file);
});
app.get('/lib/:file', (req, res) => {
	res.sendFile(__dirname + '/parkour/lib/' + req.params.file);
});

//app.use(express.static(__dirname + "/../public"));
function getUserCount(room) {
	let _room = io.sockets.adapter.rooms[room];
	if(_room !== undefined) return _room.length;
	else return 0;
}
function getUserList(room) {
	let list = [];
	let sockets = io.sockets.adapter.rooms[room].sockets;  
	for(let socketId in sockets ) {
		let socket = io.sockets.connected[socketId];
		list.push(socket.name);
	}
	return list;
}

function getRoomList() {
	let list = [];
	let rooms = io.sockets.adapter.rooms;
	for(let room in rooms) {
		if (!rooms[room].sockets.hasOwnProperty(room)) {
			list.push([room, rooms[room].length]);
		}
	}
	return list;
}

io.on('connection', (socket, name) => {
	socket.name = null;
	socket.room = null;
	let address = socket.handshake.address;

	console.log(`${address} connected.`);

	socket.on('disconnect', () => {
		console.log(`${address} disconnected.`);
		if(socket.name == null) return; // Haven't initialized yet

		let userCount = getUserCount(socket.room);
		io.emit('chat', `${socket.name} just left the chat. Users in room ${socket.room} = ${userCount}`)
	});

	socket.on('init', (name, room) => {
		name = sanitizeHtml(name).trim();
		if(name == '') name = 'Guest';
		if(room == null) room = '';
		name = sanitizeHtml(name).trim()
		room = sanitizeHtml(room).trim().replace(/(\s)+/, ' ').replace(/[^A-Za-z0-9_ !@#$%^&*-+=/.]/, '');

		console.log(`${address} initialized to "${name}"`);
		socket.name = name;
		socket.room = room;
		socket.join(room);

		let userCount = getUserCount(socket.room);
		io.in(room).emit('chat', `${name} just entered the chat. Users in room ${socket.room} = ${userCount}`)
	});

	socket.on('list', () => {
		socket.emit('list', getUserList(socket.room));
	})

	socket.on('rooms', () => {
		socket.emit('rooms', getRoomList());
	})

	socket.on('chat', (msg) => {
		if(socket.name == null) return; // Haven't initialized yet
		msg = sanitizeHtml(msg).trim();
		if(msg == '') return;
		msg = `${socket.name} says ${msg}`
		io.in(socket.room).emit('chat', msg);
	});

});

// Start the server
const port = process.env.PORT || 3000;
http.listen(port, () => {
	console.log('App is running on port ' + port);
});