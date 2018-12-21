FloatMapCache = function(value_map) {
	var ranges;
	var seed_range;

	var probability_cache;

	var base_map = value_map;

	var getValueTotal = function(map) {
		var total = 0;
		for (var i=0; i<Object.values(map).length; i++) {
			total += Object.values(map)[i];
		}
		return total;
	}

	this.setProbabilityCache = function(keys, value_total) {
		probability_cache = {};
		for (var i=0; i<keys.length; i++) {
			var key = keys[i];
			var value = base_map[key];
			probability_cache[key] = value / value_total; 
		}
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

	this.getRandom = function() {
		var random_value = Math.random() * seed_range;

		for (var key in ranges) {
			if (random_value < ranges[key]) {
				return key;
			}
		}		
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

	this.setRanges();
}
