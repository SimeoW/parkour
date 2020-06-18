function Random(seed) {
	this._seed = seed % 2147483647;
	if (this._seed <= 0) this._seed += 2147483646;
}

Random.prototype.random = function (opt_minOrMax, opt_max) {
	return ((this._seed = this._seed * 16807 % 2147483647) - 1) / 2147483646;
};