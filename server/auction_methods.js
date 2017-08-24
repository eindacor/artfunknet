createAuction = function(item_id, starting, buy_now, duration, viewer) {
    try {
        if (auctions.find({'item_id': item_id}).count() == 0) {
            var post_date = moment();
            var expiration = moment(post_date).add(duration, 'minutes');
            var item_object = items.findOne(item_id);
            if (item_object == undefined)
                return false;

            var user_object = Meteor.users.findOne(item_object.owner);

            var increment = Math.floor(.02 * getItemObjectValueByType(item_object, 'actual', user_object == undefined ? undefined : user_object._id));

            //TODO let the item's artwork data replace separate artwork info fields
            var auction_object = {
                'item_id': item_id,
                'bid_history': [],
                'current_bid': starting,
                'increment': increment,
                'buy_now': buy_now,
                'min_bid': starting,
                'date_posted': post_date._d.toISOString(),
                'expiration': expiration._d.toISOString(),
                'seller': user_object ? user_object.profile.screen_name : BOT_USER_NAME,
                'viewer': viewer == undefined ? "public" : viewer,
                'item_data': {
                    'title': item_object.artwork_data.title,
                    'artist': item_object.artwork_data.artist,
                    'rarity': item_object.artwork_data.rarity,
                    'medium': item_object.artwork_data.medium,
                    'condition': item_object.condition,
                    'date': item_object.artwork_data.date,
                    'level': item_object.level,
                    'feature_count': item_object.attributes.length,
                    'rarity_value' : item_object.artwork_data.rarity_value,
                    'roll_count' : item_object.roll_count,
                    'foil' : item_object.foil,
                    'unlocked': item_object.unlocked,
                    'vintage': item_object.vintage,
                    'lottery' : item_object.lottery,
                    'seasonal' : item_object.seasonal,
                    'original' : item_object.original,
                    'attributes': item_object.attributes,
                    'artwork_id': item_object.artwork_id,
                    'artwork_data': item_object.artwork_data
                }               
            };

            auctions.insert(auction_object);
        }
    }

    catch(error) {
        console.log("createAuction: " + error.message);
    }
}

var failedAuction = function(auction_object) {
    if (auction_object.seller == BOT_USER_NAME) {
        removeAuction(auction_object._id, function() {
            removeItem(auction_object.item_id, "failedAuction", undefined);
        });
        return;
    }

    else {
        var item_interface = new ItemIF(auction_object.item_id);
        item_interface.updateItem({$set: {'status' : 'claimed'}}, false, function(error) {
            if (error)
                console.log(error.message);

            else {
                var message = "Your auction has ended for " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " without a sale";
                var player_interface = new PlayerIF(items.findOne(auction_object.item_id).owner);
                player_interface.alert(message, 'fa-gavel', 'neutral');

                removeAuction(auction_object._id);
            }
        });
    }
}

