VALUE_SCALE_WEIGHT = .5;
DROP_INDEX_BASE_SHARES = 100;

ACTIVE_ARTWORK_CACHE = undefined;

SERIALIZED_SPECIAL_ATTRIBUTE_COMBINATION_CACHE = undefined;

ARTWORK_DROP_ODDS = undefined;

LOOT_DATA = undefined;

ARTWORK_DROP_MAP_CACHE = undefined;

AVERAGE_ITEM_VALUE_BY_RARITY_CACHE = undefined;

BASIC_CRATE_UPCOST_FROM_AVG_VALUE = undefined;

getBasicCrateUpcostFromAverageValue = function() {
    if (BASIC_CRATE_UPCOST_FROM_AVG_VALUE == undefined) {
        updateBasicCrateUpcostFromAverageValue();
    }

    return BASIC_CRATE_UPCOST_FROM_AVG_VALUE;
}

updateBasicCrateUpcostFromAverageValue = function() {
    var crate_expense_per_masterpiece = getLootData().crate_expense_per_masterpiece;
    var basic_crate_cost = getLootData().basic_crate_cost;
    var items_per_basic_crate = getLootData().items_per_basic_crate;

    var max_level_rarity_map = getRarityMap(PLAYER_LEVEL_MAX);

    var average_drop_value = 0;

    for (var i=0; i<ARTWORK_RARITIES.length; i++) {
        var rarity = ARTWORK_RARITIES[i];
        average_drop_value += (getAverateItemValueByRarityCache()[rarity] * max_level_rarity_map[rarity]);
    }

    // TODO seasonal/foil/unlocked

    var total_value = average_drop_value * items_per_basic_crate;
    BASIC_CRATE_UPCOST_FROM_AVG_VALUE = basic_crate_cost / total_value;
    devLog("BASIC_CRATE_UPCOST_FROM_AVG_VALUE updated");
}

getLootData = function() {
    if (LOOT_DATA == undefined) {
        updateLootData();
    }

    return JSON.parse(JSON.stringify(LOOT_DATA));
}

updateLootData = function() {
    LOOT_DATA = metadata.findOne({'loot_data': {$ne: null}}).loot_data;
    devLog("LOOT_DATA updated");
    updateBasicCrateUpcostFromAverageValue();
}

getDropIndexShares = function(value_scale) {
    return DROP_INDEX_BASE_SHARES + Math.floor(DROP_INDEX_BASE_SHARES * VALUE_SCALE_WEIGHT * (1 - value_scale));
}

updateArtworkDropMapCache = function() {
    ARTWORK_DROP_MAP_CACHE = {};

    for (var i=0; i<ARTWORK_RARITIES.length; i++) {
        var rarity = ARTWORK_RARITIES[i];
        var artwork_rarity_map = {};
        var all_artworks_of_rarity = artworks.find({'active': true, 'rarity': rarity}).fetch();
        for (var c=0; c<all_artworks_of_rarity.length; c++) {
            var artwork_object_of_rarity = all_artworks_of_rarity[c];
            artwork_rarity_map[artwork_object_of_rarity._id] = 50 + Math.floor((1 - artwork_object_of_rarity.value_scale) * 50);
        }

        ARTWORK_DROP_MAP_CACHE[rarity] = getMapCacheFromValueMap(artwork_rarity_map);
    }

    devLog("ARTWORK_DROP_MAP_CACHE updated");
}

getArtworkDropMapCache = function() {
    if (ARTWORK_DROP_MAP_CACHE == undefined) {
        updateArtworkDropMapCache();
    }

    return ARTWORK_DROP_MAP_CACHE;
}

