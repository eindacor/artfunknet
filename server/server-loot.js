seasonal_ids = ["xtCiaet3j7XgYquAm"];

bronze_rarity_map = {
    'common': 60,
    'uncommon': 12,
    'rare': 0,
    'legendary': 0,
    'masterpiece': 0
}

silver_rarity_map = {
    'common': 24,
    'uncommon': 38,
    'rare': 2,
    'legendary': 0,
    'masterpiece': 0
}

gold_rarity_map = {
    'common': 400,
    'uncommon': 900,
    'rare': 400,
    'legendary': 1,
    'masterpiece': 0
}

platinum_rarity_map = {
    'common': 100,
    'uncommon': 200,
    'rare': 600,
    'legendary': 10,
    'masterpiece': 1
}

diamond_rarity_map = {
    'common': 0,
    'uncommon': 0,
    'rare': 0,
    'legendary': 1000000,
    'masterpiece': 1
}

rarity_values = {
    'common' : {
        'min' : 5000,
        'max' : 25000
    },

    'uncommon' : {
        'min' : 25000,
        'max' : 65000
    },

    'rare' : {
        'min' : 65000,
        'max' : 225000
    },

    'legendary' : {
        'min' : 225000,
        'max' : 1505000
    },

    'masterpiece' : {
        'min' : 1505000,
        'max' : 21985000
    },
}

rarity_inflation_coefficient = {
    'bronze' : 1.2345,
    'silver' : 1.6049,
    'gold' : 1.975,
    'platinum' : 2.345,
    'diamond' : 50
}

rarity_maps = {
    'bronze' : bronze_rarity_map,
    'silver' : silver_rarity_map,
    'gold' : gold_rarity_map,
    'platinum' : platinum_rarity_map,
    'diamond' : diamond_rarity_map
}