var successfulAuction = function(auction_object, winning_user) {
    var winning_bid = auction_object.current_bid;

    var item_interface = new ItemIF(auction_object.item_id);
    var seller = item_interface.getItemObject().owner;

    var winning_user_interface;
    var send_item_to_inventory = true;
    var new_status = "claimed";

    try {
        winning_user_interface = new PlayerIF(winning_user);
        send_item_to_inventory = winning_user.profile.settings.auction_items_to_inventory && !winning_user_interface.inventoryIsFull();
        new_status = send_item_to_inventory ? 'claimed' : 'won';
    }

    catch (error) {
        console.log(error);
    }

    var updateCallback = function(error) {
        if (error)
            console.log(error.message);

        else {
            var previous_owner = Meteor.users.findOne({'profile.screen_name': auction_object.seller});
            var nested_item_interface = new ItemIF(auction_object.item_id);
            var item_object = nested_item_interface.getItemObject();
            var new_winner_id = item_object.owner;
            var winner_interface = new PlayerIF(new_winner_id);

            if (item_object.status == "claimed") {
                var player_item_interface = new PlayerItemIF(winner_interface, nested_item_interface);
            }

            if (previous_owner) {
                var previous_owner_interface = new PlayerIF(previous_owner);
                var sale_message = "You have successfully auctioned " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " for $" + getCommaSeparatedValue(auction_object.current_bid)
                previous_owner_interface.alert(sale_message, 'fa-gavel', 'good');
                previous_owner_interface.addFunds("auction", auction_object.current_bid);
            }

            var message = "You have won " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " in the auction house for $" + getCommaSeparatedValue(auction_object.current_bid);
            winner_interface.alert(message, 'fa-gavel', 'good');
            
            if (item_object.condition < .5 && winner_interface.procUniqueAttribute("AUCTION_WIN_CONDITION_INCREASE", undefined)) {
                nested_item_interface.updateItem({$set: {'condition': .9}}, false);
            }

            if (Math.random() < IDENTIFY_FORGED_AUCTIONS_PROC && winner_interface.procUniqueAttribute("IDENTIFY_FORGED_AUCTIONS", undefined)) {
                nested_item_interface.updateItem({$set: {'authenticity.identified': true}})
            }

            if (winner_interface.procUniqueAttribute("KNOWLEDGE_FOR_AUCTION_WINS", undefined)) {
                var unit_reward = nested_item_interface.getUnitValue() * 6;
                var knowledge_reward = convertUnitValueToKnowledge(unit_reward);
                winner_interface.giveKnowledge(knowledge_reward);
            }

            if (winning_user.profile.settings.animations_enabled) {
                Meteor.users.update(winning_user._id, {$push: {'profile.notifications.loot': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': 1}}});
            }

            var seller_item_interface = new PlayerItemIF(new PlayerIF(seller), item_interface);
            seller_item_interface.makeLiable();
            removeAuction(auction_object._id);
        }
    }

    transferAuctionItem(item_interface, new_status, winning_user._id, auction_object.current_bid, updateCallback);
}

transferAuctionItem = function(item_interface, new_status, winning_user_id, winning_bid, updateCallback) {
    item_interface.updateItem({
        $set: {
            'status' : new_status, 
            'owner': winning_user_id, 
            'tags': [], 
            'date_received': moment()._d.toISOString(),
            'authenticity.identified': false,
            'authenticity.fee': winning_bid,
            'authenticity.liability_pending': true
        }
    }, true, updateCallback);
}

concludeAuction = function(auction_id) {
	try {
        var winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_id]}});
        var auction_object = auctions.findOne(auction_id);

        var item_object = items.findOne(auction_object.item_id);
        if (item_object == undefined || item_object.status != "auctioned") {
            removeAuction(auction_id, undefined);
            return false;
        }

        winner ? successfulAuction(auction_object, winner) : failedAuction(auction_object);
	}

	catch(error) {
		console.log("in concludeAuction (" + auction_id + ")");
		console.log(auctions.findOne(auction_id));
		console.log(error.message);
	}
}

refundWinner = function(auction_object, new_winner, refund_amount, bought) {
    var former_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});
    if (former_winner == undefined)
        return undefined;

    var former_winner_interface = new PlayerIF(former_winner);

    former_winner_interface.addFunds(undefined, refund_amount);

    notifyFormerWinner(auction_object, new_winner, bought);

    return former_winner;
}

notifyFormerWinner = function(auction_object, new_winner_id, bought) {
    var former_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});
    if (former_winner == undefined)
        return;

    var former_winner_interface = new PlayerIF(former_winner);

    if (new_winner_id != former_winner_interface.getId()) {
        if (bought) {
            var message = "Someone has purchased one of your watched items: " + auction_object.item_data.title + " by " + auction_object.item_data.artist;
            former_winner_interface.alert(message, 'fa-gavel', 'bad');
        }

        else {
            var message = "Someone has outbid you on one of your watched items: " + auction_object.item_data.title + " by " + auction_object.item_data.artist;
            former_winner_interface.alert(message, 'fa-gavel', 'bad');
        }
    }

    else return undefined;
}

