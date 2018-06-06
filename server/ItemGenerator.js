ItemGenerator = function() {
	var getSpecialAttributes = function(rarity, attribute_map) {
		var attribute_map_copy = JSON.parse(JSON.stringify(attribute_map));
		var special_attribute_count = ARTWORK_RARITIES.indexOf(rarity) - 1;

		var rolled_special_attributes = [];
		for (var i=0; i<special_attribute_count; i++) {
			var selected_attribute = JepLoot.catRoll(attribute_map_copy);
			rolled_special_attributes.push(selected_attribute);
			delete attribute_map_copy[selected_attribute];
		}

		return rolled_special_attributes;
	}

	var selectArtwork = function(rarity, attribute_map) {
	    // if no attribute map is specified, drop should be purely based on value scale
	    if (attribute_map == undefined) {
	    	return new ArtworkIF(artworks.findOne(getRandomIdFromRarity(rarity)));
	    }

		var special_attributes = getSpecialAttributes(rarity, attribute_map);

		var matching_artworks;
		if (special_attributes.length > 0) {
			var serialized_specials = serializeSpecialCombination(special_attributes);
			matching_artworks = getSerializedSpecialAttributeCombinationCache()[serialized_specials];
		}

		if (matching_artworks == undefined) {
			matching_artworks = getActiveArtworkCache()[rarity];
		}

		var random_index = Math.floor(Math.random() * matching_artworks.length);
		return new ArtworkIF(artworks.findOne({'_id': {$in: matching_artworks}}, {skip: random_index}));
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

	var getItemAttributes = function(artwork_object, item_is_unlocked, attribute_map, roll_value_boost) {
		var attribute_map_copy = JSON.parse(JSON.stringify(attribute_map));
	    var attributes_object = {
	        'locked': [],
	        'unlocked': [],
	        'special': []
	    }

	    var adjusted_min_roll = function(base_min_roll) {
	    	if (roll_value_boost === undefined) {
	    		return base_min_roll;
	    	}

	    	var delta = 1 - base_min_roll;
	    	var adjustment = roll_value_boost * delta;
	    	return Math.min(base_min_roll + adjustment, 1);
	    }

	    for (var i=0; artwork_object.special_attributes && i<artwork_object.special_attributes.length; i++) {
	        var attribute_object = attributes.findOne(artwork_object.special_attributes[i]);
	        var min_roll = adjusted_min_roll(.8); 
	        attribute_object.value = getAttributeValue(0, min_roll);
	        attributes_object.special.push(attribute_object);
	        delete attribute_map_copy[attribute_object._id];
	    }

	    var locked_count = artwork_object.rarity == "common" || item_is_unlocked ? 0 : 1;
	    var unlocked_count = artwork_object.rarity == "common" || !item_is_unlocked ? 1 : 2;

	    for (var i=0; i<locked_count; i++) {
	    	var attribute_id = JepLoot.catRoll(attribute_map_copy);
	        var attribute_object = attributes.findOne(attribute_id);
	        var min_roll = adjusted_min_roll(.5); 
	        attribute_object.value = getAttributeValue(0, min_roll);
	        attributes_object.locked.push(attribute_object);
	        delete attribute_map_copy[attribute_id];
	    }

	    for (var i=0; i<unlocked_count; i++) {
	        var attribute_id = JepLoot.catRoll(attribute_map_copy);
	        var attribute_object = attributes.findOne(attribute_id);
	        var min_roll = adjusted_min_roll(0); 
	        attribute_object.value = getAttributeValue(0, min_roll);
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

	var getItemRarity = function(multi_item_generator_object, player_level) {
    	return multi_item_generator_object.rarity_map === undefined ? getRarityDropMapCache()[player_level].getRandom() : JepLoot.catRoll(multi_item_generator_object.rarity_map);
	}

	/*
		multi_item_generator fields:
			---REQUIRED---
			source
			count
			status

			---OPTIONAL---
			rarity_map
			attribute_map
			condition_min
			level
			foil_chance
			unlocked_chance
			misprint_chance
			forgery_chance
			min_roll_boost
			patreon_chance
	*/

	this.generateMultiple = function(multi_item_generator_object, player_interface, callback) {
		var mandatory_fields = ["source", "count", "status"];
		if (!hasMandatoryFields(multi_item_generator_object, mandatory_fields)) {
			throw "invalid multi_item_generator_object: " + JSON.stringify(multi_item_generator_object)
		}

 		var item_ids = [];

 		var attribute_map = multi_item_generator_object.attribute_map === undefined ? undefined : multi_item_generator_object.attribute_map;
 		var forgery_chance = multi_item_generator_object.forgery_chance === undefined ? 0 : multi_item_generator_object.forgery_chance;
 		var rarity_map_cache = multi_item_generator_object.rarity_map === undefined ? getRarityDropMapCache()[player_interface === undefined ? PLAYER_LEVEL_MAX : player_interface.getPlayerLevel()] : new MapCacheIF(multi_item_generator_object.rarity_map);

	    for (var i=0; i < parseInt(multi_item_generator_object.count); i++) {
	    	var rarity_roll = rarity_map_cache.getRandom();

	        var artwork_interface = selectArtwork(rarity_roll, attribute_map);
	        var forgery = multi_item_generator_object.forgery === undefined ? Math.random() < forgery_chance : multi_item_generator_object.forgery;
	        var min_roll_boost = multi_item_generator_object.min_roll_boost === undefined ? 0 : multi_item_generator_object.min_roll_boost;

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
	            'patreon': multi_item_generator_object.patreon_chance,
	            'vintage': false,
	            'misprint_chance': multi_item_generator_object.misprint_chance,
	            'status': multi_item_generator_object.status,
	            'attribute_map': attribute_map,
	            'forgery': forgery,
	            'forgery_quality': multi_item_generator_object.forgery_quality,
	            'min_roll_boost': min_roll_boost
	        }

	        item_ids.push(this.generateSingle(item_generator, player_interface, callback));
	    }

	    return item_ids;

	}

	var insertItem = function(item_object, source, callback) {
		var new_item_id = items.insert(item_object, function(error, result) {
	        if (error)
	            console.log(error)

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

	/*
		item_generator_object fields:
			---REQUIRED---
			source
			status
			artwork_interface

			---OPTIONAL---
			rarity_map
		
			map_amplifier
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

			patreon
				or
			patreon_chance

			misprint
				or
			misprint_chance

			forgery
			forgery_quality

			seasonal
			lottery
			vintage
			original

			min_roll_boost
	*/

	this.generateSingle = function(item_generator_object, player_interface, callback) {
		var mandatory_fields = ["artwork_interface", "status"];
		if (!hasMandatoryFields(item_generator_object, mandatory_fields)) {
			throw "invalid item_generator_object: " + JSON.stringify(item_generator_object)
		}

		var loot_data = getLootData();

		var foil;
		if (item_generator_object.foil === undefined) {
			var foil_chance = item_generator_object.foil_chance === undefined ? loot_data.global_foil_chance : item_generator_object.foil_chance;
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
			var unlocked_chance = item_generator_object.unlocked_chance === undefined ? loot_data.global_unlocked_chance : item_generator_object.unlocked_chance;
			unlocked = Math.random() < unlocked_chance;
		}
		else {
			unlocked = item_generator_object.unlocked;
		}

		var misprint;
		if (item_generator_object.misprint === undefined) {
			var misprint_chance = item_generator_object.misprint_chance === undefined ? loot_data.global_misprint_chance : item_generator_object.misprint_chance;
	    	misprint = Math.random() < misprint_chance;
		}

		else {
			misprint = item_generator_object.misprint;
		}

	    var artwork_data = misprint ? misprintArtworkData(item_generator_object.artwork_interface.getArtworkObject()) : item_generator_object.artwork_interface.getArtworkObject();

	    var attribute_map = item_generator_object.attribute_map === undefined ? DEFAULT_ATTRIBUTE_MAP : item_generator_object.attribute_map;
	    var condition_min = item_generator_object.condition_min === undefined ? 0 : item_generator_object.condition_min;
	    var min_roll_boost = item_generator_object.min_roll_boost === undefined ? 0 : item_generator_object.min_roll_boost;

	    // patreon items are only possible when the rarity is lower or equal to the player's tier
	    var patreon;
		if (item_generator_object.patreon === undefined) {
			if (player_interface == undefined || !player_interface.isPatron()) {
				patreon = false;
			}
			else if (ARTWORK_RARITIES.indexOf(player_interface.getPatreonTier()) < ARTWORK_RARITIES.indexOf(artwork_data.rarity)) {
				patreon = false;
			}
			else {
				var patreon_chance = item_generator_object.patreon_chance === undefined ? loot_data.global_patreon_chance : item_generator_object.patreon_chance;
				patreon = Math.random() < patreon_chance;
			}
		}
		else {
			patreon = item_generator_object.patreon;
		}

		var rarity = item_generator_object.artwork_interface.getRarity();
		var seasonal_ids = loot_data.seasonal_items[rarity];
		var is_seasonal_id = seasonal_ids != undefined && seasonal_ids.indexOf(item_generator_object.artwork_interface.getId()) != -1;

	    var new_item_object = {
	        'artwork_id' : item_generator_object.artwork_interface.getId(),
	        'condition' : item_generator_object.condition === undefined ? getCondition(condition_min) : item_generator_object.condition,
	        'attributes' : getItemAttributes(artwork_data, unlocked, attribute_map, min_roll_boost),
	        'active_unique_attribute': artwork_data.unique_attributes ? artwork_data.unique_attributes[0] : undefined,
	        'owner' : player_interface === undefined ? BOT_USER_NAME : player_interface.getId(),
	        'status' : item_generator_object.status,
	        'date_created' : moment()._d.toISOString(),
	        'date_received': moment()._d.toISOString(),
	        'level' : item_generator_object.level === undefined ? 1 : item_generator_object.level,
	        'roll_count' : 0,
	        'foil': foil,
	        'unlocked': unlocked,
	        'seasonal': item_generator_object.seasonal === undefined ? is_seasonal_id : item_generator_object.seasonal,
	        'lottery': item_generator_object.lottery === undefined ? 0 : item_generator_object.lottery,
	        'original': item_generator_object.original === undefined ? false : item_generator_object.original,
	        'patreon': patreon,
	        'vintage': item_generator_object.vintage === undefined ? false : item_generator_object.vintage,
	        'authenticity': {
	        	'forgery':  item_generator_object.forgery === undefined ? false : item_generator_object.forgery,
	        	'forgery_quality': item_generator_object.forgery_quality === undefined ? Number(Math.random().toFixed(3)) : item_generator_object.forgery_quality,
	        	'liable': player_interface === undefined ? BOT_USER_NAME : player_interface.getId(),
	        	'liability_pending': false,
	        	'identified': true,
	        	'fee': 0,
	        	'original_owner': player_interface === undefined ? BOT_USER_NAME : player_interface.getId()
	        },
	        'tags': [],
	        'artwork_data': artwork_data,
	        'permanent': false,
	        'repairing': false
	    };

	    new_item_object.odds = getItemOddsString(new_item_object);

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

	this.forgeItem = function(item_id, forgery_contract_id, callback) {
		var forgery_contract_object = forgery_contracts.findOne(forgery_contract_id);
		var item_object = items.findOne(item_id);
		var item_object_copy = JSON.parse(JSON.stringify(item_object));
		delete item_object_copy._id;
		if (item_object_copy._id != undefined) {
			console.log("id not removed");
			return;
		}

		item_object_copy.status = "won";
		item_object_copy.date_created = getNowISOString();
		item_object_copy.date_received = getNowISOString();

		item_object_copy.authenticity = {
			'forgery': true,
        	'forgery_quality': forgery_contract_object.quality,
        	'liable': item_object.owner,
        	'liability_pending': false,
        	'identified': true,
        	'fee': 0,
        	'original_owner': item_object.owner
		}

		var new_item_id = insertItem(item_object_copy, "forge", callback);
	}
}

ITEM_GENERATOR = new ItemGenerator();