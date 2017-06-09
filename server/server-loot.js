logLegendary = function(source, item_object) {
    if (item_object && source && source != "test") {
        var rarity = item_object.artwork_data.rarity;
        var specifier = {};
        var specifier_string = "drops";
        specifier[specifier_string] = {"$ne": undefined};

        var rarity_object = metadata.findOne(specifier).drops[rarity];

        if (rarity_object.sources[source] == undefined)
            rarity_object.sources[source] = 1;

        else rarity_object.sources[source] += 1;

        if (rarity_object.counts[item_object.artwork_id] == undefined)
            rarity_object.counts[item_object.artwork_id] = 1;

        else rarity_object.counts[item_object.artwork_id] += 1;

        var owner_object = Meteor.users.findOne(item_object.owner);;

        if (owner_object) {
            rarity_object.player_level_avg = ((rarity_object.count_total * rarity_object.player_level_avg) + Meteor.users.findOne(item_object.owner).profile.level) / (rarity_object.count_total + 1);
            rarity_object.count_total += 1
        }

        var setter = {};
        var setter_string = "drops." + rarity;
        setter[setter_string] = rarity_object;
        metadata.update(specifier, {$set: setter});
    }
}

getCondition = function(min_value) {
    var tier_map = {
        0 : 2,
        1 : 3,
        2 : 3,
        3 : 2,
        4 : 1
    };

    var random_tier = Number(JepLoot.catRoll(tier_map));
    var condition = (random_tier * 20) + (Math.random() * 20);
    var condition_float = Number((condition / 100).toFixed(2));
    condition_float = Number((min_value + (condition_float * (1 - min_value))).toFixed(2));

    return condition_float;
}

// sumtotal of these values must equal 1
var lowest_possible_value_coefficient = .4;
var condition_coefficient_max = .4;
var attribute_coefficient_max = .2;

getItemObjectRollCost = function(item_object) {
    var roll_count = item_object.roll_count < 0 ? 0 : item_object.roll_count;

    var reroll_coefficient;
    switch(item_object.artwork_data.rarity) {
        case 'common' : reroll_coefficient = 1.1; break;
        case 'uncommon' : reroll_coefficient = 1.11; break;
        case 'rare' : reroll_coefficient = 1.12; break;
        case 'legendary' : reroll_coefficient = 1.13; break;
        case 'masterpiece' : reroll_coefficient = 1.14; break;
        default: reroll_coefficient - 1.14; break;
    }

    var rarity_values = getLootData().rarity_values;
    var reroll_cost = Math.floor((rarity_values[item_object.artwork_data.rarity].min * .1) * Math.pow(reroll_coefficient, roll_count));
    return reroll_cost;
}

getItemObjectValues = function(item_object) {
    var values_object = {};

    var rarity_values = getLootData().rarity_values;

    var min = rarity_values[item_object.artwork_data.rarity].min;
    var max = rarity_values[item_object.artwork_data.rarity].max;

    var range = max - min;

    if (item_object.artwork_data.value_scale == undefined) {
        item_object.artwork_data.value_scale = artworks.findOne({'_id': item_object.artwork_id}).value_scale;
    }

    var mint_value = Math.floor(min + (item_object.artwork_data.value_scale * range));

    var base_value = mint_value * lowest_possible_value_coefficient;
    var condition_value = mint_value * condition_coefficient_max * item_object.condition;
    var attribute_value = mint_value * getAttributeValueCoefficient(item_object);

    var actual_value = Math.floor(base_value + condition_value + attribute_value);

    if (item_object.foil) {
        actual_value *= FOIL_VALUE_BUFF;
    }

    if (item_object.seasonal) {
        actual_value *= SEASONAL_VALUE_BUFF;
    }

    if (item_object.lottery && item_object.lottery != 0) {
        actual_value *= (BASE_LOTTERY_VALUE_BUFF + (item_object.lottery * LOTTERY_LEVEL_VALUE_BUFF));
    }

    if (item_object.original) {
        actual_value *= ORIGINAL_VALUE_BUFF;
    }

    if (item_object.vintage){
        actual_value *= VINTAGE_VALUE_BUFF;
    }

    if (item_object.unlocked) {
        actual_value *= UNLOCKED_VALUE_BUFF;
    }

    var item_level_amplifier = 1 + (item_object.level * ITEM_LEVEL_VALUE_BUFF);
    actual_value *= item_level_amplifier;

    values_object.sell = Math.floor(actual_value * .8);
    values_object.purchase = Math.floor(actual_value * 1.5);
    values_object.actual = Math.floor(actual_value);
    values_object.auction_min = Math.floor(values_object.sell * .8);
    values_object.collector = Math.floor(actual_value * 1.2);
    values_object.dealer = Math.floor(actual_value * .9);

    var all_keys = Object.keys(values_object);
    for (var i=0; i<all_keys.length; i++) {
        var key = all_keys[i];
        if (isNaN(values_object[key])) {
            console.log("invalid value.... " + key + ": " + values_object[key])
            values_object[key] = 0;
        }
    }

    return values_object;
}

