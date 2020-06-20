const zeroVector = new THREE.Vector3(0, 0, 0);

class Game {
	constructor() {
		// An integer used to seed each server, generated by hashing the server name
		this.serverSeed = null;
		// The FPS for the game
		this.fixedTimeStep = 1 / 60;
		// The game's camera
		this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100000);
		// The perspective of the camera
		this.fov = 20;
		// The physics scene used to simulate the objects
		this.scene = new Physijs.Scene({
			fixedTimeStep: this.fixedTimeStep
		});
		// The server's name, hashed to generate the server seed
		this.server_name = null;
		// The player's name
		this.player_name = null;
		// The websocket used to communicate with the server
		this.socket = null;
		// The server's gravity vector, set in loadMap
		this.gravity = zeroVector;
		// An array used to keep track of the game objects in the world
		this.objects = [];
		// The three.js renderer
		this.renderer = new THREE.WebGLRenderer({
			antialias: false
		});
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(new THREE.Color(0x101010), 1);
		this.renderer.domElement.id = 'draw';

		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap; //BasicShadowMap;

		document.getElementById('viewport').appendChild(this.renderer.domElement);

		// Keep everything synchronized by rendering after each physics update
		this.scene.addEventListener('update', this.draw.bind(this)); // Keep the same this

		this.spawn = null;
		this.players = [];
		this.player = null;
		this.playerScale = {
			l: 6,
			w: 1,
			h: 10
		}
		// The padding underneath the lowest object where the player respawns
		this.respawnHeightPadding = 10;

