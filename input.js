class Input {
	constructor(element) {
		this.resetAll();

		if(!element) element = window;
		element.addEventListener('mousedown', this.mouseDown.bind(this), false);
		element.addEventListener('mouseup', this.mouseUp.bind(this), false);
		element.addEventListener('mousemove', this.mouseMove.bind(this), false);
		element.addEventListener('keydown', this.keyDown.bind(this), false);
		element.addEventListener('keyup', this.keyUp.bind(this), false);
		element.addEventListener('blur', this.blur.bind(this), false);
		element.addEventListener('wheel', this.wheel.bind(this), false);
		element.addEventListener('touchstart', this.touchStart.bind(this), false);
		element.addEventListener('touchend', this.touchEnd.bind(this), false);
		element.addEventListener('touchmove', this.touchMove.bind(this), false);
		element.addEventListener('contextmenu', this.contextMenu.bind(this), false);
	}

	resetAll() {
		this.isKeyDown = {};

		this.scrollX = 0;
		this.scrollY = 0;
		this.scrollDist = 0;
		this.startScrollDist = 0;

		this.isLeftDown = false;
		this.isMiddleDown = false;
		this.isRightDown = false;

		this.mouseX = 0;
		this.mouseY = 0;
		this.mouseStartX = 0;
		this.mouseStartY = 0;
		this.mouseEndX = 0;
		this.mouseEndY = 0;

		this.prevIsKeyDown = {};
		this.prevIsLeftDown = false;
		this.prevIsMiddleDown = false;
		this.prevIsRightDown = false;
		this.prevMouseX = null;
		this.prevMouseY = null;
	}

	get mouseDeltaX() {
		if(this.prevMouseX == null) return 0;
		return this.mouseX - this.prevMouseX;
	}

	get mouseDeltaY() {
		if(this.prevMouseY == null) return 0;
		return this.mouseY - this.prevMouseY;
	}

	// To be called each frame
	endFrame() {
		this.prevIsKeyDown = Object.assign({}, this.isKeyDown);

		this.prevIsLeftDown = this.isLeftDown;
		this.prevIsMiddleDown = this.isMiddleDown;
		this.prevIsRightDown = this.isRightDown;

		this.prevMouseX = this.mouseX;
		this.prevMouseY = this.mouseY;

		this.scrollX = 0;
		this.scrollY = 0;
		this.startScrollDist = this.scrollDist;
	}

	// Get the position from an event, with many fallbacks
	getPosition(e) {
		if(e.touches !== undefined) {
			if(e.touches.length == 1) {
				return [
					e.touches[0].pageX,
					e.touches[0].pageY
				];
			} else if(e.touches.length > 1){
				return [
					(e.touches[0].pageX + e.touches[1].pageX) / 2,
					(e.touches[0].pageY + e.touches[1].pageY) / 2
				];
			}
		}
		var x = e.pageX, y = e.pageY;
		if(x === undefined) x = e.x;
		if(y === undefined) y = e.y;
		if(x === undefined) x = e.offsetX;
		if(y === undefined) y = e.offsetY;
		if(x === undefined) x = e.clientX;
		if(y === undefined) y = e.clientY;
		if(x === undefined) x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
		if(y === undefined) y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
		return [x, y];
	}

	mouseDown(e) {
		var pos = this.getPosition(e);
		this.mouseStartX = pos[0];
		this.mouseStartY = pos[1];
		switch(e.button) {
			case 0: this.isLeftDown = true; break;
			case 1: this.isMiddleDown = true; break;
			case 2: this.isRightDown = true; break;
		}
	}

	mouseUp(e) {
		var pos = this.getPosition(e);
		this.mouseEndX = pos[0];
		this.mouseEndY = pos[1];
		switch(e.button) {
			case 0: this.isLeftDown = false; break;
			case 1: this.isMiddleDown = false; break;
			case 2: this.isRightDown = false; break;
		}
	}

	mouseMove(e) {
		var pos = this.getPosition(e);
		this.mouseX = pos[0];
		this.mouseY = pos[1];
	}

	keyDown(e) {
		this.isKeyDown[e.key.toLowerCase()] = true;
	}

	keyUp(e) {
		this.isKeyDown[e.key.toLowerCase()] = false;
	}

	blur(e) {
		this.resetAll();
	}

	wheel(e) {
		this.scrollX = e.deltaX;
		this.scrollY = e.deltaY;
	}

	touchStart(e) {
		var pos = this.getPosition(e);
		this.mouseStartX = pos[0];
		this.mouseStartY = pos[1];
		this.isLeftDown = true;
		if(e.touches.length > 1) return multiTouchStart(e);
	}

	multiTouchStart(e) {
		var pos = this.getPosition(e.touches[1]);
		this.mouseStartX2 = pos[0];
		this.mouseStartY2 = pos[1];

		var dx = this.mouseX - e.touches[0].pageX;
		var dy = this.mouseY - e.touches[0].pageY;
		var dx2 = this.mouseX - e.touches[1].pageX;
		var dy2 = this.mouseY - e.touches[1].pageY;
		var dt = Math.sqrt(dx * dx + dy * dy);
		var dt2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
		this.startScrollDist = Math.min(dt, dt2);
		this.scrollY = 10 * (this.startScrollDist - this.scrollDist);
	}

	touchEnd(e) {
		//var pos = this.getPosition(e);
		this.mouseEndX = this.mouseX;
		this.mouseEndY = this.mouseY;
		this.isLeftDown = false;
	}

	touchMove(e) {
		var pos = this.getPosition(e);
		this.mouseX = pos[0];
		this.mouseY = pos[1];
		if(e.touches.length > 1){
			var dx = this.mouseX - e.touches[0].pageX;
			var dy = this.mouseY - e.touches[0].pageY;
			var dx2 = this.mouseX - e.touches[1].pageX;
			var dy2 = this.mouseY - e.touches[1].pageY;
			var dt = Math.sqrt(dx * dx + dy * dy);
			var dt2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
			this.scrollDist = Math.min(dt, dt2);
			this.scrollY = 10 * (this.startScrollDist - this.scrollDist);
			// TODO: Attach to a zoom effect
		}
	}

	contextMenu(e) {
		e.preventDefault();
	}
}