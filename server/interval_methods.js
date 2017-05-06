getNowISOString = function() {
    return moment()._d.toISOString();
}

Meteor.setInterval((function() {
    var now = getNowISOString();
    // items.find({'status' : 'displayed', 'display_details.end': {$lt : now}}).forEach(function(db_object) {
    //     concludeDisplay(db_object._id);
    // });

    auctions.find({'expiration': {$lt : now}}).forEach(function(db_object) {
        concludeAuction(db_object._id);
    });

    //removed_items.remove({'removed': {$lt: moment().subtract(1, 'hours')}});

    var creation_cutoff = moment().add(-10, 'minutes')._d.toISOString();
    items.find({'status' : {$in: ['unclaimed', 'for_sale']}, 'date_received' : {$lt : creation_cutoff}}).forEach(function(item_object) {
        removeItem(item_object._id, "failed to claim (" + item_object.status + ")", undefined);
    })

    var auction_win_cutoff = moment().add(-12, 'hours')._d.toISOString();
    items.find({'status': 'won', 'date_received' : {$lt : auction_win_cutoff}, 'lottery': 0}).forEach(function(item_object) {
        removeItem(item_object._id, "failed to claim (won)", undefined);
    })

    // create auction for lottery items won instead of removing
    items.find({'status': 'won', 'date_received' : {$lt : auction_win_cutoff}, 'lottery': {$ne: 0}}).forEach(function(item_object) {
        updateItem(item_object._id, {$set: {'owner': "Artfunkel, Inc.", 'status': "auctioned", 'tags': []}}, function() {
            createAuction(item_object._id, getItemObjectValueByType(items.findOne(item_object._id), "actual", "Artfunkel, Inc.") * 10, -1, 120, "public");
        });
    });
    
    alerts.remove({'time': {$lt: moment().add(-48, "hours")._d.toISOString()}});

}), ONE_SECOND * 10);

// TODO refactor auctions so this isn't necessary
// clear invalid watching lists
Meteor.setInterval((function() {
    Meteor.users.find().forEach(function(user_object) {
        if (auctions.findOne({'_id': {$in: user_object.profile.auction_data.watching}}) == undefined) {
            Meteor.users.update({'_id': user_object._id}, {$set: {'profile.auction_data.watching': []}});
        }

        if (auctions.findOne({'_id': {$in: user_object.profile.auction_data.winning}}) == undefined) {
            Meteor.users.update({'_id': user_object._id}, {$set: {'profile.auction_data.winning': []}});
        }
    });
}), 60000);

var check_ticket_frequency = 300000; //once every 5 minutes
Meteor.setInterval((function() {
    gallery_tickets.remove({'expiration': {$lt : getNowISOString()}});
}), check_ticket_frequency);

var npc_spawn_frequency = 600000; // 10 minutes
Meteor.setInterval((function() {
    galleries.find().forEach(function(db_object) {
        npcs.remove({'owner_id': db_object.owner_id});

        if (db_object.gallery_rarity_npc_coefficient <= 0)
            return;

        var attribute_values = db_object.attribute_values;
        var attribute_ids = Object.keys(attribute_values);
        var rarity_npc_coefficient = db_object.gallery_rarity_npc_coefficient;
        var owner_object = Meteor.users.findOne(db_object.owner_id);

        for (var i=0; i < attribute_ids.length; i++) {
            var attribute_object = attributes.findOne(attribute_ids[i]);
            if (attribute_object == undefined || attribute_object.type == "secondary")
                continue;
            
            var proc_chance = Math.pow((attribute_values[attribute_ids[i]] * rarity_npc_coefficient), 2);

            if (attribute_object.npc_name == "Art Donor" && 
                owner_object.profile.market_expert.expiration < getNowISOString() && 
                procUniqueAttribute(db_object.owner_id, "DONOR_SPAWN_BOOST", undefined) 
                ){
                    proc_chance += .2;
            }

            if (Math.random() < proc_chance) {
                var npc_quality = getNPCQuality(Meteor.users.findOne(db_object.owner_id).profile.level);
                createNPC(db_object, attribute_ids[i], npc_spawn_frequency, npc_quality);

                if (attribute_object.npc_name == "Designer" && Math.random() < .2 && procUniqueAttribute(db_object.owner_id, "DESIGNER_PAIRS", undefined))
                    createNPC(db_object, attribute_ids[i], npc_spawn_frequency, "bronze");
                    
                if ((npc_quality == "platinum") && procUniqueAttribute(db_object.owner_id, "COLLECTOR_DONOR_PAIR", undefined)) {
                    if (attribute_object.npc_name == "Art Collector")
                        createNPC(db_object, attributes.findOne({'npc_name': "Art Donor"})._id, npc_spawn_frequency, "bronze")
                        
                    else if (attribute_object.npc_name == "Art Donor")
                        createNPC(db_object, attributes.findOne({'npc_name': "Art Collector"})._id, npc_spawn_frequency, "bronze")
                }
            }
        }
    });

    npc_data.remove({'timestamp': {$lt: moment().add((npc_spawn_frequency * -1), "milliseconds")._d.toISOString()}});

}), npc_spawn_frequency);