rotateSeasonalItems = function(rarities, increment_next_rotation) {
    var setter = {};
    var id_setter = getLootData().seasonal_items;
    var rotation_setter = getLootData().seasonal_rotation;

    for (var i=0; i<rarities.length; i++) { 
        var rarity = rarities[i];
        id_setter[rarity] = getNewSeasonalIds(rarity);

        if (increment_next_rotation) {
            var rotation_frequency = SEASONAL_ITEM_ROTATION_FREQUENCIES[rarity];
            var last_rotation = getLootData().seasonal_rotation[rarity];
            if (last_rotation == undefined) {
                last_rotation = getNowISOString();
            }
            rotation_setter[rarity] = moment(last_rotation).add(1, rotation_frequency)._d.toISOString();
        }    
    }

    var id_setter_key = 'loot_data.seasonal_items';
    setter[id_setter_key] = id_setter;

    if (increment_next_rotation) {
        var rotation_setter_key = 'loot_data.seasonal_rotation';
        setter[rotation_setter_key] = rotation_setter;
    }

    metadata.update({'loot_data': {$ne: null}}, {$set: setter}, function() {
        alertPlayers({}, '<p>The seasonal artworks have been updated. Click <a href="/wiki">here</a> to view!</p>', 'fa-exclamation', 'neutral');
        updateLootData();
        updateActiveArtworkCache();
    });
}

getNewSeasonalIds = function(rarity) {
    var previous_seasonals = getLootData().seasonal_items[rarity];

    if (previous_seasonals == undefined) {
        previous_seasonals = [];
    }

    var id_count = SEASONAL_ITEM_COUNTS[rarity];

    var random_artwork_ids = [];

    for (var i=0; i<id_count; i++) {
        var random_artwork_id;
        do {
            random_artwork_id = getRandomArtworkIFFromRarity(rarity).getId();
        } while (previous_seasonals.indexOf(random_artwork_id) != -1 && random_artwork_ids.indexOf(random_artwork_id) != -1)

        random_artwork_ids.push(random_artwork_id);
    }

    return random_artwork_ids;
}

getRandomIdFromRarity = function(rarity) {
    return getArtworkDropMapCache()[rarity].getRandom();
}

serializeSpecialCombination = function(attribute_array) {
    attribute_array.sort();
    return attribute_array.toString();
}

updateArtwork = function(artwork_id, modifier) {
    artworks.update(artwork_id, modifier, function(error) {
        if (error)
            console.log("updateArtwork: " + error)

        else {
            var artwork_object = artworks.findOne(artwork_id);
            if (artwork_object == undefined)
                return false;

            items.find({'artwork_id': artwork_object._id}).forEach(function(item_object) {
                updateItemAttributesWithNewArtworkData(new ItemIF(item_object));
            })

            updateAverageItemValueByRarityCache();
            updateActiveArtworkCache();
        }
    })
}

updateSerializedSpecialAttributeCombinationCache = function() {
    var special_attribute_map = {};

    var all_artworks = artworks.find({'active': true}).fetch();
    for (var i=0; i<all_artworks.length; i++) {
        var artwork_object = all_artworks[i];

        if ([RARE, LEGENDARY, MASTERPIECE].indexOf(artwork_object.rarity) != -1) {
            var serialized_specials = serializeSpecialCombination(artwork_object.special_attributes);
            if (special_attribute_map[serialized_specials] == undefined) {
                special_attribute_map[serialized_specials] = [artwork_object._id];
            }
            else {
                special_attribute_map[serialized_specials].push(artwork_object._id);
            }
        }
    }

    SERIALIZED_SPECIAL_ATTRIBUTE_COMBINATION_CACHE = special_attribute_map;

    devLog("SERIALIZED_SPECIAL_ATTRIBUTE_COMBINATION_CACHE updated");
}

getSerializedSpecialAttributeCombinationCache = function() {
    if (SERIALIZED_SPECIAL_ATTRIBUTE_COMBINATION_CACHE == undefined) {
        updateSerializedSpecialAttributeCombinationCache();
    }

    return SERIALIZED_SPECIAL_ATTRIBUTE_COMBINATION_CACHE;
}

updateActiveArtworkCache = function() {
    var local_cache = {
        'common': [],
        'uncommon': [],
        'rare': [],
        'legendary': [],
        'masterpiece': []
    }

    var all_artworks = artworks.find({'active': true}).fetch();
    for (var i=0; i<all_artworks.length; i++) {
        var artwork_object = all_artworks[i];
        local_cache[artwork_object.rarity].push(artwork_object._id);
    }

    ACTIVE_ARTWORK_CACHE = local_cache;

    devLog("ACTIVE_ARTWORK_CACHE updated");

    updateAverageItemValueByRarityCache();
    updateArtworkDropMapCache();
    updateArtworkDropOdds();
}

