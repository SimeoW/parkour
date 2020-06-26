class ChunkManager {
	constructor(parent) {
		// A link to the original game object
		this.parent = parent;
		// How long to sleep before generating the next chunk
		this.sleepMilliseconds = 100;
		// A simplex random noise generator
		this.simplex = new SimplexNoise(new Random(this.parent.serverSeed));
		// An array of which chunks to maintain, coordinates relative to the player's chunk
		this.activeChunks = [];
		// A dictionary of the respawn heights for each chunk, used to determine when the player falls out of the world
		this.chunkRespawnHeights = {};
		// A dictionary of arrays of objects within each chunk
		this.chunkObjects = {};
		// A queue used to process generating and removing chunks
		this.chunkQueue = [];
		// If the chunk queue is currently processing or not, used to determine when the start the chunk queue again
		this.isChunkQueueActive = false;
		// Used to determine when the player's chunk updates
		this.lastPlayerChunk = null;
		// The lowest point of the chunks
		this.playerChunkRespawnHeight = null;
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
		if(this.parent.player == null) return; // Player respawning

		var playerChunk = this.positionToChunk(this.parent.player.position);
		if(this.lastPlayerChunk != null && playerChunk.x == this.lastPlayerChunk.x && playerChunk.y == this.lastPlayerChunk.y && playerChunk.z == this.lastPlayerChunk.z) {
			return; // Return early if the chunk is the same as it was from the last frame
		}
		this.lastPlayerChunk = playerChunk;

		var newActiveChunks = [], sqRadius = this.parent.chunkRadius * this.parent.chunkRadius;
		//for(var y = -this.parent.chunkRadius; y <= this.parent.chunkRadius; y++) {
		for(var z = -this.parent.chunkRadius; z <= this.parent.chunkRadius; z++) {
			for(var x = -this.parent.chunkRadius; x <= this.parent.chunkRadius; x++) {
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

		for(var i in addChunks) {
			// If the chunk already exists, don't re-add it
			if(this.chunkObjects[addChunks[i]] !== undefined) {
				addChunks.splice(i, 1);
			}
			// Register the chunk as generated so that it's not generated twice
			this.chunkObjects[addChunks[i]] = [];
		}
		this.generateChunks(addChunks);
		this.removeChunks(deleteChunks);

		if(!this.isChunkQueueActive) this.processChunkQueue();
	}

	// Create a new chunk, where a chunk is in "x,y,z" format
	generateChunk(chunk) {
		var random = new Random(this.parent.serverSeed + this.parent.hashString(chunk))
		// Sanity checking, if the chunk exists, just remove it
		if(this.chunkObjects[chunk] !== undefined && this.chunkObjects[chunk].length > 0) this.removeChunks(chunk);
		// Initialize the chunk
		this.chunkObjects[chunk] = [];
		var _coords = chunk.split(','), coords = new THREE.Vector3(parseFloat(_coords[0]), parseFloat(_coords[1]), parseFloat(_coords[2]));
		var grid = 4;
		for(var z = -0.5 + 1/grid/2; z < 0.5; z += 1/grid) {
			for(var x = -0.5 + 1/grid/2; x < 0.5; x += 1/grid) {
				var px = coords.x + x, pz = coords.z + z;
				var py = coords.y - this.noise(px * 10, 100, pz * 10, 7);
				var threshhold = this.simplex.noise(px / 10, pz / 10);
				if(threshhold > 0.75) {
					var p = this.chunkToPosition(px, py, pz);
					var position = new THREE.Vector3(p.x, p.y, p.z);
					var scale = [this.parent.chunkSize / grid, this.parent.chunkSize / grid, this.parent.chunkSize / grid];
					var rotation = new THREE.Vector3(0, 0, 0);//random.random() * 360, random.random() * 360, random.random() * 360);
					var color = 'hsl(' + Math.floor(Math.abs(this.simplex.noise3d(px / 20, 100, pz / 20) * 360)) + ', 100%, 70%)';
					var friction = 0.9;
					var restitution = 0.1;
					var mass = 0;
					var object = this.parent.addCube('generated', position, scale, rotation, color, friction, restitution, mass);
				
				} else if(threshhold <= 0.25 && threshhold > -0.25) {
					var p = this.chunkToPosition(px, py, pz);
					var position = new THREE.Vector3(p.x, p.y, p.z);
					var rotation = new THREE.Vector3(random.random() * 360, random.random() * 360, random.random() * 360);
					var radiusTop = this.parent.chunkSize / grid / 2;
					var radiusBottom = this.parent.chunkSize / grid / 2;
					var height = this.parent.chunkSize / grid / 2;
					var numSegments = 20;
					var color = 'hsl(' + Math.floor(Math.abs(this.simplex.noise3d(px / 20, 100, pz / 20) * 360)) + ', 75%, 50%)';
					var friction = 0.9;
					var restitution = 0.1;
					var mass = 0;
					var object = this.parent.addCylinder('generated', position, radiusTop, radiusBottom, height, numSegments, rotation, color, friction, restitution, mass);
				
				} else if(threshhold <= -0.75) {
					var p = this.chunkToPosition(px, py, pz);
					var position = new THREE.Vector3(p.x, p.y, p.z);
					var rotation = new THREE.Vector3(random.random() * 360, random.random() * 360, random.random() * 360);
					var radius = this.parent.chunkSize / grid / 2;
					var color = 'hsl(' + Math.floor(Math.abs(this.simplex.noise3d(px / 20, 100, pz / 20) * 360)) + ', 75%, 50%)';
					var friction = 0.9;
					var restitution = 0.1;
					var mass = 0;
					var object = this.parent.addSphere('generated', position, radius, rotation, color, friction, restitution, mass);
				}
				if(object !== undefined) this.chunkObjects[chunk].push(object);
			}
			this.playerChunkRespawnHeight = Math.min(...Object.values(this.chunkRespawnHeights), 0);
		}

		// Update the respawn height for the chunk
		this.chunkRespawnHeights[chunk] = Infinity;
		for(var object of this.chunkObjects[chunk]) {
			if(object.position.y < this.chunkRespawnHeights[chunk]) {
				this.chunkRespawnHeights[chunk] = object.position.y;
			}
		}
		if(this.chunkRespawnHeights[chunk] == Infinity) this.chunkRespawnHeights[chunk] = 0;
		this.chunkRespawnHeights[chunk] -= this.parent.respawnHeightPadding;
	}

	// Remove a pre-existing chunk, where a chunk is in "x,y,z" format
	removeChunk(chunk) {
		// Our job is already done
		if(this.chunkObjects[chunk] === undefined) return;
		// Remove all the objects in it, before deleting the array
		var objects = this.chunkObjects[chunk] || [], failedToDelete = [];
		for(var object of objects) {
			//console.log(object)
			if(!this.parent.remove(object)) {
				failedToDelete.push(object);
			}
		}
		if(failedToDelete.length > 0) {
			console.log('Failed to delete: ' + failedToDelete);
		}
		delete this.chunkObjects[chunk];

		// Remove the chunk's respawn height
		if(this.chunkRespawnHeights[chunk] !== undefined) {
			delete this.chunkRespawnHeights[chunk];
		}

		this.playerChunkRespawnHeight = Math.min(...Object.values(this.chunkRespawnHeights), 0);
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
	processChunkQueue() {
		if(this.chunkQueue.length == 0) {
			this.isChunkQueueActive = false;
			return;
		}
		this.isChunkQueueActive = true;
		var job = this.chunkQueue.shift();
		var ignore = (job.f == this.generateChunk && !this.activeChunks.includes(job.arg))
			//|| (job.f == this.removeChunk && this.activeChunks.includes(job.arg));
		if(ignore) return this.processChunkQueue();

		job.f.bind(this)(job.arg);
		setTimeout(this.processChunkQueue.bind(this), this.sleepMilliseconds);
	}

	// Returns the chunk containing a position
	positionToChunk(position) {
		var x = Math.floor(position.x / this.parent.chunkSize + 0.5);
		var y = Math.floor(position.y / this.parent.chunkSize + 0.5);
		var z = Math.floor(position.z / this.parent.chunkSize + 0.5);
		return new THREE.Vector3(x, y, z);
	}

	// Put the chunk coordinates in a consistent string format
	chunkToString(x, y, z) {
		return x + ',' + y + ',' + z;
	}

	// Returns the central position of a chunk
	chunkToPosition(chunkX, chunkY, chunkZ) {
		var x = chunkX * this.parent.chunkSize;
		var y = chunkY * this.parent.chunkSize;
		var z = chunkZ * this.parent.chunkSize;
		return new THREE.Vector3(x, y, z);
	}
}