Meteor.setInterval((function() {
    var finish_xp_max_percentage = .02;
    var all_users = Meteor.users.find();
    all_users.forEach(function(db_object) {       
        var active_floor_finish_id = db_object.profile.gallery_finishes.active.floor_finish;
        var floor_xp_rating = db_object.profile.gallery_finishes.owned.floor_finishes[active_floor_finish_id].xp_rating;
        var floor_percentage = finish_xp_max_percentage * floor_xp_rating;

        var active_wall_finish_id = db_object.profile.gallery_finishes.active.wall_finish;
        var wall_xp_rating = db_object.profile.gallery_finishes.owned.wall_finishes[active_wall_finish_id].xp_rating;
        var wall_percentage = finish_xp_max_percentage * wall_xp_rating;

        addXPChunkPercentage("finishes", db_object._id, wall_percentage + floor_percentage);
    });

}), finishes_check_frequency);

// some vars defined in lib/time_constants.js
Meteor.setInterval((function() {
    if (metadata.findOne({'display_earnings_tick': {$ne: null}}) != undefined) {
        var display_earning_time = metadata.findOne({'display_earnings_tick': {$ne: null}}).display_earnings_tick;

        if (getNowISOString() > display_earning_time) {
            if (DEBUG) {
                console.log("awarding display earnings: " + getNowISOString());
            }

            Meteor.users.find().forEach(function(user_object) {
                var total_earnings = 0;
                var total_xp = 0;
                items.find({'status': "displayed", 'owner': user_object._id}).forEach(function(item_object) {
                    var player_item_interface = new PlayerItemIF(item_object.owner, item_object._id);
                    var money_per_hour = player_item_interface.getDisplayValuePerHour(display_earning_time);
                    total_earnings += money_per_hour;
                    total_xp += player_item_interface.getXPPerHour(display_earning_time);

                    var display_level = player_item_interface.getDisplayLevel(display_earning_time);

                    var player_interface = new PlayerIF(user_object._id);
                    if (!player_interface.isRecentlyActive()) {
                        player_item_interface.setDisplayStatus(false);
                    }

                    if (Math.random() < .5) {
                        var new_condition = item_object.condition < .5 ? item_object.condition : item_object.condition - .01;
                        updateItem(item_object._id, {$set: {'condition' : new_condition}});
                    }
                });

                if (total_earnings > 0)
                    addFunds("display earnings", user_object._id, Math.floor(total_earnings));

                if (total_xp > 0)
                    addXP(user_object._id, total_xp);
            })
     
            var next_tick = moment(display_earning_time).add(display_earning_frequency, "milliseconds")._d.toISOString();
            metadata.update({'display_earnings_tick': {$ne: null}}, {$set: {'display_earnings_tick': next_tick}});
        }
    }

    else metadata.insert({'display_earnings_tick': moment()._d.toISOString()});
}), display_earning_check_frequency);

