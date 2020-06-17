const zeroVector = new THREE.Vector3(0, 0, 0);

window.onkeypress = function(e) {
	let id = document.activeElement.id;
	let textbox = document.getElementById('chat');
	if(id == 'chat') {
		if(e.key == 'Enter') {
			game.chat(textbox.value);
			textbox.value = '';
			//chat.blur();
		}
	} else {
		if(e.key == 'Enter' || e.key == 't') {
			textbox.focus();
			textbox.select();
			e.preventDefault();
		}
		if(e.key == '/' || e.key == '\\') {
			textbox.focus();
			textbox.select();
		}
	}
}
window.onkeyup = function(e) {
	let id = document.activeElement.id;
	let textbox = document.getElementById('chat');
	if(id == 'chat') {
		if(e.key == 'Escape') {
			textbox.value = '';
			textbox.blur();
		}
	}
}
class Game {
	constructor() {

		this.fixedTimeStep = 1 / 60;

		this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100000);
		this.fov = 40;
		this.scene = new Physijs.Scene({ fixedTimeStep: this.fixedTimeStep });

		this.server_name = null;
		this.player_name = null;
		this.socket = null;

		this.gravity = zeroVector;

		this.objects = []; // Three.js objects

		this.renderer = new THREE.WebGLRenderer({ antialias: false });
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(new THREE.Color(0x101010), 1);
		this.renderer.domElement.id = 'draw';

		this.renderer.shadowMap.enabled = false;
		//this.renderer.shadowMap.type = THREE.BasicShadowMap;
		//this.renderer.shadowMapEnabled = true;
		//this.renderer.shadowMapSoft = true;
		document.getElementById('viewport').appendChild(this.renderer.domElement);

		// Keep everything synchronized by rendering after each physics update
		this.scene.addEventListener('update', this.draw.bind(this)); // Keep the same this

		this.spawn = null;
		this.players = [];
		this.player = null;
		this.playerScale = {l: 6, w: 1, h: 10};

		// Used for standardized user input
		this.input = new StInput(window);

		// Used to orbit the camera around the player
		this.controls = new THREE.CameraOrbit(this.renderer, this.scene, this.camera);
		this.controls.smoothing = 10;

		this.paused = false;

