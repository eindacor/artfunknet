ItemGenerator = function() {
	var lowest_possible_value_coefficient = .4;
	var condition_coefficient_max = .4;
	var attribute_coefficient_max = .2;

	var getAttributeArray = function(rarity, attribute_map) {
		var attribute_map_copy = JSON.parse(JSON.stringify(attribute_map));
		var attribute_count = artwork_rarities.indexOf(rarity) + 1;

		if (attribute_count == 0)
			throw "invalid item rarity: " + rarity;

		var rolled_attributes = [];
		for (var i=0; i<attribute_count; i++) {
			var selected_attribute = JepLoot.catRoll(attribute_map_copy);
			rolled_attributes.push(selected_attribute);
			delete attribute_map_copy[selected_attribute];
		}

		return rolled_attributes;
	}

	var selectArtwork = function(rarity, attribute_array, seasonal_amplifier) {
	    if (rarity == "legendary" || rarity == "masterpiece") {
	        if (Math.random() < (calcSeasonalChance(rarity) * seasonal_amplifier)) {
	            return artworks.findOne({'_id': {$in: getLootData().seasonal_items}, 'active': true, 'rarity': rarity})._id;
	        }
	    }

		var special_attribute_count = artwork_rarities.indexOf(rarity) - 1;
		var query_object;
		var count = 0;

		if (special_attribute_count > 0) {
			var special_attributes = attribute_array.slice(0, special_attribute_count);
			query_object = {'rarity': rarity, 'active': true, 'special_attributes': {$in: special_attributes}};
			count = artworks.find(query_object).count();
		}

		if (count == 0) {
			query_object = {'rarity': rarity, 'active': true};
			count = artworks.find(query_object).count();
		}

		var random_index = Math.floor(Math.random() * count);
		return new ArtworkIF(artworks.findOne(query_object, {skip: random_index}));
	}

	var getItemAttributes = function(artwork_object, item_is_unlocked, attribute_map) {
		var attribute_map_copy = JSON.parse(JSON.stringify(attribute_map));
	    var attributes_object = {
	        'locked': [],
	        'unlocked': [],
	        'special': []
	    }

	    for (var i=0; artwork_object.special_attributes && i<artwork_object.special_attributes.length; i++) {
	        var attribute_object = attributes.findOne(artwork_object.special_attributes[i]);
	        attribute_object.value = getAttributeValue(0, .8);
	        attributes_object.special.push(attribute_object);
	        delete attribute_map_copy[attribute_object._id];
	    }

	    var locked_count = artwork_object.rarity == "common" || item_is_unlocked ? 0 : 1;
	    var unlocked_count = artwork_object.rarity == "common" || !item_is_unlocked ? 1 : 2;

	    for (var i=0; i<locked_count; i++) {
	    	var attribute_id = JepLoot.catRoll(attribute_map_copy);
	        var attribute_object = attributes.findOne(attribute_id);
	        attribute_object.value = getAttributeValue(0, .5);
	        attributes_object.locked.push(attribute_object);
	        delete attribute_map_copy[attribute_id];
	    }

	    for (var i=0; i<unlocked_count; i++) {
	        var attribute_id = JepLoot.catRoll(attribute_map_copy);
	        var attribute_object = attributes.findOne(attribute_id);
	        attribute_object.value = getAttributeValue(0, 0);
	        attributes_object.unlocked.push(attribute_object);
	        delete attribute_map_copy[attribute_id];
	    }

	    return attributes_object;
	}

	var hasMandatoryFields = function(object, mandatory_fields) {
		var keys = Object.keys(object);
		for (var i=0; i<mandatory_fields.length; i++) {
			if (keys.indexOf(mandatory_fields[i]) == -1) {
				return false;
			};
		}

		return true;
	}

	var getItemAttributes = function(artwork_object, item_is_unlocked, attribute_map) {
		var attribute_map_copy = JSON.parse(JSON.stringify(attribute_map));
	    var attributes_object = {
	        'locked': [],
	        'unlocked': [],
	        'special': []
	    }

	    for (var i=0; artwork_object.special_attributes && i<artwork_object.special_attributes.length; i++) {
	        var attribute_object = attributes.findOne(artwork_object.special_attributes[i]);
	        attribute_object.value = getAttributeValue(0, .8);
	        attributes_object.special.push(attribute_object);
	        delete attribute_map_copy[attribute_object._id];
	    }

	    var locked_count = artwork_object.rarity == "common" || item_is_unlocked ? 0 : 1;
	    var unlocked_count = artwork_object.rarity == "common" || !item_is_unlocked ? 1 : 2;

	    for (var i=0; i<locked_count; i++) {
	    	var attribute_id = JepLoot.catRoll(attribute_map_copy);
	        var attribute_object = attributes.findOne(attribute_id);
	        attribute_object.value = getAttributeValue(0, .5);
	        attributes_object.locked.push(attribute_object);
	        delete attribute_map_copy[attribute_id];
	    }

	    for (var i=0; i<unlocked_count; i++) {
	        var attribute_id = JepLoot.catRoll(attribute_map_copy);
	        var attribute_object = attributes.findOne(attribute_id);
	        attribute_object.value = getAttributeValue(0, 0);
	        attributes_object.unlocked.push(attribute_object);
	        delete attribute_map_copy[attribute_id];
	    }

	    return attributes_object;
	}

	var misprintArtworkData = function(artwork_data) {
	    if (Math.random() < .5) {
	        var artist_name = artwork_data.artist;
	        var random_index = Math.random() * artist_name.length;
	        artwork_data.artist = artist_name.slice(0, random_index) + artist_name.slice(random_index + 1);
	    }

	    else {
	        var title = artwork_data.title;
	        var random_index = Math.random() * title.length;
	        artwork_data.title = title.slice(0, random_index) + title.slice(random_index + 1);
	    }

	    return artwork_data;
	}

	/*
		multi_item_generator fields:
			---REQUIRED---
			source
			count
			status

			---OPTIONAL---
			rarity_map_level
				or
			rarity_map
		
			map_amplifier
			seasonal_amplifier
			attribute_map
			condition_min
			level
			foil_chance
			unlocked_chance
			misprint_chance
	*/

	this.generateMultiple = function(multi_item_generator_object, player_interface, callback) {
		var mandatory_fields = ["source", "count", "status"];
		if (!hasMandatoryFields(multi_item_generator_object, mandatory_fields)) {
			throw "invalid multi_item_generator_object: " + JSON.stringify(multi_item_generator_object)
		}

 		var item_ids = [];

 		var rarity_map;

 		if (multi_item_generator_object.rarity_map === undefined) {
 			var player_level = player_interface === undefined ? PLAYER_LEVEL_MAX : player_interface.getPlayerLevel();
	 		var rarity_map_level = multi_item_generator_object.rarity_map_level === undefined ? player_level : multi_item_generator_object.rarity_map_level;
	 		var map_amplifier = multi_item_generator_object.map_amplifier === undefined ? .8 : multi_item_generator_object.map_amplifier;

	 		rarity_map = getSmartRarityMap(rarity_map_level, map_amplifier)
 		}

 		else {
 			rarity_map = multi_item_generator_object.rarity_map;
 		}

 		var seasonal_amplifier = multi_item_generator_object.seasonal_amplifier === undefined ? 1 : multi_item_generator_object.seasonal_amplifier;

 		var attribute_map = multi_item_generator_object.attribute_map === undefined ? DEFAULT_ATTRIBUTE_MAP : multi_item_generator_object.attribute_map;

	    for (var i=0; i < parseInt(multi_item_generator_object.count); i++) {
	        var rarity_roll = JepLoot.catRoll(rarity_map);
	        var attribute_array = getAttributeArray(rarity_roll, attribute_map);
	        var artwork_interface = selectArtwork(rarity_roll, attribute_array, seasonal_amplifier);

	        var item_generator = {
	            'source': multi_item_generator_object.source,
	            'artwork_interface': artwork_interface,
	            'condition_min': multi_item_generator_object.condition_min,
	            'level': multi_item_generator_object.level,
	            'foil_chance': multi_item_generator_object.foil_chance,
	            'unlocked_chance': multi_item_generator_object.unlocked_chance,
	            'seasonal': undefined,
	            'lottery': 0,
	            'original': false,
	            'vintage': false,
	            'misprint_chance': multi_item_generator_object.misprint_chance,
	            'status': multi_item_generator_object.status,
	            'attribute_map': attribute_map
	        }

	        item_ids.push(this.generateSingle(item_generator, player_interface, callback));
	    }

	    return item_ids;

	}

	/*
		item_generator_object fields:
			---REQUIRED---
			source
			status
			artwork_interface

			---OPTIONAL---
			rarity_map_level
				or
			rarity_map
		
			map_amplifier
			seasonal_amplifier
			attribute_map
			level

			condition
				or
			condition_min

			foil
				or
			foil_chance

			unlocked
				or
			unlocked_chance

			misprint
				or
			misprint_chance

			seasonal
			lottery
			vintage
			original

	*/

	var insertItem = function(item_object, source, callback) {
		var new_item_id = items.insert(item_object, function(error, result) {
	        if (error)
	            console.log(error.message)

	        else {
	        	item_object._id = result;
	        	if (item_object.artwork_data.rarity == "legendary" || item_object.artwork_data.rarity == "masterpiece") {
		        	logLegendary(source, item_object);
		        }

		        if (callback) {
	        		callback(item_object);
	        	}
	        }
	    });

	    return new_item_id;
	}

	this.generateSingle = function(item_generator_object, player_interface, callback) {
		var mandatory_fields = ["artwork_interface", "status"];
		if (!hasMandatoryFields(item_generator_object, mandatory_fields)) {
			throw "invalid item_generator_object: " + JSON.stringify(item_generator_object)
		}

		var foil;
		if (item_generator_object.foil === undefined) {
			var foil_chance = item_generator_object.foil_chance === undefined ? getLootData().global_foil_chance : item_generator_object.foil_chance;
			foil = Math.random() < foil_chance;
		}

		else {
			foil = item_generator_object.foil;
		}

		var unlocked;
		if (item_generator_object.artwork_interface.getRarity() == "common") {
			unlocked = false;
		}

		else if (item_generator_object.unlocked === undefined) {
			var unlocked_chance = item_generator_object.unlocked_chance === undefined ? getLootData().global_unlocked_chance : item_generator_object.unlocked_chance;
			unlocked = Math.random() < unlocked_chance;
		}

		else {
			unlocked = item_generator_object.unlocked;
		}

		var misprint;
		if (item_generator_object.misprint === undefined) {
			var misprint_chance = item_generator_object.misprint_chance === undefined ? getLootData().global_misprint_chance : item_generator_object.misprint_chance;
	    	misprint = Math.random() < misprint_chance;
		}

		else {
			misprint = item_generator_object.misprint;
		}

	    var artwork_data = misprint ? misprintArtworkData(item_generator_object.artwork_interface.getArtworkObject()) : item_generator_object.artwork_interface.getArtworkObject();

	    var attribute_map = item_generator_object.attribute_map === undefined ? DEFAULT_ATTRIBUTE_MAP : item_generator_object.attribute_map;
	    var condition_min = item_generator_object.condition_min === undefined ? 0 : item_generator_object.condition_min;

	    var new_item_object = {
	        'artwork_id' : item_generator_object.artwork_interface.getId(),
	        'condition' : item_generator_object.condition === undefined ? getCondition(condition_min) : item_generator_object.condition,
	        'attributes' : getItemAttributes(artwork_data, unlocked, attribute_map),
	        'active_unique_attribute': artwork_data.unique_attributes ? artwork_data.unique_attributes[0] : undefined,
	        'owner' : player_interface === undefined ? BOT_USER_NAME : player_interface.getId(),
	        'status' : item_generator_object.status,
	        'date_created' : moment()._d.toISOString(),
	        'date_received': moment()._d.toISOString(),
	        'level' : item_generator_object.level === undefined ? 1 : item_generator_object.level,
	        'roll_count' : 0,
	        'foil': foil,
	        'unlocked': unlocked,
	        'seasonal': item_generator_object.seasonal === undefined ? getLootData().seasonal_items.indexOf(item_generator_object.artwork_id) != -1 : item_generator_object.seasonal,
	        'lottery': item_generator_object.lottery === undefined ? 0 : item_generator_object.lottery,
	        'original': item_generator_object.original === undefined ? false : item_generator_object.original,
	        'vintage': item_generator_object.vintage === undefined ? false : item_generator_object.vintage,
	        'tags': [],
	        'artwork_data': artwork_data,
	        'permanent': false
	    };

	    new_item_object.values = getItemObjectValues(new_item_object);
	    new_item_object.reroll_cost = getItemObjectRollCost(new_item_object);

	    var new_item_id = insertItem(new_item_object, item_generator_object.source, callback);
	    
	    if (misprint) {
	    	var receiver = player_interface === undefined ? BOT_USER_NAME : player_interface.getUserObject().profile.screen_name;
	    	var misprint_message = "Misprint created: " + new_item_id + " -> " + receiver;
	    	var admin_interface = new PlayerIF(Meteor.users.findOne({'profile.screen_name': "admin"}));
	    	admin_interface.alert(misprint_message, 'fa-star', 'good');
	    }

	    return new_item_id;
	}
}

ITEM_GENERATOR = new ItemGenerator();