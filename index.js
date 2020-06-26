const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const sanitizeHtml = require('sanitize-html');
const fs = require('fs');

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html');
});
app.get('/:file', (req, res) => {
	console.log('Loading "' + req.params.file + '"')
	res.sendFile(__dirname + '/' + req.params.file);
});
app.get('/skyboxes/:file', (req, res) => {
	res.sendFile(__dirname + '/skyboxes/' + req.params.file);
});
app.get('/lib/:file', (req, res) => {
	res.sendFile(__dirname + '/lib/' + req.params.file);
});

// Returns the number of users within a room
function getUserCount(room) {
	let _room = io.sockets.adapter.rooms[room];
	if(_room !== undefined) return _room.length;
	else return 0;
}

// Returns an array of usernames
function getUserList(room) {
	let list = [];
	if(io.sockets.adapter.rooms[room] === undefined) return list;
	let sockets = io.sockets.adapter.rooms[room].sockets;  
	for(let socketId in sockets ) {
		let socket = io.sockets.connected[socketId];
		list.push(socket.name);
	}
	return list;
}

// Returns an array of usernames
function getPlayerStates(room) {
	let list = [];
	if(io.sockets.adapter.rooms[room] === undefined) return list;
	let sockets = io.sockets.adapter.rooms[room].sockets;  
	for(let socketId in sockets ) {
		let socket = io.sockets.connected[socketId];
		let player_state = socket.last_player_state;
		if(player_state != null && player_state != undefined) list.push(player_state);
	}
	return list;
}

// Returns a list of room names with the number of players in each room
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

// Read a json object from file and return the object, or null if error
function loadJsonFile(path, callback) {
	try {
		fs.readFile(path, 'utf8', (err, map) => {
			try {
				if(err) {
					console.log('File read failed: ', err);
					callback(null);
				}
				callback(JSON.parse(map));
			} catch(e) {
				console.log(`Error reading "${path}": ${e}`);
				callback(null);
			}
		});
	} catch(e) {
		console.log(`Error reading "${path}": ${e}`);
		callback(null);
	}
}


io.on('connection', (socket) => {
	socket.name = null;
	socket.room = null;
	socket.last_player_state
	socket.initialized = false;
	let address = socket.handshake.address;

	console.log(`${address} connected.`);

	socket.on('disconnect', () => {
		if(!socket.initialized) return; // Haven't initialized yet
		console.log(`${address} disconnected.`);
		
		socket.emit('remove_player', socket.name);
		io.emit('chat', '', `${socket.name} left the server`)
	});

	socket.on('initialize', (name, room) => {
		if(socket.initialized) return; // Already initialized
		name = sanitizeHtml(name).trim().replace(/[^A-Za-z0-9_]/g, '').substring(0, 20);
		if(name == '') name = 'Guest';
		if(room == null) room = '';
		room = sanitizeHtml(room).trim().replace(/(\s)+/, ' ').replace(/[^A-Za-z0-9_ !@#$%^&*-+=/.]/, '');

		users = getUserList(room) // Don't allow any duplicate names
		let count = 1, _name = name;
		while(users.includes(name)) {
			count++;
			name = _name + count.toString()
			users = getUserList(room)
		}

		console.log(`${address} initialized to "${name}"`);
		socket.name = name;
		socket.room = room;
		socket.join(room);
		socket.initialized = true;

		let players = getPlayerStates(room);
		let map = loadJsonFile('maps/1.json', function(map) {
			// Callback function for once the file is read
			if(map == null) {
				// Fallback map
				map = {
					"spawn": [0, 10, 0],
					"gravity": [0, -50, 0],
					"objects": [
						["ambientlight", "", "rgb(255,255,255)", 0.8],
						["directionallight", "", [5000, 10000, 0], "rgb(255,0,0)", 1],
						["skybox", "", "nebula", "png", 10000],
						["cube", "", [0, -50, 0], [100, 100, 100], [0, 0, 0], "rgb(55,158,57)", 0.9, 0.3, 0],
						["cube", "", [75, -75, 0], [50, 50, 50], [0, 0, 0], "rgb(17, 117, 47)", 0.9, 0.3, 0],
						["cube", "", [-75, -75, 0], [50, 50, 50], [0, 0, 0], "rgb(17, 117, 47)", 0.9, 0.3, 0],
						["cube", "", [0, -75, 75], [50, 50, 50], [0, 0, 0], "rgb(17, 117, 47)", 0.9, 0.3, 0],
						["cube", "", [0, -75, -75], [50, 50, 50], [0, 0, 0], "rgb(17, 117, 47)", 0.9, 0.3, 0],
					]
				}
			}
			socket.emit('map', name, players, map);
		});

		io.in(room).emit('chat', '', `${name} joined the server`);

	});

	socket.on('list', () => {
		socket.emit('list', getUserList(socket.room));
	})

	socket.on('rooms', () => {
		socket.emit('rooms', getRoomList());
	})

	socket.on('update_player_state', (state) => {
		if(!socket.initialized || state.length != 16) { // Misbehaving
			console.log('Player misbehaving: ' + socket.name);
			socket.disconnect();
			return;
		}
		for(let item of state) { // If anything is not a number, return
			if(typeof item != 'number') return;
		}
		state.unshift(socket.name);
		socket.last_player_state = state;
		// "to" doesn't send back to sender, but everyone else
		io.in(socket.room).emit('update_player_state', state);
	})

	socket.on('chat', (msg) => {
		if(!socket.initialized) { // Misbehaving
			console.log('Player misbehaving: ' + socket.name);
			socket.disconnect();
			return;
		}
		msg = sanitizeHtml(msg).trim().substring(0, 256);
		if(msg == '') return;
		//msg = `<span>${socket.name}:</span> ${msg}`
		// "to" does send back to sender, everyone
		io.in(socket.room).emit('chat', socket.name, msg);
	});

});

// Start the server
const port = process.env.PORT || 3000;
http.listen(port, () => {
	console.log('App is running on port ' + port);
});