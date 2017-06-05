var auction_info_tracker = new Tracker.Dependency;
var auction_error_tracker = new Tracker.Dependency;
var auction_object;
var available_balance = undefined;
var auction_errors = [];

Template.placeBidModal.rendered = function() {
	$('.errors').hide();
    auction_errors = [];

    Meteor.call('getAuctionInfo', this.data.auction_id, function(error, result) {
        if (error)
            console.log(error.message)

        else {
            auction_object = result;
            
            if (Meteor.user().profile.auction_data.winning.indexOf(auction_object._id) != -1)
                available_balance = auction_object.current_bid + Meteor.user().profile.bank_balance;

            else available_balance = Meteor.user().profile.bank_balance;

            auction_info_tracker.changed();
        }
    })
}

Template.placeBidModal.helpers({
	'auctionData' : function() {
        auction_info_tracker.depend();
        return auction_object;
	},

	'error' : function() {
        auction_error_tracker.depend();
		return auction_errors;
	},

	'canBuy' : function() {
        auction_info_tracker.depend();
		return auction_object && auction_object.buy_now != -1 && available_balance >= auction_object.buy_now && Meteor.user().profile.screen_name != auction_object.seller;
	},

    'available_balance': function() {
        auction_info_tracker.depend();
        return getCommaSeparatedValue(available_balance);
    },

    'currently_winning': function() {
        auction_info_tracker.depend();
        return auction_object && Meteor.user().profile.auction_data.winning.indexOf(auction_object._id) != -1;
    }
})

var placeBid = function(template) {
    auction_errors = [];

    if (auction_object) {
        var bid_amount = getAmountFromInput(template.find('#bid-amount').value);
        var currently_winning = Meteor.users.findOne({'_id': Meteor.userId(), 'profile.auction_data.winning': {$in: [auction_object._id]}}) != undefined;

        if (! !!auction_object) 
            auction_errors.push("auction not found");

        if (bid_amount < auction_object.min_bid)
            auction_errors.push("bid must be at least $" + getCommaSeparatedValue(auction_object.min_bid));

        if (bid_amount > available_balance)
            auction_errors.push("bid amount exceeds available funds");

        if (auction_errors.length == 0) {
            Meteor.call('placeBid', auction_object.item_id, bid_amount, function(error) {
                if (error) 
                    console.log(error.message);

                else {
                    Session.set("refreshAuctions", true);
                    $('.template-modalTemplate').remove();
                }
            }); 
        }

        else auction_error_tracker.changed();
    }
}

Template.placeBidModal.events({
    'click #ok-modal': function(event, template) {
    	placeBid(template);
    },

    'keydown #bid-amount': function(event, template) {
        if (event.key == "Enter") {
            event.preventDefault();

            placeBid(template);
        }
    }, 

    'click #bid-minimum' : function(event, template) {
        auction_errors = [];

        if (auction_object) {
            if (auction_object.min_bid > available_balance)
                auction_errors.push("bid amount exceeds available funds");

            if (auction_errors.length == 0) {
                Meteor.call('placeBid', auction_object.item_id, auction_object.min_bid, function(error) {
                    if (error)
                        console.log(error.message);

                    else {
                        Session.set("refresh_auctions", true);
                        $('.template-modalTemplate').remove();
                    }
                });
            }

            else auction_error_tracker.changed();
        }
    },

    'click #buy-now' : function(event, template) {
        auction_errors = [];

        if (auction_object) {
            console.log(auction_object);
            if (auction_object.buy_now == -1) 
                auction_errors.push("this item cannot be purchased");

            if (auction_object.buy_now > available_balance)
                auction_errors.push("bid amount exceeds available funds");

            if (auction_errors.length == 0) {
                Meteor.call('placeBid', auction_object.item_id, auction_object.buy_now, function(error) {
                    if (error)
                        console.log(error.message);

                    else {
                        Session.set("refreshAuctions", true);
                        $('.template-modalTemplate').remove();
                    }
                });
            }
        }
    },
})