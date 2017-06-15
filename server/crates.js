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
		var chance = LOOT_DATA.global_foil_chance;
		if (crateContainsTypeBuff("foil")) {
			chance *= global_type_buff;
		}

		return Math.min(chance, 1);
	}

	this.getSeasonalAmplifier = function() {
		return crateContainsTypeBuff("seasonal") ? global_type_buff : 1;
	}

	this.getUnlockedChance = function() {
		var chance = LOOT_DATA.global_unlocked_chance;
		if (crateContainsTypeBuff("unlocked")) {
			chance *= global_type_buff;
		}
		
		return Math.min(chance, 1);
	}

	this.getMisprintChance = function() {
		return LOOT_DATA.global_misprint_chance;
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

	        ITEM_GENERATOR.generateMultiple(multi_item_generator, player_interface);

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
			var player_crate_interface = new PlayerCrateIF(new PlayerIF(Meteor.user()), crate_id);
	    	player_crate_interface.open();
	    }

	    catch (error) {
	    	console.log(error);
	    }
	},

	'getDynamicCrates': function() {
		var crate_objects = crates.find({$or: [{'owner_id': Meteor.userId()}, {'owner_id': null}, {'type': "public"}]}).fetch();
		for (var i=0; i<crate_objects.length; i++) {
			var player_crate_interface = new PlayerCrateIF(new PlayerIF(Meteor.user()), crate_objects[i]._id);
    		crate_objects[i].cost = player_crate_interface.getCost();
    		crate_objects[i].can_open = player_crate_interface.canOpen();
		}

		return crate_objects;
	}
})