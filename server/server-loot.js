CONDITION_CACHE_MAP = undefined;
CRATE_QUALITY_MAP_CACHE = undefined;

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
    if (CONDITION_CACHE_MAP == undefined) {
        var tier_map = {
            0 : 2,
            1 : 3,
            2 : 3,
            3 : 2,
            4 : 1
        };

        CONDITION_CACHE_MAP = getMapCacheFromValueMap(tier_map);
    }

    var random_tier = Number(CONDITION_CACHE_MAP.getRandom());
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

getItemObjectValues = function(item_object) {
    var values_object = {};

    var artwork_object = artworks.findOne({'_id': item_object.artwork_id});

    //TODO move getArtworkValue to ArtworkIF
    values_object.theoretical = Math.floor(getArtworkValue(artwork_object) / getSignatureDropChance(item_object));

    var attribute_coefficient = getAttributeValueCoefficient(item_object.attributes);
    values_object.theoretical = interpolateValues(values_object.theoretical * .8, values_object.theoretical, attribute_coefficient);

    if (item_object.seasonal) {
        values_object.theoretical *= SEASONAL_VALUE_BUFFS[item_object.artwork_data.rarity];
    }

    if (item_object.lottery && item_object.lottery != 0) {
        values_object.theoretical *= (BASE_LOTTERY_VALUE_BUFF + (item_object.lottery * LOTTERY_LEVEL_VALUE_BUFF));
    }

    if (item_object.original) {
        values_object.theoretical *= ORIGINAL_VALUE_BUFF;
    }

    if (item_object.vintage){
        values_object.theoretical *= VINTAGE_VALUE_BUFF;
    }

    var item_level_amplifier = 1 + (item_object.level * ITEM_LEVEL_VALUE_BUFF);
    values_object.theoretical *= item_level_amplifier;

    values_object.theoretical = Math.floor(values_object.theoretical);

    values_object.conditional = getConditionValue(values_object.theoretical, item_object.condition);
    values_object.sell = Math.floor(values_object.conditional * .8);
    values_object.dealer = Math.floor(values_object.conditional * .9);

    values_object.purchase = Math.floor(values_object.conditional * 1.5);
    values_object.actual = Math.floor(values_object.conditional);
    values_object.auction_min = Math.floor(values_object.sell * .8);
    values_object.collector = Math.floor(values_object.conditional * 1.2);

    var all_keys = Object.keys(values_object);
    for (var i=0; i<all_keys.length; i++) {
        var key = all_keys[i];
        if (isNaN(values_object[key])) {
            console.log("invalid value.... " + key + ": " + values_object[key]);
            values_object[key] = 0;
        }
    }

    return values_object;
}

// Returns a value representing attribute totals vs. potential max
var getAttributeValueCoefficient = function(attributes) {
    var attribute_array = attributes.locked.concat(attributes.unlocked.concat(attributes.special));
    var total_rating = 0;

    for (var i=0; i<attribute_array.length; i++) {
        total_rating += attribute_array[i].value;
    }

    if (attribute_array.length > 0) {
        return total_rating / attribute_array.length;
    }
    else {
        return 0;
    }
}

getRolledCrateQuality = function() {
    if (CRATE_QUALITY_MAP_CACHE == undefined) {
        var roll_quality_map = {
            'bronze' : 10000,
            'silver' : 4000,
            'gold' : 1500,
            'platinum' : 100,
            'diamond' : 0
        }

        CRATE_QUALITY_MAP_CACHE = getMapCacheFromValueMap(roll_quality_map);
    }
    
    return CRATE_QUALITY_MAP_CACHE.getRandom();
}

calcSeasonalChance = function(rarity) {
    try {
        var seasonal_ids = getLootData().seasonal_items[rarity];

        if(seasonal_ids == undefined) {
            return 0;
        }

        var probability = 0;
        for (var i=0; i<seasonal_ids.length; i++) {
            probability += getArtworkDropMapCache()[rarity].getProbability(seasonal_ids[i]);
        }

        return probability;
    }
    catch (error) {
        console.log(error);
        return 0;
    }
}