attribute_quantities = {
    'common' : {
        'primary' : 1,
        'secondary' : 0
    },
    'uncommon' : {
        'primary' : 2,
        'secondary' : 0
    },
    'rare' : {
        'primary' : 3,
        'secondary' : 1
    },
    'legendary' : {
        'primary' : 4,
        'secondary' : 2
    },
    'masterpiece' : {
        'primary' : 5,
        'secondary' : 3
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

getItemValue = function(item_id, type) {
    return getItemObjectValue(items.findOne(item_id), type);
}

getItemObjectValue = function(item_object, type) {
    if (item_object) {
        var artwork_object = artworks.findOne({'_id': item_object.artwork_id});

        var min = rarity_values[artwork_object.rarity].min;
        var max = rarity_values[artwork_object.rarity].max;

        var range = max - min;

        var mint_value = Math.floor(min + (artwork_object.value_scale * range));

        var condition_min_coefficient = .5;
        var lowest_possible = mint_value * condition_min_coefficient;
        var condition_factor = lowest_possible + ((mint_value - lowest_possible) * parseFloat(item_object.condition));
        var actual_value = Math.floor(condition_factor);
        var display_value = actual_value * 2;

        if (item_object.foil) {
            actual_value *= 2;
            display_value *= 1.2;
        }

        else if(item_object.seasonal) {
            actual_value *= 5;
            display_value *= 1.5;
        }

        else if(item_object.lottery && item_object.lottery != 0) {
            actual_value *= (10 * item_object.lottery);
            display_value *= 2;
        }

        else if(item_object.original) {
            actual_value *= 7;
            display_value *= 2;
        }

        var sell_value = Math.floor(actual_value * .8);
        var purchase_value = Math.floor(actual_value * 1.5);
        var dealer_offer = Math.floor(actual_value * .9);
        var auction_min = Math.floor(sell_value * .8);
        var collector_offer = Math.floor(actual_value * 1.2);

        if (procUniqueAttribute(Meteor.userId, "DEALER_DISCOUNT", undefined)) {
            dealer_offer = Math.floor(dealer_offer * .75);
        }

        switch(type) {
            case "sell": return sell_value;
            case "purchase": return purchase_value;
            case "actual": return Math.floor(actual_value);
            case "auction_min": return auction_min;
            case "collector" : return collector_offer; 
            case "dealer" : return dealer_offer; 
            case "display" : return display_value;
            default: return undefined;
        }
    }

    else {
        console.log("item_id: " + item_id);
        console.log("item_object: " + item_object);
        return undefined;
    }
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
    var item_object = items.findOne(item_id);

    var roll_count = item_object.roll_count < 0 ? 0 : item_object.roll_count;

    var rarity = item_object.artwork_data.rarity;
    var reroll_coefficient = reroll_coefficients[rarity];
    var average_value = Math.floor((rarity_values[rarity].max + rarity_values[rarity].min) / 2);

    var reroll_cost = (rarity_values[rarity].min * .1) * Math.pow(reroll_coefficient, roll_count);

    if (procUniqueAttribute(Meteor.userId, "REROLL_DISCOUNT", undefined)) {
        reroll_cost = Math.floor(reroll_cost * .75);
    }

    return Math.floor(reroll_cost);
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

    var smart_loot_map = getSmartRarityMap(Meteor.user().profile.level, map_amplifier);

    var total_proportions = 0;
    for (var i=0; i < artwork_rarities.length; i++) {
        var rarity = artwork_rarities[i];
        total_proportions += smart_loot_map[rarity];
    }

    var total_average = 0;
    for (var i=0; i < artwork_rarities.length; i++) {
        var rarity = artwork_rarities[i];
        var average_value = Math.floor((rarity_values[rarity].min + rarity_values[rarity].max) / 2)
        total_average += (average_value * (smart_loot_map[rarity] / total_proportions));
    }

    return Math.floor(total_average * count * rarity_inflation_coefficient[quality]);
}

generateItems = function(user_id, quality, count, status, foil_chance, xp_rating_min, condition_min) {
    if (Meteor.users.findOne(user_id) === undefined)
        return;

    var map_amplifier;

    switch(quality) {
        case 'bronze': map_amplifier = 0; break;
        case 'silver': map_amplifier = .2; break;
        case 'gold': map_amplifier = .4; break;
        case 'platinum': map_amplifier = .8; break;
        default: map_amplifier = 0; break;
    }

    var item_ids = [];

    for (var i=0; i < parseInt(count); i++) {
        var rarity_roll = JepLoot.catRoll(getSmartRarityMap(Meteor.user().profile.level, map_amplifier));
        var possibilities = artworks.find({'rarity': rarity_roll, 'active': true}).fetch();
        var random_index = Math.floor(Math.random() * possibilities.length);
        var rolled_id = possibilities[random_index]._id;

        generateItemFromArtworkID(user_id, rolled_id, undefined, undefined, foil_chance, undefined, 0, false, status, xp_rating_min, condition_min);
    }

    return true;
}

generateItemFromArtworkID = function(user_id, artwork_id, condition, xp_rating, foil_chance, seasonal, lottery, original, status, xp_rating_min, condition_min) {
    var artwork_data = artworks.findOne(artwork_id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}});
    if (artwork_data) {
        var new_item_id = items.insert({
            'artwork_id' : artwork_id,
            'condition' : condition === undefined ? getCondition(condition_min) : condition,
            'attributes' : getAttributes(artwork_data.rarity, artwork_id),
            'owner' : user_id,
            'status' : status,
            'date_created' : new Date(),
            'xp_rating' : xp_rating === undefined ? getXPRating(xp_rating_min) : xp_rating,
            'roll_count' : 0,
            'foil': seasonal_ids.indexOf(artwork_id) == -1 && Math.random() < foil_chance,
            'seasonal': seasonal === undefined ? seasonal_ids.indexOf(artwork_id) != -1 : seasonal,
            'lottery': lottery === undefined ? 0 : lottery,
            'original': original === undefined ? false : original,
            'tags': [],
            'artwork_data': artwork_data
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
        var att_count = attribute_quantities[rarity].primary;
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

            var foil_chance = .01;

            if (procUniqueAttribute(Meteor.userId(), "DAILY_FOIL_BONUS", undefined)) {
                foil_chance = .02;
            }

            generateItems(Meteor.userId(), rolled_quality, admin_settings.daily_drop_count, "unclaimed", foil_chance, 0, 0);
   
            var now = moment().toISOString();
            Meteor.users.update(Meteor.userId(), {$set: {'profile.last_drop' : now}});

            return rolled_quality;    
        }

        else return undefined;
    },

    'openCrate' : function(user_id, quality) {
        var cost = lookupCrateCost(quality, admin_settings.crate_drop_count);
        if (Meteor.userId() && Meteor.userId() == user_id && cost < Meteor.user().profile.bank_balance) {
            var foil_chance = .01;

            if (procUniqueAttribute(Meteor.userId(), "CRATE_FOIL_BONUS", undefined)) {
                foil_chance = .02;
            }

            generateItems(user_id, quality, admin_settings.crate_drop_count, "unclaimed", foil_chance, 0, 0);
            chargeAccount(user_id, cost);
        }

        else console.log("insufficient funds");
    },

    'getGraphData': function() {
        return getGraphData();
    },

    'updateSmartMap': function(revised_smart_map) {
        if (revised_smart_map) {
            smart_map = revised_smart_map;
        }

        return {
            'graph_data': getGraphData(),
            'map_data': smart_map
        }
    },

    'getTestResults': function(level) {
        return testMap(getSmartRarityMap(level, 0));
    }
})

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

smart_map = {"0":{"common":70000,"uncommon":20000,"rare":1000,"legendary":0,"masterpiece":0},"10":{"common":50000,"uncommon":40000,"rare":3000,"legendary":0,"masterpiece":0},"20":{"common":40000,"uncommon":65000,"rare":10000,"legendary":0,"masterpiece":0},"30":{"common":13000,"uncommon":30000,"rare":10000,"legendary":0,"masterpiece":0},"40":{"common":15000,"uncommon":30000,"rare":30000,"legendary":500,"masterpiece":0},"50":{"common":20000,"uncommon":35000,"rare":70000,"legendary":1000,"masterpiece":10}};

var rarities = ['common', 'uncommon', 'rare', 'legendary', 'masterpiece'];

var getSmartRarityMap = function(level, amplifier) {
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
            var value = Math.ceil(map_one[rarity] + (level_ratio * difference));
            generated_map[rarity] = value;
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
            'rarity': rarity
        };

        ids_selected.push(artworks.findOne(selector, {skip: Math.floor(Math.random() * artworks.find(selector).count())})._id);
    }

    return ids_selected;
}

getRandomArtworkIDFromRarity = function(rarity) {
    return artworks.findOne({'rarity': rarity}, {skip: Math.floor(Math.random() * artworks.find({'rarity': rarity}).count())})._id;
}
