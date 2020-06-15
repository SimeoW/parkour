/*let isKeyDown = {};
window.onkeyup = function(e) {
	isKeyDown[e.key] = false;
}
window.onkeydown = function(e) {
	isKeyDown[e.key] = true;
}*/

const zeroVector = new THREE.Vector3(0, 0, 0);

class Game {
	constructor() {

		this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000);
		this.camera.position.set(0, 100, -100);

		this.scene = new Physijs.Scene({ fixedTimeStep: 1 / 30 });

		this.server_name = null;
		this.player_name = null;
		this.socket = null;

		this.gravity = zeroVector;

		this.objects = []; // Three.js objects

		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(new THREE.Color(0x101010), 1);
		this.renderer.domElement.id = 'draw';
		//this.renderer.shadowMap.enabled = true;
		//this.renderer.shadowMap.type = THREE.BasicShadowMap;
		//renderer.shadowMapEnabled = true;
		//renderer.shadowMapSoft = true;
		document.getElementById('viewport').appendChild(this.renderer.domElement);

		// Keep everything synchronized by rendering after each physics update
		this.scene.addEventListener('update', function() {
			this.renderer.render(this.scene, this.camera);
		}.bind(this)); // Keep the same this

		this.spawn = null;
		this.player = null;

		// Used for standardized user input
		this.input = new StInput(window);

		// Used to orbit the camera around the player
		this.controls = new THREE.CameraOrbit(this.renderer, this.scene, this.camera);

		this.paused = false;

