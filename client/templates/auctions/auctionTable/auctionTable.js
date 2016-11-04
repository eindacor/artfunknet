var sought_item_tracker = new Tracker.Dependency;
var details_tracker = new Tracker.Dependency;
var sought_items = {};
var hide_details = true;

var getSoughtStatus = function(artwork_id) {
	Meteor.call('getSoughtStatus', artwork_id, function(error, result) {
		if (error)
			console.log(error.message)

		else {
			sought_items[artwork_id] = result;
			sought_item_tracker.changed();
		}
	})
}

Template.headerTemplate.events({
	'click th': function(element) {
		var sort = $(element.target).closest('.table-header').data('sort');
		var table_id = $(element.target).closest('.auction-table').data('table_id');

		if (sort && Session.get(table_id + '_sort')) {
			var ascending = (Session.get(table_id + '_sort') != sort ? true : !Session.get(table_id + '_ascending'));
			Session.set(table_id + '_ascending', ascending);
			Session.set(table_id + '_sort', sort);
		}
	}
})

Template.headerTemplate.helpers({
	'sorted' : function() {
		var table_id = this.table_id;
		return {
			'sort' : Session.get(table_id + '_sort') == this.sort_id,
			'ascending' : Session.get(table_id + '_ascending')
		}
	}
})

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

	'auction_info' : function(auction_object) {
		try {
			var list_object = auction_object;

			list_object.expiration = auction_object.expiration;
			var funds_available = auction_object.min_bid <= Meteor.user().profile.bank_balance || Meteor.users.findOne({'_id': Meteor.userId(), 'profile.auction_data.winning': {$in: [auction_object._id]}}) != undefined;
			
			list_object.biddable = 
				Meteor.userId() && 
				(auction_object.seller != Meteor.user().profile.screen_name) && 
				funds_available && 
				items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale']}}).count() < Meteor.user().profile.inventory_cap;

			list_object.owned = items.findOne({'owner': Meteor.userId(), 'artwork_id': auction_object.item_data.artwork_id, 'status': {$nin: ['unclaimed', 'for_sale']}}) != undefined;
			list_object.attribute = auction_object.item_data.attributes;
			list_object.artwork_id = auction_object.item_data.artwork_id;
			list_object.buy_now_text = auction_object.buy_now == -1 ? "-" : "$" + getCommaSeparatedValue(auction_object.buy_now);

			return list_object;
		}

		catch(error) {
			console.log(error.message);
			return {};
		}
	},

	'isBiddable' : function(list_object) {
		return list_object.biddable && list_object.expiration > moment()._d.toISOString();
	},

	'attributeColor' : function(value) {
		return 255 - Math.floor(value * 255);
	},

	'thumbnailFilename' : function(artwork_id) {
		try {
			return artworks.findOne(artwork_id).filename;
		}

		catch(error) {
			console.log(error.message);
		}
	},

	'full' : function() {
		if (Meteor.userId())
			return items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale']}}).count() >= Meteor.user().profile.inventory_cap;

		else return false;
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

	'hideDetails': function() {
		details_tracker.depend();
		return hide_details;
	},

	'isWinning': function(auction_id) {
		return Meteor.user().profile.auction_data.winning.indexOf(auction_id) != -1;
	},

	'isLosing': function(auction_id) {
		return Meteor.user().profile.auction_data.winning.indexOf(auction_id) == -1 && Meteor.user().profile.auction_data.watching.indexOf(auction_id) != -1;;
	},

	'linkSeller': function(seller) {
		return seller != "Artfunkel, Inc.";
	},

	'rollCount': function(roll_count) {
		return roll_count !== undefined;
	}
});

Template.auctionTable.events({
	'click .place-bid-hidden, click .place-bid' : function(element) {
		var auction_id = $(element.target).data('auction_id');
		console.log(auction_id);

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

	'click .preview.enabled' : function(element) {
		var auction_id = $(element.target).closest('tr').data('auction_id');
		var item_id = auctions.findOne(auction_id).item_id;
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "fullViewModal", 
			'modal_data': {
				'item_data': items.findOne(item_id)
			}
		}, $('body')[0]);
	},

	'click .item-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_title;
		console.log(attribute_id);
	},

	'mouseover .item-attribute' : function(element) {
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_title;
		setFootnote("level " + value + " " + description, Math.floor(Math.random() * 100000));
	},

	'click #toggle-details' : function() {
		hide_details = !hide_details;
		details_tracker.changed();
	},

	'click #refresh-auctions': function() {
		sought_items = {};
		sought_item_tracker.changed();
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
}
