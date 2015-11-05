Template.inventory.helpers({
	'owned': function() {	
		return items.find({'owner': Meteor.userId(), 'status': {$in : ['claimed', 'displayed', 'permanent']}}, {sort: {'aftwork_id' : 1}}).fetch();
	},
	
	'onDisplay' : function(item_id) {
		var item_object = items.findOne(item_id);
		return item_object && item_object.status == 'displayed';
	},

	'permanent' : function(item_id) {
		var item_object = items.findOne(item_id);
		return item_object && item_object.status == 'permanent';
	},

	'time_remaining': function(item_id) {
		var item_object = items.findOne(item_id);

		if (item_object.status == 'displayed') {
			var expiration = moment(item_object.display_details.end);
			var now = moment(Session.get('now'));
			var remaining = expiration - now;

			var remaining_text = remaining > 0 ? getCountdownString(remaining) : "expired";
			return remaining_text;
		}

		else return "";
	},

	'can_display' : function(display_object) {
		if (Meteor.userId()) {
			return items.find({'owner' : Meteor.userId(), 'status' : 'displayed'}).count() < Meteor.user().profile.display_cap && 
				items.find({'owner' : Meteor.userId(), 'status' : 'displayed', 'artwork_id' : display_object.artwork_id}).count() == 0 &&
				display_object.status != 'permanent';
		}

		else return false;
	},

	'can_auction' : function(display_object) {
		if (Meteor.userId()) {
			return items.find({'owner' : Meteor.userId(), 'status' : 'auctioned'}).count() < Meteor.user().profile.auction_cap &&
				display_object.status != 'permanent';
		}

		else return false;
	},

	'can_reroll' : function(display_object) {
		return display_object.status != 'permanent';
	},

	'can_sell' : function(display_object) {
		return display_object.status != 'permanent';
	},

	'can_permanent' : function(display_object) {
		return items.find({'owner' : Meteor.userId(), 'status' : 'permanent'}).count() < Meteor.user().profile.pc_cap ||
			display_object.status == 'permanent';
	},

	'list_view' : function() {
		return Session.get('list_view');
	},

	'listHeader' : function() {
		var header_array = [
			{ 'text' : 'view', 'sort_id' : undefined },
			{ 'text' : 'title', 'sort_id' : 'title' },
			{ 'text' : 'date', 'sort_id' : 'date' },
			{ 'text' : 'artist', 'sort_id' : 'artist' },
			{ 'text' : 'rarity', 'sort_id' : 'rarity_rank' },
			{ 'text' : 'estimated value', 'sort_id' : 'estimated_value' },
			{ 'text' : 'dimensions', 'sort_id' : undefined },
			{ 'text' : 'condition', 'sort_id' : 'condition' },
			{ 'text' : 'features', 'sort_id' : 'feature_count' },
			{ 'text' : 'xp rating', 'sort_id' : 'xp_rating' },
			{ 'text' : 'reroll count', 'sort_id' : 'roll_count' },
			{ 'text' : 'actions', 'sort_id' : undefined },
		];

		return header_array;
	},

	'sortHeader' : function() {
		var header_array = [
			{ 'text' : 'title', 'sort_id' : 'title' },
			{ 'text' : 'date', 'sort_id' : 'date' },
			{ 'text' : 'artist', 'sort_id' : 'artist' },
			{ 'text' : 'rarity', 'sort_id' : 'rarity_rank' },
			{ 'text' : 'estimated value', 'sort_id' : 'estimated_value' },
			{ 'text' : 'condition', 'sort_id' : 'condition' },
			{ 'text' : 'features', 'sort_id' : 'feature_count' },
			{ 'text' : 'xp rating', 'sort_id' : 'xp_rating' },
		];

		return header_array;
	},

	'thumbnailInfo' : function(item_id) {
		try {
			var item_object = items.findOne(item_id);
			var artwork_object = artworks.findOne(item_object.artwork_id);
			var auction_object = auctions.findOne({'item_id' : item_id}); 
			var biddable = (item_object.owner != Meteor.userId()) && (auction_object.bid_minimum <= Meteor.user().profile.bank_balance);

			var max_dimension = 40;

			var width = artwork_object.width;
			var height = artwork_object.height;
			var ratio = width / height;

			var info_object = {
				'image_width' : 0,
				'image_height' : 0,
				'biddable' : biddable,
				'filename' : artwork_object.filename,
				'imageURL' : artwork_object.img_link == "" ? "http://go-grafix.com/data/wallpapers/35/painting-626297-1920x1080-hq-dsk-wallpapers.jpg" : artwork_object.img_link
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
			console.log(error.message);
			return {
				'image_width' : 0,
				'image_height' : 0,
				'biddable' : false,
				'filename' : ""
			};
		}
	},

	'valueColor' : function(value) {
		return 255 - Math.floor(value * 255);
	},
})

Template.inventory.events ({
	'click .quick-sell.enabled' : function(element) {
		var item_id = $(element.target).data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('quickSellModal');
	},

	'click .auction.enabled' : function(element) {
		var item_id = $(element.target).data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('createAuctionModal');
	},

	'click .display.enabled' : function(element, template) {
		var item_id = $(element.target).data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('onDisplayModal');
	},

	'click #toggle-view' : function() {
		Session.set('list_view', !Session.get('list_view'));
	},

	'click .preview.enabled' : function(element) {
		var item_id = $(element.target).closest('tr').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('fullViewModal');
	},

	'click .reroll.enabled' : function(element) {
		var item_id = $(element.target).data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('rerollModal');
	},

	'click .perm-collection.inactive' : function(element) {
		var item_id = $(element.target).data('item_id');
		Meteor.call('setItemPermanentCollectionStatus' , item_id, true, function(error) {
			if (error)
				console.log(error.message)
		})
	},

	'click .perm-collection.active' : function(element) {
		var item_id = $(element.target).data('item_id');
		Meteor.call('setItemPermanentCollectionStatus' , item_id, false, function(error) {
			if (error)
				console.log(error.message)
		})
	},

	'mouseover .list-item-attribute' : function(element) {
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_title;
		setFootnote("level " + value + " " + description, Math.floor(Math.random() * 100000));
	},

	'mouseover .quick-sell' : function(event) {
		var enabled = $(event.target).closest('span.quick-sell').hasClass("enabled");
		var footnote_string = "sell artwork" + (enabled ? "" : " (unavailable)");
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
	},

	'mouseover .auction' : function(event) {
		var enabled = $(event.target).closest('span.auction').hasClass("enabled");
		var footnote_string = "auction artwork" + (enabled ? "" : " (unavailable)");
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
	},

	'mouseover .display' : function(event) {
		var enabled = $(event.target).closest('span.display').hasClass("enabled");
		var footnote_string = "display artwork" + (enabled ? "" : " (unavailable)");
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
	},

	'mouseover .reroll' : function(event) {
		var enabled = $(event.target).closest('span.reroll').hasClass("enabled");
		var footnote_string = "reroll attribute values" + (enabled ? "" : " (unavailable)");
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
	},

	'mouseover .perm-collection' : function(event) {
		var active = $(event.target).closest('span.perm-collection').hasClass("active");
		var footnote_string = active ? "remove from permanent collection" : "add to permanent collection";
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
	},

})

Template.inventory.created = function() {
	Session.set('inventory_sort', 'title');
	Session.set('inventory_ascending', true);
	Session.set('list_view', false);
	this.handle = Meteor.setInterval((function() {
		var now = moment();
		Session.set('now', now.toISOString());
	}), 1000);
}

Template.inventory.rendered = function() {
	Blaze.getData($('.template-inventory')[0])["value_data"] = {};
}

Template.inventory.destroyed = function() {
	Meteor.clearInterval(this.handle);
}

//	HEADERS
Template.inventoryHeaderTemplate.events({
	'click th': function(element) {
		var sort = $(element.target).closest('.table-header').data('sort');

		if (sort && Session.get('inventory_sort')) {
			var ascending = (Session.get('inventory_sort') != sort ? true : !Session.get('inventory_ascending'));
			Session.set('inventory_ascending', ascending);
			Session.set('inventory_sort', sort);
		}
	}
})

Template.inventoryHeaderTemplate.helpers({
	'sorted' : function() {
		var table_id = this.table_id;
		return {
			'sort' : Session.get('inventory_sort') == this.sort_id,
			'ascending' : Session.get('inventory_ascending')
		}
	}
})