		this.prevFrameTime = (new Date()).getTime();
		this.step();
	}

	// Clear all objects from the world
	clearMap() {
		for (let i in this.scene._objects) {
			this.scene.remove(this.scene._objects[i]);
		}
		this.player = null;
	}

	initializePlayer() {
		// Remove the old player if not done already
		if(this.player != null) this.scene.remove(this.player);
		if(this.spawn === undefined) this.spawn = zeroVector;

		this.player = this.addPlayer(this.player_name, new THREE.Vector3(this.spawn.x, this.spawn.y, this.spawn.z), {l: 1, w: 1, h: 1}, zeroVector, 0xFFFFFF, 0.8, 0.1, 50);
		this.player.addEventListener('collision', function(other_object, relative_velocity, relative_rotation, contact_normal){
			game.playerJumping = false;
		});
	}

	// Physics for a single frame
	step() {
		this.currentFrameTime = (new Date()).getTime();
		this.deltaTime = (this.currentFrameTime - this.prevFrameTime) / 1000;

		if(!this.paused) {
			this.scene.simulate();
			this.playerMovement();
			this.updateControls();
		} else {
			this.updateControls();
			this.renderer.render(this.scene, this.camera);
		}

		this.prevFrameTime = this.currentFrameTime;
		requestAnimationFrame(this.step.bind(this));
	}

	// Handle the player's movement
	playerMovement() {
		if(this.player == null) return;
		this.controls.target = this.player.position;
	}

	// Handle the camera orbit
	updateControls() {
		let rotateCamera = this.input.mouseDown(this.input.MouseButtons.left);
		let moveCamera = false;
		let mouseDelta = this.input.mouseDelta;
		let zoom = this.input.mouseWheel;
		if (this.input.down('page_up')) zoom += 10;
		else if (this.input.down('page_down')) zoom -= 10;

		let controllerInput = {
			deltaTime: this.deltaTime,                                      // time passed, in seconds, since last update call
			rotateHorizontally: rotateCamera ? -mouseDelta.x : 0,                    // rotation around y axis
			rotateVertically: rotateCamera ? -mouseDelta.y : 0,                        // rotate vertically around x / z axis
			moveOffsetVertically: (moveCamera ? -mouseDelta.y : 0) * 10,                               // move the target offset (affect lookat AND camera position), along camera's Y axis. 
			moveOffsetHorizontally: (moveCamera ? mouseDelta.x : 0) * 10,                            // move the target offset left / right, relative to camera's world direction.
			zoom: zoom * 10,                                                // zoom in / out
		}
		this.controls.update(controllerInput);
		this.input.endFrame();
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

		this.socket.on('map', function(map) {
			this.loadMap(map);
		}.bind(this)); // Make that this, this this

		this.socket.on('chat', function(msg) {
			console.log(msg)
		});

		this.socket.on('list', function(names) {
			console.log('Users online: ' + names.join(', '));
		});

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
		
		// Add each object one by one
		for(let object of map.objects) {
			let type, name, position, scale, rotation, color, friction, restitution, mass, colorNum, intensity, texture, size, radius, positionVector, rotationVector;
			type = object[0];
			if(typeof type != 'string') continue;
			name = object[1];
			if(typeof name != 'string') continue;
			if(name.trim() == "") name = type; // Set the default to the type

			console.log(`Started  loading "${name}"`);
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
					colorNum = parseInt(color);
					this.addCube(name, positionVector, scale, rotationVector, colorNum, friction, restitution, mass);
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
					colorNum = parseInt(color);
					this.addSphere(name, positionVector, radius, colorNum, friction, restitution, mass);
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
					if(rotation.length != 3) continue;
					rotationVector = new THREE.Vector3(rotation[0], rotation[1], rotation[2])
					color = object[6];
					if(typeof color != 'string') continue;
					friction = object[7];
					if(typeof friction != 'number') continue;
					restitution = object[8];
					if(typeof restitution != 'number') continue;
					colorNum = parseInt(color);
					this.addPlane(name, positionVector, width, height, rotationVector, colorNum, friction, restitution);
					break;

				case 'skybox':
					if(object.length != 4) continue;
					texture = object[2];
					if(typeof texture != 'string') continue;
					size = object[3];
					if(typeof size != 'number') continue;
					this.addSkybox(name, texture, size);
					break;

				case 'ambience':
					if(object.length != 4) continue;
					color = object[2];
					if(typeof color != 'string') continue;
					intensity = object[3];
					if(typeof intensity != 'number') continue;
					colorNum = parseInt(color);
					this.addAmbientLight(name, colorNum, intensity);
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
					colorNum = parseInt(color);
					this.addDirectionalLight(name, positionVector, colorNum, intensity);
					break;

				default:
					console.log(`Unknown object "${name}"`);
					continue;
			}

			console.log(`Finished loading "${name}"`);
		}
		this.initializePlayer();
	}

	add(object) {
		this.scene.add(object);
		//object.__dirtyPosition = true;
		//object.__dirtyRotation = true;
	}

	addCube(name, position, scale, rotation, color, friction, restitution, mass) {
		let cube = new Physijs.BoxMesh(
			new THREE.CubeGeometry(scale[0], scale[1], scale[2]),
			Physijs.createMaterial(new THREE.MeshLambertMaterial({
				color: color
			}), friction, restitution),
			mass
		);
		cube.name = name;
		cube.rotation.set(THREE.Math.degToRad(rotation.x), THREE.Math.degToRad(rotation.y), THREE.Math.degToRad(rotation.z));
		cube.position.set(position.x, position.y, position.z);
		cube.receiveShadow = true;
		if(mass != 0) cube.castShadow = true; // Ignore static objects
		this.objects.push(cube);
		this.add(cube);
		return cube;
	}

	addSphere(name, position, radius, color, friction, restitution, mass) {
		let sphere = new Physijs.SphereMesh(
			new THREE.SphereGeometry(radius),
			Physijs.createMaterial(new THREE.MeshStandardMaterial({
				color: color,
				wireframe: true
			}), friction, restitution),
			mass
		);
		sphere.name = name;
		sphere.position.set(position.x, position.y, position.z);
		sphere.receiveShadow = true;
		sphere.castShadow = true; // Ignore static objects
		this.objects.push(sphere);
		this.add(sphere);
		return sphere;
	}
	
	// TODO: Apply scale, rotation, ...
	addPlayer(name, position, scale, rotation, color, friction = 0.8, restitution = 0.1, mass = 50) {
		let playerGeom = new THREE.Geometry();
		playerGeom.vertices = [
			new THREE.Vector3(-0.3, -4, 0),
			new THREE.Vector3(-0.3, 4, 0),
			new THREE.Vector3(0.3, 4, 0),
			new THREE.Vector3(0.3, -4, 0),
			new THREE.Vector3(0, 0, 4)
		];
		playerGeom.faces = [
			new THREE.Face3(0, 1, 2),
			new THREE.Face3(0, 2, 3),
			new THREE.Face3(1, 0, 4),
			new THREE.Face3(2, 1, 4),
			new THREE.Face3(3, 2, 4),
			new THREE.Face3(0, 3, 4)
		];
		let player = new Physijs.BoxMesh(
			playerGeom,
			Physijs.createMaterial(new THREE.MeshBasicMaterial({ color: color }), friction, restitution),
			mass
		);
		player.name = name;
		player.position.set(position.x, position.y, position.z);
		//player.castShadow = true;
		
		this.add(player);
		return player;
	}

	addPlane(name, position, width, height, rotation, color, friction, restitution) {
		let plane = new Physijs.PlaneMesh(
			new THREE.PlaneGeometry(width, height),
			Physijs.createMaterial(new THREE.MeshBasicMaterial({
				color: color,
				side: THREE.DoubleSide
			}), friction, restitution)
		);
		plane.name = name;
		plane.rotation.set(THREE.Math.degToRad(rotation.x), THREE.Math.degToRad(rotation.y), THREE.Math.degToRad(rotation.z));
		plane.position.set(position.x, position.y, position.z);
		//plane.receiveShadow = true;
		//plane.castShadow = true;
		this.objects.push(plane);
		this.add(plane);
		return plane;
	}

	addSkybox(name, texture, size) {
		let materialArray = [], loader = new THREE.TextureLoader();
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-xpos.png')
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-xneg.png')
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-ypos.png')
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-yneg.png')
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-zpos.png')
		}));
		materialArray.push(new THREE.MeshBasicMaterial({
			map: loader.load('skyboxes/' + texture + '-zneg.png')
		}));
		for(let i = 0; i < 6; i++) {
			materialArray[i].side = THREE.BackSide;
		}
		let skyboxGeometry = new THREE.CubeGeometry(size, size, size, 1, 1, 1);
		let skybox = new THREE.Mesh(skyboxGeometry, materialArray);
		skybox.name = name;
		this.objects.push(skybox);
		this.add(skybox);
		return skybox;
	}

	// TODO: Implement
	addPointLight(name, position, color, distance, decay) {
		let light = new THREE.AmbientLight(color, distance, decay);
		light.name = name;
		light.position.set(position.x, position.y, position.z);
		this.objects.push(light);
		this.add(light);
		return light;
	}

	addAmbientLight(name, color, intensity) {
		let light = new THREE.AmbientLight(color, intensity);
		light.name = name;
		this.objects.push(light);
		this.add(light);
		return light;
	}

	addDirectionalLight(name, position, color, intensity) {
		let light = new THREE.AmbientLight(color, intensity);
		light.name = name;
		light.position.set(position.x, position.y, position.z);
		this.objects.push(light);
		this.add(light);
		return light;
	}
}