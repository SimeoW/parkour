class ChunkManager {
	constructor(game, chunkSize, objects) {
		this.game = game;
		// An array of which chunks to maintain, coordinates relative to the player's chunk
		this.activeChunks = [];
		this.chunkObjects = {};
		// Used to determine when the player's chunk updates
		this.lastPlayerChunk = null;
	}

	// To be called when the player's position changes
	step() {
		let y = -0.5;
		if(this.game.player == null) return; // Player respawning

		let playerChunk = this.positionToChunk(this.game.player.position);
		if(this.lastPlayerChunk != null && playerChunk.x == this.lastPlayerChunk.x && playerChunk.y == this.lastPlayerChunk.y && playerChunk.z == this.lastPlayerChunk.z) {
			return; // Return early if the chunk is the same as it was from the last frame
		}
		this.lastPlayerChunk = playerChunk;

		let newActiveChunks = [], sqRadius = this.game.chunkRadius * this.game.chunkRadius;
		// for(let y = -this.game.chunkRadius; y <= this.game.chunkRadius; y++) {
		for(let z = -this.game.chunkRadius; z <= this.game.chunkRadius; z++) {
			for(let x = -this.game.chunkRadius; x <= this.game.chunkRadius; x++) {
				//let sqDt = x * x + y * y + z * z;
				let sqDt = x * x + z * z;
				if(sqDt > sqRadius) continue; // Spherical shape
				let p = this.chunkToString(x + playerChunk.x, y, z + playerChunk.z)
				newActiveChunks.push(p);
			}
		}
		//}
		let addChunks = newActiveChunks.filter(chunk => !this.activeChunks.includes(chunk));
		let deleteChunks = this.activeChunks.filter(chunk => !newActiveChunks.includes(chunk));
		
		// Look for new chunks to generate=
		this.activeChunks = newActiveChunks;

		this.removeChunks(deleteChunks);
		this.generateChunks(addChunks);
	}

	// Create a new chunk, where a chunk is in "x,y,z" format
	generateChunk(chunk) {
		// Sanity checking, if the chunk exists, just remove it
		if(this.chunkObjects[chunk] !== undefined) this.removeChunks(chunk);
		// Initialize the chunk
		this.chunkObjects[chunk] = [];

		let scaleNum = this.game.chunkSize * this.game.chunkRadius / 4;

		// let seed = this.stringHash(chunk);
		let coords = chunk.split(','), p = this.chunkToPosition(coords[0], coords[1], coords[2]);
		let position = new THREE.Vector3(p.x, p.y, p.z);
		let scale = [scaleNum, scaleNum, scaleNum];
		let rotation = new THREE.Vector3(0, 0, 0);
		let color = 'rgb(255, 255, 255)';
		let friction = 0.9;
		let restitution = 0.1;
		let mass = 0;
		let object = this.game.addCube('generated', position, scale, rotation, color, friction, restitution, mass);
		this.chunkObjects[chunk].push(object);
	}

	// Remove a pre-existing chunk, where a chunk is in "x,y,z" format
	removeChunk(chunk) {
		// Our job is already done
		if(this.chunkObjects[chunk] === undefined) return;
		// Remove all the objects in it, before deleting the array
		let objects = this.chunkObjects[chunk] || [];
		for(let object of objects) {
			this.game.remove(object);
		}
		delete this.chunkObjects[chunk]
	}

	// Generate an array of chunks, where a chunk is in "x,y,z" format
	generateChunks(chunks) {
		for(let chunk of chunks) {
			this.generateChunk(chunk);
		}
	}

	// Remove an array of chunks, where a chunk is in "x,y,z" format
	removeChunks(chunks) {
		for(let chunk of chunks) {
			this.removeChunk(chunk);
		}
	}

	// Returns the chunk containing a position
	positionToChunk(position) {
		let x = Math.floor(position.x / this.game.chunkSize + 0.5);
		let y = Math.floor(position.y / this.game.chunkSize + 0.5);
		let z = Math.floor(position.z / this.game.chunkSize + 0.5);
		return new THREE.Vector3(x, y, z);
	}

	// Put the chunk coordinates in a consistent string format
	chunkToString(x, y, z) {
		return x + ',' + y + ',' + z;
	}

	// Returns the central position of a chunk
	chunkToPosition(chunkX, chunkY, chunkZ) {
		let x = chunkX * this.game.chunkSize;
		let y = chunkY * this.game.chunkSize;
		let z = chunkZ * this.game.chunkSize;
		return new THREE.Vector3(x, y, z);
	}

	// Get the hash of a string, used for the seed
	stringHash(str) {
		str = str.trim() + ' ';
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = str.charCodeAt(i) + ((hash << 5) - hash);
		}
		return hash;
	}
}