getAverateItemValueByRarityCache = function() {
    if (AVERAGE_ITEM_VALUE_BY_RARITY_CACHE == undefined) {
        updateAverageItemValueByRarityCache();
    }

    return AVERAGE_ITEM_VALUE_BY_RARITY_CACHE;
}

updateAverageItemValueByRarityCache = function() {
    AVERAGE_ITEM_VALUE_BY_RARITY_CACHE = {};

    var rarity_base_value_totals = {
        'common': 0,
        'uncommon': 0,
        'rare': 0,
        'legendary': 0,
        'masterpiece': 0,
    }

    var artwork_rarity_counts = {
        'common': 0,
        'uncommon': 0,
        'rare': 0,
        'legendary': 0,
        'masterpiece': 0,
    }

    var all_artworks = artworks.find({'active': true}).fetch();
    for (var i=0; i<all_artworks.length; i++) {
        var artwork_object = all_artworks[i];
        var mint_value = getMintValueFromArtworkObject(artwork_object);
        var actual_value = getActualValueFromMintValue(mint_value, .5);
        rarity_base_value_totals[artwork_object.rarity] += actual_value;
        artwork_rarity_counts[artwork_object.rarity] += 1;
    }

    for (var i=0; i<ARTWORK_RARITIES.length; i++) {
        var rarity = ARTWORK_RARITIES[i];
        AVERAGE_ITEM_VALUE_BY_RARITY_CACHE[rarity] = rarity_base_value_totals[rarity] / artwork_rarity_counts[rarity];
    }

    devLog("AVERAGE_ITEM_VALUE_BY_RARITY_CACHE updated");
}

getActiveArtworkCache = function() {
    if (ACTIVE_ARTWORK_CACHE == undefined) {
        updateActiveArtworkCache();
    }

    return ACTIVE_ARTWORK_CACHE;
}

updateArtworkDropOdds = function() {
    var all_artworks = artworks.find({'active': true}).fetch();
    ARTWORK_DROP_ODDS = {};
    for (var i=0; i<ARTWORK_RARITIES.length; i++) {
        var rarity = ARTWORK_RARITIES[i];
        var all_artworks = artworks.find({'rarity': rarity}).fetch();
        for (var c=0; c<all_artworks.length; c++) {
            var artwork_id = all_artworks[c]._id;
            ARTWORK_DROP_ODDS[artwork_id] = all_artworks[c].active ? getArtworkDropMapCache()[rarity].getProbability(artwork_id) : 0;
        }
    }

    devLog("ARTWORK_DROP_ODDS updated");

    items.find().forEach(function(item_object) {
        var item_odds = getItemOddsString(item_object);
        if (item_odds != item_object.odds) {
            items.update(item_object._id, {$set: {'odds': item_odds}});
        }
    })
}

getArtworkDropOdds = function(artwork_id) {
    if (ARTWORK_DROP_ODDS == undefined) {
        updateArtworkDropOdds();
    }

    return ARTWORK_DROP_ODDS[artwork_id];
}

getItemOddsString = function(item_object) {
    var loot_data = getLootData();

    if (item_object.seasonal) {
        var seasonal_ids = loot_data.seasonal_items[item_object.artwork_data.rarity];
        if (seasonal_ids == undefined || seasonal_ids.indexOf(item_object.artwork_id) == -1) {
            return "0";
        }
    }

    if (item_object.original || 
        item_object.lottery || 
        artworks.findOne({'_id': item_object.artwork_id, 'active': false}) != undefined) {
        return "0";
    }

    var standard_map = getRarityMap(50);
    var keys = Object.keys(standard_map);
    var sumtotal = 0;
    for (var i=0; i<keys.length; i++) {
        sumtotal += standard_map[keys[i]];
    }

    var odds = standard_map[item_object.artwork_data.rarity] / sumtotal;

    odds *= getArtworkDropOdds(item_object.artwork_id);

    if (item_object.foil) {
        odds *= loot_data.global_foil_chance;
    }

    if (item_object.unlocked) {
        odds *= loot_data.global_unlocked_chance;
    }

    if (item_object.patreon) {
        odds *= loot_data.global_patreon_chance;
    }

    var drop_count = getCommaSeparatedValue(Math.floor(1/odds));
    return "1 in " + drop_count;
}