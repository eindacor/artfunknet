getLootData = function() {
    return metadata.findOne({'loot_data': {$ne: null}}).loot_data;
}

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

var reroll_coefficients = {
    'common' : 1.1,
    'uncommon' : 1.11,
    'rare' : 1.12,
    'legendary' : 1.13,
    'masterpiece' : 1.14
}

// sumtotal of these values must equal 1
var lowest_possible_value_coefficient = .5;
var condition_coefficient_max = .3;
var attribute_coefficient_max = .2;

getItemObjectValues = function(item_object) {
    try {
        var value_types = ["sell", "purchase", "actual", "auction_min", "collector", "dealer", "display"];
        var values_object = {};

        var rarity_values = getLootData().rarity_values;

        var artwork_object = artworks.findOne({'_id': item_object.artwork_id});

        var min = rarity_values[artwork_object.rarity].min;
        var max = rarity_values[artwork_object.rarity].max;

        var range = max - min;

        var mint_value = Math.floor(min + (artwork_object.value_scale * range));

        var base_value = mint_value * lowest_possible_value_coefficient;
        var condition_value = mint_value * condition_coefficient_max * item_object.condition;
        var attribute_value = mint_value * getAttributeValueCoefficient(item_object);

        var actual_value = Math.floor(base_value + condition_value + attribute_value);
        var display_value = actual_value * 2;

        if (item_object.foil) {
            actual_value *= 2;
            display_value *= 1.2;
        }

        if(item_object.seasonal) {
            actual_value *= 5;
            display_value *= 1.5;
        }

        if(item_object.lottery && item_object.lottery != 0) {
            actual_value *= 30 + (10 * item_object.lottery);
            display_value *= 2;
        }

        if(item_object.original) {
            actual_value *= 7;
            display_value *= 2;
        }

        if (item_object.misprint){
            display_value *= 20;
        }

        if (item_object.vintage){
            actual_value *= 2;
            display_value *= 1.5;
        }

        values_object.sell = Math.floor(actual_value * .8);
        values_object.purchase = Math.floor(actual_value * 1.5);
        values_object.actual = Math.floor(actual_value);
        values_object.auction_min = Math.floor(values_object.sell * .8);
        values_object.collector = Math.floor(actual_value * 1.2);
        values_object.dealer = Math.floor(actual_value * .9);
        values_object.display = Math.floor(display_value);

        return values_object;
    }

    catch (error) {
        console.log("getItemObjectValues: " + error.message);
        return {};
    }
}

