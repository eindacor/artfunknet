getNowISOString = function() {
    return moment()._d.toISOString();
}

Meteor.setInterval((function() {
    var now = getNowISOString();

    getFromCollection("interval_methods.js conclude auctions", auctions, {'expiration': {$lt : now}}).forEach(function(db_object) {
        concludeAuction(db_object._id);
    });

    var creation_cutoff = moment().add(-10, 'minutes')._d.toISOString();
    getFromCollection("interval_methods.js remove unclaimed", items, {'status' : {$in: ['unclaimed', 'for_sale']}, 'date_received' : {$lt : creation_cutoff}}).forEach(function(item_object) {
        removeItem(item_object._id, "failed to claim (" + item_object.status + ")", undefined);
    })

    var auction_win_cutoff = moment().add(-12, 'hours')._d.toISOString();
    getFromCollection("interval_methods.js remove unclaimed won", items, {'status': 'won', 'date_received' : {$lt : auction_win_cutoff}, 'lottery': 0}).forEach(function(item_object) {
        removeItem(item_object._id, "failed to claim (won)", undefined);
    })

    // create auction for lottery items won instead of removing
    getFromCollection("interval_methods.js reclaim lottery items", items, {'status': 'won', 'date_received' : {$lt : auction_win_cutoff}, 'lottery': {$ne: 0}}).forEach(function(item_object) {
        var item_interface = new ItemIF(item_object);
        item_interface.updateItem({$set: {'owner': BOT_USER_NAME, 'status': "auctioned", 'tags': []}}, true, function() {
            createAuction(item_object._id, getItemObjectValueByType(getOneFromCollection("interval_methods.js", items, item_object._id), "actual", BOT_USER_NAME), -1, 1440, "public");
        });
    });
    
    alerts.remove({'time': {$lt: moment().add(-48, "hours")._d.toISOString()}});

}), ONE_SECOND * 10);

var check_ticket_frequency = ONE_MINUTE * 5;
Meteor.setInterval((function() {
    gallery_tickets.remove({'expiration': {$lt : getNowISOString()}});
}), check_ticket_frequency);

var check_marketing_manager_frequency = ONE_SECOND * 30;
Meteor.setInterval((function() {
    getFromCollection("interval_methods.js", Meteor.users, {'profile.marketing_manager_spawn_boost_expiration': {$lt: getNowISOString()}}).forEach(function(user_object) {
        var player_interface = new PlayerIF(user_object);
        Meteor.users.update(user_object._id, {$unset: {'profile.marketing_manager_spawn_boost_expiration': "", 'profile.marketing_manager_spawn_boost_coefficient': ""}});
        player_interface.updateGalleryDetails();
    })
}), check_marketing_manager_frequency);

Meteor.setInterval((function() {
    var admin_ids = ['Artfunkel, Inc.'];
    Meteor.users.find({'profile.user_type': "admin"}).forEach(function(user_object) {
        admin_ids.push(user_object._id);
    });

    if (DEBUG)
        admin_ids = [];

    var match_object = {
        'status': "archived",
        'displaced': {$ne: true},
        'owner': {$nin: admin_ids}
    };

    var aggregated_values = items.aggregate([
        { $match: match_object}, 
        {$group: {
            _id: {owner: "$owner"},
            total_value: { $sum: "$values.actual" }
        }},
        {$sort: {
            total_value: -1
        }}
    ]);

    var value_objects = [];
    for (var i=0; i<aggregated_values.length; i++) {
        value_objects.push({
            'owner': aggregated_values[i]._id.owner,
            'value': aggregated_values[i].total_value
        })
    }

    var aggregated_counts = items.aggregate([
        { $match: match_object}, 
        {$group: {
            _id: {owner: "$owner"},
            count: { $sum: 1 }
        }},
        {$sort: {
            count: -1
        }}
    ]);

    var count_objects = [];
    for (var i=0; i<aggregated_counts.length; i++) {
        count_objects.push({
            'owner': aggregated_counts[i]._id.owner,
            'count': aggregated_counts[i].count
        })
    }

    var archive_data = {
        'value_data': value_objects,
        'count_data': count_objects
    }

    if (metadata.findOne({'archive_data': {$ne: null}}) == undefined) {
        metadata.insert({
            'archive_data': archive_data
        })
    }

    else metadata.update({'archive_data': {$ne: null}}, {$set: {'archive_data': archive_data}});

}), DEBUG ? ONE_SECOND * 10 : ONE_MINUTE);

