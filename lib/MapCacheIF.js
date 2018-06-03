MapCacheIF = function(value_map) {
	if (value_map == undefined) {
		throw "invalid value map";
	}

	if (Object.keys(value_map).length == 0) {
		throw "empty map";
	}

	var all_ints = true;

	// only used for int maps
	var key_cache;

	// only used for float maps
	var ranges;
	var seed_range;

	var probability_cache;

	var getLCD = function(values) {
		var lowest;
		for (var i=0; i<values.length; i++) {
			if (values[i] != 0 && (lowest == undefined || values[i] < lowest)) {
				lowest = values[i];
			}
		}

		var lcd = 1;

		for (var i=2; i<lowest; i++) {
			var valid_count = 0;
			for (var c=0; c<values.length; c++) {
				if (values[c] % i != 0) {
					break;
				}

				valid_count++;
			}

			if (valid_count == values.length) {
				lcd = i;
			}
		}

		return lcd;
	}

	// reduce to lowest common denominator
	var getSimpleMap = function(map) {
		var values = [];
		var keys = Object.keys(map);
		for (var i=0; i<keys.length; i++) {
			var value = map[keys[i]];

			if (value % 1 != 0) {
				console.log("invalid int map: " + Object.values(map));
				return map;
			}

			if (value != 0) {
				values.push(value);
			}
		}

		var lcd = getLCD(values);

		for (var i=0; i<keys.length; i++) {
			var key = keys[i];
			map[key] = map[key] / lcd;
		}

		return map;
	}

	var value_map_keys = Object.keys(value_map)

	for (var i=0; i<value_map_keys.length; i++) {
		var key = value_map_keys[i];
		if (value_map[key] % 1 !== 0) {
			all_ints = false;
			break;
		}
	}

	var base_map = all_ints ? getSimpleMap(value_map) : value_map;

	var getFloatMapAmplifier = function(values) {
		var power = 0;
		for (var i=0; i<values.length; i++) {
			var value = values[i];
			if (value == 0) {
				continue;
			}

			if (value < 0) {
				throw "negative values cannot be used in MapCaches";
			}

			var local_power = 0;
			// 10 chosen to increase resolution
			while (value < 10) {
				value *= 10;
				local_power++;
			}

			power = Math.max(power, local_power);
		}

		return Math.pow(10, power);
	}

	var convertFloatMap = function(map) {
		var local_map = {};
		var keys = Object.keys(map);
		var amplifier = getFloatMapAmplifier(Object.values(map));
		for (var i=0; i<keys.length; i++) {
			var key = keys[i];
			var new_value = Math.floor(map[key] * amplifier);
			local_map[key] = new_value;
		}

		return local_map;
	}

	var getValueTotal = function(map) {
		var total = 0;
		for (var i=0; i<Object.values(map).length; i++) {
			total += Object.values(map)[i];
		}
		return total;
	}

	this.setProbabilityCache = function(keys, value_total) {
		for (var i=0; i<keys.length; i++) {
			var key = keys[i];
			var value = base_map[key];
			probability_cache[key] = value / value_total; 
		}
	}

	// adds keys to cache, tallies totals, adds keys to probability_cache
	this.setKeyCache = function() {
		var keys = Object.keys(base_map);
		key_cache = [];		
		
		for (var i=0; i<keys.length; i++) {
			var key = keys[i];
			var count = base_map[key];

			for (var c=0; c<count; c++) {
				key_cache.push(key);
			}
		}		

		this.setProbabilityCache(keys, key_cache.length);
	}

	this.setRanges = function() {
		seed_range = 0;
		ranges = {};
		for (var key in base_map) {
		    if (isNaN(base_map[key])) {
		    	throw new Error("at least one of the values passed is NaN: " + base_map[key]);
		    }

		    seed_range += base_map[key];
		    ranges[key] = seed_range;
		}

		this.setProbabilityCache(Object.keys(base_map), getValueTotal(base_map));
	}

	this.update = function() {
		probability_cache = {};
		if (all_ints) {
			this.setKeyCache();
		}
		else {
			this.setRanges();
		}
	}

	this.update();

	this.getRandom = function() {
		if (all_ints) {
			var random_index = Math.floor(Math.random() * key_cache.length);	
			return key_cache[random_index];
		}
		else {
			var random_value = Math.random() * seed_range;

			for (var key in ranges) {
				if (random_value < ranges[key]) {
					return key;
				}
			}
		}
		
	}

	this.getProbability = function(key) {
		return probability_cache[key];
	}

	this.getProbabilityString = function(key) {
		var probability = probability_cache[key];
		return "1 in " + Math.floor(1 / probability); 
	}

	this.getBaseMap = function() {
		return base_map;
	}
}