var getAttributeValueCoefficient = function(item_object) {
    var attribute_array = item_object.attributes;

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

getRerollCost = function(item_id) {
    var rarity_values = getLootData().rarity_values;

    var item_object = items.findOne(item_id);

    var roll_count = item_object.roll_count < 0 ? 0 : item_object.roll_count;

    var rarity = item_object.artwork_data.rarity;
    var reroll_coefficient = reroll_coefficients[rarity];
    var average_value = Math.floor((rarity_values[rarity].max + rarity_values[rarity].min) / 2);

    var reroll_cost = (rarity_values[rarity].min * .1) * Math.pow(reroll_coefficient, roll_count);

    if (procUniqueAttribute(Meteor.userId(), "REROLL_DISCOUNT", undefined)) {
        reroll_cost = Math.floor(reroll_cost * .75);
    }

    return Math.floor(reroll_cost);
}

getAverageDropValue = function(player_level, amplifier) {
    var smart_loot_map = getSmartRarityMap(player_level, amplifier);
    var rarity_values = getLootData().rarity_values;

    var total_proportions = 0;
    for (var i=0; i < artwork_rarities.length; i++) {
        var rarity = artwork_rarities[i];
        total_proportions += smart_loot_map[rarity];
    }

    var total_average = 0;
    for (var i=0; i < artwork_rarities.length; i++) {
        var rarity = artwork_rarities[i];
        var average_value = (rarity_values[rarity].min + rarity_values[rarity].max) / 2
        total_average += (average_value * (smart_loot_map[rarity] / total_proportions));
    }

    return Math.floor(total_average);
}

//calculates crate costs based on rarity maps and qulity maps
lookupCrateCost = function(quality, count) {
    var map_amplifier;

    switch(quality) {
        case 'bronze': map_amplifier = 0; break;
        case 'silver': map_amplifier = .2; break;
        case 'gold': map_amplifier = .4; break;
        case 'platinum': map_amplifier = .8; break;
        default: map_amplifier = 0; break;
    }

    var average_drop_value = getAverageDropValue(Meteor.user().profile.level, map_amplifier);

    //TODO remove hardcoded multiplier and adjust rarity_inflation_coefficients on DB
    return Math.floor(average_drop_value * count * getLootData().rarity_inflation_coefficients[quality] * 1.75);
}

generateItems = function(multi_item_generator) {
    if (Meteor.users.findOne(multi_item_generator.user_id) === undefined && multi_item_generator.user_id != "Artfunkel, Inc.")
        return [];

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
        var rarity_roll = JepLoot.catRoll(getSmartRarityMap(Meteor.user().profile.level, map_amplifier));
        var query = {'rarity': rarity_roll, 'active': true};
        var match_count = artworks.find(query).count();
        var rolled_id = artworks.findOne(query, {skip: Math.floor(Math.random() * match_count)})._id;

        var item_generator = {
            'source': multi_item_generator.source,
            'user_id': multi_item_generator.user_id,
            'artwork_id': rolled_id,
            'condition': undefined,
            'xp_rating': undefined,
            'foil_chance': multi_item_generator.foil_chance,
            'seasonal': undefined,
            'lottery': 0,
            'original': false,
            'vintage': false,
            'misprint_chance': multi_item_generator.misprint_chance,
            'status': multi_item_generator.status,
            'xp_rating_min': multi_item_generator.xp_rating_min,
            'condition_min': multi_item_generator.condition_min
        }

        item_ids.push(generateItemFromArtworkID(item_generator));
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
    var misprinted = Math.random() < item_generator.misprint_chance;
    var artwork_data = artworks.findOne(item_generator.artwork_id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}});
    if (artwork_data) {

        if (misprinted)
            artwork_data = misprintArtworkData(artwork_data);

        var loot_data = getLootData();

        var new_item_object = {
            'artwork_id' : item_generator.artwork_id,
            'condition' : item_generator.condition === undefined ? getCondition(item_generator.condition_min) : item_generator.condition,
            'attributes' : getAttributes(artwork_data.rarity, item_generator.artwork_id),
            'owner' : item_generator.user_id,
            'status' : item_generator.status,
            'date_created' : moment()._d.toISOString(),
            'date_received': moment()._d.toISOString(),
            'xp_rating' : item_generator.xp_rating === undefined ? getXPRating(item_generator.xp_rating_min) : item_generator.xp_rating,
            'roll_count' : 0,
            'foil': loot_data.seasonal_items.indexOf(item_generator.artwork_id) == -1 && Math.random() < item_generator.foil_chance,
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

attributeIsLocked = function(artwork_id, attribute_id) {
    return artworks.findOne({'_id': artwork_id, 'locked_attributes': {$in: [attribute_id]}}) != undefined;
}

getAttributes = function(rarity, artwork_id) {
    try {
        var att_count = getLootData().attribute_quantities[rarity].primary;
        var total_primary = attributes.find({'type' : "primary", 'active': true}).count();

        var locked_att_ids = artworks.findOne(artwork_id).locked_attributes;

        var att_ids = locked_att_ids == undefined ? [] : locked_att_ids;

        var attribute_array = attributes.find({'_id': {$in: att_ids}}).fetch();

        var atts_to_add = att_count - attribute_array.length;

        for (var i=0; i < atts_to_add; i++) {
            var remaining = attributes.find({'type' : "primary", 'active': true, '_id' : {$nin: att_ids}}).count();
            var random_index = Math.floor(Math.random() * remaining);
            var random_attribute = attributes.findOne({'type' : "primary", 'active': true, '_id' : {$nin: att_ids}}, {skip: random_index});
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

getXPRating = function(min_value) {
    var tier_map = {
        0 : 2,
        1 : 3,
        2 : 3,
        3 : 2,
        4 : 1
    };

    var random_tier = Number(JepLoot.catRoll(tier_map));
    var xp_rating = (random_tier * 20) + (Math.random() * 20);
    var xp_rating_float = Number((xp_rating / 100).toFixed(2));

    xp_rating_float = Number((min_value + (xp_rating_float * (1 - min_value))).toFixed(2));

    return xp_rating_float;
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
            var rolled_quality = getRolledCrateQuality();

            var foil_chance = getLootData().global_foil_chance;

            if (procUniqueAttribute(Meteor.userId(), "DAILY_FOIL_BONUS", undefined)) {
                foil_chance *= 2;
            }

            var multi_item_generator = {
                'source': "daily drop",
                'user_id': Meteor.userId(),
                'quality': rolled_quality,
                'count': admin_settings.daily_drop_count,
                'status': "unclaimed",
                'foil_chance': foil_chance,
                'misprint_chance': getLootData().global_misprint_chance,
                'xp_rating_min': 0,
                'condition_min': 0
            }

            generateItems(multi_item_generator);
   
            var now = moment().toISOString();
            Meteor.users.update(Meteor.userId(), {$set: {'profile.last_drop' : now}});

            return rolled_quality;    
        }

        else return undefined;
    },

    'openCrate' : function(size) {
        var approved_sizes = ['small', 'medium', 'large'];
        if (approved_sizes.indexOf(size) == -1)
            return false;

        var quality = 'platinum'; 
        var crate_object = getCrateData(size, quality);

        if (crate_object == undefined)
            return false;

        if (Meteor.userId() && crate_object.cost < Meteor.user().profile.bank_balance) {
            var foil_chance = getLootData().global_foil_chance;

            if (procUniqueAttribute(Meteor.userId(), "CRATE_FOIL_BONUS", undefined)) {
                foil_chance *= 2;
            }

            var multi_item_generator = {
                'source': crate_object.size + " crate",
                'user_id': Meteor.userId(),
                'quality': quality,
                'count': crate_object.count,
                'status': "unclaimed",
                'foil_chance': foil_chance,
                'misprint_chance': getLootData().global_misprint_chance,
                'xp_rating_min': 0,
                'condition_min': 0
            }

            generateItems(multi_item_generator);
            chargeAccount(Meteor.userId(), crate_object.cost);
            Meteor.users.update(Meteor.userId(), {$inc: {'profile.money_spent_on_crates': crate_object.cost}});
        }

        else console.log("insufficient funds");
    },

    'getCrates' : function() {
        var sizes = ['small', 'medium', 'large'];
        var crate_objects = [];
        for (var i=0; i<sizes.length; i++) {
            crate_objects.push(getCrateData(sizes[i], 'platinum'));
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

var getCrateData = function(size, quality) {
    var output_count;

    switch(size) {
        case "small": output_count = 6; break;
        case "medium": output_count = 18; break;
        case "large": output_count = 54; break;
        default: break;
    }

    var cost = lookupCrateCost('platinum', output_count);

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

// getSmartRarityMap = function(player_level, amplifier) {
//     var player_weight = player_level / player_level_max;
//     var rarities = ['common', 'uncommon', 'rare', 'legendary', 'masterpiece'];

//     var rarity_map = {};

//     for (var i=0; i < rarities.length; i++) {
//         var rarity = rarities[i];
//         var rarity_map_range = smart_loot_map[rarity].max_player_level - smart_loot_map[rarity].min_player_level;
//         var weighted_value = 100000 * (smart_loot_map[rarity].min_player_level + (player_weight * rarity_map_range));

//         var max_reduction_coefficient;
//         switch(rarity) {
//             case "common": max_reduction_coefficient = .8; break;
//             case "uncommon": max_reduction_coefficient = .4; break;
//             case "rare": max_reduction_coefficient = .2; break;
//             case "legendary": max_reduction_coefficient = .1; break;
//         }
        
//         weighted_value = weighted_value * (1 - (max_reduction_coefficient * amplifier));
//         rarity_map[rarity] = Math.floor(weighted_value);
//     }

//     return rarity_map;
// }

// calculateMapChances = function(loot_map) {
//     var map_keys = Object.keys(loot_map);
//     var sum_total = 0;
//     for (var i=0; i<map_keys.length; i++) {
//         sum_total += loot_map[map_keys[i]];
//     }

//     var map_chances = {};

//     for (var i=0; i<map_keys.length; i++) {
//         map_chances[map_keys[i]] = loot_map[map_keys[i]] / sum_total;
//     }

//     return map_chances;
// }



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
