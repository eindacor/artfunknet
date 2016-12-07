createAuction = function(item_id, starting, buy_now, duration, viewer) {
    try {
        if (auctions.find({'item_id': item_id}).count() == 0) {
            var post_date = moment();
            var expiration = moment(post_date).add(duration, 'minutes');
            var item_object = items.findOne(item_id);
            var user_object = Meteor.users.findOne(item_object.owner);

            var rarity_rank;

            switch(item_object.artwork_data.rarity) {
                case 'common' : rarity_rank = 0; break;
                case 'uncommon' : rarity_rank = 1; break;
                case 'rare' : rarity_rank = 2; break;
                case 'legendary' : rarity_rank = 3; break;
                case 'masterpiece' : rarity_rank = 4; break;
                default: rarity_rank = 0; break;
            }

            var increment = Math.floor(.02 * getItemObjectValueByType(item_object, 'actual', user_object == undefined ? undefined : user_object._id));

            var auction_object = {
                'item_id': item_id,
                'bid_history': [],
                'current_bid': starting,
                'increment': increment,
                'buy_now': buy_now,
                'min_bid': starting,
                'highest_bid': starting,
                'date_posted': post_date,
                'expiration': expiration._d.toISOString(),
                'seller': user_object ? user_object.profile.screen_name : "Artfunkel, Inc.",
                'viewer': viewer == undefined ? "public" : viewer,
                'item_data': {
                    'title': item_object.artwork_data.title,
                    'artist': item_object.artwork_data.artist,
                    'rarity': item_object.artwork_data.rarity,
                    'medium': item_object.artwork_data.medium,
                    'condition': item_object.condition,
                    'date': item_object.artwork_data.date,
                    'xp_rating': item_object.xp_rating,
                    'feature_count': item_object.attributes.length,
                    'rarity_value' : item_object.artwork_data.rarity_value,
                    'roll_count' : item_object.roll_count,
                    'foil' : item_object.foil,
                    'lottery' : item_object.lottery,
                    'seasonal' : item_object.seasonal,
                    'original' : item_object.original,
                    'attributes': item_object.attributes,
                    'artwork_id': item_object.artwork_id
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
    if (auction_object.seller == "Artfunkel, Inc.") {
        removeItem(auction_object.item_id, "failedAuction", undefined);
        auctions.remove(auction_object._id);
        return;
    }

    else {
        updateItem(auction_object.item_id, {$set: {'status' : 'claimed'}}, function(error) {
            if (error)
                console.log(error.message);

            else {
                auctions.remove(auction_object._id);

                var message = "Your auction has ended for " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " without a sale";
                alertPlayers(items.findOne(auction_object.item_id).owner, message, 'fa-gavel', 'neutral');
            }
        });
    }
}

var successfulAuction = function(auction_object, winning_user) {
    var winning_bid = auction_object.current_bid;
    var refund = auction_object.highest_bid - winning_bid;
    addFunds(undefined, winning_user._id, refund);

    var seller = items.findOne(auction_object.item_id).owner;

    var send_item_to_inventory = winning_user.profile.settings.auction_items_to_inventory && !inventoryIsFull(winning_user);
    var new_status = send_item_to_inventory ? 'claimed' : 'won';

    updateItem(auction_object.item_id, {$set: {'status' : new_status, 'owner': winning_user._id, 'tags': [], 'date_received': moment()._d.toISOString()}}, function(error) {
        if (error)
            console.log(error.message);

        else {
            var previous_owner = Meteor.users.findOne({'profile.screen_name': auction_object.seller});
            var item_object = items.findOne(auction_object.item_id);
            var new_winner_id = item_object.owner;

            if (previous_owner) {
                var sale_message = "You have successfully auctioned " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " for $" + getCommaSeparatedValue(auction_object.current_bid)
                alertPlayers(previous_owner._id, sale_message, 'fa-gavel', 'good');
                addFunds("auction", previous_owner._id, auction_object.current_bid);
            }

            var message = "You have won " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " in the auction house for $" + getCommaSeparatedValue(auction_object.current_bid);
            alertPlayers(items.findOne(auction_object.item_id).owner, message, 'fa-gavel', 'good');
            
            if (item_object.condition < .5 && procUniqueAttribute(new_winner_id, "AUCTION_WIN_CONDITION_INCREASE", undefined)) {
                updateItem(item_object._id, {$set: {'condition': .9}});
            }

            if (procUniqueAttribute(new_winner_id, "AUCTION_WIN_TICKET_EXTENSION", undefined)) {
                gallery_tickets.find({'ticketholder': new_winner_id}).forEach(function(db_object) {
                    var new_expiration = moment(db_object.expiration).add(30, "minutes");
                    gallery_tickets.update(db_object._id, {$set: {'expiration': new_expiration._d.toISOString()}});
                })
            }

            Meteor.users.update({'profile.auction_data.winning': {$in: [auction_object._id]}}, {$pull: {'profile.auction_data.winning': auction_object._id}}); 
            Meteor.users.update({}, {$pull: {'profile.auction_data.watching': auction_object._id}}, {multi: true});   

            if (winning_user.profile.settings.animations_enabled) {
                Meteor.users.update(winning_user._id, {$push: {'profile.notifications.loot': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': 1}}});
            }
        }
    });

    auctions.remove(auction_object._id);
}

concludeAuction = function(auction_id) {
	try {
        var winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_id]}});
        var auction_object = auctions.findOne(auction_id);

        if (items.findOne(auction_object.item_id) == undefined) {
            //console.log("null auction detected: " + auction_object._id + "(item id: " + auction_object.item_id + ")");
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

var refundWinner = function(auction_object, new_winner, refund_amount, bought) {
    var former_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});

    if (former_winner == undefined)
        return undefined;

    addFunds(undefined, former_winner._id, refund_amount);

    notifyFormerWinner(auction_object, new_winner, bought);

    return former_winner;
}

var notifyFormerWinner = function(auction_object, new_winner_id, bought) {
    var former_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});

    if (former_winner == undefined)
        return;

    if (new_winner_id != former_winner._id) {
        if (bought) {
            var message = "Someone has purchased one of your watched items: " + auction_object.item_data.title + " by " + auction_object.item_data.artist;
            alertPlayers(former_winner._id, message, 'fa-gavel', 'bad');
        }

        else {
            var message = "Someone has outbid you on one of your watched items: " + auction_object.item_data.title + " by " + auction_object.item_data.artist;
            alertPlayers(former_winner._id, message, 'fa-gavel', 'bad');
        }
    }

    else return undefined;
}

var removeAuction = function(auction_id) {
    auctions.remove(auction_id);
    Meteor.users.update({'profile.auction_data.winning': {$in: [auction_id]}}, {$pull: {'profile.auction_data.winning': auction_id}});
    Meteor.users.update({'profile.auction_data.watching': {$in: [auction_id]}}, {$pull: {'profile.auction_data.watching': auction_id}}, {multi: true});
}

var botBid = function(auction_object, bid_increase_coefficient) {
    if (auction_object == undefined || amount < auction_object.min_bid)
        return;

    var current_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});
    var bidder_is_winner = current_winner == undefined;

    var amount = Math.floor(auction_object.min_bid * (1 + (Math.random() * bid_increase_coefficient)));

    if (amount > auction_object.highest_bid || (amount == auction_object.highest_bid && !auction_object.has_bid)) {
        var current_bid;
        var min_bid;

        if (!bidder_is_winner) {
            if (amount > auction_object.highest_bid + auction_object.increment) {
                current_bid = auction_object.highest_bid + auction_object.increment;
                min_bid = current_bid + auction_object.increment;             
            }

            else {
                current_bid = amount;
                min_bid = Math.floor(amount + auction_object.increment);     
            }
        }

        else {
            current_bid = auction_object.current_bid;
            min_bid = auction_object.min_bid;
        }

        // indicates previous winner was player
        if (current_winner != undefined) {
            refundWinner(auction_object, "Artfunkel, Inc.", auction_object.highest_bid, false);
            Meteor.users.update({'profile.auction_data.winning': {$in: [auction_object._id]}}, {$pull: {'profile.auction_data.winning': auction_object._id}});
        }
        
        var highest_bid = amount;
        auctions.update(auction_object._id, {$set: {
            'min_bid': min_bid,
            'current_bid': current_bid,
            'highest_bid': highest_bid,
            'has_bid': true
        }});
    }

    else {
        var current_bid = amount;
        var min_bid = amount + auction_object.increment;

        auctions.update(auction_object._id, {$set: {
            'min_bid': min_bid,
            'current_bid': current_bid,
            'has_bid': true
        }});
    }
}