Meteor.setInterval((function() {
    var cutoff_duration = DEBUG ? ONE_SECOND * 20 : ONE_HOUR;
    var displaced_cutoff = moment().add(cutoff_duration * -1, "milliseconds")._d.toISOString();
    items.remove({'status': "archived", 'displaced': true, 'time_archived': {$lt: displaced_cutoff}})
}), DEBUG ? ONE_SECOND * 10 : ONE_MINUTE)

var marketing_boost = .15;
var base_proc_max = 1 - marketing_boost;
Meteor.setInterval((function() {
    getFromCollection("interval_methods.js", galleries, {}).forEach(function(gallery_object) {
        npcs.remove({'owner_id': gallery_object.owner_id});

        if (gallery_object.gallery_rarity_npc_coefficient <= 0)
            return;

        var attribute_values = gallery_object.attribute_values;
        var attribute_ids = Object.keys(attribute_values);
        var rarity_npc_coefficient = gallery_object.gallery_rarity_npc_coefficient;
        var owner_object = getOneFromCollection("interval_methods.js", Meteor.users, gallery_object.owner_id);

        for (var i=0; i < attribute_ids.length; i++) {
            var proc_chance = gallery_object.procs[attribute_ids[i]];

            if (Math.random() < proc_chance) {
                var attribute_object = getOneFromCollection("interval_methods.js", attributes, attribute_ids[i]);
                var npc_quality;

                if (attribute_object.npc_name == "Art Collector" && procUniqueAttribute(gallery_object.owner_id, "COLLECTOR_MAX_QUALITY"), undefined) {
                    if (owner_object.profile.npcs_met.platinum < npc_max_map.platinum)
                        npc_quality = "platinum";

                    else if (owner_object.profile.npcs_met.gold < npc_max_map.gold) 
                        npc_quality = "gold";

                    else if (owner_object.profile.npcs_met.siler < npc_max_map.silver) 
                        npc_quality = "silver";

                    else if (owner_object.profile.npcs_met.bronze < npc_max_map.bronze) 
                        npc_quality = "bronze";
                }

                var npc_quality = getNPCQuality(getOneFromCollection("interval_methods.js", Meteor.users, gallery_object.owner_id).profile.level);
                createNPC(gallery_object, attribute_ids[i], NPC_SPAWN_FREQUENCY, npc_quality);

                if ((npc_quality == "platinum") && procUniqueAttribute(gallery_object.owner_id, "COLLECTOR_DONOR_PAIR", undefined)) {
                    if (attribute_object.npc_name == "Art Collector")
                        createNPC(gallery_object, getOneFromCollection("interval_methods.js", attributes, {'npc_name': "Art Donor"})._id, NPC_SPAWN_FREQUENCY, "bronze")
                        
                    else if (attribute_object.npc_name == "Art Donor")
                        createNPC(gallery_object, getOneFromCollection("interval_methods.js", attributes, {'npc_name': "Art Collector"})._id, NPC_SPAWN_FREQUENCY, "bronze")
                }
            }
        }
    });

    npc_data.remove({'timestamp': {$lt: moment().add((NPC_SPAWN_FREQUENCY * -1), "milliseconds")._d.toISOString()}});

}), NPC_SPAWN_FREQUENCY);

