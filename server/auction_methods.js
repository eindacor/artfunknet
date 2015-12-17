createAuction = function(item_id, starting, buy_now, duration) {
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

            var increment = Math.floor(.02 * getItemValue(item_id, "actual", undefined));

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
                    'original' : item_object.original
                }               
            };

            auctions.insert(auction_object);
        }
    }

    catch(error) {
        console.log(error.message);
    }
}

var failedAuction = function(auction_object) {
    if (auction_object.seller == "Artfunkel, Inc.") {
        items.remove(auction_object.item_id);
        auctions.remove(auction_object._id);
        return;
    }

    else {
        items.update(auction_object.item_id, {$set: {'status' : 'claimed'}}, function(error) {
            if (error)
                console.log(error.message);

            else {
                auctions.remove(auction_object._id);

                var message = "Your auction has ended for " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " without a sale";
                var alert_object = {
                    'user_id' : items.findOne(auction_object.item_id).owner,
                    'message' : message,
                    'link' : '/',
                    'icon' : 'fa-gavel',
                    'sentiment' : "neutral",
                    'time' : moment()
                };
                alerts.insert(alert_object);
            }
        });
    }
}

var successfulAuction = function(auction_object, winning_user) {
    var winning_bid = auction_object.current_bid;
    var refund = auction_object.highest_bid - winning_bid;
    addFunds(winning_user._id, refund);

    var seller = items.findOne(auction_object.item_id).owner;

    items.update(auction_object.item_id, {$set: {'status' : 'claimed', 'owner': winning_user._id, 'tags': []}}, function(error) {
        if (error)
            console.log(error.message);

        else {
            var previous_owner = Meteor.users.findOne({'profile.screen_name': auction_object.seller});

            if (previous_owner) {
                var sale_message = "You have successfully auctioned " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " for $" + getCommaSeparatedValue(auction_object.current_bid)
                var alert_sale_object = {
                    'user_id' : previous_owner._id,
                    'message' : sale_message,
                    'link' : '/',
                    'icon' : 'fa-gavel',
                    'sentiment' : "good",
                    'time' : moment()
                };
                alerts.insert(alert_sale_object);

                addFunds(previous_owner._id, auction_object.current_bid);
                calcMVP(previous_owner._id);
            }

            var win_message = "You have won " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " in the auction house for $" + getCommaSeparatedValue(auction_object.current_bid);
            var alert_win_object = {
                'user_id' : items.findOne(auction_object.item_id).owner,
                'message' : win_message,
                'link' : '/',
                'icon' : 'fa-gavel',
                'sentiment' : "good",
                'time' : moment()
            };
            alerts.insert(alert_win_object);

            calcMVP(winning_user._id); 
            Meteor.users.update({'profile.auction_data.winning': {$in: [auction_object._id]}}, {$pull: {'profile.auction_data.winning': auction_object._id}}); 
            Meteor.users.update({}, {$pull: {'profile.auction_data.watching': auction_object._id}}, {multi: true});   
        }
    });

    auctions.remove(auction_object._id);
}


concludeAuction = function(auction_id) {
    var winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_id]}});
    var auction_object = auctions.findOne(auction_id);
    winner ? successfulAuction(auction_object, winner) : failedAuction(auction_object);
}

var refundWinner = function(auction_object, new_winner, refund_amount, bought) {
    var former_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});

    if (former_winner == undefined)
        return undefined;

    addFunds(former_winner._id, refund_amount);

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
            var alert_object = {
                'user_id' : former_winner._id,
                'message' : message,
                'link' : '/',
                'icon' : 'fa-gavel',
                'sentiment' : "bad",
                'time' : moment()
            };

            alerts.insert(alert_object);
        }

        else {
            var message = "Someone has outbid you on one of your watched items: " + auction_object.item_data.title + " by " + auction_object.item_data.artist;
            var alert_object = {
                'user_id' : former_winner._id,
                'message' : message,
                'link' : '/',
                'icon' : 'fa-gavel',
                'sentiment' : "bad",
                'time' : moment()
            };

            alerts.insert(alert_object);
        }
    }

    else return undefined;
}

var removeAuction = function(auction_id) {
    auctions.remove(auction_id);
    Meteor.users.update({'profile.auction_data.winning': {$in: [auction_id]}}, {$pull: {'profile.auction_data.winning': auction_id}});
    Meteor.users.update({'profile.auction_data.watching': {$in: [auction_id]}}, {$pull: {'profile.auction_data.watching': auction_id}}, {multi: true});
}

Meteor.methods({
    'placeBid': function(auction_id, amount) {
        var auction_object = auctions.findOne(auction_id);

        if (auction_object == undefined || amount < auction_object.min_bid)
            return;

        var current_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});
        var bidder_is_winner = current_winner && current_winner._id == Meteor.userId();

        var available_balance = bidder_is_winner ? Meteor.user().profile.bank_balance + auction_object.highest_bid : Meteor.user().profile.bank_balance;

        if (amount > available_balance)
            return;

        if (amount >= auction_object.buy_now && auction_object.buy_now != -1) {
            items.update({'_id': auction_object.item_id}, {$set: {'status' : 'claimed', 'owner': Meteor.userId(), 'tags': []}}, function(error) {
                refundWinner(auction_object, Meteor.userId(), auction_object.highest_bid, true);
                chargeAccount(Meteor.userId(), auction_object.buy_now);
                var seller_id = Meteor.users.findOne({'profile.screen_name': auction_object.seller})._id;
                if (auction_object.seller != "Artfunkel, Inc.") {
                    var message = "Someone has purchased " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " for $" + getCommaSeparatedValue(auction_object.buy_no);
                    var alert_object = {
                        'user_id' : seller_id,
                        'message' : message,
                        'link' : '/',
                        'icon' : 'fa-gavel',
                        'sentiment' : "good",
                        'time' : moment()
                    };

                    alerts.insert(alert_object);

                    removeAuction(auction_id);
                    addFunds(seller_id, auction_object.buy_now);
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
                Meteor.users.update(Meteor.userId(), {$push: {'profile.auction_data.winning': auction_id}});
            });

            chargeAccount(Meteor.userId(), amount);
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

        Meteor.users.update({'_id': Meteor.userId(), 'profile.auction_data.watching': {$nin: [auction_id]}}, {$push: {'profile.auction_data.watching': auction_id}});

        if (moment(auction_object.expiration) - moment() < 10000)
            auctions.update(auction_object._id, {$set: {'expiration': moment().add(10, 'seconds')._d.toISOString()}});
    },

    'getAuctionInfo': function(auction_id) {
        var current_winner = Meteor.users.findOne({'_id': Meteor.userId(), 'profile.auction_data.winning': {$in: [auction_id]}}) != undefined;
        var auction_object = auctions.findOne(auction_id);

        if (!current_winner)
            auction_object.highest_bid = undefined;

        return auction_object; 
    }
})