var getAttributeValueCoefficient = function(item_object) {
    var attribute_array = getAllItemObjectAttributes(item_object);

    var total_rating = 0;
    var rating_count = 0;

    for (var i=0; i<attribute_array.length; i++) {
        rating_count++;
        total_rating += attribute_array[i].value;
    }

    if (rating_count)
        return (total_rating / rating_count) * attribute_coefficient_max;

    else return 0;
}

getRolledCrateQuality = function() {
    var roll_quality_map = {
        'bronze' : 10000,
        'silver' : 4000,
        'gold' : 1500,
        'platinum' : 100,
        'diamond' : 0
    }

    return JepLoot.catRoll(roll_quality_map);
}

calcSeasonalChance = function(rarity) {
    var item_count = artworks.find({'rarity': rarity, 'active': true}).count();
    return 1 / item_count;
}

getAverageDropValueFromMap = function(rarity_map, foil_chance, unlocked_chance, seasonal_amplifier) {
    var rarity_values = getLootData().rarity_values;
    foil_chance = Math.min(foil_chance, 1);
    unlocked_chance = Math.min(unlocked_chance, 1);

    var total_proportions = 0;
    for (var i=0; i < artwork_rarities.length; i++) {
        var rarity = artwork_rarities[i];
        total_proportions += rarity_map[rarity];
    }

    var total_average = 0;
    for (var i=0; i < artwork_rarities.length; i++) {
        var rarity = artwork_rarities[i];
        var average_rarity_value = (rarity_values[rarity].min + rarity_values[rarity].max) / 2

        if (rarity == "legendary" || rarity == "masterpiece") {
            var seasonal_chance = Math.min(calcSeasonalChance(rarity) * seasonal_amplifier, 1);
            average_rarity_value = (average_rarity_value * (1 - seasonal_chance)) + (average_rarity_value * seasonal_chance * SEASONAL_VALUE_BUFF);
        }

        total_average += (average_rarity_value * (rarity_map[rarity] / total_proportions));
    }

    total_average = (total_average * (1 - foil_chance)) + (total_average * foil_chance * FOIL_VALUE_BUFF);
    total_average = (total_average * (1 - unlocked_chance)) + (total_average * unlocked_chance * UNLOCKED_VALUE_BUFF);



    return Math.floor(total_average);
}

getAverageDropValue = function(player_level, amplifier) {
    var smart_loot_map = getSmartRarityMap(player_level, amplifier);
    var loot_data = getLootData();
    return getAverageDropValueFromMap(smart_loot_map, loot_data.global_foil_chance, loot_data.global_unlocked_chance, 1);
}

//calculates crate costs based on rarity maps and qulity maps
lookupCrateCost = function(count) {
    var average_drop_value = getAverageDropValue(Meteor.user().profile.level, 1);

    return Math.floor(average_drop_value * count * CRATE_UPCHARGE_COEFFICIENT);
}

