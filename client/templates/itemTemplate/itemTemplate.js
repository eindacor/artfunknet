var div_size_tracker = new Tracker.Dependency;
var card_container_width;
var card_container_height;

Template.itemInfo.rendered = function() {
	if ($('.card-container').length != 0) {
		card_container_height = $('.card-container').css('height').replace("px", "");
		card_container_width = $('.card-container').css('width').replace("px", ""); 
		div_size_tracker.changed();
	}
}

Template.itemInfo.helpers({
	'attributeLevel' : function(value) {
		return Math.floor(value * 100);
	},

	'imageSize' : function(width, height) {
		div_size_tracker.depend();

		if ($('.card-container').length != 0) {
			var max_width = card_container_width;
			var max_height = card_container_height;

			var original_ratio = width / height;

			var height_when_width_maxed = max_width / original_ratio;

			if (height_when_width_maxed < max_height) {
				return {
					'image_width': Math.floor(original_ratio * max_height),
					'image_height': max_height
				}
			}

			else return {
				'image_width': max_width,
				'image_height': max_width / original_ratio
			} 
		}

		else return {
			'image_width': 20,
			'image_height': 20
		}
	},

	'time_remaining': function(display_object) {
		if (display_object.status == 'displayed') {
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
				display_object.status == 'claimed';
		}

		else return false;
	},

	'can_auction' : function(display_object) {
		if (Meteor.userId()) {
			return items.find({'owner' : Meteor.userId(), 'status' : 'auctioned'}).count() < Meteor.user().profile.auction_cap &&
				display_object.status == 'claimed';
		}

		else return false;
	},

	'can_reroll_sell_permanent' : function(display_object) {
		return display_object.status == 'claimed';
	}
})

Template.itemInfo.events({
	'mouseover .item-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_id;
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_description;
		var hover_string = "level " + value + " " + description;
		setFootnote(hover_string, Math.floor(Math.random() * 1000));
	},

	'click .quick-sell.enabled' : function(element) {
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('quickSellModal');
	},

	'click .auction.enabled' : function(element) {
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('createAuctionModal');
	},

	'click .display.enabled' : function(element, template) {
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('onDisplayModal');
	},

	'click #toggle-view' : function() {
		Session.set('list_view', !Session.get('list_view'));
	},

	'click .preview.enabled' : function(element) {
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('fullViewModal');
	},

	'click .reroll.enabled' : function(element) {
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('rerollModal');
	},

	'click .perm-collection.inactive' : function(element) {
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Meteor.call('setItemPermanentCollectionStatus' , item_id, true, function(error) {
			if (error)
				console.log(error.message)
		})
	},

	'click .perm-collection.active' : function(element) {
		var item_id = $(element.target).closest('.card-container').data('item_id');
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

Template.itemThumbnail.helpers({
	'imageInfo' : function(item_id) {
		try {
			var item_object = items.findOne(item_id);
			var artwork_object = artworks.findOne(item_object.artwork_id);

			var overall_dimension = 210;
			var max_dimension = 200;

			var width = artwork_object.width;
			var height = artwork_object.height;
			var ratio = width / height;

			var info_object = {
				'item_id' : item_id,
				'image_width' : 0,
				'image_height' : 0,
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

			info_object.padding_top = Math.floor((overall_dimension - info_object.image_height) / 2);

			return info_object;
		}

		catch(error) {
			return {
				'item_id' : "",
				'image_width' : 0,
				'image_height' : 0,
				'imageURL' : "",
				'padding_top' : 0,
			};
		}
	},


})

Template.itemThumbnail.events({
	'click .image-thumb' : function(element) {
		var item_id = $(element.target).data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('fullViewModal');
	},
})