var galleryContentTracker = new Tracker.Dependency;
var item_count;

var thinnest_image_width = 20;
var pixels_per_centimeter;
var click_location, original_offset;
var offset_max = 0;


var setGallery = function(screen_name, template_data) {
	Meteor.call('getUserGallery', screen_name, function(error, result) {
		if (error)
			console.log(error.message);

		else {
			template_data["gallery_data"] = result;
			galleryContentTracker.changed();
			pixels_per_centimeter = thinnest_image_width / artworks.findOne({}, {sort: {'width': 1}}).width;
		}
	});
}

Template.userGallery.helpers({
	'galleryData': function(screen_name) {
		galleryContentTracker.depend();

		if (this["gallery_data"] === undefined) {
			setGallery(screen_name, this);
			return {
				'displayed_shown' : false,
				'displayed' : [],
				'permanent_shown' : false,
				'permanent' : []
			}
		}

		else return {
			'displayed_shown' : this['gallery_data'].displayed.length,
			'displayed' : this['gallery_data'].displayed,
			'permanent_shown' : this['gallery_data'].permanent.length,
			'permanent' : this['gallery_data'].permanent
		};
	},

	'time_remaining': function(item_id) {
		var item_object = items.findOne(item_id);

		if (item_object && item_object.status == 'displayed') {
			var expiration = moment(item_object.display_details.end);
			var now = moment(Session.get('now'));
			var remaining = expiration - now;

			var remaining_text = remaining > 0 ? getCountdownString(remaining) : "expired";
			return remaining_text;
		}

		else return "";
	},

	'entryInfo' : function(screen_name) {
		var gallery_object = galleries.findOne({'owner': screen_name});

		if (Meteor.user() && gallery_object) {
			var viewer_object = Meteor.user();
			var tickets_maxed = viewer_object.profile.gallery_tickets.length >= viewer_object.profile.ticket_cap;
			var insufficient_funds = gallery_object.entry_fee > viewer_object.profile.bank_balance;
			var paid = viewer_object.profile.gallery_tickets.some(function(ticket_object) {
				return ticket_object.owner_id == gallery_object.owner_id;
			});

			return {
				'paid' : paid || screen_name == viewer_object.profile.screen_name,
				'pay_fee_enabled' : !insufficient_funds && !tickets_maxed,
				'entry_fee_text' : "$" + getCommaSeparatedValue(gallery_object.entry_fee),
				'screen_name' : screen_name,
				'owner_id' : gallery_object.owner_id
			}
		}

		else return {};
	},

	'npc' : function(owner_id) {
		var primary_attributes = attributes.find({'type' : "primary"}).fetch();
		var primary_ids = [];
		primary_attributes.forEach(function(db_object) {
			primary_ids.push(db_object._id);
		});

		return npcs.find({'owner_id' : owner_id, 'attribute_id' : {$in : primary_ids}});
	},

	'unmet' : function(npc_id) {
		return npcs.findOne(npc_id).players_met.indexOf(Meteor.userId()) == -1;
	},

	'carousel_rendered' : function() {
		return Session.get('carouselRendered');
	}
})

Template.userGallery.events ({
	'click #enter-button' : function(element) {
		var owner_id = element.target.dataset.owner_id;
		Meteor.call('purchaseTicket', Meteor.userId(), owner_id, function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .npc.enabled' : function(element) {
		var npc_id = element.target.dataset.npc_id;
		if (npcs.findOne(npc_id).players_met.indexOf(Meteor.userId()) == -1) {
			Meteor.call('interactWithNPC', npc_id, function(error, interaction_object) {
				if (error)
					console.log(error.message);

				else {
					try {
						switch(interaction_object.type) {
							case "collector_bonus": 
								Session.set('npc_interaction', interaction_object);
								Modal.show("collectorOfferModal");
								break;
							default: 
								Session.set('npc_interaction', interaction_object);
								Modal.show("standardNPCMessageModal");
								break;
						}
					}

					catch(error) {
						console.log(error.message);
					}
				}
			})
		}
	},

	'mouseover .npc' : function(element) {
		var npc_id = element.target.dataset.npc_id;

		var npc_object = npcs.findOne(npc_id);
		var attribute_object = attributes.findOne(npc_object.attribute_id);
		var quality_string = npc_object.quality[0].toUpperCase() + npc_object.quality.substr(1);
		var hover_string = quality_string + " " + attribute_object.npc_name;

		if (npc_object.players_met.indexOf(Meteor.userId()) != -1)
			hover_string += " (already met)";

		setFootnote(hover_string, Math.floor(Math.random() * 1000));
	},

	'mousedown #gallery-wall' : function(element) {
		click_location = Number(element.screenX);
		original_offset = Number($('.image-container').css('margin-left').replace("px", ""));

		offset_max = 0;
		var overall_width = 0;
		for (var i=0; i < $('.painting-container').length; i++) {
			overall_width += Number($('.painting-container:eq(' + i + ')').css('width').replace("px", ""));
			overall_width += Number($('.painting-container:eq(' + i + ')').css('margin-right').replace("px", ""));
			overall_width += Number($('.painting-container:eq(' + i + ')').css('margin-left').replace("px", ""));
		}

		overall_width += Number($('#gallery-wall').css('padding-left').replace("px", ""));
		overall_width += Number($('#gallery-wall').css('padding-right').replace("px", ""));
		offset_max = overall_width - Math.floor(Number($('#gallery-wall').css('width').replace("px", "")));
	},

	'mousemove #gallery-wall' : function(element) {
		if (click_location !== undefined && original_offset !== undefined) {
			var movement = click_location - Number(element.screenX);
			var new_offset = original_offset - movement;
			if (new_offset < 0 && new_offset > offset_max * -1) {
				$('.image-container').css('margin-left', new_offset + "px");
				$('#gallery-floor').css('background-position', new_offset + "px");
			}
		}
	},

	'mouseup #gallery-wall' : function(element) {
		click_location = undefined;
		original_offset = undefined;
	}
})

Template.userGallery.created = function() {
	this.handle = Meteor.setInterval((function() {
		var now = moment();
		Session.set('now', now.toISOString());
	}), 1000);
}

Template.userGallery.destroyed = function() {
	Meteor.clearInterval(this.handle);
}

Template.galleryItem.helpers({
	'getFilename' : function(artwork_id) {
		return artworks.findOne(artwork_id).filename;
	},

	'calcWidth' : function(artwork_id) {
		if (pixels_per_centimeter === undefined) {
			return 0;
		}

		else {
			var artwork_object = artworks.findOne(artwork_id);
			return Math.floor(artwork_object.width * pixels_per_centimeter);
		}
	},

	'plackardData' : function(artwork_id) {
		return artworks.findOne(artwork_id);
	}
});

Template.galleryItem.events({
	'click .item img' : function(element) {
		var item_id = $(element.target).closest('.painting-container').data().item_id;
		Session.set('selectedItem', item_id);
		Modal.show('fullViewModal');
	},

	'mousedown .item' : function(element) {
		element.stopPropagation();
	},
})