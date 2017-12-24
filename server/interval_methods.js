Meteor.setInterval((function() {
    var now = getNowISOString();

    getFromCollection("interval_methods.js conclude auctions", auctions, {'expiration': {$lt : now}}).forEach(function(db_object) {
        concludeAuction(db_object._id);
    });

    var unclaimed_creation_cutoff = moment().add(-1 * ONE_HOUR, 'milliseconds')._d.toISOString();
    getFromCollection("interval_methods.js remove unclaimed", items, {'status' : 'unclaimed', 'date_received' : {$lt : unclaimed_creation_cutoff}}).forEach(function(item_object) {
        removeItem(item_object._id, "failed to claim (" + item_object.status + ")", undefined);
    })

    var store_creation_cutoff = moment().add(-1 * 20 * ONE_MINUTE, 'milliseconds')._d.toISOString();
    getFromCollection("interval_methods.js remove unpurchased", items, {'status' : 'for_sale', 'date_received' : {$lt : store_creation_cutoff}}).forEach(function(item_object) {
        removeItem(item_object._id, "failed to claim (" + item_object.status + ")", undefined);
    })
    
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
    Meteor.users.find({'profile.user_type': {$in: ["admin", "bot"]}}).forEach(function(user_object) {
        admin_ids.push(user_object._id);
    });

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

Meteor.setInterval((function() {
    generateArtfunkelAuctions(20, DEBUG ? ONE_MINUTE : ONE_HOUR);
}), GENERATED_AUCTION_FREQUENCY);

var marketing_boost = .15;
var base_proc_max = 1 - marketing_boost;
Meteor.setInterval((function() {
    getFromCollection("interval_methods.js", galleries, {'tutorial': {$ne: true}}).forEach(function(gallery_object) {
        npcs.remove({'owner_id': gallery_object.owner_id});

        if (gallery_object.gallery_rarity_npc_coefficient <= 0) {
            return;
        }

        var attribute_ids = Object.keys(gallery_object.procs);
        var rarity_npc_coefficient = gallery_object.gallery_rarity_npc_coefficient;
        var owner_interface = new PlayerIF(gallery_object.owner_id);
        var owner_object = owner_interface.getUserObject();

        for (var i=0; i < attribute_ids.length; i++) {
            var proc_chance = gallery_object.procs[attribute_ids[i]];

            if (Math.random() < proc_chance) {
                var attribute_object = getOneFromCollection("interval_methods.js", attributes, attribute_ids[i]);
                var npc_quality = undefined;

                if (attribute_object.npc_name == "Art Collector" && owner_interface.procUniqueAttribute("COLLECTOR_MAX_QUALITY", undefined)) {
                    if (owner_object.profile.npcs_met.platinum < npc_max_map.platinum) {
                        npc_quality = "platinum";
                    }
                    else if (owner_object.profile.npcs_met.gold < npc_max_map.gold) { 
                        npc_quality = "gold";
                    }
                    else if (owner_object.profile.npcs_met.silver < npc_max_map.silver) {
                        npc_quality = "silver";
                    }
                    else if (owner_object.profile.npcs_met.bronze < npc_max_map.bronze) {
                        npc_quality = "bronze";
                    }
                }
                
                if (npc_quality == undefined) {
                    npc_quality = getNPCQuality(owner_interface.getPlayerLevel());
                }

                createNPC(gallery_object, attribute_ids[i], NPC_SPAWN_FREQUENCY, npc_quality);

                if ((npc_quality == "platinum") && owner_interface.procUniqueAttribute("COLLECTOR_DONOR_PAIR", undefined)) {
                    if (attribute_object.npc_name == "Art Collector") {
                        createNPC(gallery_object, getOneFromCollection("interval_methods.js", attributes, {'npc_name': "Art Donor"})._id, NPC_SPAWN_FREQUENCY, "bronze")
                    }
                    else if (attribute_object.npc_name == "Art Donor") {
                        createNPC(gallery_object, getOneFromCollection("interval_methods.js", attributes, {'npc_name': "Art Collector"})._id, NPC_SPAWN_FREQUENCY, "bronze")
                    }
                }
            }
        }
    });
}), NPC_SPAWN_FREQUENCY);

var rewardForger = function(item_interface, display_earning_time) {
    var forger_interface = new PlayerIF(item_interface.getItemObject().authenticity.original_owner);
    var forger_item_interface = new PlayerItemIF(forger_interface, item_interface);

    var xp_earned = forger_item_interface.getXPPerHour(display_earning_time);

    forger_interface.addXP(xp_earned, false);
}

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

                    if (item_object.authenticity.forgery) {
                        if (item_object.owner != item_object.authenticity.original_owner) {
                            rewardForger(item_interface, display_earning_time);
                        }

                        if (player_item_interface.catchForgery(FORGERY_HEAT_CATEGORY.DISPLAY)) {
                            item_interface.punishForgeryOwner();
                            player_item_interface.makeLiable();
                        }
                    }

                    var money_per_hour = player_item_interface.getDisplayValuePerHour(display_earning_time);
                    total_earnings += money_per_hour;
                    total_xp += player_item_interface.getXPPerHour(display_earning_time);

                    var display_level = player_item_interface.getDisplayLevel(display_earning_time);
        
                    if (!player_interface.isRecentlyActive() && player_interface.getUserObject().profile.user_type != "bot") {
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
                    player_interface.addXP(total_xp, true);
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
    var tick_object = getOneFromCollection("interval_methods.js", metadata, {'repairing_tick': {$ne: null}});
    if (tick_object != undefined) {
        var repairing_tick_time = getOneFromCollection("interval_methods.js", metadata, {'repairing_tick': {$ne: null}}).repairing_tick;

        if (getNowISOString() > repairing_tick_time) {
            if (DEBUG) {
                console.log("repairing items: " + getNowISOString());
            }

            getFromCollection("interval_methods.js", Meteor.users, {}).forEach(function(user_object) {
                var player_interface = new PlayerIF(user_object);      
                getFromCollection("interval_methods.js", items, {'repairing': true, 'status': {$in: ["claimed", "displayed"]}, 'owner': user_object._id, 'condition': {$lt: 1}}).forEach(function(item_object) {
                    var repair_value = REPAIRING_IMPROVEMENT_VALUE;
                    var player_item_interface = new PlayerItemIF(player_interface, new ItemIF(item_object));
                    player_item_interface.repair(repair_value, "repair tick");
                });
            })
            
            var next_tick = moment().add(REPAIRING_TICK_FREQUENCY, "milliseconds")._d.toISOString();
            metadata.update({'repairing_tick': {$ne: null}}, {$set: {'repairing_tick': next_tick}});
        }
    }

    else metadata.insert({'repairing_tick': moment()._d.toISOString()});
}), REPAIRING_CHECK_FREQUENCY);

Meteor.setInterval((function() {
    var liability_cutoff = moment().subtract(ACQUISITION_LIABILITY_CUTOFF, 'milliseconds')._d.toISOString();
    items.find({'date_received': {$lt: liability_cutoff}, 'authenticity.identified': false, 'authenticity.liability_pending': true}).forEach(function(item_object) {
        items.update(item_object._id, {$set: {'authenticity.liable': item_object.owner, 'authenticity.liability_pending': false}});
    })

}), LIABILITY_CHECK_FREQUENCY)

var lottery_check_frequency = 60000; //once per minute
Meteor.setInterval((function() {
    var force_draw = false;
    drawLottery(force_draw);
}), lottery_check_frequency);

var seasonal_rotation_check = 60000;
Meteor.setInterval((function() {
    if (getLootData().seasonal_rotation < getNowISOString()) {
        rotateSeasonalItems();
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
        var query = {};
        var query_string = "profile.crate_purchases." + crate_object._id;
        query[query_string] = {'$ne': null};
        var unsetter = {};
        unsetter[query_string] = "";
        Meteor.users.update(query, {$unset: unsetter}, {multi: true});
        crates.remove({'_id': crate_object._id});
        createCrate();
    })

    var current_dynamic_crate_count = getFromCollection("interval_methods.js", crates, {}).count();
    for (var i=0; i<DYNAMIC_CRATE_COUNT - current_dynamic_crate_count; i++) {
        createCrate();
    }
}), DYNAMIC_CRATE_CHECK_FREQUENCY)