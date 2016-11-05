var check_frequency = 10000;
Meteor.setInterval((function() {
    var now = moment()._d.toISOString();
    var finished_displays = items.find({'status' : 'displayed', 'display_details.end': {$lt : now}});
    finished_displays.forEach(function(db_object) {
        concludeDisplay(db_object._id);
    });

    var expired_auctions = auctions.find({'expiration': {$lt : now}});
    expired_auctions.forEach(function(db_object) {
        concludeAuction(db_object._id);
    });

    var creation_cutoff = moment().add(-10, 'minutes')._d.toISOString();
    items.remove({'status' : {$in: ['unclaimed', 'for_sale']}, 'date_received' : {$lt : creation_cutoff}});

    var auction_win_cutoff = moment().add(-2, 'hours')._d.toISOString();
    items.remove({'status': 'won', 'date_received' : {$lt : auction_win_cutoff}});
    
    alerts.remove({'time': {$lt: moment().add(-48, "hours")._d.toISOString()}});

}), check_frequency);

var check_ticket_frequency = 300000; //once every 5 minutes
// check_ticket_frequency = 10000; //once every 10 seconds
Meteor.setInterval((function() {
    gallery_tickets.remove({'expiration': {$lt : moment()._d.toISOString()}});
}), check_ticket_frequency);

var npc_spawn_frequency = 600000; // 10 minutes
// npc_spawn_frequency = 10000; // 10 seconds
Meteor.setInterval((function() {
    galleries.find().forEach(function(db_object) {
        npcs.remove({'owner_id': db_object.owner_id});
        var attribute_values = db_object.attribute_values;
        var attribute_ids = Object.keys(attribute_values);
        var rarity_npc_coefficient = db_object.gallery_rarity_npc_coefficient;

        for (var i=0; i < attribute_ids.length; i++) {
            var attribute_object = attributes.findOne(attribute_ids[i]);
            if (attribute_object == undefined || attribute_object.type == "secondary")
                continue;
            
            var proc_chance = Math.pow((attribute_values[attribute_ids[i]] * rarity_npc_coefficient), 2);

            if (attribute_object.npc_name == "Art Donor" && procUniqueAttribute(db_object.owner_id, "DONOR_SPAWN_BOOST", undefined)) {
                if (Meteor.user().profile.market_expert.expiration < moment()._d.toISOString())
                    proc_chance += .2;
            }

            if (JepLoot.booRoll(proc_chance)) {
                var npc_quality = getNPCQuality(Meteor.users.findOne(db_object.owner_id).profile.level);
                createNPC(db_object, attribute_ids[i], npc_spawn_frequency, npc_quality);

                if (attribute_object.npc_name == "Designer" && procUniqueAttribute(db_object.owner_id, "DESIGNER_PAIRS", undefined) && Math.random() < .3)
                    createNPC(db_object, attribute_ids[i], npc_spawn_frequency, "bronze");
                    
                if ((npc_quality == "platinum" || npc_quality == "gold") && procUniqueAttribute(db_object.owner_id, "COLLECTOR_DONOR_PAIR", undefined)) {
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

var xp_frequency = 3600000; //once per hour
//xp_frequency = 10000; //uncomment when debugging permanent collection xp
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

    var pc_xp_max_percentage = .1;
    var pc_xp_increment = .01;
    items.find({'status' : 'permanent'}).forEach(function(db_object) {
        var time_displayed = moment() - moment(db_object.permanent_post);

        var periods_displayed = Math.floor(time_displayed / xp_frequency);

        var percentage = periods_displayed * pc_xp_increment <= pc_xp_max_percentage ? periods_displayed * pc_xp_increment : pc_xp_max_percentage;

        var time_til_next_xp = (xp_frequency * (periods_displayed + 1)) - time_displayed;

        addXPChunkPercentage("permanent collection", db_object.owner, percentage * db_object.xp_rating);
    });

}), xp_frequency);