		// How large each chunk is
		this.chunkSize = 512;
		// Radius of how many away from the player to generate
		this.chunkRadius = 2;
		// The chunk management system
		this.chunkManager = null;
		// Used for keyboard and mouse user input
		this.input = new Input(window);
		// Used to orbit the camera around the player
		this.controls = new THREE.CameraOrbit(this.renderer, this.scene, this.camera);
		this.controls.smoothing = 3;
		// The skybox in the world
		this.sky = this.addSkybox('', 'nebula', 'png', 10000);
		// Used to pause the physics engine
		this.paused = false;
		// Timing variables, used to ensure that tasks are done in a specific frequency
		this.currentFrameTime = (new Date()).getTime();
		this.prevFrameTime = this.currentFrameTime;
		this.lastServerUpdateTime = this.prevFrameTime;
		this.lastPositionCheckTime = this.prevFrameTime;
		// Start the game
		this.step();
	}

	// Connect to the server, returns boolean success
	connect(player_name, server_name) {
		if (this.player_name != null) return false;
		if (this.server_name != null) return false;
		if (this.socket != null) return false;
		this.player_name = player_name;
		this.server_name = server_name;

		this.serverSeed = this.hashString(server_name);
		this.chunkManager = new ChunkManager(this);

		this.socket = io();
		this.socket.emit('initialize', player_name, server_name);
		//this.socket.emit('list');
		this.addChatMessage('', 'Type "\\help" for help')

		this.socket.on('map', function(name, players, map) {
			this.player_name = name;
			this.loadMap(map);
			for (var playerState of players) {
				this.updatePlayerState(playerState);
			}
		}.bind(this)); // Make that this, this this

		this.socket.on('update_player_state', function(state) {
			this.updatePlayerState(state);
		}.bind(this));

		this.socket.on('remove_player', function(name) {
			if (typeof name != 'string') return;
			if (this.players[name] !== undefined) {
				console.log(`Removing "${name}"`);
				this.remove(this.players[name]);
				delete this.players[name];
			}
		});

		this.socket.on('chat', function(name, msg) {
			var color = '#FFFFFF';
			if (name != '') color = this.strColor(name);
			this.addChatMessage(name, msg, color);
		}.bind(this));

		this.socket.on('list', function(names) {
			names.sort();
			var html = 'Users online (server="' + this.server_name + '"):';
			for (var name of names) {
				var color = this.strColor(name);
				html += '<br><span style="color: ' + color + '">' + '•</span> <span style="color: #FFF76B">' + name + '</span>';
			}
			this.addChatMessage('', html, '#FFFFFF');
		}.bind(this));

		this.socket.on('rooms', function(rooms) {
			var html = 'Active servers:';
			for (var i in rooms) {
				var room = rooms[i][0],
					unit = rooms[i][1].toString();
				unit += (unit == '1' ? ' player' : ' players');
				html += '<br>• "<span style="color: #FFF76B">' + room + '</span>": <span style="color: #8DDBFF">' + unit + '</span>';
			}
			this.addChatMessage('', html, '#FFFFFF');
		}.bind(this));
		return true;
	}

	chat(msg) {
		if (msg.startsWith('/') || msg.startsWith('\\')) {
			var cmd = msg.substring(1);
			var words = cmd.split(/\s+/);
			if (words.length == 0) return;
			words[0] = words[0].toLowerCase();
			switch (words[0]) {
				case 'help':
					var html = '<h3>Welcome to VWORLD, you are in server "' + this.server_name + '"</h3>';
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
					html += '<br>• \\fov ~<span style="color: #FFF76B">: Set the camera\'s field of view</span>';
					html += '<br>• \\list <span style="color: #FFF76B">: List the players currently on the server</span>';
					html += '<br>• \\pause <span style="color: #FFF76B">: Toggle the paused game state</span>';
					html += '<br>• \\rename<span style="color: #FFF76B">: Rename your character</span>';
					html += '<br>• \\reset <span style="color: #FFF76B">: Respawn</span>';
					html += '<br>• \\scale ~ ~ ~<span style="color: #FFF76B">: Set your (length, width, height)</span>';
					html += '<br>• \\server SERVER_NAME<span style="color: #FFF76B">: Move to a new server</span>';
					html += '<br>• \\servers<span style="color: #FFF76B">: List the currently active servers</span>';
					html += '<br>• \\tp PLAYER_NAME<span style="color: #FFF76B">: Teleport to a player</span>';
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
					if (this.paused) {
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
					if (words.length != 4) {
						this.addChatMessage('', 'Invalid number of parameters. Must contain length, width, and height', '#FF4949');
						return;
					}

					var l = words[1],
						w = words[2],
						h = words[3];
					if (l == '~') l = 6;
					if (w == '~') w = 1;
					if (h == '~') h = 10;
					l = parseFloat(l);
					w = parseFloat(w);
					h = parseFloat(h);
					if (isNaN(l) || isNaN(w) || isNaN(h)) {
						this.addChatMessage('', 'Invalid parameters, must be numbers', '#FF4949');
						return;
					}
					this.playerScale = {
						l: l,
						w: w,
						h: h
					};
					this.remove(this.player);
					this.player = null;
					break;

				case 'servers':
					this.socket.emit('rooms');
					break;

				case 'server':
					if (words.length != 2) {
						this.addChatMessage('', 'Invalid number of parameters. Must contain a server name', '#FF4949');
						return;
					}

					var s = words[1];
					localStorage.setItem('serverName', s);
					location.reload();
					break;

				case 'fov':
					if (words.length != 2) {
						this.addChatMessage('', 'Invalid number of parameters. Must contain an FOV value', '#FF4949');
						return;
					}
					var fov = words[1];
					if (fov == '~') fov = 40;
					this.fov = parseFloat(fov);
					break;

				case 'tp':
					if (words.length != 2) {
						this.addChatMessage('', 'Invalid number of parameters. Must contain a player\'s name', '#FF4949');
						return;
					}
					var name = words[1],
						player;
					if (name == this.player_name) player = this.player;
					else player = this.players[name];
					if (player === undefined || this.player == null) {
						this.addChatMessage('', 'Player could not be found', '#FF4949');
						return;
					}
					this.player.__dirtyPosition = true;
					this.player.position.set(player.position.x + Math.random() * 2 - 1, player.position.y + Math.random() * 2 - 1, player.position.z + Math.random() * 2 - 1);
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
		for (var i in this.scene._objects) {
			this.remove(this.scene._objects[i]);
		}
		this.player = null;
	}

	initializePlayer() {
		// Remove the old player if not done already
		if (this.player != null) this.remove(this.player);
		// Ensure that there is a spawn
		if (this.spawn === undefined) this.spawn = zeroVector;
		var color = 0xFFFFFF;
		this.player = this.addPlayer(this.player_name, new THREE.Vector3(this.spawn.x, this.spawn.y, this.spawn.z), {
			l: this.playerScale.l,
			w: this.playerScale.w,
			h: this.playerScale.h
		}, zeroVector, color);
		this.player.previousPosition = new THREE.Vector3(this.player.position.x, this.player.position.y, this.player.position.z);
		this.player.velocity = 4;
		this.player.maxVelocity = 200;
		this.player.jumping = false;
		this.player.jumpVelocity = 50;
		this.player.flying = true;
		//this.player.addEventListener('collision', function(other_object, relative_velocity, relative_rotation, contact_normal){
		//	game.player.jumping = false;
		//});
		this.controls.position = new THREE.Vector3(0, 60, -80);
		this.playerRespawnTimeout = null;
	}

	// Called after each physics update
	draw() {
		this.updateCamera();
		this.renderer.render(this.scene, this.camera);
		requestAnimationFrame(this.step.bind(this));
	}

	// Apply motion to the scene
	step() {
		this.prevFrameTime = this.currentFrameTime;
		this.currentFrameTime = (new Date()).getTime();
		this.deltaTime = (this.currentFrameTime - this.prevFrameTime) / 1000;
		this.updateControls();
		this.input.endFrame();
		if (!this.paused) {
			if(this.chunkManager != null) this.chunkManager.step();
			this.scene.simulate();
			this.playerMovement();
		} else {
			this.draw();
		}
	}

	// Update the camera by applying a smooth transition to the next player's position
	updateCamera() {
		if (this.player == null) return;
		var x = (this.controls.target.x * this.controls.smoothing + this.player.position.x) / (this.controls.smoothing + 1);
		var y = (this.controls.target.y * this.controls.smoothing + this.player.position.y) / (this.controls.smoothing + 1);
		var z = (this.controls.target.z * this.controls.smoothing + this.player.position.z) / (this.controls.smoothing + 1);
		this.controls.target = new THREE.Vector3(x, y, z);
		this.camera.setFocalLength(this.fov);
	}

	// Handle the camera orbit
	updateControls() {
		var rotateCamera = this.input.isLeftDown;
		var moveCamera = false;
		var mouseDeltaX = this.input.mouseDeltaX;
		var mouseDeltaY = this.input.mouseDeltaY;
		var zoom = this.input.scrollY;
		mouseDeltaX /= 3;
		mouseDeltaY /= 3;
		if (document.activeElement.id != 'chat') {
			if (this.input.isKeyDown['-'] || this.input.isKeyDown['pagedown']) zoom += 10;
			else if (this.input.isKeyDown['+'] || this.input.isKeyDown['pageup']) zoom -= 10;

			if (this.input.isKeyDown['arrowleft'] || this.input.isKeyDown['a']) {
				rotateCamera = true;
				mouseDeltaX -= 3;
			}
			if (this.input.isKeyDown['arrowright'] || this.input.isKeyDown['d']) {
				rotateCamera = true;
				mouseDeltaX += 3;
			}
		}

		var controllerInput = {
			deltaTime: this.deltaTime, // time passed, in seconds, since last update call
			rotateHorizontally: rotateCamera ? -mouseDeltaX : 0, // rotation around y axis
			rotateVertically: rotateCamera ? -mouseDeltaY : 0, // rotate vertically around x / z axis
			moveOffsetVertically: 0, // (moveCamera ? -mouseDeltaY : 0) * 10, // move the target offset (affect lookat AND camera position), along camera's Y axis.
			moveOffsetHorizontally: 0, // (moveCamera ? mouseDeltaX : 0) * 10, // move the target offset left / right, relative to camera's world direction.
			zoom: zoom * 10, // zoom in or out
		}
		this.controls.update(controllerInput);
	}

	// Handle the player's movement
	playerMovement() {
		if (this.player == null || this.player === undefined || isNaN(this.player.position.x)) {
			if (this.playerRespawnTimeout == null) {
				this.playerRespawnTimeout = setTimeout(function() {
					this.initializePlayer();
				}.bind(this), 1000);
			}
			return;
		}

		var x = Math.floor(this.player.position.x / this.chunkSize);
		var y = Math.floor(this.player.position.y / this.chunkSize);
		var z = Math.floor(this.player.position.z / this.chunkSize);
		if (document.activeElement.id != 'chat') {
			if (this.player != null && this.player._physijs.touches.length > 0) this.player.jumping = false;
			if (this.player != null && this.player.flying) this.player.jumping = false;
			
			if (!this.player.jumping) {
				// Sprinting
				var maxVelocity = this.player.maxVelocity;
				if (this.input.isKeyDown['shift']) maxVelocity *= 1.25;
				// Moving forward
				if (this.input.isKeyDown['arrowup'] || this.input.isKeyDown['w']) {
					this.updatePlayerRotation();

					// 2D angle
					var vx2 = game.player.position.x - game.camera.position.x;
					var vz2 = game.player.position.z - game.camera.position.z;
					var dt = Math.sqrt(vx2 * vx2 + vz2 * vz2);

					if (dt != 0) {
						var v = this.player.getLinearVelocity();
						var vx = v.x + this.player.velocity * vx2 / dt;
						var vz = v.z + this.player.velocity * vz2 / dt;

						var vel = Math.sqrt(vx * vx + vz * vz);
						if (vel > maxVelocity) { // Limit velocity
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
				if (this.input.isKeyDown['arrowdown'] || this.input.isKeyDown['s']) {
					this.updatePlayerRotation();

					// 2D angle
					var vx2 = game.player.position.x - game.camera.position.x;
					var vz2 = game.player.position.z - game.camera.position.z;
					var dt = Math.sqrt(vx2 * vx2 + vz2 * vz2);

					if (dt != 0) {
						var v = this.player.getLinearVelocity();
						var vx = v.x - this.player.velocity * vx2 / dt;
						var vz = v.z - this.player.velocity * vz2 / dt;

						var vel = Math.sqrt(vx * vx + vz * vz);
						if (vel > maxVelocity) { // Limit velocity
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
				if (this.input.isKeyDown[' ']) {
					var v = this.player.getLinearVelocity();
					if (v.y < 0) v.y = 0;
					//this.player.applyCentralImpulse(new THREE.Vector3(0, this.player.jumpVelocity, 0))
					this.player.setLinearVelocity(new THREE.Vector3(v.x, this.player.jumpVelocity, v.z));
					this.player.jumping = true;
				}
			} else { // While the player is in the air, grand a small amount of influence
				var influenceVelocity = 0.01;
				// Moving forward
				if (this.input.isKeyDown['arrowup'] || this.input.isKeyDown['w']) {
					var vx2 = game.player.position.x - game.camera.position.x;
					var vz2 = game.player.position.z - game.camera.position.z;
					var dt = Math.sqrt(vx2 * vx2 + vz2 * vz2);
					if (dt != 0) {
						var v = this.player.getLinearVelocity();
						var vx = v.x + influenceVelocity * vx2 / dt;
						var vz = v.z + influenceVelocity * vz2 / dt;

						//var vel = Math.sqrt(vx * vx + vz * vz);
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
				if (this.input.isKeyDown['arrowdown'] || this.input.isKeyDown['s']) {
					var vx2 = game.player.position.x - game.camera.position.x;
					var vz2 = game.player.position.z - game.camera.position.z;
					var dt = Math.sqrt(vx2 * vx2 + vz2 * vz2);
					if (dt != 0) {
						var v = this.player.getLinearVelocity();
						var vx = v.x - influenceVelocity * vx2 / dt;
						var vz = v.z - influenceVelocity * vz2 / dt;

						//var vel = Math.sqrt(vx * vx + vz * vz);
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


		this.sky.position.set(this.player.position.x, this.player.position.y, this.player.position.z)

		// Every second, check if the player has not moved, if no, then grant access to a free jump
		if (this.currentFrameTime - this.lastPositionCheckTime >= 1000) {
			// If the player has not moved
			if (this.player.position.x == this.player.previousPosition.x && this.player.position.y == this.player.previousPosition.y && this.player.position.z == this.player.previousPosition.z) {
				this.player.jumping = false;
			}
			this.player.previousPosition = new THREE.Vector3(this.player.position.x, this.player.position.y, this.player.position.z);
			this.lastPositionCheckTime = (new Date()).getTime();
		}
		// Update the server
		if (this.currentFrameTime - this.lastServerUpdateTime >= 50) {
			var p = this.player.position,
				r = this.player.rotation,
				lv = this.player.getLinearVelocity(),
				av = this.player.getAngularVelocity();
			this.socket.emit('update_player_state', [p.x, p.y, p.z, r.x, r.y, r.z, lv.x, lv.y, lv.z, av.x, av.y, av.z, this.player.length, this.player.width, this.player.height]);
			this.lastServerUpdateTime = (new Date()).getTime();
		}

		// Falling out of bounds, pick the lowest respawn height (manually added objects vs. chunk)
		var respawnHeight = this.respawnHeight;
		if(this.chunkManager.playerChunkRespawnHeight != null) {
			respawnHeight = Math.min(respawnHeight, this.chunkManager.playerChunkRespawnHeight);
		}
		if (this.player.position.y < respawnHeight) {
			this.remove(this.player);
			this.player = null;
		}
	}

	// Update a player's position, rotation, scale, and velocities
	updatePlayerState(state) {
		var name = state.shift();
		if (typeof name != 'string' || state.length != 15) return;
		if (this.player != null && name == this.player_name) return; // Ignore self

		for (var item of state) { // If anything is not a number, ignore the message
			if (typeof item != 'number') return;
		}

		var p = this.players[name];
		var l = state[12],
			w = state[13],
			h = state[14];
		var color = 0xFFFFFF;
		if (p === undefined) { // Create online player object
			p = this.addPlayer(name, new THREE.Vector3(state[0], state[1], state[2]), {
				l: l,
				w: w,
				h: h
			}, new THREE.Vector3(state[3], state[4], state[5]), color);
			p.setLinearVelocity(new THREE.Vector3(state[6], state[7], state[8]));
			p.setAngularVelocity(new THREE.Vector3(state[9], state[10], state[11]));
			this.players[name] = p;
		} else { // Update player position
			if (p.length != l || p.width != w || p.height != h) {
				// One of the scales changed, we need to reset the player
				p = this.players[name] = p.setScale(l, w, h);
			}

			p.__dirtyPosition = true;
			p.position.set(state[0], state[1], state[2]);
			p.__dirtyRotation = true;
			p.rotation.set(state[3], state[4], state[5]);
			try {
				p.setLinearVelocity(new THREE.Vector3(state[6], state[7], state[8]));
				p.setAngularVelocity(new THREE.Vector3(state[9], state[10], state[11]));
			} catch (e) {}
		}
	}

	// Set the player's rotation to the camera direction
	updatePlayerRotation() {
		var vx = game.player.position.x - game.camera.position.x;
		var vz = game.player.position.z - game.camera.position.z;
		var dt = Math.sqrt(vx * vx + vz * vz);
		var theta = Math.atan2(vx, vz);
		if (theta < 0) theta += 2 * Math.PI;
		this.player.rotation.x = 0; // Keep player upright
		this.player.rotation.y = theta; // Facing against the camera
		this.player.rotation.z = 0;
		this.player.__dirtyRotation = true;
	}

	// Get/set gravity
	get gravity() {
		return this._gravity;
	}
	set gravity(vector) {
		this._gravity = vector;
		this.scene.setGravity(vector);
	}

	// Get/set paused
	get paused() {
		return this._paused;
	}
	set paused(bool) {
		if (!bool) this.scene.onSimulationResume();
		this._paused = bool;
	}

	// Get/set spawn
	get spawn() {
		return this._spawn;
	}
	set spawn(position) {
		this._spawn = position;
	}

	// Get the hash of a string, used for the server seed
	hashString(str) {
		str = str.trim() + ' ';
		var hash = 0;
		for (var i = 0; i < str.length; i++) {
			hash = str.charCodeAt(i) + ((hash << 5) - hash);
		}
		return hash;
	}

	// Given a string, compute a corresponding color
	strColor(str) {
		var hash = this.hashString(str);
		var c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
		return '#' + ('00000'.substring(0, 6 - c.length) + c);
	}

	// Given a color, returns a black or white color for the background/foreground
	strBWColor(hex) {
		if (hex.indexOf('#') === 0) hex = hex.slice(1);
		if (hex.length === 3) {
			hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
		}
		if (hex.length != 6) {
			throw new Error('Invalid HEX color.');
		}
		var r = parseInt(hex.slice(0, 2), 16),
			g = parseInt(hex.slice(2, 4), 16),
			b = parseInt(hex.slice(4, 6), 16);
		return (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000000' : '#FFFFFF';
	}

	addChatMessage(name, msg, color) {
		var html = '';
		if (name == '') {
			html = '<tr><td id="chatserver" style="color: ' + color + '">' + msg + '</td></tr>';
		} else {
			var bw = this.strBWColor(color);
			html = '<tr><td><span id="chatname" style="color: ' + bw + '; background-color: ' + color + '">' + name + '</span><span id="chatcontents">' + msg + '</span></td></tr>';
		}
		var chatfeed = document.getElementById('chatfeed');
		chatfeed.innerHTML += html;
		if (chatfeed.children.length > 5) chatfeed.children[0].remove();
	}

	// Load map from JSON object
	loadMap(map) {
		this.clearMap();
		console.log('Loading map...');
		if (map['objects'] === undefined) return false;

		// Set the spawn location
		if (map['spawn'] !== undefined && map.spawn.length == 3) {
			this.spawn = new THREE.Vector3(map.spawn[0], map.spawn[1], map.spawn[2]);
		} else return false;

		// Set the gravity
		if (map['gravity'] !== undefined && map.gravity.length == 3) {
			this.gravity = new THREE.Vector3(map.gravity[0], map.gravity[1], map.gravity[2]);
		} else return false;

		this.respawnHeight = Infinity;

		// Add each object one by one
		for (var objectDefinition of map.objects) {
			var success = this.addObjectFromDefinition(objectDefinition)
			if (!success) {
				console.log('Failed to load object:');
				console.log(objectDefinition);
			}
		}
		this.respawnHeight -= this.respawnHeightPadding;
		this.initializePlayer();
		this.chunkManager.step();
	}

	// Given an object definition, put it into the world
	addObjectFromDefinition(object) {
		var type = object[0];
		if (typeof type != 'string') return false;
		var name = object[1];
		if (typeof name != 'string') return false;
		if (name.trim() == "") name = type; // Set the default to the type

		switch (type) {
			case 'cube':
				if (object.length != 9) return false;
				var position = object[2];
				if (position.length != 3) return false;
				var positionVector = new THREE.Vector3(position[0], position[1], position[2])
				var scale = object[3];
				if (scale.length != 3) return false;
				var rotation = object[4];
				if (rotation.length != 3) return false;
				var rotationVector = new THREE.Vector3(rotation[0], rotation[1], rotation[2])
				var color = object[5];
				if (typeof color != 'string') return false;
				var friction = object[6];
				if (typeof friction != 'number') return false;
				var restitution = object[7];
				if (typeof restitution != 'number') return false;
				var mass = object[8];
				if (typeof mass != 'number') return false;
				this.addCube(name, positionVector, scale, rotationVector, color, friction, restitution, mass);

				var minHeight = positionVector.y - scale[1] / 2;
				if (minHeight < this.respawnHeight) this.respawnHeight = minHeight;
				break;

			case 'sphere':
				if (object.length != 8) return false;
				var position = object[2];
				if (position.length != 3) return false;
				var positionVector = new THREE.Vector3(position[0], position[1], position[2])
				var radius = object[3];
				if (typeof radius != 'number') return false;
				var rotation = object[4];
				if (rotation.length != 3) return false;
				var rotationVector = new THREE.Vector3(rotation[0], rotation[1], rotation[2])
				var color = object[4];
				if (typeof color != 'string') return false;
				var friction = object[5];
				if (typeof friction != 'number') return false;
				var restitution = object[6];
				if (typeof restitution != 'number') return false;
				var mass = object[7];
				if (typeof mass != 'number') return false;
				this.addSphere(name, positionVector, rotationVector, radius, color, friction, restitution, mass);

				var minHeight = positionVector.y - radius;
				if (minHeight < this.respawnHeight) this.respawnHeight = minHeight;
				break;

			case 'plane':
				if (object.length != 9) return false;
				var position = object[2];
				if (position.length != 3) return false;
				var positionVector = new THREE.Vector3(position[0], position[1], position[2])
				var width = object[3];
				if (typeof width != 'number') return false;
				var height = object[4];
				if (typeof height != 'number') return false;
				var rotation = object[5];
				console.log('Plane')
				if (rotation.length != 3) return false;
				var rotationVector = new THREE.Vector3(rotation[0], rotation[1], rotation[2])
				var color = object[6];
				if (typeof color != 'string') return false;
				var friction = object[7];
				if (typeof friction != 'number') return false;
				var restitution = object[8];
				if (typeof restitution != 'number') return false;
				this.addPlane(name, positionVector, width, height, rotationVector, color, friction, restitution);

				var minHeight = positionVector.y;
				if (minHeight < this.respawnHeight) this.respawnHeight = minHeight;
				break;

			case 'skybox':
				if (object.length != 5) return false;
				var texture = object[2];
				if (typeof texture != 'string') return false;
				var fileType = object[3];
				if (fileType != 'png' && fileType != 'jpg') return false;
				var size = object[4];
				if (typeof size != 'number') return false;
				this.addSkybox(name, texture, fileType, size);
				break;

			case 'pointlight':
				if (object.length != 6) return false;
				var position = object[2];
				if (position.length != 3) return false;
				var positionVector = new THREE.Vector3(position[0], position[1], position[2])
				var color = object[3];
				if (typeof color != 'string') return false;
				var distance = object[4];
				if (typeof distance != 'number') return false;
				var decay = object[5];
				if (typeof decay != 'number') return false;
				this.addPointLight(name, positionVector, color, distance, decay);
				break;

			case 'ambientlight':
				if (object.length != 4) return false;
				var color = object[2];
				if (typeof color != 'string') return false;
				var intensity = object[3];
				if (typeof intensity != 'number') return false;
				this.addAmbientLight(name, color, intensity);
				break;

			case 'directionallight':
				if (object.length != 5) return false;
				var position = object[2];
				if (position.length != 3) return false;
				var positionVector = new THREE.Vector3(position[0], position[1], position[2])
				var color = object[3];
				if (typeof color != 'string') return false;
				var intensity = object[4];
				if (typeof intensity != 'number') return false;
				this.addDirectionalLight(name, positionVector, color, intensity);
				break;

			default:
				console.log(`Unknown object "${name}"`);
				return false;
		}
		return true;
	}

	add(object) {
		if (object == null || object === undefined) return;
		this.scene.add(object);
		//object.__dirtyPosition = true;
		//object.__dirtyRotation = true;
	}

	remove(object) {
		let index = this.objects.indexOf(object);
		if(index > -1) this.objects.splice(index, 1);
		if (object == null || object === undefined) return false;
		if (object.label != null || object.label !== undefined) {
			this.scene.remove(object.label)
		}
		//object.__dirtyPosition = true;
		//object.position.set(0, 300, 0);
		//object.visible = false;
		this.scene.remove(object);
		object.geometry.dispose();
		object.material.dispose();
		//this.renderer.renderLists.dispose();
		return true;
	}

	addCube(name, position, scale, rotation, color, friction, restitution, mass) {
		var cube = new Physijs.BoxMesh(
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
		cube.receiveShadow = true;
		cube.castShadow = true;
		this.objects.push(cube);
		this.add(cube);
		return cube;
	}

	addSphere(name, position, radius, rotation, color, friction, restitution, mass) {
		var sphere = new Physijs.SphereMesh(
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
		sphere.rotation.set(THREE.Math.degToRad(rotation.x), THREE.Math.degToRad(rotation.y), THREE.Math.degToRad(rotation.z));
		sphere.receiveShadow = true;
		sphere.castShadow = true;
		this.objects.push(sphere);
		this.add(sphere);
		return sphere;
	}

	// TODO: Apply scale, rotation, ...
	addPlayer(name, position, scale, rotation, color, friction = 0.8, restitution = 0.1, mass = 30) {
		var playerGeometry = new THREE.Geometry();
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
		var playerMaterial = new THREE.MeshBasicMaterial({
			color: new THREE.Color(color)
		});
		//playerMaterial.depthTest = false;

		var player = new Physijs.BoxMesh(
			playerGeometry,
			Physijs.createMaterial(playerMaterial, friction, restitution),
			mass
		);
		player.meshName = name;
		player.meshType = 'player';
		player.position.set(position.x, position.y, position.z);
		player.castShadow = true;
		player.length = scale.l;
		player.width = scale.w;
		player.height = scale.h;

		var _color = this.strColor(name);
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
			var scale = {
				l: l,
				w: w,
				h: h
			};
			this.remove(player);
			player = this.addPlayer(name, position, scale, rotation, color, friction, restitution, mass);
			return player;
		}
		return player;
	}

	addPlane(name, position, width, height, rotation, color, friction, restitution) {
		var plane = new Physijs.PlaneMesh(
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
		plane.receiveShadow = true;
		plane.castShadow = true;
		this.objects.push(plane);
		this.add(plane);
		return plane;
	}

	addSkybox(name, texture, fileType, size) {
		if(this.sky != null) this.remove(this.sky);
		var materialArray = [],
			loader = new THREE.TextureLoader();
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
		for (var i = 0; i < 6; i++) {
			materialArray[i].side = THREE.BackSide;
		}
		var skyboxGeometry = new THREE.CubeGeometry(size, size, size, 1, 1, 1);
		var skybox = new THREE.Mesh(skyboxGeometry, materialArray);
		skybox.meshName = name;
		skybox.meshType = 'skybox';
		this.sky = skybox;
		this.add(skybox);
		return skybox;
	}

	addPointLight(name, position, color, distance, decay) {
		var light = new THREE.PointLight(new THREE.Color(color), distance, decay);
		light.meshName = name;
		light.meshType = 'pointlight';
		light.position.set(position.x, position.y, position.z);
		this.objects.push(light);
		this.add(light);
		return light;
	}

	addAmbientLight(name, color, intensity) {
		var light = new THREE.AmbientLight(new THREE.Color(color), intensity);
		light.meshName = name;
		light.meshType = 'ambientlight';
		this.objects.push(light);
		this.add(light);
		return light;
	}

	addDirectionalLight(name, position, color, intensity) {
		var light = new THREE.DirectionalLight(0xFFFFFF, intensity);
		light.meshName = name;
		light.meshType = 'directionallight';
		
		light.shadow.mapSize.width = 512;  // default
		light.shadow.mapSize.height = 512; // default
		light.shadow.camera.near = 0.5;    // default
		light.shadow.camera.far = 500;     // default
		//light.castShadow = true;
		//light.shadow.mapSize.width = 512;
		//light.shadow.mapSize.height = 512;
		//light.shadow.camera.near = 0.5;
		//light.shadow.camera.far = 500



		light.castShadow = true;
		/*
		light.shadow.camera = new THREE.CameraHelper(light.shadow.camera)
		light.mapSize.width = light.mapSize.height = 2048;
		light.shadow.camera.left = -50;
		light.shadow.camera.right = 50;
		light.shadow.camera.top = 50;
		light.shadow.camera.bottom = -50;
		light.shadow.camera.far = 500;
		light.shadowDarkness = 0.5;*/

		light.position.set(position.x, position.y, position.z);
		this.objects.push(light);
		//this.add(new THREE.CameraHelper(light.shadow.camera));
		this.add(light);
		return light;
	}
}