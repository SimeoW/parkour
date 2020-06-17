const zeroVector = new THREE.Vector3(0, 0, 0);

window.onkeypress = function(e) {
	let id = document.activeElement.id;
	let textbox = document.getElementById('chat');
	if(id == 'chat') {
		if(e.key == 'Enter') {
			game.chat(textbox.value);
			chat.value = '';
			chat.style.width = 144;
			chat.blur();
		}
		if(e.key == 'Escape') {
			document.activeElement.blur();
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
	console.log(id, e.key)
	if(id == 'chat') {
		if(e.key == 'Escape') {
			document.activeElement.blur();
		}
	}
}
class Game {
	constructor() {

		this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100000);

		this.scene = new Physijs.Scene({ fixedTimeStep: 1 / 30 });

		this.server_name = null;
		this.player_name = null;
		this.socket = null;

		this.gravity = zeroVector;

		this.objects = []; // Three.js objects

		this.renderer = new THREE.WebGLRenderer({ antialias: false });
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(new THREE.Color(0x101010), 1);
		this.renderer.domElement.id = 'draw';

		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.BasicShadowMap;
		//this.renderer.shadowMapEnabled = true;
		//this.renderer.shadowMapSoft = true;
		document.getElementById('viewport').appendChild(this.renderer.domElement);

		// Keep everything synchronized by rendering after each physics update
		this.scene.addEventListener('update', function() {
			this.renderer.render(this.scene, this.camera);
		}.bind(this)); // Keep the same this

		this.spawn = null;
		this.players = [];
		this.player = null;

		// Used for standardized user input
		this.input = new StInput(window);

		// Used to orbit the camera around the player
		this.controls = new THREE.CameraOrbit(this.renderer, this.scene, this.camera);

		this.paused = false;

		this.prevFrameTime = (new Date()).getTime();
		this.lastServerUpdateTime = this.prevFrameTime;
		this.step();
	}

	chat(msg) {
		this.socket.emit('chat', msg);
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
		if(this.spawn === undefined) this.spawn = zeroVector;
		let l = 1, w = 1, h = 1;
		let color = 0xFFFFFF;
		this.player = this.addPlayer(this.player_name, new THREE.Vector3(this.spawn.x + Math.random() * 10 - 5, this.spawn.y, this.spawn.z + Math.random() * 10 - 5), {l: l, w: w, h: h}, zeroVector, color, 0.8, 0.1, 30);
		this.player.speedSmoothing = 2;
		this.player.speed = 30;
		this.player.jumping = false;
		this.player.jumpVelocity = 150;
		this.player.addEventListener('collision', function(other_object, relative_velocity, relative_rotation, contact_normal){
			game.player.jumping = false;
		});
		this.controls.position = new THREE.Vector3(0, 80, -50);
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
			this.renderer.render(this.scene, this.camera);
		}
		if(this.player != null) this.controls.target = this.player.position;
		if(this.player != null && this.currentFrameTime - this.lastServerUpdateTime >= 20) {
			let p = this.player.position, r = this.player.rotation, lv = this.player.getLinearVelocity(), av = this.player.getAngularVelocity();
			this.socket.emit('update_player_state', [p.x, p.y, p.z, r.x, r.y, r.z, lv.x, lv.y, lv.z, av.x, av.y, av.z]);
			this.lastServerUpdateTime = (new Date()).getTime();
		}
		this.input.endFrame();
		this.prevFrameTime = this.currentFrameTime;
		requestAnimationFrame(this.step.bind(this));
	}

	// Handle the camera orbit
	updateControls() {
		let rotateCamera = this.input.mouseDown(this.input.MouseButtons.left);
		let moveCamera = false;
		let mouseDelta = this.input.mouseDelta;
		let zoom = this.input.mouseWheel;
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
			moveOffsetVertically: (moveCamera ? -mouseDelta.y : 0) * 10,                               // move the target offset (affect lookat AND camera position), along camera's Y axis. 
			moveOffsetHorizontally: (moveCamera ? mouseDelta.x : 0) * 10,                            // move the target offset left / right, relative to camera's world direction.
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
		if(!this.player.jumping && document.activeElement.id != 'chat') {

			// Sprinting
			let sprinting_boost = 0;
			if(this.input.down('shift')) sprinting_boost = this.player.speed;

			// Moving forward
			if(this.input.down('up_arrow') || this.input.down('w')) {
				this.updatePlayerRotation();
				let vx = game.player.position.x - game.camera.position.x;
				let vz = game.player.position.z - game.camera.position.z;
				let dt = Math.sqrt(vx * vx + vz * vz);
				if(dt != 0) {
					//let p = this.player.position;
					//let px = p.x + this.player.speed * vx / dt; 
					//let pz = p.z + this.player.speed * vz / dt; 
					//this.player.__dirtyPosition = true;
					//this.player.position.set(px, p.y, pz);
					
					let v = this.player.getLinearVelocity();
					vx = (v.x * this.player.speedSmoothing + ((this.player.speed + sprinting_boost) * vx / dt * this.deltaTime * 100)) / (this.player.speedSmoothing + 1);
					vz = (v.z * this.player.speedSmoothing + ((this.player.speed + sprinting_boost) * vz / dt * this.deltaTime * 100)) / (this.player.speedSmoothing + 1);
					this.player.setLinearVelocity(new THREE.Vector3(vx, v.y, vz));
				}
			}
			// Moving backward
			if(this.input.down('down_arrow') || this.input.down('s')) {
				this.updatePlayerRotation();
				let vx = game.player.position.x - game.camera.position.x;
				let vz = game.player.position.z - game.camera.position.z;
				let dt = Math.sqrt(vx * vx + vz * vz);
				if(dt != 0) {
					//let p = this.player.position;
					//let px = p.x + this.player.speed * vx / dt; 
					//let pz = p.z + this.player.speed * vz / dt; 
					//this.player.__dirtyPosition = true;
					//this.player.position.set(px, p.y, pz);
					
					let v = this.player.getLinearVelocity();
					vx = (v.x * this.player.speedSmoothing + (-this.player.speed * vx / dt * this.deltaTime * 100)) / (this.player.speedSmoothing + 1);
					vz = (v.z * this.player.speedSmoothing + (-this.player.speed * vz / dt * this.deltaTime * 100)) / (this.player.speedSmoothing + 1);
					this.player.setLinearVelocity(new THREE.Vector3(vx, v.y, vz));
				}
			}
			// Jumping
			if(this.input.down('space')) {
				let v = this.player.getLinearVelocity();
				if(v.y < 0) v.y = 0;
				this.player.setLinearVelocity(new THREE.Vector3(v.x, v.y + this.player.jumpVelocity * this.deltaTime * this.deltaTime * 1000, v.z));
				this.player.jumping = true;
			}
		}
		// Falling out of bounds
		if(this.player.position.y < this.respawnHeight) {
			this.remove(this.player);
			this.player = null;
		}
	}

	// Set the player's rotation to the camera direction
	updatePlayerRotation() {
		//let vector = game.camera.getWorldDirection(zeroVector.clone());
		//let vector = game.camera.rotation;
		let vx = game.player.position.x - game.camera.position.x;
		let vz = game.player.position.z - game.camera.position.z;
		let dt = Math.sqrt(vx * vx + vz * vz);
		let theta = Math.atan2(vx, vz);
		if (theta < 0) theta += 2 * Math.PI;
		this.player.rotation.x = 0; // Keep player upright
		this.player.rotation.y = theta; // Facing against the camera
		this.player.rotation.z = 0;
		this.player.__dirtyRotation = true;
		//this.player.setAngularVelocity(zeroVector);
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

		this.socket.on('map', function(name, map) {
			this.player_name = name;
			this.loadMap(map);
		}.bind(this)); // Make that this, this this

		this.socket.on('update_player_state', function(state) {
			let name = state.shift();
			if(typeof name != 'string' || state.length != 12) return;
			if(this.player != null && name == this.player_name) return; // Ignore self
			
			for(let item of state) { // If anything is not a number, return
				if(typeof item != 'number') return;
			}

			if(this.players[name] === undefined) {
				let l = 1, w = 1, h = 1;
				let color = 0xFFFFFF;
				let p = this.addPlayer(name, new THREE.Vector3(state[0], state[1], state[2]), {l: l, w: w, h: h}, new THREE.Vector3(state[3], state[4], state[5]), color, 0.8, 0.1, Infinity);
				this.players[name] = p;
			} else {
				let p = this.players[name];
				p.__dirtyPosition = true;
				p.position.set(state[0], state[1], state[2]);
				p.__dirtyRotation = true;
				p.rotation.set(state[3], state[4], state[5]);
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
			this.addChatMessage(name, msg);
		}.bind(this));

		this.socket.on('list', function(names) {
			this.addChatMessage('', 'Users online: ' + names.join(', '));
		}.bind(this));

		this.socket.on('rooms', function(rooms) {
			for(let i in rooms) {
				let room = rooms[i][0],
					count = rooms[i][1];
				let unit = (count == 1 ? 'person' : 'people');
				rooms[i] = room + ' (' + count + ' ' + unit + ')';
			}
			console.log('Rooms online:\n' + rooms.join('\n'));
		});
		return true;
	}

	addChatMessage(name, msg) {
		let html = '';
		if(name == '') {
			html = '<tr><td><span id="chatserver">' + msg + '</span></td></tr>';
		} else {
			html = '<tr><td><span id="chatname">' + name + '</span><span id="chatcontents">' + msg + '</span></td></tr>';
		}
		let chatfeed = document.getElementById('chatfeed');
		chatfeed.innerHTML += html;
		if(chatfeed.children.length > 30) chatfeed.children[0].remove();
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
		cube.receiveShadow = true;
		cube.castShadow = true;
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
		sphere.receiveShadow = true;
		sphere.castShadow = true;
		this.objects.push(sphere);
		this.add(sphere);
		return sphere;
	}
	
	// TODO: Apply scale, rotation, ...
	addPlayer(name, position, scale, rotation, color, friction = 0.8, restitution = 0.1, mass = 30) {
		let playerGeometry = new THREE.Geometry();
		playerGeometry.vertices = [
			new THREE.Vector3(-0.3, -4, 0),
			new THREE.Vector3(-0.3, 4, 0),
			new THREE.Vector3(0.3, 4, 0),
			new THREE.Vector3(0.3, -4, 0),
			new THREE.Vector3(0, 0, 4)
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
		player.castShadow = true;

		player.label = new THREE.TextSprite({
			text: name,
			fontFamily: 'Helvetica, Arial, sans-serif',
			fontSize: 1.8,
			fillColor: color,
		});
		player.label.position.set(0, 7, 0);
		player.label.material.depthTest = false;
		player.add(player.label);
		
		this.add(player);
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
		let light = new THREE.DirectionalLight(0xffffff, intensity);
		light.meshName = name;
		light.meshType = 'directionallight';
		light.position.set(position.x, position.y, position.z);
		this.objects.push(light);
		this.add(light);
		return light;
	}
}