class CameraOrbit {
	constructor(t, e, i) {
		this.renderer = t, this.domElement = t.domElement, this.scene = e, this.camera = i, this._targetSpherical = new THREE.Spherical, this._spherical = new THREE.Spherical, this._targetLookat = new THREE.Vector3, this._lookat = new THREE.Vector3, this._targetOffset = new THREE.Vector3, this._offset = new THREE.Vector3, this.position = this.camera.position, this.directionLerpSpeed = 10, this.positionLerpSpeed = 10, this.distanceMin = 10, this.distanceMax = 3000
	}
	get target() {
		return this._offset.clone()
	}
	set target(t) {
		this._offset = t.clone(), this._targetOffset = t.clone()
	}
	rotateHorizontally(t) {
		this._targetSpherical.theta += t
	}
	rotateVertically(t) {
		this._targetSpherical.phi += t
	}
	zoom(t) {
		this._targetSpherical.radius += t, this._targetSpherical.radius < this.distanceMin && (this._targetSpherical.radius = this.distanceMin), this.distanceMax && this._targetSpherical.radius > this.distanceMax && (this._targetSpherical.radius = this.distanceMax)
	}
	moveTargetBy(t) {
		this._targetOffset.add(t)
	}
	get worldDirection() {
		var t = new THREE.Vector3;
		return this.camera.getWorldDirection(t), t
	}
	moveTargetForward(t) {
		var e = this.worldDirection;
		e.multiplyScalar(t), this._targetOffset.add(e)
	}
	moveTargetBackwards(t) {
		this.moveTargetForward(-t)
	}
	get position() {
		return this.camera.position.clone()
	}
	set position(t) {
		this._targetSpherical.setFromVector3(t)
	}
	moveOffsetHorizontally(t) {
		var e = this.worldDirection;
		e.y = 0, e.normalize().multiplyScalar(t), e.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), this._targetOffset.add(e)
	}
	moveOffsetVertically(t) {
		var e = new THREE.Spherical;
		e.setFromVector3(this.worldDirection), e.phi += Math.PI / 2;
		var i = (new THREE.Vector3).setFromSpherical(e).normalize().multiplyScalar(t);
		this._targetOffset.add(i)
	}
	update(t) {
		if(t) {
			var e = t.deltaTime,
				i = t.rotateHorizontally || 0;
			0 !== i && this.rotateHorizontally(i * e);
			var r = t.rotateVertically || 0;
			0 !== r && this.rotateVertically(r * e);
			var a = t.zoom || 0;
			0 !== a && this.zoom(a * e);
			var s = t.moveTarget;
			s && (s = s.clone().multiplyScalar(e), this.moveTargetBy(s));
			var o = t.moveOffsetHorizontally;
			o && this.moveOffsetHorizontally(o * e);
			var h = t.moveOffsetVertically;
			h && this.moveOffsetVertically(h * e)
		}
		this.directionLerpSpeed ? (this._spherical.theta = THREE.Math.lerp(this._spherical.theta, this._targetSpherical.theta, e * this.directionLerpSpeed), this._spherical.phi = THREE.Math.lerp(this._spherical.phi, this._targetSpherical.phi, e * this.directionLerpSpeed)) : (this._spherical.theta = this._targetSpherical.theta, this._spherical.phi = this._targetSpherical.phi), this.positionLerpSpeed ? (this._spherical.radius = THREE.Math.lerp(this._spherical.radius, this._targetSpherical.radius, e * this.positionLerpSpeed), this._lookat.lerp(this._targetLookat, e * this.positionLerpSpeed), this._offset.lerp(this._targetOffset, e * this.positionLerpSpeed)) : (this._spherical.radius = this._targetSpherical.radius, this._lookat = this._targetLookat.clone(), this._offset = this._targetOffset.clone()), this._spherical.makeSafe(), this._targetSpherical.makeSafe(), this.camera.position.setFromSpherical(this._spherical).add(this._offset), this.camera.lookAt(this._lookat.clone().add(this._offset))
	}
	dispose() {}
}
CameraOrbit.InputAPI = class {
	get rotateHorizontally() {
		return 0
	}
	get rotateVertically() {
		return 0
	}
	get zoom() {
		return 0
	}
	get moveTarget() {
		return null
	}
	get moveOffsetHorizontally() {
		return null
	}
	get moveOffsetVertically() {
		return null
	}
	get deltaTime() {
		return 1
	}
}, THREE.CameraOrbit = CameraOrbit;