generateItems = function(multi_item_generator) {
    var user_object = Meteor.users.findOne(multi_item_generator.user_id);

    if (user_object === undefined && multi_item_generator.user_id != BOT_USER_NAME)
        return [];

    var player_level = user_object ? user_object.profile.level : 50;

    var map_amplifier;

    switch(multi_item_generator.quality) {
        case 'bronze': map_amplifier = 0; break;
        case 'silver': map_amplifier = .2; break;
        case 'gold': map_amplifier = .4; break;
        case 'platinum': map_amplifier = .8; break;
        default: map_amplifier = 0; break;
    }

    var item_ids = [];

    for (var i=0; i < parseInt(multi_item_generator.count); i++) {
        var rarity_roll = JepLoot.catRoll(getSmartRarityMap(player_level, map_amplifier));
        var query = {'rarity': rarity_roll, 'active': true};
        var match_count = artworks.find(query).count();
        var rolled_id = artworks.findOne(query, {skip: Math.floor(Math.random() * match_count)})._id;

        var item_generator = {
            'source': multi_item_generator.source,
            'user_id': multi_item_generator.user_id,
            'artwork_id': rolled_id,
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
            'condition_min': multi_item_generator.condition_min
        }

        item_ids.push(generateItemFromArtworkID(item_generator));
    }

    if (user_object != undefined && user_object.profile.settings.animations_enabled) {
        if (multi_item_generator.status == "for_sale") {
            Meteor.users.update(multi_item_generator.user_id, {$push: {'profile.notifications.store': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': multi_item_generator.count}}});
        }

        else if (multi_item_generator.status == "unclaimed" || multi_item_generator.status == "won") {
            Meteor.users.update(multi_item_generator.user_id, {$push: {'profile.notifications.loot': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': multi_item_generator.count}}});
        }
    }

    return item_ids;
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

generateItemFromArtworkID = function(item_generator, callback) {   
    var artwork_data = artworks.findOne(item_generator.artwork_id, {fields: {'active': 0}}); 

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
            'attributes' : getAttributes(artwork_data, unlocked),
            'unlocked': unlocked,
            'active_unique_attribute': artwork_data.unique_attributes ? artwork_data.unique_attributes[0] : undefined,
            'owner' : item_generator.user_id,
            'status' : item_generator.status,
            'date_created' : moment()._d.toISOString(),
            'date_received': moment()._d.toISOString(),
            'level' : item_generator.level === undefined ? 1 : item_generator.level,
            'roll_count' : 0,
            'foil': foil,
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
        new_item_object.reroll_cost = getItemObjectRollCost(new_item_object);

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
            var admin_interface = new PlayerIF(Meteor.users.findOne({'profile.screen_name': "admin"}));
            admin_interface.alert(misprint_message, 'fa-star', 'good');
        }

        return new_item_id;
    }

    else return undefined;
}

getAttributes = function(artwork_object, item_is_unlocked) {
    var all_attributes = [];
    var attributes_object = {
        'locked': [],
        'unlocked': [],
        'special': []
    }

    for (var i=0; artwork_object.special_attributes && i<artwork_object.special_attributes.length; i++) {
        var attribute_object = attributes.findOne(artwork_object.special_attributes[i]);
        attribute_object.value = getAttributeValue(0, .8);
        attributes_object.special.push(attribute_object);
        all_attributes.push(attribute_object._id);
    }

    var locked_count = artwork_object.rarity == "common" || item_is_unlocked ? 0 : 1;
    var unlocked_count = artwork_object.rarity == "common" || !item_is_unlocked ? 1 : 2;

    for (var i=0; i<locked_count; i++) {
        var query = {'_id': {$nin: all_attributes}, 'active': true};
        var attribute_object = attributes.findOne(query, {skip: Math.floor(Math.random() * attributes.find(query).count())});
        attribute_object.value = getAttributeValue(0, .5);
        attributes_object.locked.push(attribute_object);
        all_attributes.push(attribute_object._id);
    }

    for (var i=0; i<unlocked_count; i++) {
        var query = {'_id': {$nin: all_attributes}, 'active': true};
        var attribute_object = attributes.findOne(query, {skip: Math.floor(Math.random() * attributes.find(query).count())});
        attribute_object.value = getAttributeValue(0, 0);
        attributes_object.unlocked.push(attribute_object);
        all_attributes.push(attribute_object._id);
    }

    return attributes_object;
}

getAttributesLegacy = function(artwork_id) {
    try {
        var artwork_object = artworks.findOne(artwork_id);
        var att_count = getLootData().attribute_quantities[artwork_object.rarity];

        var locked_att_ids = artworks.findOne(artwork_id).locked_attributes;

        var att_ids = locked_att_ids == undefined ? [] : locked_att_ids;

        var attribute_array = attributes.find({'_id': {$in: att_ids}}).fetch();

        var atts_to_add = att_count - attribute_array.length;

        for (var i=0; i < atts_to_add; i++) {
            var remaining = attributes.find({'active': true, '_id' : {$nin: att_ids}}).count();
            var random_index = Math.floor(Math.random() * remaining);
            var random_attribute = attributes.findOne({'active': true, '_id' : {$nin: att_ids}}, {skip: random_index});
            attribute_array.push(random_attribute);
            att_ids.push(random_attribute._id)
        }

        for (var i=0; i < attribute_array.length; i++) {
            var locked = attributeIsLocked(artwork_id, attribute_array[i]._id);
            attribute_array[i].value = locked ? getLockedAttributeValue() : getAttributeValue(0, 0);
            attribute_array[i].locked = locked;
        }

        return attribute_array;
    }

    catch(error) {
        console.log(error);
        console.log(artwork_id);
        console.log(rarity);
    }
}

getAttributeValue = function(multiplier, min_value) {
    var tier_map = {
        0 : 1 + (multiplier * 0),
        1 : 2 + (multiplier * 1),
        2 : 3 + (multiplier * 2),
        3 : 2 + (multiplier * 3),
        4 : 1 + (multiplier * 4)
    };

    var random_tier = Number(JepLoot.catRoll(tier_map));
    var attribute_rating = (random_tier * 20) + (Math.random() * 20);
    var attribute_rating_float = Number((attribute_rating / 100).toFixed(2));

    attribute_rating_float = Number((min_value + (attribute_rating_float * (1 - min_value))).toFixed(2));
    return attribute_rating_float;
}

getLockedAttributeValue = function() {
    return Number((.8 + (getAttributeValue(0, 0) * .2)).toFixed(2));
}

Meteor.methods({
    'giveDailyDrop' : function() {
        if (Meteor.user() && dailyDropIsEnabled()) {
            var foil_chance = getLootData().global_foil_chance;

            var multi_item_generator = {
                'source': "daily drop",
                'user_id': Meteor.userId(),
                'quality': "platinum",
                'count': admin_settings.daily_drop_count,
                'status': "unclaimed",
                'foil_chance': foil_chance,
                'unlocked_chance': getLootData().global_unlocked_chance,
                'misprint_chance': getLootData().global_misprint_chance,
                'condition_min': 0,
                'level': 1
            }

            generateItems(multi_item_generator);
   
            var now = getNowISOString();
            Meteor.users.update(Meteor.userId(), {$set: {'profile.last_drop' : now}});

            return true;    
        }

        else return false;
    },

    'openCrate' : function(size) {
        var player_interface = new PlayerIF(Meteor.user());
        var approved_sizes = ['small', 'medium', 'large'];
        if (approved_sizes.indexOf(size) == -1)
            return false;

        var quality = 'platinum'; 
        var crate_object = getCrateData(size);

        if (crate_object == undefined)
            return false;

        if (player_interface.getId() && crate_object.cost < player_interface.getBankBalance()) {
            var loot_data = getLootData();
            var foil_chance = loot_data.global_foil_chance;

            var multi_item_generator = {
                'source': crate_object.size + " crate",
                'user_id': player_interface.getId(),
                'quality': quality,
                'count': crate_object.count,
                'status': "unclaimed",
                'foil_chance': foil_chance,
                'unlocked_chance': loot_data.global_unlocked_chance,
                'misprint_chance': loot_data.global_misprint_chance,
                'condition_min': 0,
                'level': 1
            }

            generateItems(multi_item_generator);
            player_interface.chargeAccount(crate_object.cost);
            Meteor.users.update(player_interface.getId(), {$inc: {'profile.money_spent_on_crates': crate_object.cost}});
        }
    },

    'getCrates' : function() {
        var sizes = ['small', 'medium', 'large'];
        var crate_objects = [];
        for (var i=0; i<sizes.length; i++) {
            crate_objects.push(getCrateData(sizes[i]));
        }
        return crate_objects;
    },

    'getGraphData': function() {
        return getGraphData();
    },

    'updateSmartMap': function(revised_smart_map) {
        if (!adminValidated())
            return false;
        
        if (revised_smart_map) {
            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.smart_map': revised_smart_map}});
            setTimeout('', 2000);
        }

        return {
            'graph_data': getGraphData(),
            'map_data': getLootData().smart_map
        }
    },

    'getTestResults': function(level) {
        return testMap(getSmartRarityMap(level, 1));
    }
})

getCrateData = function(size) {
    var output_count;

    switch(size) {
        case "small": output_count = 6; break;
        case "medium": output_count = 18; break;
        case "large": output_count = 54; break;
        default: break;
    }

    var cost = lookupCrateCost(output_count);

    switch(size) {
        case "small": cost *= 1.4; break;
        case "medium": cost *= 1.2; break;
        case "large": break;
        default: break;
    }

    var crate_object = {
        'cost': Math.floor(cost),
        'count': output_count,
        'size': size
    }

    return crate_object;
}

var getGraphData = function() {
    var graph_data = {
        'common': [],
        'uncommon': [],
        'rare': [],
        'legendary': [],
        'masterpiece': []
    };

    for (var i=0; i < 51; i+=10) {
        var percentage_map = calcPercentageMap(i);

        artwork_rarities.forEach(function(rarity) {
            graph_data[rarity].push(percentage_map[rarity]);
        });
    }

    return graph_data;
}

var rarities = ['common', 'uncommon', 'rare', 'legendary', 'masterpiece'];

getSmartRarityMap = function(level, amplifier) {
    var smart_map = getLootData().smart_map;

    if (level >= 50)
        return smart_map[50];

    else {
        var first_index = Math.floor(level / 10) * 10;
        var second_index = Math.ceil(level / 10) * 10;
        var map_one = smart_map[first_index];
        var map_two = smart_map[second_index];

        var level_ratio = (level % 10) / 10;

        var generated_map = {};

        rarities.forEach(function(rarity) {
            var difference = map_two[rarity] - map_one[rarity];
            var value = map_one[rarity] + (level_ratio * difference);

            var max_reduction_coefficient;

            switch(rarity) {
                case "common": max_reduction_coefficient = .4; break;
                case "uncommon": max_reduction_coefficient = .3; break;
                case "rare": max_reduction_coefficient = .2; break;
                case "legendary": max_reduction_coefficient = .1; break;
                case "masterpiece": max_reduction_coefficient = 0; break;
                default: max_reduction_coefficient = 1; break;
            }
            
            weighted_value = value * (1 - (max_reduction_coefficient * amplifier));

            generated_map[rarity] = Math.ceil(weighted_value);
        });

        return generated_map;
    }
}

var calcPercentageMap = function(level) {
    var generated_map = getSmartRarityMap(level, 0);

    var value_total = 0;

    var percentage_map = {};

    rarities.forEach(function(rarity) {
        value_total += generated_map[rarity];
    });

    rarities.forEach(function(rarity) {
        var percent_chance = generated_map[rarity] / value_total;
        percentage_map[rarity] = percent_chance;
    });

    return percentage_map;
};

testMap = function(loot_map) {
    var roll_counts = {
        'common': 0,
        'uncommon': 0,
        'rare': 0,
        'legendary': 0,
        'masterpiece': 0
    };

    for (var i=0; i < 10000; i++) {
        var rarity_rolled = JepLoot.catRoll(loot_map);
        roll_counts[rarity_rolled] += 1;
    }

    return roll_counts;
}

getRandomArtworkIDsFromRarity = function(count, rarity) {
    var ids_selected = [];

    while (ids_selected.length < count && artworks.findOne({'_id': {$nin: ids_selected}, 'rarity': rarity}) != undefined) {
        var selector = {
            '_id': {$nin: ids_selected}, 
            'rarity': rarity,
            'active': true
        };

        ids_selected.push(artworks.findOne(selector, {skip: Math.floor(Math.random() * artworks.find(selector).count())})._id);
    }

    return ids_selected;
}

getRandomArtworkIDFromRarity = function(rarity) {
    return artworks.findOne({'rarity': rarity, 'active': true}, {skip: Math.floor(Math.random() * artworks.find({'rarity': rarity}).count())})._id;
}
