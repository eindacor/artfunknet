getDynamicCrateCost = function(user_id, crate_id) {
	var player_interface = new PlayerIF(user_id);
	var crate_object = crates.findOne(crate_id);

	// calc normal odds of occurance
	// determine chance increase
	// increase cost based on chance increase

	// aggregate seed amplifications

	var crate_seeds = crate_object.seeds;
	var cost_amplifier = 1;
	var original_loot_map = getSmartRarityMap(player_interface.getPlayerLevel(), .8);
	var original_cost = getAverageDropValueFromMap(original_loot_map);

	var revised_loot_map = getRarityMapFromCrate(crate_object);
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

	return Math.floor(original_cost * cost_amplifier);
}

getRarityMapFromCrate = function(user_id, crate_id) {
	var player_interface = new PlayerIF(user_id);
	var crate_object = crates.findOne(crate_id);

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

getAttributeMapFromCrate = function(user_id, crate_id) {
	var player_interface = new PlayerIF(user_id);
	var crate_object = crates.findOne(crate_id);

	var crate_seeds = crate_object.seeds;
	var attribute_map = {};
	var all_attributes = attributes.find({'active': true}).fetch();

	for (var i=0; i<all_attributes.length; i++) {
		var attribute_object = all_attributes[i];
		attribute_map[attribute_object._id] = 1;
	}

	for (var i=0; i<crate_seeds.length; i++) {
		if (crate_seeds[i].type == "attribute") {
			attribute_map[crate_seeds[i].value] *= 3;
		}
	}

	return attribute_map;
}

// openCrate = function(user_id, crate_id) {

// }

Meteor.methods({
	'checkCrates': function() {
		var user_id = "3zsXCKgsYtdDojitM";
	    console.log(user_id);
	    crates.find().forEach(function(crate_object) {
	        var crate_cost = getDynamicCrateCost(user_id, crate_object._id);
	        console.log("cost: " + crate_cost);
	        var crate_rarity_map = getRarityMapFromCrate(user_id, crate_object._id);
	        console.log("rarity map: " + crate_rarity_map);
	        var crate_attribute_map = getAttributeMapFromCrate(user_id, crate_object._id);
	        console.log("crate attribute map: " + crate_attribute_map);
	    })
	}
})