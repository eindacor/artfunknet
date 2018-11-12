createAuction = function(item_id, starting, buy_now, duration, viewer) {
    try {
        if (auctions.find({'item_id': item_id}).count() == 0) {
            var post_date = moment();
            var expiration = moment(post_date).add(duration, 'milliseconds');
            var item_object = items.findOne(item_id);
            if (item_object == undefined)
                return false;

            var user_object = Meteor.users.findOne(item_object.owner);

            var increment = Math.floor(.02 * getItemObjectValueByType(item_object, 'actual', user_object == undefined ? undefined : user_object._id));

            //TODO let the item's artwork data replace separate artwork info fields
            //TODO instead of setting each item data field, modify the fields of the item_object returned and give that as the item data
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
                'seller_id': user_object ? user_object._id : undefined,
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
                    'patreon' : item_object.patreon,
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
        console.log("createAuction: " + error);
    }
}

var failedAuction = function(auction_object) {
    if (auction_object.seller == BOT_USER_NAME) {
        item_object = items.findOne(auction_object.item_id)
        if (itemIsMisprinted(item_object)) {
            removeAuction(auction_object._id, function() {
                admin_interface = new PlayerIF(Meteor.users.findOne({'profile.screen_name': "admin"}));

                var item_interface = new ItemIF(auction_object.item_id);
                item_interface.updateItem({$set: {
                    'status': "won",
                    'owner': admin_interface.getId(),
                    'date_received': moment()._d.toISOString(),
                    'authenticity.identified': true,
                    'authenticity.fee': 0,
                    'authenticity.liability_pending': false,
                    'authenticity.liable' : admin_interface.getId()
                }}, function(error) {
                    if (error)
                        console.log(error)
                })
            })
        }
        else {
            removeAuction(auction_object._id, function() {
                removeItem(auction_object.item_id, "failedAuction", undefined);
            });
        }
        return;
    }

    else {
        var item_interface = new ItemIF(auction_object.item_id);
        item_interface.updateItem({$set: {'status' : 'claimed'}}, false, function(error) {
            if (error)
                console.log(error);

            else {
                var html = '<p>Your auction has ended for <span class="' + auction_object.item_data.artwork_data.rarity + '" style="font-style:italic">' + auction_object.item_data.title + '</span> by <span class="af-color">' + auction_object.item_data.artist + '</span> without a sale</span></p>';
                var player_interface = new PlayerIF(items.findOne(auction_object.item_id).owner);
                player_interface.htmlAlert(html, 'fa-gavel', 'neutral');

                removeAuction(auction_object._id);
            }
        });
    }
}

successfulAuction = function(winning_player_interface, auction_object, winning_bid_amount) { 
    var item_interface = new ItemIF(auction_object.item_id);

    var seller = getOneFromCollection("auction_methods.js:successfulAuction()", Meteor.users, auction_object.seller_id);

    //TECH DEBT: below is a catch for auctions made before change
    if (seller == undefined) {
        seller = getOneFromCollection("PlayerItemIF.js:PlayerItemIF.placeBid()", Meteor.users, {'profile.screen_name': auction_object.seller});
    }

    var updateCallback = function(error) {
        refundWinner(auction_object, winning_player_interface.getId(), auction_object.current_bid, true);
        winning_player_interface.chargeAccount(winning_bid_amount);

        var html = '<p>You have won <span class="' + auction_object.item_data.artwork_data.rarity + '" style="font-style:italic">' + auction_object.item_data.title + '</span> by <span class="af-color">' + auction_object.item_data.artist + '</span> in the auction house for <span class="green-text">$' + getCommaSeparatedValue(winning_bid_amount) + '</span></p>';
        winning_player_interface.htmlAlert(html, 'fa-gavel', 'good');
                        
        var nested_item_interface = new ItemIF(auction_object.item_id);
        if (auction_object.item_data.condition < .5 && winning_player_interface.procUniqueAttribute("AUCTION_WIN_CONDITION_INCREASE", undefined)) {
            nested_item_interface.updateItem({$set: {'condition': .9}}, true);
        }

        if (winning_player_interface.procUniqueAttribute("KNOWLEDGE_FOR_AUCTION_WINS", undefined)) {
            var unit_reward = nested_item_interface.getUnitValue() * 6;
            var knowledge_reward = convertUnitValueToKnowledge(unit_reward);
            winning_player_interface.giveKnowledge(knowledge_reward);
        }
    
        if (seller != undefined) {
            var seller_interface = new PlayerIF(seller);
            var html = '<p>You have successfully auctioned <span class="' + auction_object.item_data.artwork_data.rarity + '" style="font-style:italic">' + auction_object.item_data.title + '</span> by <span class="af-color">' + auction_object.item_data.artist + '</span> for <span class="green-text">$' + getCommaSeparatedValue(winning_bid_amount) + '</span></p>';
            seller_interface.htmlAlert(html, 'fa-gavel', 'good');
            removeAuction(auction_object._id);
            seller_interface.addFunds("auction", winning_bid_amount);
            var seller_item_interface = new PlayerItemIF(seller_interface, item_interface);
            seller_item_interface.makeLiable();
        }   
    }


    transferAuctionItem(item_interface, winning_player_interface, seller, winning_bid_amount, updateCallback);  
    updateArtworkMarketValue(item_interface, winning_bid_amount);      
}

transferAuctionItem = function(item_interface, winning_player_interface, seller, winning_bid_amount, updateCallback) {
    var send_item_to_inventory = winning_player_interface.getUserObject().profile.settings.auction_items_to_inventory && !winning_player_interface.inventoryIsFull();

    item_interface.updateItem({
        $set: {
            'status' : send_item_to_inventory ? 'claimed' : 'won', 
            'owner': winning_player_interface.getId(), 
            'tags': [], 
            'date_received': moment()._d.toISOString(),
            'authenticity.identified': seller == undefined,
            'authenticity.fee': winning_bid_amount,
            'authenticity.liability_pending': seller != undefined
        }
    }, true, updateCallback);
}

updateArtworkMarketValue = function(item_interface, winning_bid_amount) {
    var item_signature = item_interface.getArchiveSignature();
    var setter_string = "market_data." + item_signature;
    var setter_object = {};
    var market_info = artworks.findOne(item_interface.getArtworkId()).market_data[item_signature];
    if (market_info  == undefined) {
        setter_object[setter_string] = {'count': 1, 'average': winning_bid_amount};
    }
    else {
        var previous_count = market_info.count;
        var previous_average = market_info.average;
        var new_count = previous_count + 1;
        var new_average = ((previous_count * previous_average) + winning_bid_amount) / new_count;
        setter_object[setter_string] = {'count': new_count, 'average': Math.floor(new_average)};
    }

    artworks.update({'_id': item_interface.getArtworkId()}, {$set: setter_object});
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

        winner ? successfulAuction(new PlayerIF(winner), auction_object, auction_object.current_bid) : failedAuction(auction_object);
	}

	catch(error) {
		console.log("in concludeAuction (" + auction_id + ")");
		console.log(auctions.findOne(auction_id));
		console.log(error);
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
            var html = '<p class="red-text">Someone has purchased one of your watched items:  <span class="' + auction_object.item_data.artwork_data.rarity + '" style="font-style:italic">' + auction_object.item_data.title + '</span> by <span class="af-color">' + auction_object.item_data.artist + '</span></p>';
            former_winner_interface.htmlAlert(html, 'fa-gavel', 'bad');
        }

        else {
            var html = '<p class="red-text">Someone has outbid you on one of your watched items:  <span class="' + auction_object.item_data.artwork_data.rarity + '" style="font-style:italic">' + auction_object.item_data.title + '</span> by <span class="af-color">' + auction_object.item_data.artist + '</span></p>';
            former_winner_interface.htmlAlert(html, 'fa-gavel', 'bad');
        }
    }

    else return undefined;
}

removeAuction = function(auction_id, callback) {
    var auction_object = auctions.findOne(auction_id);
    auctions.remove(auction_id, function(error) {
        if (error) {
            console.log("removeAuction: " + error)
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
