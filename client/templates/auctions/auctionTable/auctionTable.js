var sought_item_tracker = new Tracker.Dependency;
var already_winning_tracker = new Tracker.Dependency;
var details_tracker = new Tracker.Dependency;
var sought_items = {};
var already_winning = {};
var hide_details = false;

var biddable_rarities = ["common"];

var getAuctionPreviewItemObject = function(auction_id) {
	Meteor.call('getAuctionPreviewItemObject', auction_id, function(error, result) {
		if (error)
			console.log(error.message);

		else {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "fullViewModal", 
				'modal_data': {
					'item_id': result._id
				}
			}, $('body')[0]);
		}
	})
}

var getSoughtStatus = function(artwork_id) {
	Meteor.call('getSoughtStatus', artwork_id, false, function(error, result) {
		if (error)
			console.log(error.message)

		else {
			sought_items[artwork_id] = result;
			sought_item_tracker.changed();
		}
	})
}

var getAlreadyWinning = function(auction_id) {
	Meteor.call('getAlreadyWinningElsewhere', auction_id, function(error, result) {
		if (error)
			console.log(error.message)

		else {
			already_winning[auction_id] = result;
			already_winning_tracker.changed();
		}
	})
}

//	AUCTION TABLE
Template.auctionTable.helpers({
	'time_remaining': function(expiration_date) {
		var expiration = moment(expiration_date);
		var now = moment(Session.get('now'));
		var remaining = expiration - now;

		var remaining_text = remaining > 0 ? getCountdownString(remaining) : "expired";

		return {
			'remaining': remaining_text,
			'soon' : remaining < 10000
		}
	},

	'current_bid' : function(auction_id) {
		var auction_object = auctions.findOne(auction_id);
		if (auction_object)
			return "$" + getCommaSeparatedValue(auction_object.current_price);

		else return "";
	},

	/*
	var indicator_count = 0;
	var artwork_interface = new ArtworkIF(getOneFromCollection("ItemTemplate.js:archive_indicator", artworks, {'_id': player_item_interface.getItemIF().getItemObject().artwork_id}));
	for (var i=0; i<ARCHIVE_CATEGORIES.length; i++) {
		if (player_item_interface.getPlayerIF().hasArchivedArtworkOfCategory(artwork_interface, ARCHIVE_CATEGORIES[i])) {
			$archive_indicators.append($('<i class="check ' + ARCHIVE_CATEGORIES[i] + '-text fa fa-archive"></i>'));
			indicator_count++;
		}
	}

	if (indicator_count > 0) {
		$container.append($archive_indicators);
	}
	*/

	'auction_info' : function(auction_object) {
		Session.get('refresh_auctions');
		try {
			var list_object = auction_object;

			var bidder_interface = new PlayerIF(Meteor.user());
			var bidder_object = bidder_interface.getUserObject();

			list_object.expiration = auction_object.expiration;
			var has_auctioneer = bidder_object.profile.market_expert.expiration > moment()._d.toISOString();

			var auctions_maxed = bidder_object.profile.auction_data.winning.length >= Math.floor(bidder_object.profile.auction_cap * (has_auctioneer ? 1.5 : 1));
			var currently_winning = bidder_object.profile.auction_data.winning.indexOf(auction_object._id) != -1;
			var inventory_full = bidder_interface.inventoryIsFull();
			var item_is_original = auction_object.item_data.original;

			var available_balance = currently_winning ? bidder_object.profile.bank_balance + auction_object.current_bid : bidder_object.profile.bank_balance;
			var funds_available = auction_object.min_bid <= available_balance;
			var bidding_start = moment(auction_object.date_posted).add(BID_FREEZE_DURATION, 'milliseconds');
			var now = moment();
			
			var biddable = true;
			var reason = undefined;

			if (Meteor.userId() == undefined)
				biddable = false;

			else if (auction_object.viewer == "public" && biddable_rarities.indexOf(auction_object.item_data.rarity) == -1) {
				biddable = false;
				reason = "insufficient player level";
			}

			else if (auction_object.seller == Meteor.user().profile.screen_name) {
				biddable = false;
				reason = "you are the seller";
			}

			else if (!funds_available && !currently_winning) {
				biddable = false;
				reason = "insufficient funds";
			}

			else if (auctions_maxed && !currently_winning) {
				biddable = false;
				reason = "auction limit met";
			}

			else if (inventory_full && !item_is_original) {
				biddable = false;
				reason = "inventory full";
			}

			else if (auction_object.buy_now != -1 && bidding_start > now) {
				biddable = false;
				var hours = bidding_start._d.getHours();
				var pm_string = hours > 12 ? "pm" : "am";
				var hours_string;

				if (hours == 0) {
					hours_string = 12;
				}

				else if (hours > 12) {
					hours_string = hours - 12;
				}

				else hours_string = hours;

				var minutes = bidding_start._d.getMinutes();
				var minutes_string = minutes < 10 ? "0" + minutes : minutes;
				var time_string = hours_string + ":" + minutes_string + pm_string;
				reason = "bidding starts at " + time_string;
			}

			list_object.bid_status = {
				'biddable': biddable,
				'reason': reason
			};

			list_object.attributes = auction_object.item_data.attributes;
			list_object.artwork_id = auction_object.item_data.artwork_id;
			list_object.artwork_data = auction_object.item_data.artwork_data;
			list_object.buy_now_text = auction_object.buy_now == -1 ? "-" : "$" + getCommaSeparatedValue(auction_object.buy_now);

			return list_object;
		}

		catch(error) {
			console.log(error.message);
			return {};
		}
	},

	'isBiddable' : function(list_object) {
		return list_object.bid_status.biddable && list_object.expiration > moment()._d.toISOString();
	},

	'isQuestItem' : function(artwork_id) {
		return quests.findOne({'owner_id': Meteor.userId(), 'target': {$in: [artwork_id]}}) != undefined;
	},

	'isSought' : function(artwork_id) {
		sought_item_tracker.depend();
		if (sought_items[artwork_id] == undefined) {
			getSoughtStatus(artwork_id);
		}

		else return sought_items[artwork_id];
	},

	'isAlreadyWinning': function(auction_id) {
		already_winning_tracker.depend();
		if (already_winning[auction_id] == undefined) {
			getAlreadyWinning(auction_id);
		}

		else return already_winning[auction_id];
	},

	'hideDetails': function() {
		details_tracker.depend();
		return hide_details;
	},

	'minBid': function(auction_id) {
		var auction_object = auctions.findOne(auction_id);
		if (auction_object)
			return getCommaSeparatedValue(auction_object.min_bid);

		else return "-";
	},

	'isWinning': function(auction_id) {
		return Meteor.user().profile.auction_data.winning.indexOf(auction_id) != -1;
	},

	'isLosing': function(auction_id) {
		return Meteor.user().profile.auction_data.winning.indexOf(auction_id) == -1 && Meteor.user().profile.auction_data.watching.indexOf(auction_id) != -1;;
	},

	'linkSeller': function(seller) {
		return seller != BOT_USER_NAME;
	},

	'rollCount': function(roll_count) {
		return roll_count !== undefined;
	},

	'refresh_auction_details': function() {
		if (Session.get('toggle_auction_details', true)) {
			hide_details = !hide_details;
			details_tracker.changed();
			Session.set('toggle_auction_details', undefined);
		}
	},

	'sortedAttributes' : function(attributes) {
		if (attributes == undefined || attributes.length == undefined)
			return [];
		
		attributes.sort(function(first, second) {
	        if (first.description > second.description)
	            return 1;

	        else return -1;
	    });

	    return attributes;
	},
});