// TODO consolidate xp, display, repairing ticks if possible
// some vars defined in lib/time_constants.js
Meteor.setInterval((function() {
    var tick_object = getOneFromCollection("interval_methods.js", metadata, {'display_earnings_tick': {$ne: null}});
    if (tick_object != undefined) {
        var display_earning_time = getOneFromCollection("interval_methods.js", metadata, {'display_earnings_tick': {$ne: null}}).display_earnings_tick;

        if (getNowISOString() > display_earning_time) {
            if (DEBUG) {
                console.log("awarding display earnings: " + getNowISOString());
            }

            getFromCollection("interval_methods.js", Meteor.users, {}).forEach(function(user_object) {
                var player_interface = new PlayerIF(user_object);
                var total_earnings = 0;
                var total_xp = 0;
                var all_displayed = getFromCollection("interval_methods.js", items, {'status': "displayed", 'owner': player_interface.getId()}).fetch();

                var update_gallery = false;

                for (var i=0; i<all_displayed.length; i++) {
                    var item_object = all_displayed[i];
                    var item_interface = new ItemIF(item_object);
                    var player_item_interface = new PlayerItemIF(player_interface, item_interface);
                    var money_per_hour = player_item_interface.getDisplayValuePerHour(display_earning_time);
                    total_earnings += money_per_hour;
                    total_xp += player_item_interface.getXPPerHour(display_earning_time, "displayed");

                    var display_level = player_item_interface.getDisplayLevel(display_earning_time);
        
                    if (!player_interface.isRecentlyActive()) {
                        player_item_interface.setDisplayStatus(false);
                    }

                    if (Math.random() < .2) {
                        var new_condition = item_object.condition < .5 ? item_object.condition : item_object.condition - .01;
                        item_interface.updateItem({$set: {'condition' : new_condition}}, true);
                        update_gallery = true;
                    }
                };

                if (total_earnings > 0) {
                    player_interface.addFunds("display earnings", Math.floor(total_earnings));
                }

                if (total_xp > 0) {
                    player_interface.addXP(total_xp);
                }

                if (update_gallery) {
                    player_interface.updateGalleryDetails();
                }
            })
     
            var next_tick = moment().add(display_earning_frequency, "milliseconds")._d.toISOString();
            metadata.update({'display_earnings_tick': {$ne: null}}, {$set: {'display_earnings_tick': next_tick}});
        }
    }

    else metadata.insert({'display_earnings_tick': moment()._d.toISOString()});
}), display_earning_check_frequency);

Meteor.setInterval((function() {
    var tick_object = getOneFromCollection("interval_methods.js", metadata, {'permanent_xp_tick': {$ne: null}});
    if (tick_object != undefined) {
        var xp_earning_time = tick_object.permanent_xp_tick;

        if (getNowISOString() > xp_earning_time) {
            if (DEBUG) {
                console.log("awarding xp: " + getNowISOString());
            }

            getFromCollection("interval_methods.js", Meteor.users, {}).forEach(function(user_object) {
                var total_xp = 0;
                var player_interface = new PlayerIF(user_object);
                getFromCollection("interval_methods.js", items, {'status': "permanent", 'owner': user_object._id}).forEach(function(item_object) {
                    var player_item_interface = new PlayerItemIF(player_interface, new ItemIF(item_object));
                    var xp_per_hour = player_item_interface.getXPPerHour(xp_earning_time, "permanent");
                    total_xp += xp_per_hour;
                });

                if (total_xp > 0) {
                    player_interface.addXP(total_xp);      
                }  
            })
            
            var next_tick = moment().add(xp_earning_frequency, "milliseconds")._d.toISOString();
            metadata.update({'permanent_xp_tick': {$ne: null}}, {$set: {'permanent_xp_tick': next_tick}});
        }
    }

    else metadata.insert({'permanent_xp_tick': moment()._d.toISOString()});
}), permanent_xp_check_frequency);

Meteor.setInterval((function() {
    var tick_object = getOneFromCollection("interval_methods.js", metadata, {'repairing_tick': {$ne: null}});
    if (tick_object != undefined) {
        var repairing_tick_time = getOneFromCollection("interval_methods.js", metadata, {'repairing_tick': {$ne: null}}).repairing_tick;

        if (getNowISOString() > repairing_tick_time) {
            if (DEBUG) {
                console.log("repairing items: " + getNowISOString());
            }

            getFromCollection("interval_methods.js", Meteor.users, {}).forEach(function(user_object) {
                var player_interface = new PlayerIF(user_object);
                var repair_value_boost = procUniqueAttribute(user_object._id, "ITEM_LEVEL_REPAIR_BOOST", undefined) ? true : false;       

                getFromCollection("interval_methods.js", items, {'status': "repairing", 'owner': user_object._id}).forEach(function(item_object) {
                    var repair_value = REPAIRING_IMPROVEMENT_VALUE;
                    if (repair_value_boost) {
                        repair_value += (item_object.level * .01);
                    }
                    var player_item_interface = new PlayerItemIF(player_interface, new ItemIF(item_object));
                    player_item_interface.repairItem(repair_value);
                });
            })
            
            var next_tick = moment().add(REPAIRING_TICK_FREQUENCY, "milliseconds")._d.toISOString();
            metadata.update({'repairing_tick': {$ne: null}}, {$set: {'repairing_tick': next_tick}});
        }
    }

    else metadata.insert({'repairing_tick': moment()._d.toISOString()});
}), REPAIRING_CHECK_FREQUENCY);