		// Timing variables, used to ensure that tasks are done in a specific frequency
		this.prevFrameTime = (new Date()).getTime();
		this.lastServerUpdateTime = this.prevFrameTime;
		this.lastPositionCheckTime = this.prevFrameTime;
		this.step();
	}

	chat(msg) {
		if(msg.startsWith('/') || msg.startsWith('\\')) {
			let cmd = msg.substring(1).toLowerCase();
			let words = cmd.split(/\s+/);
			switch(words[0]) {
				case 'help':
					let html = '<h3>Welcome to VWORLD, you are in server "' + this.server_name + '"</h3>';
					html += '<hr>The controls are as follows:';
					html += '<br>• SPACE <span style="color: #FFF76B">: Jump</span>';
					html += '<br>• W, UP <span style="color: #FFF76B">: Move forward</span>';
					html += '<br>• A, LEFT <span style="color: #FFF76B">: Rotate camera left</span>';
					html += '<br>• S, DOWN <span style="color: #FFF76B">: Move backward</span>';
					html += '<br>• D, RIGHT <span style="color: #FFF76B">: Rotate camera right</span>';
					html += '<br>• SHIFT <span style="color: #FFF76B">: Sprint</span>';
					html += '<br>• T, ENTER <span style="color: #FFF76B">: Chat</span>';

					html += '<hr>The chat commands are as follows (~ can be anything):';
					html += '<br>• \\help <span style="color: #FFF76B">: List the available commands</span>';
					html += '<br>• \\list <span style="color: #FFF76B">: List the players currently on the server</span>';
					html += '<br>• \\pause <span style="color: #FFF76B">: Toggle the paused game state</span>';
					html += '<br>• \\rename<span style="color: #FFF76B">: Rename your character</span>';
					html += '<br>• \\reset <span style="color: #FFF76B">: Respawn</span>';
					html += '<br>• \\scale ~ ~ ~<span style="color: #FFF76B">: Set your (length=' + this.player.length + ', width=' + this.player.width + ', height=' + this.player.height + ')</span>';
					html += '<br>• \\server ~<span style="color: #FFF76B">: Move to a new server</span>';
					html += '<br>• \\servers<span style="color: #FFF76B">: List the currently active servers</span>';
					html += '<br>• \\fov ~<span style="color: #FFF76B">: Set the camera\'s field of view</span>';
					html += '<br>';
					html += '<br>';
					this.addChatMessage('', html, '#FFFFFF');
					break;
				case 'list':
					this.socket.emit('list');
					break;
				case 'reset':
					this.remove(this.player);
					this.player = null;
					break;
				case 'pause':
					if(this.paused) {
						this.paused = false;
						this.addChatMessage('', 'The game has been resumed', '#FFFFFF');
					} else {
						this.paused = true;
						this.addChatMessage('', 'The game has been paused', '#FFFFFF');
					}
					break;
				case 'rename':
					localStorage.removeItem('playerName');
					location.reload();
					break;
				case 'scale':
					if(words.length != 4) {
						this.addChatMessage('', 'Invalid number of parameters. Must contain length, width, and height', '#FF4949');
						return;
					}

					let l = words[1], w = words[2], h = words[3];
					if(l == '~') l = 6;
					if(w == '~') w = 1;
					if(h == '~') h = 10;
					l = parseFloat(l);
					w = parseFloat(w);
					h = parseFloat(h);
					if(isNaN(l) || isNaN(w) || isNaN(h)) {
						this.addChatMessage('', 'Invalid parameters, must be numbers', '#FF4949');
						return;
					}
					this.playerScale = {l: l, w: w, h: h};
					this.remove(this.player);
					this.player = null;
					break;
				case 'servers':
					this.socket.emit('rooms');
					break;
				case 'server':
					if(words.length != 2) {
						this.addChatMessage('', 'Invalid number of parameters. Must contain a server name', '#FF4949');
						return;
					}

					let s = words[1];
					localStorage.setItem('serverName', s);
					location.reload();
					break;
				case 'fov':
					if(words.length != 2) {
						this.addChatMessage('', 'Invalid number of parameters. Must contain an FOV value', '#FF4949');
						return;
					}
					let fov = words[1];
					if(fov == '~') fov = 40;
					this.fov = parseFloat(fov);
					break;

				default:
					this.addChatMessage('', 'Command not found, type \\help for more information', '#FF4949');
			}
			document.getElementById('chat').blur();
		} else {
			msg = msg.substring(0, 256);
			this.socket.emit('chat', msg);
		}
	}

	// Clear all objects from the world
	clearMap() {
		for (let i in this.scene._objects) {
			this.remove(this.scene._objects[i]);
		}
		this.player = null;
	}

	initializePlayer() {
		// Remove the old player if not done already
		if(this.player != null) this.remove(this.player);
		// Ensure that there is a spawn
		if(this.spawn === undefined) this.spawn = zeroVector;
		let color = 0xFFFFFF;
		this.player = this.addPlayer(this.player_name, new THREE.Vector3(this.spawn.x, this.spawn.y, this.spawn.z), {l: this.playerScale.l, w: this.playerScale.w, h: this.playerScale.h}, zeroVector, color);
		this.player.previousPosition = new THREE.Vector3(this.player.position.x, this.player.position.y, this.player.position.z);
		this.player.velocity = 1;
		this.player.maxVelocity = 70;
		this.player.jumping = false;
		this.player.jumpVelocity = 150;
		this.player.addEventListener('collision', function(other_object, relative_velocity, relative_rotation, contact_normal){
			game.player.jumping = false;
		});
		this.controls.position = new THREE.Vector3(0, 50, -80);
		this.playerRespawnTimeout = null;
	}

	// Physics for a single frame
	step() {
		this.currentFrameTime = (new Date()).getTime();
		this.deltaTime = (this.currentFrameTime - this.prevFrameTime) / 1000;

		if(!this.paused) {
			this.updateControls();
			this.playerMovement();
			this.scene.simulate();
		} else {
			this.updateControls();
			this.draw();
		}
		this.input.endFrame();
		this.prevFrameTime = this.currentFrameTime;
		//console.log(1 / this.deltaTime)

	}

	draw() {
		this.updateCamera();
		this.renderer.render(this.scene, this.camera);
		requestAnimationFrame(this.step.bind(this));
	}

	// Update the camera by applying a smooth transition to the next player's position
	updateCamera() {
		if(this.player == null) return;
		let x = (this.controls.target.x * this.controls.smoothing + this.player.position.x) / (this.controls.smoothing + 1);
		let y = (this.controls.target.y * this.controls.smoothing + this.player.position.y) / (this.controls.smoothing + 1);
		let z = (this.controls.target.z * this.controls.smoothing + this.player.position.z) / (this.controls.smoothing + 1);
		this.controls.target = new THREE.Vector3(x, y, z);
		this.camera.setFocalLength(this.fov);
	}

	// Handle the camera orbit
	updateControls() {
		let rotateCamera = this.input.mouseDown(this.input.MouseButtons.left);
		let moveCamera = false;
		let mouseDelta = this.input.mouseDelta;
		let zoom = this.input.mouseWheel;
		mouseDelta.x /= 3;
		mouseDelta.y /= 3;
		if(document.activeElement.id != 'chat') {
			if(this.input.down('subtract') || this.input.down('page_down')) zoom += 10;
			else if(this.input.down('add') || this.input.down('page_up')) zoom -= 10;

			if(this.input.down('left_arrow') || this.input.down('a')) {
				rotateCamera = true;
				mouseDelta.x -= 3;
			}
			if(this.input.down('right_arrow') || this.input.down('d')) {
				rotateCamera = true;
				mouseDelta.x += 3;
			}
		}

		let controllerInput = {
			deltaTime: this.deltaTime,                                      // time passed, in seconds, since last update call
			rotateHorizontally: rotateCamera ? -mouseDelta.x : 0,                    // rotation around y axis
			rotateVertically: rotateCamera ? -mouseDelta.y : 0,                        // rotate vertically around x / z axis
			moveOffsetVertically: 0, // (moveCamera ? -mouseDelta.y : 0) * 10,                               // move the target offset (affect lookat AND camera position), along camera's Y axis. 
			moveOffsetHorizontally: 0, // (moveCamera ? mouseDelta.x : 0) * 10,                            // move the target offset left / right, relative to camera's world direction.
			zoom: zoom * 10,                                                // zoom in / out
		}
		this.controls.update(controllerInput);
	}

	// Handle the player's movement
	playerMovement() {
		if(this.player == null || this.player === undefined || isNaN(this.player.position.x)) {
			if(this.playerRespawnTimeout == null) {
				this.playerRespawnTimeout = setTimeout(function() {
					this.initializePlayer();
				}.bind(this), 1000);
			}
			return;
		}
		if(document.activeElement.id != 'chat') {
			if(!this.player.jumping) {

				// Sprinting
				let maxVelocity = this.player.maxVelocity;
				if(this.input.down('shift')) maxVelocity *= 1.25;
				// Moving forward
				if(this.input.down('up_arrow') || this.input.down('w')) {
					this.updatePlayerRotation();
					
					// 2D angle
					let vx2 = game.player.position.x - game.camera.position.x;
					let vz2 = game.player.position.z - game.camera.position.z;
					let dt = Math.sqrt(vx2 * vx2 + vz2 * vz2);

					if(dt != 0) {
						let v = this.player.getLinearVelocity();
						//console.log(v.z)
						let vx = v.x + this.player.velocity * vx2 / dt * this.deltaTime * 100;
						let vz = v.z + this.player.velocity * vz2 / dt * this.deltaTime * 100;

						let vel = Math.sqrt(vx * vx + vz * vz);
						if(vel > maxVelocity) { // Limit velocity
							vx = vx2 / dt * maxVelocity
							vz = vz2 / dt * maxVelocity
						}
						this.player.setLinearVelocity(new THREE.Vector3(vx, v.y, vz));
						this.player.setAngularVelocity(zeroVector);
					} else {
						console.log('Error: distance is 0')
					}
				}
				// Moving backward
				if(this.input.down('down_arrow') || this.input.down('s')) {
					this.updatePlayerRotation();

					// 2D angle
					let vx2 = game.player.position.x - game.camera.position.x;
					let vz2 = game.player.position.z - game.camera.position.z;
					let dt = Math.sqrt(vx2 * vx2 + vz2 * vz2);

					if(dt != 0) {
						let v = this.player.getLinearVelocity();
						//console.log(v.z)
						let vx = v.x - this.player.velocity * vx2 / dt * this.deltaTime * 100;
						let vz = v.z - this.player.velocity * vz2 / dt * this.deltaTime * 100;

						let vel = Math.sqrt(vx * vx + vz * vz);
						if(vel > maxVelocity) { // Limit velocity
							vx = -vx2 / dt * maxVelocity
							vz = -vz2 / dt * maxVelocity
						}
						this.player.setLinearVelocity(new THREE.Vector3(vx, v.y, vz));
						this.player.setAngularVelocity(zeroVector);
					} else {
						console.log('Error: distance is 0')
					}
				}
				// Jumping
				if(this.input.down('space')) {
					let v = this.player.getLinearVelocity();
					if(v.y < 0) v.y = 0;
					this.player.setLinearVelocity(new THREE.Vector3(v.x, v.y + this.player.jumpVelocity * this.deltaTime * this.deltaTime * 1000, v.z));
					this.player.jumping = true;
				}
			} else { // While the player is in the air, grand a small amount of influence
				let influenceVelocity = 0.01;
				// Moving forward
				if(this.input.down('up_arrow') || this.input.down('w')) {
					let vx2 = game.player.position.x - game.camera.position.x;
					let vz2 = game.player.position.z - game.camera.position.z;
					let dt = Math.sqrt(vx2 * vx2 + vz2 * vz2);
					if(dt != 0) {
						let v = this.player.getLinearVelocity();
						let vx = v.x + influenceVelocity * vx2 / dt * this.deltaTime * 100;
						let vz = v.z + influenceVelocity * vz2 / dt * this.deltaTime * 100;
						
						//let vel = Math.sqrt(vx * vx + vz * vz);
						//if(vel > this.player.maxVelocity) { // Limit velocity
						//	vx = vx2 / dt * this.player.maxVelocity
						//	vz = vz2 / dt * this.player.maxVelocity
						//}
						this.player.setLinearVelocity(new THREE.Vector3(vx, v.y, vz));
					} else {
						console.log('Error: distance is 0')
					}
				}
				// Moving backward
				if(this.input.down('down_arrow') || this.input.down('s')) {
					let vx2 = game.player.position.x - game.camera.position.x;
					let vz2 = game.player.position.z - game.camera.position.z;
					let dt = Math.sqrt(vx2 * vx2 + vz2 * vz2);
					if(dt != 0) {
						let v = this.player.getLinearVelocity();
						let vx = v.x - influenceVelocity * vx2 / dt * this.deltaTime * 100;
						let vz = v.z - influenceVelocity * vz2 / dt * this.deltaTime * 100;
						
						//let vel = Math.sqrt(vx * vx + vz * vz);
						//if(vel > this.player.maxVelocity) { // Limit velocity
						//	vx = -vx2 / dt * this.player.maxVelocity
						//	vz = -vz2 / dt * this.player.maxVelocity
						//}
						this.player.setLinearVelocity(new THREE.Vector3(vx, v.y, vz));
					} else {
						console.log('Error: distance is 0')
					}
				}
			}
		}

		// Every second, check if the player has not moved, if no, then grant access to a free jump
		if(this.currentFrameTime - this.lastPositionCheckTime >= 1000) {
			// If the player has not moved
			if(this.player.position.x == this.player.previousPosition.x && this.player.position.y == this.player.previousPosition.y && this.player.position.z == this.player.previousPosition.z) {
				this.player.jumping = false;
			}
			this.player.previousPosition = new THREE.Vector3(this.player.position.x, this.player.position.y, this.player.position.z);
			this.lastPositionCheckTime = (new Date()).getTime();
		}
		// Update the server
		if(this.currentFrameTime - this.lastServerUpdateTime >= 50) {
			let p = this.player.position, r = this.player.rotation, lv = this.player.getLinearVelocity(), av = this.player.getAngularVelocity();
			this.socket.emit('update_player_state', [p.x, p.y, p.z, r.x, r.y, r.z, lv.x, lv.y, lv.z, av.x, av.y, av.z, this.player.length, this.player.width, this.player.height]);
			this.lastServerUpdateTime = (new Date()).getTime();
		}

		// Falling out of bounds
		if(this.player.position.y < this.respawnHeight) {
			this.remove(this.player);
			this.player = null;
		}
	}

	// Set the player's rotation to the camera direction
	updatePlayerRotation() {
		let vx = game.player.position.x - game.camera.position.x;
		let vz = game.player.position.z - game.camera.position.z;
		let dt = Math.sqrt(vx * vx + vz * vz);
		let theta = Math.atan2(vx, vz);
		if (theta < 0) theta += 2 * Math.PI;
		this.player.rotation.x = 0; // Keep player upright
		this.player.rotation.y = theta; // Facing against the camera
		this.player.rotation.z = 0;
		this.player.__dirtyRotation = true;
	}

	// Get/set gravity
	get gravity(){ return this._gravity; }
	set gravity(vector) {
		this._gravity = vector;
		this.scene.setGravity(vector);
	}

	// Get/set paused
	get paused(){ return this._paused; }
	set paused(bool) {
		if(!bool) this.scene.onSimulationResume();
		this._paused = bool;
	}

	// Get/set spawn
	get spawn(){ return this._spawn; }
	set spawn(position) {
		this._spawn = position;
	}

	// Connect to the server, returns boolean success
	connect(player_name, server_name) {
		if(this.player_name != null) return false;
		if(this.server_name != null) return false;
		if(this.socket != null) return false;
		this.player_name = player_name;
		this.server_name = server_name;

		this.socket = io();
		this.socket.emit('initialize', player_name, server_name);
		if(this.server_name != '') this.addChatMessage('', 'You are now in server "' + this.server_name + '"')
		this.addChatMessage('', 'Type "\\help" for help')
		//this.chat('\\help');

		this.socket.on('map', function(name, map) {
			this.player_name = name;
			this.loadMap(map);
		}.bind(this)); // Make that this, this this

		this.socket.on('update_player_state', function(state) {
			let name = state.shift();
			if(typeof name != 'string' || state.length != 15) return;
			if(this.player != null && name == this.player_name) return; // Ignore self
			
			for(let item of state) { // If anything is not a number, ignore the message
				if(typeof item != 'number') return;
			}
			
			let p = this.players[name];
			let l = state[12], w = state[13], h = state[14];
			let color = 0xFFFFFF;
			if(p === undefined) { // Create online player object
				p = this.addPlayer(name, new THREE.Vector3(state[0], state[1], state[2]), {l: l, w: w, h: h}, new THREE.Vector3(state[3], state[4], state[5]), color);
				p.setLinearVelocity(new THREE.Vector3(state[6], state[7], state[8]));
				p.setAngularVelocity(new THREE.Vector3(state[9], state[10], state[11]));
				this.players[name] = p;
			} else { // Update player position
				if(p.length != l || p.width != w || p.height != h) {
					// One of the scales changed, we need to reset the player
					p = this.players[name] = p.setScale(l, w, h);
				}

				p.__dirtyPosition = true;
				p.position.set(state[0], state[1], state[2]);
				p.__dirtyRotation = true;
				p.rotation.set(state[3], state[4], state[5]);
				p.setLinearVelocity(new THREE.Vector3(state[6], state[7], state[8]));
				p.setAngularVelocity(new THREE.Vector3(state[9], state[10], state[11]));
			}
		}.bind(this));

		this.socket.on('remove_player', function(name) {
			if(typeof name != 'string') return;
			if(this.players[name] !== undefined) {
				console.log(`Removing "${name}"`)
				this.remove(this.players[name]);
				delete this.players[name]
			}
		});

		this.socket.on('chat', function(name, msg) {
			let color = '#FFFFFF';
			if(name != '') color = this.strColor(name);
			this.addChatMessage(name, msg, color);
		}.bind(this));

		this.socket.on('list', function(names) {
			names.sort();
			let html = 'Users online:';
			for(let name of names) {
				let color = this.strColor(name);
				html += '<br><span style="color: ' + color + '">' + '•</span> <span style="color: #FFF76B">' + name + '</span>';
			}
			this.addChatMessage('', html, '#FFFFFF');
		}.bind(this));

		this.socket.on('rooms', function(rooms) {
			let html = 'Active servers:';
			for(let i in rooms) {
				let room = rooms[i][0], unit = rooms[i][1].toString();
				unit += (unit == '1' ? ' player' : ' players');
				html += '<br>• "<span style="color: #FFF76B">' + room + '</span>": <span style="color: #8DDBFF">' + unit + '</span>';
			}
			this.addChatMessage('', html, '#FFFFFF');
		}.bind(this));
		return true;
	}

	// Given a string, compute a corresponding color
	strColor(str) {
		str = str.trim() + ' ';
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = str.charCodeAt(i) + ((hash << 5) - hash);
		}
		let c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
		return '#' + ('00000'.substring(0, 6 - c.length) + c);
	}

	// Given a color, returns a black or white color for the background/foreground
	strBWColor(hex) {
		if (hex.indexOf('#') === 0) hex = hex.slice(1);
		if (hex.length === 3) {
			hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
		}
		if (hex.length !== 6) {
			throw new Error('Invalid HEX color.');
		}
		let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
		return (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000000' : '#FFFFFF';
	}

	addChatMessage(name, msg, color) {
		let html = '';
		if(name == '') {
			html = '<tr><td id="chatserver" style="color: ' + color + '">' + msg + '</td></tr>';
		} else {
			let bw = this.strBWColor(color);
			html = '<tr><td><span id="chatname" style="color: ' + bw + '; background-color: ' + color + '">' + name + '</span><span id="chatcontents">' + msg + '</span></td></tr>';
		}
		let chatfeed = document.getElementById('chatfeed');
		chatfeed.innerHTML += html;
		if(chatfeed.children.length > 5) chatfeed.children[0].remove();
	}

	// Load map from JSON object
	loadMap(map) {
		this.clearMap();
		console.log('Loading map...');
		if(map['objects'] === undefined) return false;

		// Set the spawn location
		if(map['spawn'] !== undefined && map.spawn.length == 3) {
			this.spawn = new THREE.Vector3(map.spawn[0], map.spawn[1], map.spawn[2]);
		} else return false;

		// Set the gravity
		if(map['gravity'] !== undefined && map.gravity.length == 3) {
			this.gravity = new THREE.Vector3(map.gravity[0], map.gravity[1], map.gravity[2]);
		} else return false;

		this.respawnHeight = Infinity;
		
		// Add each object one by one
		for(let object of map.objects) {
			let type, name, position, scale, rotation, color, friction, restitution, mass, colorNum, intensity, texture, size, radius, positionVector, rotationVector, minHeight, fileType, width, height;
			type = object[0];
			if(typeof type != 'string') continue;
			name = object[1];
			if(typeof name != 'string') continue;
			if(name.trim() == "") name = type; // Set the default to the type

			//console.log(`Started  loading "${name}"`);
			switch(type) {
				case 'cube':
					if(object.length != 9) continue;
					position = object[2];
					if(position.length != 3) continue;
					positionVector = new THREE.Vector3(position[0], position[1], position[2])
					scale = object[3];
					if(scale.length != 3) continue;
					rotation = object[4];
					if(rotation.length != 3) continue;
					rotationVector = new THREE.Vector3(rotation[0], rotation[1], rotation[2])
					color = object[5];
					if(typeof color != 'string') continue;
					friction = object[6];
					if(typeof friction != 'number') continue;
					restitution = object[7];
					if(typeof restitution != 'number') continue;
					mass = object[8];
					if(typeof mass != 'number') continue;
					this.addCube(name, positionVector, scale, rotationVector, color, friction, restitution, mass);
					
					minHeight = positionVector.y - scale[1] / 2;
					if(minHeight < this.respawnHeight) this.respawnHeight = minHeight;
					break;

				case 'sphere':
					if(object.length != 8) continue;
					position = object[2];
					if(position.length != 3) continue;
					positionVector = new THREE.Vector3(position[0], position[1], position[2])
					radius = object[3];
					if(typeof radius != 'number') continue;
					color = object[4];
					if(typeof color != 'string') continue;
					friction = object[5];
					if(typeof friction != 'number') continue;
					restitution = object[6];
					if(typeof restitution != 'number') continue;
					mass = object[7];
					if(typeof mass != 'number') continue;
					this.addSphere(name, positionVector, radius, color, friction, restitution, mass);
					
					minHeight = positionVector.y - radius;
					if(minHeight < this.respawnHeight) this.respawnHeight = minHeight;
					break;

				case 'plane':
					if(object.length != 9) continue;
					position = object[2];
					if(position.length != 3) continue;
					positionVector = new THREE.Vector3(position[0], position[1], position[2])
					width = object[3];
					if(typeof width != 'number') continue;
					height = object[4];
					if(typeof height != 'number') continue;
					rotation = object[5];
					console.log('Plane')
					if(rotation.length != 3) continue;
					rotationVector = new THREE.Vector3(rotation[0], rotation[1], rotation[2])
					color = object[6];
					if(typeof color != 'string') continue;
					friction = object[7];
					if(typeof friction != 'number') continue;
					restitution = object[8];
					if(typeof restitution != 'number') continue;
					this.addPlane(name, positionVector, width, height, rotationVector, color, friction, restitution);
					
					minHeight = positionVector.y;
					if(minHeight < this.respawnHeight) this.respawnHeight = minHeight;
					break;

				case 'skybox':
					if(object.length != 5) continue;
					texture = object[2];
					if(typeof texture != 'string') continue;
					fileType = object[3];
					if(fileType != 'png' && fileType != 'jpg') continue;
					size = object[4];
					if(typeof size != 'number') continue;
					this.addSkybox(name, texture, fileType, size);
					break;

				case 'pointlight':
					if(object.length != 6) continue;
					position = object[2];
					if(position.length != 3) continue;
					positionVector = new THREE.Vector3(position[0], position[1], position[2])
					color = object[3];
					if(typeof color != 'string') continue;
					distance = object[4];
					if(typeof distance != 'number') continue;
					decay = object[5];
					if(typeof decay != 'number') continue;
					this.addPointLight(name, positionVector, color, distance, decay);
					break;

				case 'ambientlight':
					if(object.length != 4) continue;
					color = object[2];
					if(typeof color != 'string') continue;
					intensity = object[3];
					if(typeof intensity != 'number') continue;
					this.addAmbientLight(name, color, intensity);
					break;

				case 'directionallight':
					if(object.length != 5) continue;
					position = object[2];
					if(position.length != 3) continue;
					positionVector = new THREE.Vector3(position[0], position[1], position[2])
					color = object[3];
					if(typeof color != 'string') continue;
					intensity = object[4];
					if(typeof intensity != 'number') continue;
					this.addDirectionalLight(name, positionVector, color, intensity);
					break;

				default:
					console.log(`Unknown object "${name}"`);
					continue;
			}
			//console.log(`Finished loading "${name}"`);
		}
		this.respawnHeight -= 30;
		this.initializePlayer();
	}


	// Save map to JSON object
	saveMap() {
		let map = {};
		map.spawn = [this.spawn.x, this.spawn.y, this.spawn.z];
		map.gravity = [this.gravity.x, this.gravity.y, this.gravity.z];

		for(object of this.objects) {

		}
	}

	add(object) {
		if(object == null || object === undefined) return;
		this.scene.add(object);
		//object.__dirtyPosition = true;
		//object.__dirtyRotation = true;
	}

	remove(object) {
		if(object == null || object === undefined) return;
		if(object.label !== null || object.label !== undefined) {
			this.scene.remove(object.label)
		}
		this.scene.remove(object);
	}

	addCube(name, position, scale, rotation, color, friction, restitution, mass) {
		let cube = new Physijs.BoxMesh(
			new THREE.CubeGeometry(scale[0], scale[1], scale[2]),
			Physijs.createMaterial(new THREE.MeshStandardMaterial({
				color: new THREE.Color(color),
				roughness: 0.5
			}), friction, restitution),
			mass
		);
		cube.meshName = name;
		cube.meshType = 'cube';
		cube.position.set(position.x, position.y, position.z);
		cube.rotation.set(THREE.Math.degToRad(rotation.x), THREE.Math.degToRad(rotation.y), THREE.Math.degToRad(rotation.z));
		//cube.receiveShadow = true;
		//cube.castShadow = true;
		this.objects.push(cube);
		this.add(cube);
		return cube;
	}

	addSphere(name, position, radius, color, friction, restitution, mass) {
		let sphere = new Physijs.SphereMesh(
			new THREE.SphereGeometry(radius),
			Physijs.createMaterial(new THREE.MeshStandardMaterial({
				color: new THREE.Color(color),
				roughness: 0.5,
				flatShading: true,
			}), friction, restitution),
			mass
		);
		sphere.meshName = name;
		sphere.meshType = 'sphere';
		sphere.position.set(position.x, position.y, position.z);
		//sphere.receiveShadow = true;
		//sphere.castShadow = true;
		this.objects.push(sphere);
		this.add(sphere);
		return sphere;
	}
	
	// TODO: Apply scale, rotation, ...
	addPlayer(name, position, scale, rotation, color, friction = 0.8, restitution = 0.1, mass = 30) {
		let playerGeometry = new THREE.Geometry();
		playerGeometry.vertices = [
			new THREE.Vector3(-scale.w / 2, -scale.h / 2, 0),
			new THREE.Vector3(-scale.w / 2, scale.h / 2, 0),
			new THREE.Vector3(scale.w / 2, scale.h / 2, 0),
			new THREE.Vector3(scale.w / 2, -scale.h / 2, 0),
			new THREE.Vector3(0, 0, scale.l)
		];
		playerGeometry.faces = [
			new THREE.Face3(0, 1, 2),
			new THREE.Face3(0, 2, 3),
			new THREE.Face3(1, 0, 4),
			new THREE.Face3(2, 1, 4),
			new THREE.Face3(3, 2, 4),
			new THREE.Face3(0, 3, 4)
		];
		let playerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
		//playerMaterial.depthTest = false;

		let player = new Physijs.BoxMesh(
			playerGeometry,
			Physijs.createMaterial(playerMaterial, friction, restitution),
			mass
		);
		player.meshName = name;
		player.meshType = 'player';
		player.position.set(position.x, position.y, position.z);
		//player.castShadow = true;
		player.length = scale.l;
		player.width = scale.w;
		player.height = scale.h;

		let _color = this.strColor(name);
		player.label = new THREE.TextSprite({
			text: name,
			fontFamily: 'Helvetica, Arial, sans-serif',
			fontSize: 1.8,
			fillColor: 0xFFFFFF,
		});
		player.label.position.set(0, player.height / 2 + 2, 0);
		player.label.material.depthTest = false;
		player.add(player.label);
		
		this.add(player);

		// A function for setting the scale of non-main players
		// (i.e. not the main game.player, because it has special added functions)
		player.setScale = (l, w, h) => {
			let scale = {l: l, w: w, h: h};
			this.remove(player);
			player = this.addPlayer(name, position, scale, rotation, color, friction, restitution, mass);
			return player;
		}
		return player;
	}

	addPlane(name, position, width, height, rotation, color, friction, restitution) {
		let plane = new Physijs.PlaneMesh(
			new THREE.PlaneGeometry(width, height),
			Physijs.createMaterial(new THREE.MeshStandardMaterial({
				color: new THREE.Color(color),
				roughness: 0.5,
				side: THREE.DoubleSide
			}), friction, restitution)
		);
		plane.meshName = name;
		plane.meshType = 'plane';
		plane.rotation.set(THREE.Math.degToRad(rotation.x), THREE.Math.degToRad(rotation.y), THREE.Math.degToRad(rotation.z));
		plane.position.set(position.x, position.y, position.z);
		//plane.receiveShadow = true;
		//plane.castShadow = true;
		this.objects.push(plane);
		this.add(plane);
		return plane;
	}

	addSkybox(name, texture, fileType, size) {
		let materialArray = [], loader = new THREE.TextureLoader();
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-xpos.' + fileType)
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-xneg.' + fileType)
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-ypos.' + fileType)
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-yneg.' + fileType)
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-zpos.' + fileType)
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-zneg.' + fileType)
		}));
		for(let i = 0; i < 6; i++) {
			materialArray[i].side = THREE.BackSide;
		}
		let skyboxGeometry = new THREE.CubeGeometry(size, size, size, 1, 1, 1);
		let skybox = new THREE.Mesh(skyboxGeometry, materialArray);
		skybox.meshName = name;
		skybox.meshType = 'skybox';
		this.objects.push(skybox);
		this.add(skybox);
		return skybox;
	}

	addPointLight(name, position, color, distance, decay) {
		let light = new THREE.PointLight(new THREE.Color(color), distance, decay);
		light.meshName = name;
		light.meshType = 'pointlight';
		light.position.set(position.x, position.y, position.z);
		this.objects.push(light);
		this.add(light);
		return light;
	}

	addAmbientLight(name, color, intensity) {
		let light = new THREE.AmbientLight(new THREE.Color(color), intensity);
		light.meshName = name;
		light.meshType = 'ambientlight';
		this.objects.push(light);
		this.add(light);
		return light;
	}

	addDirectionalLight(name, position, color, intensity) {
		let light = new THREE.DirectionalLight(0xFFFFFF, intensity);
		light.meshName = name;
		light.meshType = 'directionallight';
		//light.castShadow = true;
		//light.shadow.mapSize.width = 512;  
		//light.shadow.mapSize.height = 512; 
		//light.shadow.camera.near = 0.5;
		//light.shadow.camera.far = 500  
		light.position.set(position.x, position.y, position.z);
		this.objects.push(light);
		//this.add(new THREE.CameraHelper(light.shadow.camera));
		this.add(light);
		return light;
	}
}