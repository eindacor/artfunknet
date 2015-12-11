//	HEADERS
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
	'header' : function(table_data) {
		var header_array = [
			{ 'text' : 'view', 'sort_id' : undefined, 'table_id' : table_data.table_id  },
			{ 'text' : 'remaining', 'sort_id' : 'expiration', 'table_id' : table_data.table_id  },
			{ 'text' : 'title', 'sort_id' : 'title', 'table_id' : table_data.table_id  },
			{ 'text' : 'date', 'sort_id' : 'date', 'table_id' : table_data.table_id  },
			{ 'text' : 'artist', 'sort_id' : 'artist', 'table_id' : table_data.table_id  },
			{ 'text' : 'rarity', 'sort_id' : 'rarity_rank', 'table_id' : table_data.table_id  },
			// { 'text' : 'dimensions', 'sort_id' : undefined, 'table_id' : table_data.table_id  },
			{ 'text' : 'condition', 'sort_id' : 'condition', 'table_id' : table_data.table_id  },
			{ 'text' : 'features', 'sort_id' : 'feature_count', 'table_id' : table_data.table_id  },
			{ 'text' : 'xp rating', 'sort_id' : 'xp_rating', 'table_id' : table_data.table_id  },
			{ 'text' : 'roll count', 'sort_id' : 'roll_count', 'table_id' : table_data.table_id  },
			{ 'text' : 'current bid', 'sort_id' : 'current_price', 'table_id' : table_data.table_id  },
			{ 'text' : 'buy now', 'sort_id' : 'buy_now', 'table_id' : table_data.table_id  },
			{ 'text' : 'actions', 'sort_id' : undefined, 'table_id' : table_data.table_id  },
			{ 'text' : 'seller', 'sort_id' : 'seller', 'table_id' : table_data.table_id }
		];

		return header_array;
	},

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
			var item_object = items.findOne({'_id': auction_object.item_id});
			var bids = auction_object.bid_history.length;
			var winning_id = (bids > 0 ? auction_object.bid_history[bids - 1].user_id : undefined);
			var has_bid = false;

			for (var n=0; n < auction_object.bid_history.length; n++) {
				if (auction_object.bid_history[n].user_id == Meteor.userId()) {
					has_bid = true;
					break;
				}
			}

			var displayed_attributes = [];
			for(var i=0; i < item_object.attributes.length; i++) {
				if (item_object.attributes[i].type == 'primary')
					displayed_attributes.push(item_object.attributes[i]);
			}

			list_object.condition_text = Math.floor((item_object.condition * 100)) + '%';
			list_object.biddable = 
				Meteor.userId() && 
				(item_object.owner != Meteor.userId()) && 
				(auction_object.bid_minimum <= Meteor.user().profile.bank_balance) && 
				items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale']}}).count() < Meteor.user().profile.inventory_cap;
			list_object.buy_now_text = auction_object.buy_now == -1 ? "-" : "$" + getCommaSeparatedValue(auction_object.buy_now);
			list_object.has_history = auction_object.bid_history.length > 0;
			list_object.winning = (winning_id == Meteor.userId()) && Meteor.userId();
			list_object.losing = (winning_id != Meteor.userId() && winning_id && has_bid);
			list_object.owned = items.find({'owner': Meteor.userId(), 'artwork_id': item_object.artwork_id}).count() > 0;
			list_object.attribute = displayed_attributes;
			list_object.xp_rating_text = Math.floor(item_object.xp_rating * 100);
			list_object.artwork_id = item_object.artwork_id;

			return list_object;
		}

		catch(error) {
			return {};
		}
	},

	'isBiddable' : function(list_object) {
		return list_object.biddable && list_object.expiration > Session.get('now');
	},

	'attributeColor' : function(value) {
		return 255 - Math.floor(value * 255);
	},

	'thumbnailInfo' : function(item_id) {
		try {
			var item_object = items.findOne(item_id);
			var auction_object = auctions.findOne({'item_id' : item_id}); 
			var biddable = 
				Meteor.userId() && 
				(item_object.owner != Meteor.userId()) && 
				(auction_object.bid_minimum <= Meteor.user().profile.bank_balance) && 
				items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale']}}).count() < Meteor.user().profile.inventory_cap;

			var max_dimension = 40;

			var width = item_object.artwork_data.width;
			var height = item_object.artwork_data.height;
			var ratio = width / height;

			var info_object = {
				'image_width' : 0,
				'image_height' : 0,
				'biddable' : biddable,
				'filename' : item_object.artwork_data.filename,
			};

			if (width > height) {
				info_object.image_width = max_dimension;
				info_object.image_height = Math.floor(max_dimension / ratio);
			}

			else {
				info_object.image_height = max_dimension;
				info_object.image_width = Math.floor(max_dimension * ratio);
			}

			return info_object;
		}

		catch(error) {
			return {
				'image_width' : 0,
				'image_height' : 0,
				'biddable' : false,
				'filename' : ""
			};
		}
	},

	'full' : function() {
		if (Meteor.userId())
			return items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale']}}).count() >= Meteor.user().profile.inventory_cap;

		else return false;
	},

	'isQuestItem' : function(artwork_id) {
		return quests.findOne({'owner_id': Meteor.userId(), 'target': {$in: [artwork_id]}}) != undefined;
	}
});

Template.auctionTable.events({
	'click .place-bid.enabled' : function(element) {
		var auction_id = $(element.target).closest('tr').data('auction_id');
		Session.set('selectedAuction', auction_id);
		Modal.show('placeBidModal');
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
