/*
    All rarity drops are derived from the amount players should spend on crates to find a masterpiece.
    Based on the desired money spent per masterpiece drop, the desired cost of crates, and the desired
    number of items per crate, the code below determines how many drops the player should see before getting
    a masterpiece. Once the number of drops is determined, a portion of the total is assigned to
    each rarity tier based on the player's level, the rarity level restrictions, and the rarity's drop portion 
    coefficient. This coefficient determines what the maximum percentage of remaining drops will go to that 
    rarity.
*/


//TODO add globals to DB and allow modification via admin panel

RARITY_DROP_MAP_CACHE = undefined;

MAX_DROP_PORTION_COEFFICIENTS = {
    'legendary': .01,
    'rare': .1,
    'uncommon': .3
}

var getDropRestrictionScale = function(player_level, rarity) {
    // 50 - 30 + 1 = 21
    var step_count = PLAYER_LEVEL_MAX - getRarityLevelRestrictions()[rarity] + 1;
    // 30 - 30 + 1 = 1
    // 50 - 30 + 1 = 21
    var player_step_index = player_level - getRarityLevelRestrictions()[rarity] + 1;
    // 1/21
    var step_degree = 1 / step_count;
    // 1 * 1/21 = 1/21 @ lvl 30
    // 21 * 1/21 = 1 @ lvl 50
    return step_degree * player_step_index;
}

var getMasterpieceDropChance = function() {
    var loot_data = getLootData();
    return 1 / ((loot_data.crate_expense_per_masterpiece / loot_data.basic_crate_cost) * loot_data.items_per_basic_crate);
}

var getDropCountFromRemainingDrops = function(rarity, player_level, remaining_drop_value) {
    if (rarity == "common") {
        return remaining_drop_value;
    }

    if (player_level < getRarityLevelRestrictions()[rarity]) {
        return 0;
    }

    if (rarity == "masterpiece") {
        return getMasterpieceDropChance();
    }

    var drop_coefficient = 2;
    var drop_restriction_scale = getDropRestrictionScale(player_level, rarity);
    var drop_proportion_reducer = Math.pow(drop_restriction_scale, drop_coefficient);

    var max_portion_of_remaining_value = MAX_DROP_PORTION_COEFFICIENTS[rarity];

    var drop_percentage = remaining_drop_value * max_portion_of_remaining_value * drop_proportion_reducer;

    return drop_percentage;
}

var generateDropMap = function(player_level) {
    var map_object = {};

    var total_drop_value = 1;

    for (var i=ARTWORK_RARITIES.length - 1; i>=0; i--) {
        var rarity = ARTWORK_RARITIES[i]; 
        var drop_percentage = getDropCountFromRemainingDrops(rarity, player_level, total_drop_value);
        map_object[rarity] = drop_percentage;
        total_drop_value = total_drop_value - drop_percentage;
    }

    return map_object;
}

updateRarityDropMapCache = function() {
	RARITY_DROP_MAP_CACHE = {};
	for (var i=0; i<=PLAYER_LEVEL_MAX; i++) {
		RARITY_DROP_MAP_CACHE[i] = new MapCacheIF(generateDropMap(i));
	}
}

getRarityDropMapCache = function() {
	if (RARITY_DROP_MAP_CACHE == undefined) {
		updateRarityDropMapCache();
	}

	return RARITY_DROP_MAP_CACHE;
}

getRarityMap = function(player_level) {
    if (getRarityDropMapCache()[player_level] == undefined) {
        updateRarityDropMapCache();
    }

    return JSON.parse(JSON.stringify(getRarityDropMapCache()[player_level].getBaseMap()));
}

setCostPerMasterpiece = function(value) {
    metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.crate_expense_per_masterpiece': value}}, function() {
        setLootData();
        updateRarityDropMapCache();
    })
}

setCrateCost = function(value) {
    metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.basic_crate_cost': value}}, function() {
        setLootData();
        updateRarityDropMapCache();
    })
}

updateCrateDropCount = function(value) {
    metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.items_per_basic_crate': value}}, function() {
        setLootData();
        updateRarityDropMapCache();
    })
}