var auction_bot_frequency = 10000;
private_auction_duration = 300000;
var procs_per_minute = 60000 / auction_bot_frequency;
var max_bids_per_minute = 2;
var proc_chance = max_bids_per_minute / procs_per_minute;
Meteor.setInterval((function() {
    auctions.find({'viewer': {$ne: "public"}}).forEach(function(auction_object) {  
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

        if (procUniqueAttribute(Meteor.users.findOne(auction_object.viewer)._id, "DESIGNER_PRIVATE_BID_REDUCTION", "Designer")) {
            bid_increase_coefficient *= .5;
        }

        if (Math.random() < actual_proc_chance) {
            botBid(auction_object, bid_increase_coefficient);
        }
    })
}), auction_bot_frequency)

var placeBid = function(bidder_id, auction_id, amount) {
    if (!canBidOnItem(auction_id))
        return false;
    
    var bidder_object = Meteor.users.findOne(bidder_id);
    var auction_object = auctions.findOne(auction_id);

    if (auction_object == undefined || amount < auction_object.min_bid)
        return;

    var current_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});
    var bidder_is_winner = current_winner && current_winner._id == bidder_id;

    var available_balance = bidder_is_winner ? bidder_object.profile.bank_balance + auction_object.highest_bid : bidder_object.profile.bank_balance;

    if (amount > available_balance)
        return;

    if (amount >= auction_object.buy_now && auction_object.buy_now != -1) {
        updateItem(auction_object.item_id, {$set: {'status' : 'won', 'owner': bidder_id, 'tags': [], 'date_received': moment()._d.toISOString()}}, function(error) {
            refundWinner(auction_object, bidder_id, auction_object.highest_bid, true);
            chargeAccount(bidder_id, auction_object.buy_now);
            var seller_id = Meteor.users.findOne({'profile.screen_name': auction_object.seller})._id;
            
            if (auction_object.item_data.condition < .5 && procUniqueAttribute(bidder_id, "AUCTION_WIN_CONDITION_INCREASE", undefined)) {
                updateItem(auction_object.item_id, {$set: {'condition': .9}});
            }

            if (procUniqueAttribute(bidder_id, "AUCTION_WIN_TICKET_EXTENSION", undefined)) {
                gallery_tickets.find({'ticketholder': bidder_id}).forEach(function(db_object) {
                    var new_expiration = moment(db_object.expiration).add(30, "minutes");
                    gallery_tickets.update(db_object._id, {$set: {'expiration': new_expiration._d.toISOString()}});
                })
            }
        
            if (auction_object.seller != "Artfunkel, Inc.") {
                var message = "Someone has purchased " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " for $" + getCommaSeparatedValue(auction_object.buy_now);
                alertPlayers(seller_id, message, 'fa-gavel', 'good');
                removeAuction(auction_id);
                addFunds("auction", seller_id, auction_object.buy_now);
            }
        });
        
        return;
    }

    else if (amount > auction_object.highest_bid || (amount == auction_object.highest_bid && !auction_object.has_bid)) {
        var current_bid;
        var min_bid;

        if (!bidder_is_winner) {
            if (amount > auction_object.highest_bid + auction_object.increment) {
                current_bid = auction_object.highest_bid + auction_object.increment;
                min_bid = current_bid + auction_object.increment;             
            }

            else {
                current_bid = amount;
                min_bid = amount + auction_object.increment;     
            }

            if (min_bid > auction_object.buy_now && auction_object.buy_now != -1)
                min_bid = auction_object.buy_now;
        }

        else {
            current_bid = auction_object.current_bid;
            min_bid = auction_object.min_bid;
        }

        refundWinner(auction_object, Meteor.userId(), auction_object.highest_bid, false);
        var highest_bid = amount;

        Meteor.users.update({'profile.auction_data.winning': {$in: [auction_id]}}, {$pull: {'profile.auction_data.winning': auction_id}}, function(error) {
            Meteor.users.update(bidder_id, {$push: {'profile.auction_data.winning': auction_id}});
        });

        chargeAccount(bidder_id, amount);
        auctions.update(auction_id, {$set: {
            'min_bid': min_bid,
            'current_bid': current_bid,
            'highest_bid': highest_bid,
            'has_bid': true
        }});
    }

    else {
        var current_bid = amount;
        var min_bid = amount + auction_object.increment;

        auctions.update(auction_id, {$set: {
            'min_bid': min_bid,
            'current_bid': current_bid,
            'has_bid': true
        }});
    }

    Meteor.users.update({'_id': bidder_id, 'profile.auction_data.watching': {$nin: [auction_id]}}, {$push: {'profile.auction_data.watching': auction_id}});

    if (moment(auction_object.expiration) - moment() < 10000)
        auctions.update(auction_object._id, {$set: {'expiration': moment().add(10, 'seconds')._d.toISOString()}});
}

Meteor.methods({
    'placeBid': function(auction_id, amount) {
        return placeBid(Meteor.userId(), auction_id, amount);
    },

    'getAuctionInfo': function(auction_id) {
        var current_winner = Meteor.users.findOne({'_id': Meteor.userId(), 'profile.auction_data.winning': {$in: [auction_id]}}) != undefined;
        var auction_object = auctions.findOne(auction_id);

        if (auction_object == undefined)
            return {};

        if (!current_winner)
            auction_object.highest_bid = undefined;

        return auction_object; 
    }
})
