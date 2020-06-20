class ChunkManager {
	constructor(game) {
		this.game = game;

		this.chunkScale = this.game.chunkSize * this.game.chunkRadius / 2;

		this.simplex = new SimplexNoise(new Random(this.game.serverSeed));
		// An array of which chunks to maintain, coordinates relative to the player's chunk
		this.activeChunks = [];
		this.chunkObjects = {};
		this.chunkQueue = [];
		this.chunkQueueActive = false;
		// Used to determine when the player's chunk updates
		this.lastPlayerChunk = null;
	}

	noise(x, y, z, iterations) {
		var num = 0, pow = 1, powInv = 1 << (iterations - 1);
		for(var i = 0; i < iterations; i++) {
			num += this.simplex.noise3d(x / powInv, y / powInv, z / powInv) / pow;
			pow *= 2;
			powInv /= 2;
		}
		return num;
	}

	// To be called when the player's position changes
	step() {
		var y = -0.5;
		if(this.game.player == null) return; // Player respawning

		var playerChunk = this.positionToChunk(this.game.player.position);
		if(this.lastPlayerChunk != null && playerChunk.x == this.lastPlayerChunk.x && playerChunk.y == this.lastPlayerChunk.y && playerChunk.z == this.lastPlayerChunk.z) {
			return; // Return early if the chunk is the same as it was from the last frame
		}
		this.lastPlayerChunk = playerChunk;

		var newActiveChunks = [], sqRadius = this.game.chunkRadius * this.game.chunkRadius;
		//for(var y = -this.game.chunkRadius; y <= this.game.chunkRadius; y++) {
		for(var z = -this.game.chunkRadius; z <= this.game.chunkRadius; z++) {
			for(var x = -this.game.chunkRadius; x <= this.game.chunkRadius; x++) {
				//var sqDt = x * x + y * y + z * z;
				var sqDt = x * x + z * z;
				if(sqDt > sqRadius) continue; // Spherical shape
				var p = this.chunkToString(x + playerChunk.x, y, z + playerChunk.z)
				//newActiveChunks.push(p);
				newActiveChunks.push([p, sqDt]);
			}
		}
		//}
		// Sort by distance
		newActiveChunks.sort(function(a, b) {
			return ((a[1] < b[1]) ? -1 : ((a[1] == b[1]) ? 0 : 1));
		});
		// Remove the distance so that it's just the chunks
		for(var i in newActiveChunks) {
			newActiveChunks[i] = newActiveChunks[i][0];
		}

		var addChunks = newActiveChunks.filter(chunk => !this.activeChunks.includes(chunk));
		var deleteChunks = this.activeChunks.filter(chunk => !newActiveChunks.includes(chunk));
		
		// Look for new chunks to generate
		this.activeChunks = newActiveChunks;

		for(var chunk of addChunks) {
			// Register the chunk as generated so that it's not generated twice
			this.chunkObjects[chunk] = [];
		}
		this.generateChunks(addChunks);
		this.removeChunks(deleteChunks);

		if(!this.chunkQueueActive) this.activateChunkQueue();
	}

	// Create a new chunk, where a chunk is in "x,y,z" format
	generateChunk(chunk) {
		var random = new Random(this.game.serverSeed + this.game.hashString(chunk))
		// Sanity checking, if the chunk exists, just remove it
		if(this.chunkObjects[chunk] !== undefined && this.chunkObjects[chunk].length > 0) this.removeChunks(chunk);
		// Initialize the chunk
		this.chunkObjects[chunk] = [];
		var _coords = chunk.split(','), coords = new THREE.Vector3(parseFloat(_coords[0]), parseFloat(_coords[1]), parseFloat(_coords[2]));
		var grid = 8;
		for(var z = -0.5 + 1/grid/2; z < 0.5; z += 1/grid) {
			for(var x = -0.5 + 1/grid/2; x < 0.5; x += 1/grid) {
				var px = coords.x + x, pz = coords.z + z;
				var py = coords.y - this.noise(px * 4, 100, pz * 4, 6);
				var threshhold = this.simplex.noise(px / 10, pz / 10);
				if(threshhold > 0.3) {
					var p = this.chunkToPosition(px, py, pz);
					var position = new THREE.Vector3(p.x, p.y, p.z);
					var scale = [this.game.chunkSize / grid, this.game.chunkSize / grid, this.game.chunkSize / grid];
					var rotation = new THREE.Vector3(0, 0, 0);//random.random() * 360, random.random() * 360, random.random() * 360);
					var color = 'hsl(' + Math.floor(Math.abs(this.simplex.noise3d(px / 20, 100, pz / 20) * 360)) + ', 100%, 70%)';
					var friction = 0.9;
					var restitution = 0.1;
					var mass = 0;
					var object = this.game.addCube('generated', position, scale, rotation, color, friction, restitution, mass);
				} else if(threshhold < -0.3) {
					var p = this.chunkToPosition(px, py, pz);
					var position = new THREE.Vector3(p.x, p.y, p.z);
					var radius = this.game.chunkSize / grid / 2;
					var color = 'hsl(' + Math.floor(Math.abs(this.simplex.noise3d(px / 20, 100, pz / 20) * 360)) + ', 75%, 50%)';
					var friction = 0.9;
					var restitution = 0.1;
					var mass = 0;
					var object = this.game.addSphere('generated', position, radius, color, friction, restitution, mass);
				}
				if(object !== undefined) this.chunkObjects[chunk].push(object);
			}
		}

	}

	// Remove a pre-existing chunk, where a chunk is in "x,y,z" format
	removeChunk(chunk) {
		// Our job is already done
		if(this.chunkObjects[chunk] === undefined) return;
		// Remove all the objects in it, before deleting the array
		var objects = this.chunkObjects[chunk] || [], failedToDelete = [];
		for(var object of objects) {
			//console.log(object)
			if(!this.game.remove(object)) {
				failedToDelete.push(object);
			}
		}
		console.log(failedToDelete)
		delete this.chunkObjects[chunk]
	}

	// Generate an array of chunks, where a chunk is in "x,y,z" format
	generateChunks(chunks) {
		for(var chunk of chunks) {
			for(var i in this.chunkQueue) {
				// Remove old occurances of the same chunk
				if(this.chunkQueue[i].arg == chunk) {
					this.chunkQueue.splice(i, 1);
				}
			}
			this.chunkQueue.push({f: this.generateChunk, arg: chunk});
		}
	}

	// Remove an array of chunks, where a chunk is in "x,y,z" format
	removeChunks(chunks) {
		for(var chunk of chunks) {
			this.chunkQueue.push({f: this.removeChunk, arg: chunk});
		}
	}

	// If the queue has an item, begin the recursive processor to ensure it is taken care of
	activateChunkQueue() {
		if(this.chunkQueue.length == 0) {
			this.chunkQueueActive = false;
			return;
		}
		this.chunkQueueActive = true;
		var job = this.chunkQueue.shift();
		var ignore = (job.f == this.generateChunk && !this.activeChunks.includes(job.arg))
			|| (job.f == this.removeChunk && this.activeChunks.includes(job.arg));
		if(ignore) return this.activateChunkQueue();

		job.f.bind(this)(job.arg);
		setTimeout(this.activateChunkQueue.bind(this), 50);
	}

	// Returns the chunk containing a position
	positionToChunk(position) {
		var x = Math.floor(position.x / this.game.chunkSize + 0.5);
		var y = Math.floor(position.y / this.game.chunkSize + 0.5);
		var z = Math.floor(position.z / this.game.chunkSize + 0.5);
		return new THREE.Vector3(x, y, z);
	}

	// Put the chunk coordinates in a consistent string format
	chunkToString(x, y, z) {
		return x + ',' + y + ',' + z;
	}

	// Returns the central position of a chunk
	chunkToPosition(chunkX, chunkY, chunkZ) {
		var x = chunkX * this.game.chunkSize;
		var y = chunkY * this.game.chunkSize;
		var z = chunkZ * this.game.chunkSize;
		return new THREE.Vector3(x, y, z);
	}
}