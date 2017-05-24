PlayerCrateIF = function(user_id, crate_id) {
	var player_interface = new PlayerIF(user_id);
	var crate_object = crates.findOne(crate_id);

	if (crate_object == undefined)
		throw "invalid crate id: " + crate_id;

	this.getFoilChance = function() {
		return getLootData().global_foil_chance;
	}

	this.getSeasonalChance = function() {
		return getLootData().global_seasonal_chance;
	}

	this.getUnlockedChance = function() {
		return getLootData().global_unlocked_chance;
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

	this.getCost = function() {
		var crate_seeds = crate_object.seeds;
		var cost_amplifier = 1;
		var original_loot_map = getSmartRarityMap(player_interface.getPlayerLevel(), .8);
		var original_cost = getAverageDropValueFromMap(original_loot_map);

		var revised_loot_map = this.getRarityMap(user_id, crate_id);
		var new_cost = getAverageDropValueFromMap(revised_loot_map);

		var rarity_amplifier = new_cost / original_cost;
		cost_amplifier *= rarity_amplifier;
		
		for (var i=0; i<crate_seeds.length; i++) {
			var seed_object = crate_seeds[i];

			if (seed_object.type == "attribute") {
				var attribute_boost_rate = 3;
				cost_amplifier *= attribute_boost_rate;
			}
		}

		return Math.floor(original_cost * cost_amplifier * crate_object.item_count * getLootData().rarity_inflation_coefficients["platinum"] * 1.75);
	}

	this.getRarityMap = function() {
		var crate_seeds = crate_object.seeds;
		var loot_map = getSmartRarityMap(player_interface.getPlayerLevel(), .8);
		for (var i=0; i<crate_seeds.length; i++) {
			if (crate_seeds[i].type == "rarity") {
				var rarity_boost_rate;
				switch(crate_seeds[i].value) {
					case "rare": rarity_boost_rate = 10; break;
					case "legendary": rarity_boost_rate = 100; break
					case "masterpiece": rarity_boost_rate = 1000; break;
					default: rarity_boost_rate = 1; break;
				}

				loot_map[crate_seeds[i].value] *= rarity_boost_rate;
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

		for (var i=0; i<crate_seeds.length; i++) {
			if (crate_seeds[i].type == "attribute") {
				attribute_map[crate_seeds[i].value] *= 5;
			}
		}

		return attribute_map;
	}

	this.open = function() {
		var crate_cost = this.getCost();

	    if (this.canAfford()) {
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
	            'seasonal_chance': this.getSeasonalChance(),
	            'condition_min': this.getConditionMinimum(),
	            'level': this.getItemLevel()
	        }

	        generateItemsRevised(multi_item_generator);
	        chargeAccount(user_id, crate_cost);
	        Meteor.users.update(user_id, {$inc: {'profile.money_spent_on_crates': crate_cost}});
	    }
	}
}

generateItemsRevised = function(multi_item_generator) {
    if (Meteor.users.findOne(multi_item_generator.user_id) === undefined && multi_item_generator.user_id != "Artfunkel, Inc.")
        return [];

    var item_ids = [];

    for (var i=0; i < parseInt(multi_item_generator.count); i++) {
        var rarity_roll = JepLoot.catRoll(multi_item_generator.rarity_map);
        var attribute_array = getAttributeArray(rarity_roll, multi_item_generator.attribute_map);
        var artwork_id = selectArtwork(rarity_roll, attribute_array);

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

selectArtwork = function(rarity, attribute_array) {
	var special_attribute_count = artwork_rarities.indexOf(rarity) - 1;
	var query_object;
	var count = 0;

	if (special_attribute_count > 0) {
		var special_attributes = attribute_array.slice(0, special_attribute_count);
		query_object = {'rarity': rarity, 'active': true, 'special_attributes': {$all: special_attributes}};
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
    var artwork_data = artworks.findOne(item_generator.artwork_id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}}); 

    if (artwork_data) {
        var loot_data = getLootData();

        var misprint_chance = item_generator.misprint_chance === undefined ? loot_data.global_misprint_chance : item_generator.misprint_chance;
        var foil_chance = item_generator.foil_chance === undefined ? loot_data.global_foil_chance : item_generator.foil_chance;
        var unlocked_chance = item_generator.unlocked_chance === undefined ? loot_data.global_unlocked_chance : item_generator.unlocked_chance;

        var misprint = Math.random() < misprint_chance;
        var foil = Math.random() < foil_chance;
        var unlocked = artwork_data.rarity != "common" && Math.random() < unlocked_chance;

        if (misprint)
            artwork_data = misprintArtworkData(artwork_data);      

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

        return new_item_id;
    }

    else return undefined;
}

var getCrateSeeds = function() {
	var crate_seed_array = [];
	var attributes_added = [];
	var rarities_added = [];
	var types_added = [];

	var seed_map = {
		'rarity': 1,
		'attribute': 1,
		'item_type': 1
	}

	var add_seed = true;

	while(add_seed) {
		var seed_type_roll = JepLoot.catRoll(seed_map);

		switch(seed_type_roll) {
			case "rarity": 
				var elligible_rarities = [];
				for (var i=2; i<artwork_rarities.length; i++) {
					if (rarities_added.indexOf(artwork_rarities[i]) == -1) {
						elligible_rarities.push(artwork_rarities[i]);
					}
				}

				if (elligible_rarities.length > 0) {
					var random_index = Math.floor(Math.random() * elligible_rarities.length);
					crate_seed_array.push({'type': seed_type_roll, 'value': elligible_rarities[random_index]});
					rarities_added.push(elligible_rarities[random_index]);
				}
				break;
			case "attribute":
				var query_object = {'_id': {$nin: attributes_added}, 'active': true};
				var attribute_count = attributes.find(query_object).count();
				var random_index = Math.floor(Math.random() * attribute_count);
				var random_attribute = attributes.findOne(query_object, {skip: random_index});
				crate_seed_array.push({'type': seed_type_roll, 'value': random_attribute._id});
				attributes_added.push(random_attribute._id); 
				break;
			case "item_type": 
				var potential_types = ["foil", "seasonal", "unlocked"];
				var elligible_types = [];
				for (var i=0; i<potential_types.length; i++) {
					if (types_added.indexOf(potential_types[i]) == -1) {
						elligible_types.push(potential_types[i]);
					}
				}

				if (elligible_types.length > 0) {
					var random_index = Math.floor(Math.random() * elligible_types.length);
					crate_seed_array.push({'type': seed_type_roll, 'value': elligible_types[random_index]});
					types_added.push(elligible_types[random_index]);
				}
				break;

			default: break;
		}

		add_seed = Math.random() < .2 && crate_seed_array.length < 4;
	}

	return crate_seed_array;
}

createCrate = function() {
	crates.insert({'owner_id': undefined, 'type': "public", 'seeds': getCrateSeeds(), 'item_count': 6});
}

Meteor.methods({
	'openDynamicCrate': function(crate_id) {
		try {
			var player_crate_interface = new PlayerCrateIF(Meteor.userId(), crate_id);
	    	player_crate_interface.open();
	    }

	    catch (error) {
	    	console.log(error);
	    }
	},

	'getDynamicCrates': function() {
		var crate_objects = crates.find({$or: [{'owner_id': Meteor.userId()}, {'owner_id': null}, {'type': "public"}]}).fetch();
		for (var i=0; i<crate_objects.length; i++) {
			var player_crate_interface = new PlayerCrateIF(Meteor.userId(), crate_objects[i]._id);
    		crate_objects[i].cost = player_crate_interface.getCost();
		}

		return crate_objects;
	}
})