Meteor.setInterval((function() {
    if (metadata.findOne({'permanent_xp_tick': {$ne: null}}) != undefined) {
        var xp_earning_time = metadata.findOne({'permanent_xp_tick': {$ne: null}}).permanent_xp_tick;

        if (getNowISOString() > xp_earning_time) {
            if (DEBUG) {
                console.log("awarding xp: " + getNowISOString());
            }

            Meteor.users.find().forEach(function(user_object) {
                var toal_xp = 0;
                items.find({'status': "permanent", 'owner': user_object._id}).forEach(function(item_object) {
                    var player_item_interface = new PlayerItemIF(item_object.owner, item_object._id);
                    var xp_per_hour = player_item_interface.getXPPerHour(xp_earning_time);
                    toal_xp += xp_per_hour;

                    if (item_object.xp_rating < 1)
                        updateItem(item_object._id, {$set: {'xp_rating': Math.min(item_object.xp_rating + .02, 1)}});
                });

                if (toal_xp > 0)
                    addXP(user_object._id, toal_xp);        
            })
            
            var next_tick = moment(xp_earning_time).add(xp_earning_frequency, "milliseconds")._d.toISOString();
            metadata.update({'permanent_xp_tick': {$ne: null}}, {$set: {'permanent_xp_tick': next_tick}});
        }
    }

    else metadata.insert({'permanent_xp_tick': moment()._d.toISOString()});
}), permanent_xp_check_frequency);



var item_count_frequency = 30000; //30 seconds
Meteor.setInterval((function() {
    Meteor.users.find().forEach(function(user_object) {
        var items_owned = items.find({'owner': user_object._id, 'status': {$in: ['claimed', 'displayed', 'permanent']}}).count();
        Meteor.users.update({'_id': user_object._id}, {$set: {'profile.items_owned': items_owned}});
    });
}), item_count_frequency);

var lottery_check_frequency = 60000; //once per minute
Meteor.setInterval((function() {
    var lottery_draw_time = metadata.findOne({'lottery_draw': {$ne: null}}).lottery_draw;
   
    if (getNowISOString() < lottery_draw_time)
        return;

    var lottery_level = metadata.findOne({'lottery_draw': {$ne: null}}).lottery_level;
       
    if (Math.random() < .2 || lottery_level == 10) {
        var user_map = {};
        var tickets_average = 0;
        var player_count = 0;
        Meteor.users.find({'profile.user_type': {$ne: "admin"}, 'profile.lottery_tickets': {$gt: 0}}).forEach(function(user_object) {
            user_map[user_object._id] = user_object.profile.lottery_tickets;
            tickets_average = ((tickets_average * player_count) + user_object.profile.lottery_tickets) / (player_count + 1);
            player_count++;
        });
       
        var min_players_required = metadata.findOne({'lottery_draw': {$ne: null}}).lottery_draw.min_players_required;
        if (player_count < min_players_required) {
            for (var i=0; i<(min_players_required - player_count); i++) {
                var bot_string = new Meteor.Collection.ObjectID()._str;
                user_map[bot_string] = (tickets_average < 2 ? 1 : Math.floor(tickets_average / 2));
            }
        }

        var winning_id = JepLoot.catRoll(user_map);
       
        var bot_won = Meteor.users.findOne(winning_id) == undefined;
        var _id = new Meteor.Collection.ObjectID()._str;
       
        if (bot_won) {
            winning_id = "Artfunkel, Inc.";
        }

        else {
            metadata.update({'lottery_draw': {$ne: null}}, {
                $push: {
                    'previous_winners': {
                        'user_id': winning_id, 
                        'time': getNowISOString(), 
                        'item_id': _id
                    }
                }
            });
        }

        var artwork_id = Math.random() < .0001 ? getRandomArtworkIDFromRarity("masterpiece") : getRandomArtworkIDFromRarity("legendary");

        var loot_data = getLootData();

        var item_generator = {
            '_id': _id,
            'source': "lottery",
            'user_id': winning_id,
            'artwork_id': artwork_id,
            'condition': undefined,
            'xp_rating': undefined,
            'foil_chance': loot_data.global_foil_chance,
            'unlocked_chance': loot_data.global_unlocked_chance,
            'misprint_chance': loot_data.global_misprint_chance,
            'seasonal': false,
            'lottery': lottery_level,
            'original': false,
            'status': "won",
            'xp_rating_min': 0,
            'condition_min': 0
        };

        generateItemFromArtworkID(item_generator, function() {
            if (winning_id == "Artfunkel, Inc.") {
                updateItem(_id, {$set: {'status': "auctioned", 'tags': []}}, function() {
                    createAuction(_id, getItemObjectValueByType(items.findOne(_id), "actual", "Artfunkel, Inc.") * 10, -1, 120, "public");
                });
            }
        });
        metadata.update({'lottery_draw': {$ne: null}}, {$set: {'lottery_level': 1}});
       
        var winning_name = bot_won ? "Artfunkel, Inc." : Meteor.users.findOne(winning_id).profile.screen_name;

        var message = "This week's lottery winner is " + winning_name + ". Congratulations!!!";

        alertPlayers({}, message, 'fa-exclamation', 'good');
        Meteor.users.find().forEach(function(user_object) {
            var vintage_level = user_object.profile.vintage_count;
            var default_lottery_tickets = 1 + vintage_level;
            Meteor.users.update(user_object._id, {$set: {'profile.lottery_tickets': default_lottery_tickets}});
        });
    }

    else {
        if (lottery_level < 10) {
            metadata.update({'lottery_draw': {$ne: null}}, {$inc: {'lottery_level': 1}}, function(error) {
                if (error)
                    console.log(error.message)

                else {
                    var message = "This week there's no lottery winner. New Lottery Level: " + metadata.findOne({'lottery_draw': {$ne: null}}).lottery_level;
                    alertPlayers({}, message, 'fa-exclamation', 'bad');
                }
            });
        }

        else {
            var message = "This week there's no lottery winner. The Lottery Level remains at 10!";
            alertPlayers({}, message, 'fa-exclamation', 'bad');
        }
    }
   
    var next_draw = moment(lottery_draw_time).add(1, "weeks")._d.toISOString();
    metadata.update({'lottery_draw': {$ne: null}}, {$set: {'lottery_draw': next_draw}});

}), lottery_check_frequency);

