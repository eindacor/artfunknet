IntMapCache = function(value_map) {
	var key_cache;

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

	var base_map = getSimpleMap(value_map);

	this.setProbabilityCache = function(keys, value_total) {
		probability_cache = {};
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

	this.getRandom = function() {
		var random_index = Math.floor(Math.random() * key_cache.length);	
		return key_cache[random_index];
	}

	this.getProbability = function(key) {
		var value = probability_cache[key];
		if (value === undefined) {
			console.warn("key not found in probability cache: " + key);
			return 0;
		}
		
		return value;
	}

	this.getProbabilityString = function(key) {
		var probability = probability_cache[key];
		return "1 in " + Math.floor(1 / probability); 
	}

	this.getBaseMap = function() {
		return base_map;
	}

	this.setKeyCache();
}