removeAuction = function(auction_id, callback) {
    var auction_object = auctions.findOne(auction_id);
    auctions.remove(auction_id, function(error) {
        if (error) {
            console.log("removeAuction: " + error.message)
        }

        else {
            if (callback != undefined) {
                callback();
            }

            Meteor.users.update({'profile.auction_data.winning': {$in: [auction_id]}}, {$pull: {'profile.auction_data.winning': auction_id}});
            Meteor.users.update({'profile.auction_data.watching': {$in: [auction_id]}}, {$pull: {'profile.auction_data.watching': auction_id}}, {multi: true});
        }
    });
    
}

var botBid = function(auction_object, bid_increase_coefficient) {
    if (auction_object == undefined)
        return;

    var current_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});
    var bidder_is_winner = current_winner == undefined;

    var current_bid = Math.floor(auction_object.min_bid * (1 + (Math.random() * bid_increase_coefficient)));
    var min_bid = current_bid + auction_object.increment;

    // indicates previous winner was player
    if (current_winner != undefined) {
        refundWinner(auction_object, BOT_USER_NAME, auction_object.current_bid, false);
        Meteor.users.update({'profile.auction_data.winning': {$in: [auction_object._id]}}, {$pull: {'profile.auction_data.winning': auction_object._id}});
    }
    
    auctions.update(auction_object._id, {$set: {
        'min_bid': min_bid,
        'current_bid': current_bid,
        'has_bid': true
    }});
}

var auction_bot_frequency = 10000;
private_auction_duration = 300000;
var procs_per_minute = 60000 / auction_bot_frequency;
var max_bids_per_minute = 2;
var proc_chance = max_bids_per_minute / procs_per_minute;
Meteor.setInterval((function() {
    var bot_auction_cutoff = moment().add(10, "seconds")._d.toISOString();
    auctions.find({'viewer': {$ne: "public"}, 'expiration': {$gt: bot_auction_cutoff}}).forEach(function(auction_object) {  
        item_object = items.findOne(auction_object.item_id);
        if (item_object == undefined) {
            return;
        }

        var actual_value = getItemObjectValueByType(item_object, 'actual', undefined);
        if (auction_object.current_bid >= actual_value * 3 || actual_value == undefined)
            return;

        var actual_proc_chance = proc_chance;
        var bid_increase_coefficient = .1;

        switch(auction_object.item_data.rarity) {
            case "common": 
                actual_proc_chance *= .6;
                bid_increase_coefficient *= .6;
                break;
            case "uncommon": 
                actual_proc_chance *= .7;
                bid_increase_coefficient *= .7;
                break;
            case "rare": 
                actual_proc_chance *= .8;
                bid_increase_coefficient *= .8;
                break;
            case "legendary": 
                actual_proc_chance *= .9;
                bid_increase_coefficient *= .9;
                break;
            case "masterpiece":
            default: break;
        }

        var seconds_til_end = (moment(auction_object.expiration) - moment()) / 1000;
        if (seconds_til_end < 60) {
            actual_proc_chance *= 2;
            bid_increase_coefficient *= 2;
        }

        if (procUniqueAttribute(Meteor.users.findOne(auction_object.viewer)._id, "MARKETING_PRIVATE_BID_REDUCTION", "Marketing Manager")) {
            bid_increase_coefficient *= .5;
        }

        if (Math.random() < actual_proc_chance) {
            botBid(auction_object, bid_increase_coefficient);
        }
    })
}), auction_bot_frequency)


Meteor.methods({
    'placeBid': function(item_id, amount) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.placeBid(amount);
    },

    'getAuctionInfo': function(auction_id) {
        return auctions.findOne({'_id': auction_id, 'viewer': {$in: [Meteor.userId(), "public"]}}); 
    }
})
