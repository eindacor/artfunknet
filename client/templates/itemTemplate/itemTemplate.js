var div_size_tracker = new Tracker.Dependency;
var sought_tracker = new Tracker.Dependency;
var card_container_width;
var card_container_height;
var sought_status = {};

var updateSoughtStatus = function(artwork_id) {
	Meteor.call('getSoughtStatus', artwork_id, true, function(error, result) {
		if (error)
			console.log(error.message)

		else if (result !== undefined) {
			sought_status[artwork_id] = result;
			sought_tracker.changed();
		}
	});
}

Template.itemInfo.rendered = function() {
	if ($('.card-container').length != 0) {
		card_container_height = $('.card-container').css('height').replace("px", "");
		card_container_width = $('.card-container').css('width').replace("px", ""); 
		div_size_tracker.changed();
	}

	sought_status = {};
}

Template.itemInfo.helpers({
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

	'display_time_remaining': function(item_object) {
		var expiration = moment(item_object.display_details.end);
		var now = moment(Session.get('now'));
		var remaining = expiration - now;

		var remaining_text = remaining > 0 ? getCountdownString(remaining) : "expired";
		return remaining_text;
	},

	'auction_time_remaining': function(item_object) {
		var auction_object = auctions.findOne({'item_id': item_object._id});

		if (auction_object) {
			var expiration = moment(auction_object.expiration);
			var now = moment(Session.get('now'));
			var remaining = expiration - now;

			var remaining_text = remaining > 0 ? getCountdownString(remaining) : "expired";
			return remaining_text;
		}

		else return "expired";
	},

	'sortedAttributes' : function(attributes) {
		if (attributes.length == undefined)
			return [];
		
		attributes.sort(function(first, second) {
	        if (first.description > second.description)
	            return 1;

	        else return -1;
	    });

	    return attributes;
	},

	'isQuestItem' : function(artwork_id) {
		return quests.findOne({'owner_id': Meteor.userId(), 'target': {$in: [artwork_id]}}) != undefined;
	},

	'isSought' : function(artwork_id) {
		//TODO move these checks to server to prevent access from client console
		if (Meteor.user().profile.market_expert.expiration > moment()._d.toISOString()) {
			sought_tracker.depend();
			if (sought_status[artwork_id] === undefined) {
				updateSoughtStatus(artwork_id);
				return false;
			}

			else return sought_status[artwork_id];
		}

		else return false;
	},

	'isOwner' : function(owner_id) {
		return Meteor.userId() == owner_id;
	},

	'unique_attribute_data' : function(unique_attribute_code) {
		if (unique_attribute_code)
			return unique_attributes.findOne({'code': unique_attribute_code});

		else return undefined;
	},

	'reroll_unique_enable' : function(item_object) {
		return item_object.status == "displayed" && procUniqueAttribute(Meteor.userId(), "REROLL_DISPLAY_ENABLE", "Designer", true);
	},

	'already_owns': function(item_id) {
		// returns true if the viewer owns a claimed copy of this item, and the item itself is not owned or claimed by the viewer
		var item_object = items.findOne(item_id);

		if (item_object == undefined)
			return false;
		
		var item_belongs_to_other = item_object.owner != Meteor.userId();
		var item_is_unclaimed = items.findOne({'_id': item_id, 'status': {$in: ['unclaimed', 'for_sale', 'won']}}) != undefined;
		var show_already_owns = item_belongs_to_other || item_is_unclaimed;

		if (show_already_owns) {
			var artwork_id = items.findOne(item_id).artwork_id;
			var valid_statuses = ['claimed', 'permanent', 'displayed', 'auctioned'];
			return items.findOne({'owner': Meteor.userId(), 'status': {$in: valid_statuses}, 'artwork_id': artwork_id});
		}

		else return false;
	},

	'showDetails': function(item_data) {
		return item_data.xp_rating != undefined;
	},

	'action_button': function(item_data) {

	}
})