Template.auctionTable.events({
	'click .place-bid-hidden, click .place-bid' : function(element) {
		var auction_id = $(element.target).data('auction_id');

		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "placeBidModal", 
			'modal_data': {
				'auction_id': auction_id
			}
		}, $('body')[0]);
	},

	'click .view-history.enabled' : function(element) {
		var auction_id = $(element.target).closest('tr').data('auction_id');
		Session.set('selectedAuction', auction_id);
		Modal.show('auctionHistoryModal');
	},

	'click .auction-thumb' : function(element) {
		var auction_id = $(element.target).data('auction_id');
		getAuctionPreviewItemObject(auction_id);		
	},

	'click .item-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_title;
	},

	'mouseover .item-attribute' : function(element) {
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_title;
		setFootnote("level " + (isNaN(value) ? '?' : value) + " " + description, Math.floor(Math.random() * 100000));
	},

	'click #toggle-details' : function() {
		Session.set('toggle_auction_details', true);
	},

	'click #refresh-auctions': function() {
		sought_items = {};
		already_winning = {};
		Session.set('refresh_auctions', true);
	}
})

Template.auctionTable.created = function() {
	this.handle = Meteor.setInterval((function() {
		var now = moment();
		Session.set('now', now._d.toISOString());
	}), 1000);
}

Template.auctionTable.destroyed = function() {
	Meteor.clearInterval(this.handle);
}

Template.auctionTable.rendered = function() {
	sought_items = {};
	already_winning = {};
	biddable_rarities = ["common"];

	var player_level = Meteor.user().profile.level;
	if (player_level >= 20)
		biddable_rarities.push("uncommon");

	if (player_level >= 30)
		biddable_rarities.push("rare");

	if (player_level >= 40)
		biddable_rarities.push("legendary");

	if (player_level >= 50)
		biddable_rarities.push("masterpiece");
}
