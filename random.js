function Random(seed) {
	this._seed = seed % 2147483647;
	if (this._seed <= 0) this._seed += 2147483646;
}

Random.prototype.next = function () {
	return this._seed = this._seed * 16807 % 2147483647;
};

Random.prototype.nextFloat = function (opt_minOrMax, opt_max) {
	// We know that result of next() will be 1 to 2147483646 (inclusive).
	return (this.next() - 1) / 2147483646;
};