drawLottery = function(force_draw) {
    var lottery_draw_time = force_draw ? getNowISOString() : getOneFromCollection("interval_methods.js", metadata, {'lottery_draw': {$ne: null}}).lottery_draw;
   
    if (getNowISOString() < lottery_draw_time)
        return;

    var lottery_level = getOneFromCollection("interval_methods.js", metadata, {'lottery_draw': {$ne: null}}).lottery_level;
       
    if (Math.random() < .2 || lottery_level == 10) {
        var user_map = {};
        var tickets_average = 0;
        var player_count = 0;
        var user_query_object = {
            'profile.user_type': {$ne: "admin"}, 
            'profile.lottery_tickets': {$gt: 0},
            'profile.settings.lottery_eligible': true,
            'profile.active': true
        }
        
        getFromCollection("interval_methods.js", Meteor.users, user_query_object).forEach(function(user_object) {
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

        var winning_id = JepLoot.catRoll(user_map);
       
        var bot_won = getOneFromCollection("interval_methods.js", Meteor.users, winning_id) == undefined;
        var _id = new Meteor.Collection.ObjectID()._str;
       
        if (bot_won) {
            winning_id = BOT_USER_NAME;
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
            'level': 1,
            'foil_chance': loot_data.global_foil_chance,
            'unlocked_chance': loot_data.global_unlocked_chance,
            'misprint_chance': loot_data.global_misprint_chance,
            'seasonal': false,
            'lottery': lottery_level,
            'original': false,
            'status': "won",
            'condition_min': 0
        };

        generateItemFromArtworkID(item_generator, function() {
            if (winning_id == BOT_USER_NAME) {
                var item_interface = new ItemIF(_id);
                item_interface.updateItem({$set: {'status': "auctioned", 'tags': []}}, true, function() {
                    createAuction(_id, getItemObjectValueByType(getOneFromCollection("interval_methods.js", items, _id), "actual", BOT_USER_NAME) * 10, -1, 120, "public");
                });
            }
        });
        metadata.update({'lottery_draw': {$ne: null}}, {$set: {'lottery_level': 1}});
       
        var winning_name = bot_won ? BOT_USER_NAME : getOneFromCollection("interval_methods.js", Meteor.users, winning_id).profile.screen_name;

        var message = "This week's lottery winner is " + winning_name + ". Congratulations!!!";

        alertPlayers({}, message, 'fa-exclamation', 'good');
        getFromCollection("interval_methods.js", Meteor.users, user_query_object).forEach(function(user_object) {
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
                    var message = "This week there's no lottery winner. New Lottery Level: " + getOneFromCollection("interval_methods.js", metadata, {'lottery_draw': {$ne: null}}).lottery_level;
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
}

var lottery_check_frequency = 60000; //once per minute
Meteor.setInterval((function() {
    var force_draw = false;
    drawLottery(force_draw);
}), lottery_check_frequency);

var seasonal_rotation_check = 60000;
Meteor.setInterval((function() {
    var next_rotation = getOneFromCollection("interval_methods.js", metadata, {'loot_data': {$ne: null}}).loot_data.seasonal_rotation;
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
    var next_clear = getOneFromCollection("interval_methods.js", metadata, {'npc_clear_time': {$ne: null}}).npc_clear_time;
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


Meteor.setInterval((function() {
    getFromCollection("interval_methods.js", crates, {$or: [{'expiration': {$lt: getNowISOString()}}, {'expiration': null}]}).forEach(function(crate_object) {
        crates.remove({'_id': crate_object._id});
        createCrate();
    })

    var current_dynamic_crate_count = getFromCollection("interval_methods.js", crates, {}).count();
    for (var i=0; i<DYNAMIC_CRATE_COUNT - current_dynamic_crate_count; i++) {
        createCrate();
    }
}), DYNAMIC_CRATE_CHECK_FREQUENCY)