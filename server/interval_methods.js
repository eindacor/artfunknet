var check_frequency = 30000;
Meteor.setInterval((function() {
    var next_check = moment().add(check_frequency, 'milliseconds');
    var next_string = next_check._d.toISOString();
    var now = moment();
    var finishing_displays = items.find({'status' : 'displayed', 'display_details.end': {$lt : next_string}}).fetch();
    for (var i=0; i < finishing_displays.length; i++) {
        var time_from_now = moment(finishing_displays[i].display_details.end) - moment();
        concludeDisplayOnTimeout(finishing_displays[i]._id, time_from_now);
    }

    var expired_auctions = auctions.find({'expiration_date': {$lt : next_check}}).fetch();
    for (var i=0; i < expired_auctions.length; i++) {
        var time_from_now = moment(expired_auctions[i].expiration_date) - moment();
        concludeAuctionOnTimeout(expired_auctions[i]._id, time_from_now);
    }

    var creation_cutoff = moment().add(-5, 'minutes')._d;
    items.remove({'status' : {$in: ['unclaimed', 'for_sale']}, 'date_created' : {$lt : creation_cutoff}});

}), check_frequency);

var auction_bot_frequency = 3600000; //once per hour
// auction_bot_frequency = 10000;
var max_bot_auctions = 2;
Meteor.setInterval((function() {
    if (auctions.find({'bid_history.user_id' : "auction_bot"}).count() < max_bot_auctions) {
        var potential_auctions = auctions.find({'bid_history' : [], 'rarity' : {$nin : ['legendary', 'masterpiece']}}).fetch();
        var qualifying_auctions = [];

        for (var i=0; i < potential_auctions.length; i++) {
            var item_object = items.findOne(potential_auctions[i].item_id);
            var actual_value = getItemValue(item_object._id, 'actual');
            var asking_value = potential_auctions[i].current_price;
            var difference = asking_value - actual_value;
            if (difference / actual_value < .5)
                qualifying_auctions.push(potential_auctions[i]);
        }

        if (qualifying_auctions.length > 0) {
            var random_auction = qualifying_auctions[Math.floor(Math.random() * (qualifying_auctions.length))];
            var bid_object = {
                'user_id': "auction_bot",
                'amount' : random_auction.bid_minimum,
                'date' : moment(),
            }

            auctions.update(
                random_auction._id, {
                    $push: {'bid_history' : bid_object},
                    $set: {'current_price' : random_auction.bid_minimum, 'bid_minimum' : Math.floor(random_auction.bid_minimum * 1.05)}
                }
            );
        }
    }
}), auction_bot_frequency)

function concludeDisplayOnTimeout(item_id, time_offset) {
    Meteor.setTimeout(function() {
        concludeDisplay(item_id);
    }, time_offset);
}

function concludeAuctionOnTimeout(auction_id, time_offset) {
    Meteor.setTimeout(function() {
        concludeAuction(auction_id);
    }, time_offset);
}

var permanent_collection_xp_frequency = 3600000; //once per hour
//permanent_collection_xp_frequency = 10000; //uncomment when debugging permanent collection xp
Meteor.setInterval((function() {
    var permanent_items = items.find({'status' : 'permanent'}).fetch();
    for (var i=0; i < permanent_items.length; i++) {
        var time_displayed = moment() - moment(permanent_items[i].permanent_post);

        var periods_displayed = Math.floor(time_displayed / permanent_collection_xp_frequency);

        var xp_max_percentage = .1;
        var xp_increment = .01;
        var percentage = periods_displayed * xp_increment <= xp_max_percentage ? periods_displayed * xp_increment : xp_max_percentage;

        var time_til_next_xp = (permanent_collection_xp_frequency * (periods_displayed + 1)) - time_displayed;

        //TODO see if this gives xp after paintings have been removed from permanent collection
        giveXPOnTimeout(permanent_items[i].owner, percentage * permanent_items[i].xp_rating, time_til_next_xp);
    }
}), permanent_collection_xp_frequency);

function giveXPOnTimeout(user_id, percentage, time_offset) {
    Meteor.setTimeout(function() {
        addXPChunkPercentage(user_id, percentage);
    }, time_offset);
}

var check_ticket_frequency = 300000; //once every 5 minutes
// check_ticket_frequency = 30000; //once every 30 seconds
Meteor.setInterval((function() {
    var next_check = moment().add(check_ticket_frequency, 'milliseconds');
    var next_string = next_check._d.toISOString();
    var now = moment();

    var expiring_ticket_holders = Meteor.users.find({'profile.gallery_tickets.expiration' : {$lt : next_string}});
    expiring_ticket_holders.forEach(function(db_object) {
        for (var i=0; i < db_object.profile.gallery_tickets.length; i++) {
            if (db_object.profile.gallery_tickets[i].expiration < next_string) {
                var time_from_now = check_ticket_frequency - (next_check - moment(db_object.profile.gallery_tickets[i].expiration));
                removeTicketOnTimeout(db_object._id, db_object.profile.gallery_tickets[i].unique_id, time_from_now);
            }
        }
    });

}), check_ticket_frequency);

function removeTicketOnTimeout(buyer_id, unique_id, time_offset) {
    Meteor.setTimeout(function() {
        Meteor.users.update(buyer_id, {$pull : {'profile.gallery_tickets' : {'unique_id': unique_id}}});
    }, time_offset);
}

var npc_spawn_frequency = 600000; // 10 minutes
// npc_spawn_frequency = 10000; // 10 seconds
Meteor.setInterval((function() {
    var default_spawn_chance = .5;

    var gallery_objects = galleries.find();
    gallery_objects.forEach(function(db_object) {
        npcs.remove({'owner_id': db_object.owner_id});
        var attribute_values = db_object.attribute_values;
        var attribute_ids = Object.keys(attribute_values);
        for (var i=0; i < attribute_ids.length; i++) {
            if (attributes.findOne(attribute_ids[i]).type == "secondary")
                continue;
            
            var proc_chance = default_spawn_chance * attribute_values[attribute_ids[i]];
            var description = attributes.findOne(attribute_ids[i]).description;           
            var proc = JepLoot.booRoll(proc_chance);
            if (proc)
                createNPC(db_object, attribute_ids[i], npc_spawn_frequency);
        }
    });

}), npc_spawn_frequency);

var gallery_finish_xp_frequency = 3600000; //once per hour
//gallery_finish_xp_frequency = 10000; //uncomment when debugging permanent collection xp
Meteor.setInterval((function() {
    var xp_max_percentage = .1;
    var all_users = Meteor.users.find();
    all_users.forEach(function(db_object) {       
        var active_floor_finish_id = db_object.profile.gallery_finishes.active.floor_finish;
        var floor_xp_rating = db_object.profile.gallery_finishes.owned.floor_finishes[active_floor_finish_id].xp_rating;
        var floor_percentage = xp_max_percentage * floor_xp_rating;

        var active_wall_finish_id = db_object.profile.gallery_finishes.active.wall_finish;
        var wall_xp_rating = db_object.profile.gallery_finishes.owned.wall_finishes[active_wall_finish_id].xp_rating;
        var wall_percentage = xp_max_percentage * wall_xp_rating;

        addXPChunkPercentage(db_object._id, wall_percentage + floor_percentage);
    });

}), gallery_finish_xp_frequency);