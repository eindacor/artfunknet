LOOT_DATA = undefined;

getLootData = function() {
    var loot_data_copy = JSON.parse(JSON.stringify(LOOT_DATA));
    return loot_data_copy;
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

// sumtotal of these values must equal 1
var lowest_possible_value_coefficient = .4;
var condition_coefficient_max = .4;
var attribute_coefficient_max = .2;

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
    var condition_value = item_object.condition === undefined ? mint_value * condition_coefficient_max * .5 : mint_value * condition_coefficient_max * item_object.condition;
    var attribute_value = item_object.attributes === undefined ? mint_value * attribute_coefficient_max * .5 : mint_value * getAttributeValueCoefficient(item_object);

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
    return getAverageDropValueFromMap(smart_loot_map, getLootData().global_foil_chance, getLootData().global_unlocked_chance, 1);
}

//calculates crate costs based on rarity maps and qulity maps
lookupCrateCost = function(count) {
    var average_drop_value = getAverageDropValue(Meteor.user().profile.level, 1);

    return Math.floor(average_drop_value * count * CRATE_UPCHARGE_COEFFICIENT);
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

Meteor.methods({
    'giveDailyDrop' : function() {
        if (Meteor.user() && dailyDropIsEnabled()) {
            var foil_chance = getLootData().global_foil_chance;

            var multi_item_generator = {
                'source': "daily drop",
                'count': admin_settings.daily_drop_count,
                'status': "unclaimed"
            }

            var player_interface = new PlayerIF(Meteor.user());

            ITEM_GENERATOR.generateMultiple(multi_item_generator, player_interface);
   
            var now = getNowISOString();
            Meteor.users.update(player_interface.getId(), {$set: {'profile.last_drop' : now}});

            return true;    
        }

        else return false;
    },

    'openCrate' : function(size) {
        try {
            var player_interface = new PlayerIF(Meteor.user());
            var approved_sizes = ['small', 'medium', 'large'];
            if (approved_sizes.indexOf(size) == -1)
                return false;

            var quality = 'platinum'; 
            var crate_object = getCrateData(size);

            if (crate_object == undefined)
                return false;

            if (player_interface.getId() && crate_object.cost < player_interface.getBankBalance()) {
                var multi_item_generator = {
                    'source': crate_object.size + " crate",
                    'count': crate_object.count,
                    'status': "unclaimed"
                }

                ITEM_GENERATOR.generateMultiple(multi_item_generator, player_interface);
                player_interface.chargeAccount(crate_object.cost);
                Meteor.users.update(player_interface.getId(), {$inc: {'profile.money_spent_on_crates': crate_object.cost}});
            }
        }

        catch(error) {
            console.log(error);
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
            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.smart_map': revised_smart_map}}, function() {
                getLootData() = metadata.findOne({'loot_data': {$ne: null}}).loot_data;
            });

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

getRandomArtworkIFFromRarity = function(rarity) {
    return new ArtworkIF(artworks.findOne({'rarity': rarity, 'active': true}, {skip: Math.floor(Math.random() * artworks.find({'rarity': rarity}).count())}));
}

drawLottery = function(force_draw) {
    var lottery_draw_time = force_draw ? getNowISOString() : getOneFromCollection("interval_methods.js", metadata, {'lottery_draw': {$ne: null}}).lottery_draw;
   
    if (getNowISOString() < lottery_draw_time)
        return;

    var lottery_level = getOneFromCollection("interval_methods.js", metadata, {'lottery_draw': {$ne: null}}).lottery_level;

    var reward_item_ids = metadata.findOne({'lottery_draw': {$ne: null}}).rewards;
       
    if (Math.random() < .2 || lottery_level == 10) {
        var user_map = {};
        var tickets_average = 0;
        var player_count = 0;
        var user_query_object = {
            'profile.user_type': {$nin: ["admin", "bot"]}, 
            'profile.lottery_tickets': {$gt: 0},
            'profile.settings.lottery_eligible': true,
            'profile.active': true
        }
        
        getFromCollection("interval_methods.js", Meteor.users, user_query_object).forEach(function(user_object) {
            var player_interface = new PlayerIF(user_object);
            if (!player_interface.isRecentlyActive()) {
                return;
            }

            user_map[user_object._id] = user_object.profile.lottery_tickets;
            tickets_average = ((tickets_average * player_count) + user_object.profile.lottery_tickets) / (player_count + 1);
            player_count++;
        });
       
        var min_players_required = getOneFromCollection("interval_methods.js", metadata, {'lottery_draw': {$ne: null}}).lottery_draw.min_players_required;
        if (player_count < min_players_required) {
            for (var i=0; i<(min_players_required - player_count); i++) {
                var bot_string = new Meteor.Collection.ObjectID()._str;
                user_map[bot_string] = (tickets_average < 2 ? 1 : Math.floor(tickets_average / 2));
            }
        }

        var winner_names = [];
        for (var i=0; i<reward_item_ids.length; i++) {
            var winning_id = JepLoot.catRoll(user_map);
            delete user_map[winning_id];
       
            var bot_won = getOneFromCollection("interval_methods.js", Meteor.users, winning_id) == undefined;
           
            if (bot_won) {
                return;
            }

            winner_names.push(new PlayerIF(winning_id).getUserObject().profile.screen_name);
            metadata.update({'lottery_draw': {$ne: null}}, {
                $push: {
                    'previous_winners': {
                        'user_id': winning_id, 
                        'time': getNowISOString(), 
                        'item_id': reward_item_ids[i]
                    }
                }
            });

            var winning_item_interface = new ItemIF(reward_item_ids[i]);
            winning_item_interface.updateItem({$set: {'owner': winning_id, 'status': "claimed", 'date_received': getNowISOString()}}, true);
        }

        var message = winner_names.length > 1 ? "This week's lottery winners are: " : "This week's lottery winner is: ";
        for (var i=0; i<winner_names.length; i++) {
            if (i==0) {
                message += winner_names[i];
            }
            else {
                message += (", " + winner_names[i]);
            }
        }

        alertPlayers({}, message, 'fa-exclamation', 'good');
        getFromCollection("interval_methods.js", Meteor.users, user_query_object).forEach(function(user_object) {
            var player_interface = new PlayerIF(user_object);
            if (!player_interface.isRecentlyActive()) {
                return;
            }
            
            var vintage_level = user_object.profile.vintage_count;
            var default_lottery_tickets = 1 + vintage_level;
            Meteor.users.update(user_object._id, {$set: {'profile.lottery_tickets': default_lottery_tickets}});
        });


        generateNewLotteryItems();
        //transfer lottery item

        metadata.update({'lottery_draw': {$ne: null}}, {$set: {'lottery_level': 1}});      
    }

    else {
        if (lottery_level < 10) {
            metadata.update({'lottery_draw': {$ne: null}}, {$inc: {'lottery_level': 1}}, function(error) {
                if (error)
                    console.log(error.message)

                else {
                    var message = "This week there's no lottery winner. New Lottery Level: " + getOneFromCollection("interval_methods.js", metadata, {'lottery_draw': {$ne: null}}).lottery_level;
                    alertPlayers({}, message, 'fa-exclamation', 'bad');
                }
            });

            getFromCollection("interval_methods.js", items, {'_id': {$in: reward_item_ids}}).forEach(function(item_object) {
                var reward_item_interface = new ItemIF(item_object);
                reward_item_interface.updateItem({$inc: {'lottery': 1}}, true);
            })
        }

        else {
            var message = "This week there's no lottery winner. The Lottery Level remains at 10!";
            alertPlayers({}, message, 'fa-exclamation', 'bad');
        }
    }
   
    var next_draw = moment(lottery_draw_time).add(1, "weeks")._d.toISOString();
    metadata.update({'lottery_draw': {$ne: null}}, {$set: {'lottery_draw': next_draw}});
}

generateNewLotteryItems = function() {
    metadata.update({'lottery_draw': {$ne: null}}, {$set: {'rewards': []}});

    for (var i=0; i<LOTTERY_ITEM_COUNT; i++) {
        var artwork_interface = Math.random() < .0001 ? getRandomArtworkIFFromRarity("masterpiece") : getRandomArtworkIFFromRarity("legendary");

        var item_generator = {
            'source': "lottery",
            'user_id': BOT_USER_NAME,
            'artwork_interface': artwork_interface,
            'lottery': 1,
            'original': false,
            'status': "claimed", 
            'tutorial': false,
        };

        ITEM_GENERATOR.generateSingle(item_generator, undefined, function(item_object) {
            metadata.update({'lottery_draw': {$ne: null}}, {$push: {'rewards': item_object._id}});
        });
    }
}