Template.itemInfo.events({
	'click .card-container' : function(element) {
		var target = $(element.target);
		var item_id = target.closest('.card-container').data('item_id');
		//target.closest('.card-container').hasClass('selected') ? target.closest('.card-container').removeClass('selected') : target.closest('.card-container').addClass('selected');
		if ($('.template-modalTemplate').length == 0) {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "fullViewModal", 
				'modal_data': {
					'item_data': items.findOne(item_id)
				}
			}, $('body')[0]);
		}
	},

	'click .auction.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('createAuctionModal');
	},

	'click .display.enabled' : function(element, template) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('onDisplayModal');
	},

	'click .reroll.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('rerollModal');
	},

	'click .perm-collection.inactive' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Meteor.call('setItemPermanentCollectionStatus' , item_id, true, function(error) {
			if (error)
				console.log(error.message)

			else {
				if (Meteor.user().profile.tutorials.gallery && 
					items.findOne({'owner': Meteor.userId(), 'status': "displayed"}) && 
					items.findOne({'owner': Meteor.userId(), 'status': "permanent"})) 
				{
					Blaze.renderWithData(Template.modalTemplate, {
						'modal_name': "tutorialModal", 
						'modal_data': {
							'tutorial_name': "gallery",
							'next': undefined,
							'activate': "my_gallery",
							'image_filename': "tutorial/menu_gallery.png",
							'message': "Now that you have an item on display, and an item in your permanent collection, you can see your items in your gallery. Go there when you're ready, by clicking the 'My Gallery' button in the menu."
						}
					}, $('body')[0]);
				};
			}
		})
	},

	'click .perm-collection.active' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Meteor.call('setItemPermanentCollectionStatus' , item_id, false, function(error) {
			if (error)
				console.log(error.message)
		})
	},

	'click .claim.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Meteor.call('claimArtwork', item_id, function(error) {
			if (error)
				console.log(error.message);
		});
	},

	'click .purchase.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		
		if (Meteor.user().profile.settings.quick_purchase) {
			Meteor.call('purchaseItemFromDealer', item_id, function(error) {
				if (error)
					console.log(error.message);
			});
		}

		else {
			Session.set('selectedItem', item_id);
			Modal.show('purchaseModal');
		}
	},

	'click .decline.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Meteor.call('declineItem', item_id, function(error) {
			if(error)
				console.log(error.message);
		})
	},

	'click .tags.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tagItemModal", 
			'modal_data': {
				'item_data': items.findOne(item_id)
			}
		}, $('body')[0]);
	},

	'click .preview' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.card-container').data('item_id');
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "fullViewModal", 
			'modal_data': {
				'item_data': items.findOne(item_id)
			}
		}, $('body')[0]);
	},

	'mouseover .claim' : function(event) {
		var enabled = $(event.target).closest('span.claim').hasClass("enabled");
		var footnote_string = "add to inventory" + (enabled ? "" : " (unavailable)");
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
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

	'mouseover .purchase' : function(event) {
		var enabled = $(event.target).closest('span.purchase').hasClass("enabled");
		var footnote_string = "purchase" + (enabled ? "" : " (unavailable)");
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
	},

	'mouseover .decline' : function(event) {
		var footnote_string = "decline";
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
	},

	'mouseover .preview' : function(event) {
		var footnote_string = "preview";
		setFootnote(footnote_string, Math.floor(Math.random() * 100000));
	},

	'mouseover .item-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_id;
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_description;
		var hover_string = "level " + (isNaN(value) ? '?' : value) + " " + description;
		setFootnote(hover_string, Math.floor(Math.random() * 1000));
	},

})



// Template.itemThumbnail.events({
// 	'click .image-thumb' : function(element) {
// 		var item_id = $(element.target).data('item_id');
// 		Session.set('selectedItem', item_id);
// 		Modal.show('fullViewModal');
// 	},
// })
