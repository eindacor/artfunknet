PlayerCrateIF = function(player_interface, crate_id) {
	var user_id = player_interface.getId();
	var crate_object = crates.findOne(crate_id);

	if (crate_object == undefined)
		throw "invalid crate id: " + crate_id;

	var global_type_buff = 2;

	switch(crate_object.quality) {
		case "bronze": global_type_buff = 1.6; break;
		case "silver": global_type_buff = 1.8; break;
		case "gold": global_type_buff = 2; break;
		case "platinum": global_type_buff = 2.2; break;
	}

	var crateContainsTypeBuff = function(item_type) {
		var crate_seeds = crate_object.seeds;
		for (var i=0; i<crate_seeds.length; i++) {
			if (crate_seeds[i].type == "item_type" && crate_seeds[i].value == item_type)
				return true;
		}
		return false;
	}

	this.getFoilChance = function() {
		var chance = getLootData().global_foil_chance;
		if (crateContainsTypeBuff("foil")) {
			chance *= global_type_buff;
		}

		return Math.min(chance, 1);
	}

	this.getSeasonalAmplifier = function() {
		return crateContainsTypeBuff("seasonal") ? global_type_buff : 1;
	}

	this.getUnlockedChance = function() {
		var chance = getLootData().global_unlocked_chance;
		if (crateContainsTypeBuff("unlocked")) {
			chance *= global_type_buff;
		}
		
		return Math.min(chance, 1);
	}

	this.getMisprintChance = function() {
		return getLootData().global_misprint_chance;
	}

	this.getConditionMinimum = function() {
		return 0;
	}

	this.getItemLevel = function() {
		return 1;
	}

	this.canAfford = function() {
		return this.getCost() < player_interface.getBankBalance();
	}

	this.printCrate = function() {
		console.log("-------");
		console.log("foil chance: " + this.getFoilChance());
		console.log("seasonal amplifier: " + this.getSeasonalAmplifier());
		console.log("unlocked chance: " + this.getUnlockedChance());

		var crate_seeds = crate_object.seeds;
		for (var i=0; i<crate_seeds.length; i++) {
			var seed_object = crate_seeds[i];

			if (seed_object.type == "rarity") {
				console.log(seed_object.value + " buff");
			}
		}

		console.log(getMapOdds(this.getRarityMap()));
		console.log(getMapOdds(this.getAttributeMap()));
	}

	this.getCost = function() {
		var crate_seeds = crate_object.seeds;
		
		var rarity_map = this.getRarityMap(user_id, crate_id);
		var average_drop_value = getAverageDropValueFromMap(rarity_map, this.getFoilChance(), this.getUnlockedChance(), this.getSeasonalAmplifier());

		for (var i=0; i<crate_seeds.length; i++) {
			var seed_object = crate_seeds[i];

			if (seed_object.type == "attribute") {
				var attribute_boost_rate = 1.05;
				average_drop_value *= attribute_boost_rate;
			}
		}

		return Math.floor(average_drop_value * crate_object.item_count * CRATE_UPCHARGE_COEFFICIENT);
	}

	this.getRarityMap = function() {
		var crate_seeds = crate_object.seeds;
		var loot_map = getSmartRarityMap(player_interface.getPlayerLevel(), .8);
		for (var i=0; i<crate_seeds.length; i++) {
			if (crate_seeds[i].type == "rarity") {
				var rarity_boost_rate;
				var boost_rate_multiplier;

				switch (crate_object.quality) {
					case "bronze": boost_rate_multiplier = 1; break;
					case "silver": boost_rate_multiplier = 1.1; break;
					case "gold": boost_rate_multiplier = 1.2; break;
					case "platinum": boost_rate_multiplier = 1.3; break;
					default: boost_rate_multiplier = 1; break;
				}

				switch(crate_seeds[i].value) {
					case "rare": rarity_boost_rate = 2; break;
					case "legendary": rarity_boost_rate = 1.4; break
					case "masterpiece": rarity_boost_rate = 1.4; break;
					default: rarity_boost_rate = 1; break;
				}

				var base_rarity_map_value = loot_map[crate_seeds[i].value];
				var boosted_rarity_map_value = Math.floor(base_rarity_map_value * rarity_boost_rate * boost_rate_multiplier);
				var map_delta = boosted_rarity_map_value - base_rarity_map_value;
				// remove delta from common drop chance to ensure higher-tier drop rates stay the same
				loot_map.common -= map_delta;

				loot_map[crate_seeds[i].value] = boosted_rarity_map_value;
			}
		}

		return loot_map;
	}

	this.getAttributeMap = function() {
		var crate_seeds = crate_object.seeds;
		var attribute_map = {};
		var all_attributes = attributes.find({'active': true}).fetch();

		for (var i=0; i<all_attributes.length; i++) {
			var attribute_object = all_attributes[i];
			attribute_map[attribute_object._id] = 1;
		}

		var attribute_map_value_boost;
		switch (crate_object.quality) {
			case "bronze": attribute_map_value_boost = 2; break;
			case "silver": attribute_map_value_boost = 3; break;
			case "gold": attribute_map_value_boost = 4; break;
			case "platinum": attribute_map_value_boost = 5; break;
			default: attribute_map_value_boost = 1; break;
		}

		for (var i=0; i<crate_seeds.length; i++) {
			if (crate_seeds[i].type == "attribute") {
				var base_map_value = attribute_map[crate_seeds[i].value];
				var boosted_map_value = Math.floor(base_map_value * attribute_map_value_boost);
				attribute_map[crate_seeds[i].value] = boosted_map_value;
			}
		}

		return attribute_map;
	}

	this.canOpen = function() {
		if (!this.canAfford())
			return false;

		var user_object = player_interface.getUserObject();

		if (user_object.profile.level < crate_object.level_requirement)
			return false;

		if (user_object.profile.crate_purchases == undefined)
			return true;

		if (user_object.profile.crate_purchases[crate_id] == undefined)
			return true;

		return user_object.profile.crate_purchases[crate_id] < DYNAMIC_CRATE_PURCHASE_LIMIT;
	}

	this.open = function() {
		var crate_cost = this.getCost();

	    if (this.canOpen()) {
	        var multi_item_generator = {
	            'source': "dynamic crate",
	            'user_id': player_interface.getId(),
	            'attribute_map': this.getAttributeMap(),
	            'rarity_map': this.getRarityMap(),
	            'count': crate_object.item_count,
	            'status': "unclaimed",
	            'foil_chance': this.getFoilChance(),
	            'unlocked_chance': this.getUnlockedChance(),
	            'misprint_chance': this.getMisprintChance(),
	            'seasonal_amplifier': this.getSeasonalAmplifier(),
	            'condition_min': this.getConditionMinimum(),
	            'level': this.getItemLevel()
	        }

	        generateItemsRevised(multi_item_generator);
	        player_interface.chargeAccount(crate_cost);

	        if (player_interface.getUserObject().profile.crate_purchases[crate_id] == undefined) {
	        	var setter_object = {};
	        	var setter_string = 'profile.crate_purchases.' + crate_id;
	        	setter_object[setter_string] = 1;
	        	Meteor.users.update(user_id, {$inc: {'profile.money_spent_on_crates': crate_cost}, $set: setter_object});
	        }

	        else {
		        var inc_object = {'profile.money_spent_on_crates': crate_cost};
		        var inc_string = 'profile.crate_purchases.' + crate_id;
		        inc_object[inc_string] = 1; 
		        Meteor.users.update(user_id, {$inc: inc_object});
		    }
	    }

	    if (DEBUG)
	    	this.printCrate();
	}
}

