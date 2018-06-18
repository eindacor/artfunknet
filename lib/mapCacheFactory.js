getMapCacheFromValueMap = function(value_map) {
	if (value_map == undefined) {
		throw "invalid value map";
	}

	if (Object.keys(value_map).length == 0) {
		throw "empty map";
	}

	var value_map_keys = Object.keys(value_map)

	for (var i=0; i<value_map_keys.length; i++) {
		var key = value_map_keys[i];
		if (value_map[key] % 1 !== 0) {
			return new FloatMapCache(value_map);
		}
	}

	return new IntMapCache(value_map);
}