getAverageDropValueFromMap = function(rarity_map, foil_chance, unlocked_chance) {
    var rarity_values = getLootData().rarity_values;
    foil_chance = Math.min(foil_chance, 1);
    unlocked_chance = Math.min(unlocked_chance, 1);

    var total_proportions = 0;
    for (var i=0; i < ARTWORK_RARITIES.length; i++) {
        var rarity = ARTWORK_RARITIES[i];
        total_proportions += rarity_map[rarity];
    }

    var total_average = 0;
    for (var i=0; i < ARTWORK_RARITIES.length; i++) {
        var rarity = ARTWORK_RARITIES[i];
        var average_rarity_value = getAverateItemValueByRarityCache()[rarity];

        if (SEASONAL_RARITIES.indexOf(rarity) != -1) {
            var seasonal_chance = calcSeasonalChance(rarity);
            average_rarity_value = (average_rarity_value * (1 - seasonal_chance)) + (average_rarity_value * seasonal_chance * SEASONAL_VALUE_BUFFS[rarity]);
        }

        total_average += (average_rarity_value * (rarity_map[rarity] / total_proportions));
    }

    total_average = (total_average * (1 - foil_chance)) + (total_average * foil_chance * FOIL_VALUE_BUFF);
    total_average = (total_average * (1 - unlocked_chance)) + (total_average * unlocked_chance * UNLOCKED_VALUE_BUFF);



    return Math.floor(total_average);
}

getAverageDropValue = function(player_level, amplifier) {
    // TODO amplifier
    var loot_map = getRarityMap(player_level);
    return getAverageDropValueFromMap(loot_map, getLootData().global_foil_chance, getLootData().global_unlocked_chance);
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
        try {
            if (Meteor.user() && dailyDropIsEnabled()) {
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
        }
        catch(error) {
            console.log(error)
        }
    },

    'openCrate' : function() {
        try {
            var player_interface = new PlayerIF(Meteor.user());
            var loot_data = getLootData();

            var crate_cost = getBasicCrateCost(player_interface.getPlayerLevel());

            if (player_interface.getId() && crate_cost < player_interface.getBankBalance()) {
                var multi_item_generator = {
                    'source': "standard crate",
                    'count': getLootData().items_per_basic_crate,
                    'status': "unclaimed"
                }

                ITEM_GENERATOR.generateMultiple(multi_item_generator, player_interface);
                player_interface.chargeAccount(crate_cost);
                Meteor.users.update(player_interface.getId(), {$inc: {'profile.money_spent_on_crates': crate_cost}});
            }
        }

        catch(error) {
            console.log(error);
        }
    },

    'getCrate' : function() {
        return {
            'cost': getBasicCrateCost(Meteor.user().profile.level),
            'count': getLootData().items_per_basic_crate    
        }
    }
})

getCrateData = function(size) {
    var crate_object = {
        'cost': 30000000,
        'count': 12    
    }

    return crate_object;
}

getRandomArtworkIFFromRarity = function(rarity) {
    try {
        var random_index = Math.floor(Math.random() * getActiveArtworkCache()[rarity].length);
        return new ArtworkIF(getActiveArtworkCache()[rarity][random_index]);
    }
    catch (error) {
        console.log(error);
    }
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

        alertPlayers({}, '<p>' + message + '</p>', 'fa-exclamation', 'good');
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
                    console.log(error)

                else {
                    var html = '<p>This week there\'s no lottery winner. New Lottery Level: <span class="lottery-text">' + getOneFromCollection("interval_methods.js", metadata, {'lottery_draw': {$ne: null}}).lottery_level + '</span></p>';
                    alertPlayers({}, html, 'fa-exclamation', 'bad');
                }
            });

            getFromCollection("interval_methods.js", items, {'_id': {$in: reward_item_ids}}).forEach(function(item_object) {
                var reward_item_interface = new ItemIF(item_object);
                reward_item_interface.updateItem({$inc: {'lottery': 1}}, true);
            })
        }

        else {
            var html = '<p>This week there\'s no lottery winner. The Lottery Level remains at <span class="lottery-text">10</span>!</p>';
            alertPlayers({}, html, 'fa-exclamation', 'bad');
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
            'status': "claimed"
        };

        ITEM_GENERATOR.generateSingle(item_generator, undefined, function(item_object) {
            metadata.update({'lottery_draw': {$ne: null}}, {$push: {'rewards': item_object._id}});
        });
    }
}

generateArtfunkelAuctions = function(item_count, duration) {
    var multi_item_generator = {
        'source': "generated auction",
        'count': item_count,
        'status': "auctioned"
    }

    var item_ids = ITEM_GENERATOR.generateMultiple(multi_item_generator, undefined, function(item_object) {
        createAuction(item_object._id, item_object.values.auction_min, -1, duration, "public");
    });
}

getAllSeasonalIds = function() {
    var seasonal_ids = [];
    var loot_data = getLootData();

    for (var i=0; i<SEASONAL_RARITIES.length; i++) {
        var rarity = SEASONAL_RARITIES[i];
        var rarity_ids = loot_data.seasonal_items[rarity];
        if (rarity_ids != undefined && rarity_ids.length > 0) {
            seasonal_ids = seasonal_ids.concat(rarity_ids);
        }
    }

    return seasonal_ids;
}