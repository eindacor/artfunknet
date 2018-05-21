VALUE_SCALE_WEIGHT = .5;
DROP_INDEX_BASE_SHARES = 100;

ACTIVE_ARTWORK_CACHE = {
    'common': [],
    'uncommon': [],
    'rare': [],
    'legendary': [],
    'masterpiece': [],
    'special_attribute_map': {}
}

ARTWORK_DROP_ODDS = undefined;

LOOT_DATA = undefined;

// DROP_ID_INDICES is a static array of artwork id's. When an item is generated, it randomly selects an index of the array to identify the artwork.
// Items with a higher value scale have fewer "shares" in the static array, meaning they will appear less frequently
DROP_ID_INDICES = undefined;

// DROP_INDEX_SUMTOTALS is a static counter that tracks the number of total "shares" in the DROP_ID_INDICES array to quickly identify drop probabilities.
DROP_INDEX_SUMTOTALS = undefined;

getLootData = function() {
    var loot_data_copy = JSON.parse(JSON.stringify(LOOT_DATA));
    return loot_data_copy;
}

setLootData = function() {
    LOOT_DATA = metadata.findOne({'loot_data': {$ne: null}}).loot_data;
}

getDropIndexSumtotal = function(rarity) {
    if (DROP_INDEX_SUMTOTALS == undefined) {
        updateDropIndices();
    }
    
    return DROP_INDEX_SUMTOTALS[rarity];
}

getDropIndexShares = function(value_scale) {
    return DROP_INDEX_BASE_SHARES + Math.floor(DROP_INDEX_BASE_SHARES * VALUE_SCALE_WEIGHT * (1 - value_scale));
}

updateDropIndices = function() {
    DROP_ID_INDICES = {
        'common': [],
        'uncommon': [],
        'rare': [],
        'legendary': [],
        'masterpiece': []
    };

    DROP_INDEX_SUMTOTALS = {
        'common': 0,
        'uncommon': 0,
        'rare': 0,
        'legendary': 0,
        'masterpiece': 0
    };

    var seasonal_ids = getAllSeasonalIds();

    var all_artworks = artworks.find({'_id': {$nin: seasonal_ids}, 'active': true}).fetch();

    for (var i=0; i<all_artworks.length; i++) {
        var artwork_object = all_artworks[i];
        var rarity = artwork_object.rarity;
        var value_scale = artwork_object.value_scale;
        var actual_shares = getDropIndexShares(artwork_object.value_scale);
        DROP_INDEX_SUMTOTALS[rarity] += actual_shares;

        for (var n=0; n<actual_shares; n++) {
            DROP_ID_INDICES[rarity].push(artwork_object._id);
        }
    }
}

rotateSeasonalItems = function(rarities, increment_next_rotation) {
    var setter = {};
    var id_setter = {};
    var rotation_setter = {};

    for (var i=0; i<SEASONAL_RARITIES.length; i++) { 
        var rarity = SEASONAL_RARITIES[i];
        id_setter[rarity] = getNewSeasonalIds(rarity);

        if (increment_next_rotation) {
            var rotation_frequency = SEASONAL_ITEM_ROTATION_FREQUENCIES[rarity];
            var last_rotation = moment(getLootData().seasonal_rotation[rarity]);
            rotation_setter[rarity] = last_rotation.add(1, rotation_frequency)._d.toISOString();
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
        setLootData();
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

getRandomNonSeasonalIdFromRarity = function(rarity) {
    if (DROP_ID_INDICES == undefined) {
        updateDropIndices();
    }

    var sumtotal = DROP_INDEX_SUMTOTALS[rarity];
    var random_index = Math.floor(Math.random() * sumtotal);
    return DROP_ID_INDICES[rarity][random_index];
}

serializeSpecialCombination = function(attribute_array) {
    attribute_array.sort();
    return attribute_array.toString();
}

updateArtwork = function(artwork_id, modifier) {
    artworks.update(artwork_id, modifier, function(error) {
        if (error)
            console.log("updateArtwork: " + error.message)

        else {
            var artwork_object = artworks.findOne(artwork_id);
            if (artwork_object == undefined)
                return false;

            items.find({'artwork_id': artwork_object._id}).forEach(function(item_object) {
                updateItemAttributesWithNewArtworkData(new ItemIF(item_object));
            })

            updateActiveArtworkCache();
        }
    })
}

updateActiveArtworkCache = function() {
    var local_cache = {
        'common': [],
        'uncommon': [],
        'rare': [],
        'legendary': [],
        'masterpiece': [],
        'special_attribute_map': {}
    }

    var all_artworks = artworks.find({'active': true}).fetch();
    for (var i=0; i<all_artworks.length; i++) {
        var artwork_object = all_artworks[i];
        local_cache[artwork_object.rarity].push(artwork_object._id);

        if (["rare", "legendary", "masterpiece"].indexOf(artwork_object.rarity) != -1) {
            var serialized_specials = serializeSpecialCombination(artwork_object.special_attributes);
            if (local_cache.special_attribute_map[serialized_specials] == undefined) {
                local_cache.special_attribute_map[serialized_specials] = [artwork_object._id];
            }
            else {
                local_cache.special_attribute_map[serialized_specials].push(artwork_object._id);
            }
        }
    }

    ACTIVE_ARTWORK_CACHE = local_cache;

    updateDropIndices();
    updateArtworkDropOdds();
}

getActiveArtworkCache = function() {
    return ACTIVE_ARTWORK_CACHE;
}

updateArtworkDropOdds = function() {
    var all_artworks = artworks.find({'active': true}).fetch();
    ARTWORK_DROP_ODDS = {};
    for (var i=0; i<all_artworks.length; i++) {
        var artwork_object = all_artworks[i];
        var drop_index_shares = getDropIndexShares(artwork_object.value_scale);
        var drop_index_sumtotal = getDropIndexSumtotal(artwork_object.rarity);
        ARTWORK_DROP_ODDS[artwork_object._id] = drop_index_shares/drop_index_sumtotal;
    }

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

    if (item_object.original || 
        item_object.lottery || 
        artworks.findOne({'_id': item_object.artwork_id, 'active': false}) != undefined ||
        (item_object.seasonal && loot_data.seasonal_items[item_object.artwork_data.rarity].indexOf(item_object.artwork_id) == -1)) {
        return "0";
    }

    var standard_map = getDefaultRarityMap();
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