var seasonal_rotation_check = 60000;
Meteor.setInterval((function() {
    var next_rotation = metadata.findOne({'loot_data': {$ne: null}}).loot_data.seasonal_rotation;
    if (next_rotation < getNowISOString()) {
        var random_legendary = getRandomArtworkIDFromRarity("legendary");
        var random_masterpiece = getRandomArtworkIDFromRarity("masterpiece");

        metadata.update({'loot_data': {$ne: null}}, {$set: {
            'loot_data.seasonal_items': [random_legendary, random_masterpiece], 
            'loot_data.seasonal_rotation': moment(next_rotation).add(1, 'months')._d.toISOString() 
        }}, function() {
            //TODO add alert for new seasonal items
        });
    }
    
}), seasonal_rotation_check);

var clear_npcs_met_check = 60000;
Meteor.setInterval((function() {
    var next_clear = metadata.findOne({'npc_clear_time': {$ne: null}}).npc_clear_time;
    if (next_clear < getNowISOString()) {
        var npcs_met_object = {
            'bronze': 0,
            'silver': 0,
            'gold': 0,
            'platinum': 0
        };
        Meteor.users.update({}, {$set: {'profile.npcs_met': npcs_met_object}}, {multi: true});
        metadata.update({'npc_clear_time': {$ne: null}}, {$set: {'npc_clear_time': moment(next_clear).add(1, 'days')._d.toISOString()}});
        metadata.remove({'npc_limit_hits': {$ne: null}});
    }
}), clear_npcs_met_check);

var notification_clear_frequency = 10000;
Meteor.setInterval((function() {
    var now = getNowISOString();
    Meteor.users.update({}, {
        $pull: {
            'profile.notifications.procs': {'expiration': {$lt: now}},
            'profile.notifications.xp': {'expiration': {$lt: now}},
            'profile.notifications.money': {'expiration': {$lt: now}},
            'profile.notifications.loot': {'expiration': {$lt: now}},
            'profile.notifications.store': {'expiration': {$lt: now}}
        },
    }, {multi: true});
}), notification_clear_frequency);