generateItemsRevised = function(multi_item_generator) {
    if (Meteor.users.findOne(multi_item_generator.user_id) === undefined && multi_item_generator.user_id != "Artfunkel, Inc.")
        return [];

    var item_ids = [];

    for (var i=0; i < parseInt(multi_item_generator.count); i++) {
        var rarity_roll = JepLoot.catRoll(multi_item_generator.rarity_map);
        var attribute_array = getAttributeArray(rarity_roll, multi_item_generator.attribute_map);
        var artwork_id = selectArtwork(rarity_roll, attribute_array, multi_item_generator.seasonal_amplifier);

        var item_generator = {
            'source': multi_item_generator.source,
            'user_id': multi_item_generator.user_id,
            'artwork_id': artwork_id,
            'condition': undefined,
            'level': multi_item_generator.level,
            'foil_chance': multi_item_generator.foil_chance,
            'unlocked_chance': multi_item_generator.unlocked_chance,
            'seasonal': undefined,
            'lottery': 0,
            'original': false,
            'vintage': false,
            'misprint_chance': multi_item_generator.misprint_chance,
            'status': multi_item_generator.status,
            'condition_min': multi_item_generator.condition_min,
            'attribute_map': multi_item_generator.attribute_map
        }

        item_ids.push(generateItemFromArtworkIDRevised(item_generator));
    }

    if (Meteor.users.findOne(multi_item_generator.user_id) != undefined && Meteor.users.findOne(multi_item_generator.user_id).profile.settings.animations_enabled) {
        if (multi_item_generator.status == "for_sale") {
            Meteor.users.update(multi_item_generator.user_id, {$push: {'profile.notifications.store': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': multi_item_generator.count}}});
        }

        else if (multi_item_generator.status == "unclaimed" || multi_item_generator.status == "won") {
            Meteor.users.update(multi_item_generator.user_id, {$push: {'profile.notifications.loot': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': multi_item_generator.count}}});
        }
    }

    return item_ids;
}

getAttributeArray = function(rarity, attribute_map) {
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

selectArtwork = function(rarity, attribute_array, seasonal_amplifier) {
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
	var rolled_id = artworks.findOne(query_object, {skip: random_index})._id;
	return rolled_id;
}

getItemAttributes = function(artwork_object, item_is_unlocked, attribute_map) {
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

generateItemFromArtworkIDRevised = function(item_generator, callback) {  
	var owner_interface; 
	try {
		owner_interface = new PlayerIF(item_generator.user_id);
	}

	catch {
		if (item_generator.user_id != "Artfunkel, Inc.")
			return;
	}

    var artwork_data = artworks.findOne(item_generator.artwork_id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}}); 

    if (artwork_data) {
        var loot_data = getLootData();

        var misprint_chance = item_generator.misprint_chance === undefined ? loot_data.global_misprint_chance : item_generator.misprint_chance;
        var foil_chance = item_generator.foil_chance === undefined ? loot_data.global_foil_chance : item_generator.foil_chance;
        var unlocked_chance = item_generator.unlocked_chance === undefined ? loot_data.global_unlocked_chance : item_generator.unlocked_chance;

        var misprint = Math.random() < misprint_chance;
        var foil = Math.random() < foil_chance;
        var unlocked = artwork_data.rarity != "common" && Math.random() < unlocked_chance;

        if (misprint) {
            artwork_data = misprintArtworkData(artwork_data);  
        }    

        var new_item_object = {
            'artwork_id' : item_generator.artwork_id,
            'condition' : item_generator.condition === undefined ? getCondition(item_generator.condition_min) : item_generator.condition,
            'attributes' : getItemAttributes(artwork_data, unlocked, item_generator.attribute_map),
            'active_unique_attribute': artwork_data.unique_attributes ? artwork_data.unique_attributes[0] : undefined,
            'owner' : item_generator.user_id,
            'status' : item_generator.status,
            'date_created' : moment()._d.toISOString(),
            'date_received': moment()._d.toISOString(),
            'level' : item_generator.level === undefined ? 1 : item_generator.level,
            'roll_count' : 0,
            'foil': foil,
            'unlocked': unlocked,
            'seasonal': item_generator.seasonal === undefined ? loot_data.seasonal_items.indexOf(item_generator.artwork_id) != -1 : item_generator.seasonal,
            'lottery': item_generator.lottery === undefined ? 0 : item_generator.lottery,
            'original': item_generator.original === undefined ? false : item_generator.original,
            'vintage': item_generator.vintage === undefined ? false : item_generator.vintage,
            'tags': [],
            'artwork_data': artwork_data
        };

        if (item_generator._id != undefined)
            new_item_object._id = item_generator._id;

        new_item_object.values = getItemObjectValues(new_item_object);

        var new_item_id = items.insert(new_item_object, function(error, result) {
            if (error)
                console.log(error.message)

            else {
                if (new_item_object.artwork_data.rarity == "legendary" || new_item_object.artwork_data.rarity == "masterpiece")
                    logLegendary(item_generator.source, new_item_object);

                if (callback != undefined)
                    callback();
            }
        });

        if (misprint) {
        	var misprint_message = "Misprint created: " + new_item_id + " -> " + Meteor.users.findOne(item_generator.user_id).profile.screen_name;
        	var admin_interface = new PlayerIF(Meteor.users.findOne({'profile.screen_name': "admin"})._id);
        	admin_interface.alert(misprint_message, 'fa-star', 'good');
        }

        return new_item_id;
    }

    else return undefined;
}

var getCrateSeeds = function(crate_quality) {
	var crate_seed_array = [];
	var attributes_added = [];
	var rarities_added = [];
	var types_added = [];

	var rarity_seed_max = 1;
	var type_seed_max = 2;
	var attribute_seed_max = 3;

	var seed_map = {
		'rarity': 1,
		'attribute': 1,
		'item_type': 1
	}

	var add_seed = true;
	var seed_proc;

	switch(crate_quality) {
		case "bronze": seed_proc = .2; break;
		case "silver": seed_proc = .4; break;
		case "gold": seed_proc = .6; break;
		case "platinum": seed_proc = .8; break;
		default: seed_proc = 0; break;
	}

	while(add_seed) {
		var seed_type_roll = JepLoot.catRoll(seed_map);

		switch(seed_type_roll) {
			case "rarity": 
				var rarity_selection_map;

				switch(crate_quality) {
					case "bronze": 
						rarity_selection_map = {
							'rare': 25,
							'legendary': 5,
							'masterpiece': 1
						};
						break;
					case "silver": 
						rarity_selection_map = {
							'rare': 16,
							'legendary': 4,
							'masterpiece': 1
						};
						break;
					case "gold": 
						rarity_selection_map = {
							'rare': 9,
							'legendary': 3,
							'masterpiece': 1
						};
						break;
					case "platinum": 
						rarity_selection_map = {
							'rare': 4,
							'legendary': 2,
							'masterpiece': 1
						};
						break;
					default: 
						rarity_selection_map = {
							'rare': 25,
							'legendary': 5,
							'masterpiece': 1
						};
						break;
				}

				for (var i=2; i<artwork_rarities.length; i++) {
					if (rarities_added.indexOf(artwork_rarities[i]) != -1) {
						delete rarity_selection_map[artwork_rarities[i]];
					}
				}

				var rarity_roll = JepLoot.catRoll(rarity_selection_map);
				crate_seed_array.push({'type': seed_type_roll, 'value': rarity_roll});
				rarities_added.push(rarity_roll);
				if (rarities_added.length == rarity_seed_max || rarities_added.length == 3) {
					delete seed_map[seed_type_roll];
				}
				break;
			case "attribute":
				var query_object = {'_id': {$nin: attributes_added}, 'active': true};
				var attribute_count = attributes.find(query_object).count();
				var random_index = Math.floor(Math.random() * attribute_count);
				var random_attribute = attributes.findOne(query_object, {skip: random_index});
				crate_seed_array.push({'type': seed_type_roll, 'value': random_attribute._id});
				attributes_added.push(random_attribute._id); 
				if (attributes_added.length == attribute_seed_max) {
					delete seed_map[seed_type_roll];
				}
				break;
			case "item_type": 
				var elligible_types = [];
				for (var i=0; i<CARD_TYPES.length; i++) {
					if (types_added.indexOf(CARD_TYPES[i]) == -1) {
						elligible_types.push(CARD_TYPES[i]);
					}
				}

				var random_index = Math.floor(Math.random() * elligible_types.length);
				crate_seed_array.push({'type': seed_type_roll, 'value': elligible_types[random_index]});
				types_added.push(elligible_types[random_index]);
				if (types_added.length == type_seed_max || elligible_types.length == 1) {
					delete seed_map[seed_type_roll];
				}
				break;

			default: break;
		}

		add_seed = Math.random() < seed_proc && crate_seed_array.length < 4;
	}

	return crate_seed_array;
}

refreshCrates = function() {
	crates.remove({});
    for (var i=0; i<DYNAMIC_CRATE_COUNT; i++) {
        createCrate();
    }
    Meteor.users.update({}, {$set: {'profile.crate_purchases': {}}}, {multi: true});
}

createCrate = function() {
	var level_requirement = 0;
	var crate_quality_map = {
		'bronze': 4,
		'silver': 3,
		'gold': 2,
		'platinum': 1 
	}

	var crate_quality_roll = JepLoot.catRoll(crate_quality_map);

	var crate_seeds = getCrateSeeds(crate_quality_roll);

	var base_crate_duration = ONE_HOUR * 6;
	if (DEBUG)
		base_crate_duration = ONE_MINUTE;
	
	var crate_duration;

	switch(crate_quality_roll) {
		case 'bronze': crate_duration = base_crate_duration * 1; break;
		case 'silver': crate_duration = base_crate_duration * 2; break;
		case 'gold': crate_duration = base_crate_duration * 3; break;
		case 'platinum': crate_duration = base_crate_duration * 4; break;
		default: crate_duration = base_crate_duration; break;
	}

	for (var i=0; i<crate_seeds.length; i++) {
		var seed_object = crate_seeds[i];

		if (seed_object.type == "rarity") {
			switch(seed_object.value) {
				case "rare": level_requirement = Math.max(level_requirement, 20); break;
				case "legendary": level_requirement = Math.max(level_requirement, 30); break;
				case "masterpiece": level_requirement = Math.max(level_requirement, 40); break;
				default: level_requirement = 0; break;
			}
		}

		if (seed_object.type == "item_type" && seed_object.value == "seasonal") {
			level_requirement = Math.max(level_requirement, 30);
		}
	}

	crates.insert({'owner_id': undefined, 'type': "public", 'quality': crate_quality_roll, 'seeds': crate_seeds, 'item_count': 6, 'level_requirement': level_requirement, 'expiration': moment().add(crate_duration, 'milliseconds')._d.toISOString()});
}

Meteor.methods({
	'openDynamicCrate': function(crate_id) {
		try {
			var player_crate_interface = new PlayerCrateIF(new PlayerIF(Meteor.userId()), crate_id);
	    	player_crate_interface.open();
	    }

	    catch (error) {
	    	console.log(error);
	    }
	},

	'getDynamicCrates': function() {
		var crate_objects = crates.find({$or: [{'owner_id': Meteor.userId()}, {'owner_id': null}, {'type': "public"}]}).fetch();
		for (var i=0; i<crate_objects.length; i++) {
			var player_crate_interface = new PlayerCrateIF(new PlayerIF(Meteor.userId()), crate_objects[i]._id);
    		crate_objects[i].cost = player_crate_interface.getCost();
    		crate_objects[i].can_open = player_crate_interface.canOpen();
		}

		return crate_objects;
	}
})