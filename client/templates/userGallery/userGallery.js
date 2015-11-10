var galleryContentTracker = new Tracker.Dependency;
var item_count;

var click_location, original_offset;
var offset_max = 0;

var gallery_data = undefined;

var local_pixels_per_cm;

var getRGBString = function(color) {
	switch(color) {
		case "white": return "255, 255, 255";
		case "black": return "0, 0, 0";
		case "blue": return "0, 0, 255";
		case "green": return "0, 255, 0";
		case "red": return "255, 0, 0";
		default: return "255, 255, 255";
	}
}

var setGallery = function(screen_name, template_data) {
	Meteor.call('getUserGallery', screen_name, function(error, result) {
		if (error)
			console.log(error.message);

		else {
			template_data["gallery_data"] = result;
			$('.wall-wash').css('padding-bottom', Math.floor(result.finish_data.offset_from_floor) + "px");
			$('.wall-wash').css('padding-top', Math.floor(result.finish_data.offset_from_floor) + "px");
			$('.plackard p').css('font-size', Math.ceil(result.finish_data.pixels_per_centimeter) + "px");

			galleryContentTracker.changed();
		}
	});
}

Template.userGallery.helpers({
	'rgbString' : function(color) {
		return getRGBString(color);
	},

	'galleryData': function(screen_name) {
		galleryContentTracker.depend();

		if (this["gallery_data"] === undefined) {
			setGallery(screen_name, this);
			return {}
		}

		else return this['gallery_data']
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

	'canEdit' : function(screen_name) {
		return Meteor.user().profile.screen_name === screen_name;
	}
})

Template.userGallery.events ({
	'change #wall-base-selector' : function(element) {
		var wall_wash_opacity = (1 - Meteor.user().profile.gallery_finishes.wall_opacity);
		var wash_rgb = getRGBString($(element.target)[0].value);
		var color_string = "rgba(" + wash_rgb + ", " + wall_wash_opacity + ")";

		$('.wall-wash').css('background-color', color_string);
		Meteor.call('updateWallBase', $(element.target)[0].value, function(error) {
			if (error)
				console.log(error.message)
		});
	},

	'click #enter-button.enabled' : function(element) {
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
						Session.set('npc_interaction', interaction_object);
						switch(interaction_object.type) {
							case "collector_bonus": 
								Modal.show("collectorOfferModal");
								break;
							case "designer_bonus":
								Modal.show("designerModal");
								break;
							default: 
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
		offset_max = overall_width;
	},

	'mousemove #gallery-wall' : function(element) {
		if (click_location !== undefined && original_offset !== undefined) {
			var movement = click_location - Number(element.screenX);
			var new_offset = original_offset - movement;
			if (new_offset < 0 && new_offset > offset_max * -1) {
				$('.image-container').css('margin-left', new_offset + "px");
				$('#gallery-floor').css('background-position', new_offset + "px");
				$('#gallery-wall').css('background-position', new_offset + "px");
			}
		}
	},

	'mouseup #gallery-wall' : function(element) {
		click_location = undefined;
		original_offset = undefined;
	},

	'click .wall-finish-thumbnail' : function(element) {
		var html_string = "url(" + element.target.src + ")";
		$('#gallery-wall').css('background', html_string);
		$('#gallery-wall').css('background-size', "200px 100px");

		var finish_id = $(element.target).data().gallery_finish_id;
		Meteor.call('setActiveFinish', finish_id, "wall", function(error) {
			if (error)
				console.log(error.message)
		})
	},

	'click .floor-finish-thumbnail' : function(element) {
		var html_string = "url(" + element.target.src + ")";
		$('#gallery-floor').css('background', html_string);
		$('#gallery-floor').css('background-size', "200px 100px");

		var finish_id = $(element.target).data().gallery_finish_id;
		Meteor.call('setActiveFinish', finish_id, "floor", function(error) {
			if (error)
				console.log(error.message)
		})
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

	'calcWidth' : function(data) {
		var artwork_object = artworks.findOne(data.painting_info.artwork_id);
		return Math.floor(artwork_object.width * Number(data.finish_data.pixels_per_centimeter));
	},

	'calcHeight' : function(data) {
		var artwork_object = artworks.findOne(data.painting_info.artwork_id);
		return Math.floor(artwork_object.height * Number(data.finish_data.pixels_per_centimeter));
	},

	'plackardData' : function(data) {
		return {
			'artwork_data': artworks.findOne(data.painting_info.artwork_id),
			'text_height': Math.floor(data.finish_data.pixels_per_centimeter * 2)
		}
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
});

Template.galleryEdit.rendered = function() {
	$('#wall-base-selector').val(Meteor.user().profile.gallery_finishes.wall_base);

	var frame_range = max_frame_width_cm - min_frame_width_cm;
	var matte_range = max_matte_width_cm - min_matte_width_cm;

	var user_object = Meteor.user();
	$('#opacity-slider').slider({
		'value': Math.floor((1 - user_object.profile.gallery_finishes.wall_opacity) * 100),
		'max': 100,
		'min': 0,
		'change': function(event, ui) {
			var wall_wash_opacity = (1 - (ui.value / 100));
			var wash_rgb = getRGBString(user_object.profile.gallery_finishes.wall_base);
			var color_string = "rgba(" + wash_rgb + ", " + wall_wash_opacity + ")";
			$('.wall-wash').css('background-color', color_string);
			Meteor.call('updateWallOpacity', (ui.value / 100), function(error) {
				if (error)
					console.log(error.message)
			});
		}
	});

	$('#frame-slider').slider({
		'value': Math.floor(user_object.profile.gallery_finishes.frame_width * 100),
		'max': 100,
		'min': 0,
		'change': function(event, ui) {
			var new_frame_width = Math.floor(min_frame_width_cm + ((ui.value / 100) * frame_range));
			$('.item').css('border', new_frame_width + "px solid " + "black"); //replace "black" with active color
			Meteor.call('updateFrameWidth', (ui.value / 100), function(error) {
				if (error)
					console.log(error.message)
			});
		}
	});

	$('#matte-slider').slider({
		'value': Math.floor(user_object.profile.gallery_finishes.matte_width * 100),
		'max': 100,
		'min': 0,
		'change': function(event, ui) {
			var new_matte_width = Math.floor(min_matte_width_cm + ((ui.value / 100) * matte_range));
			$('.item').css('padding', new_matte_width + "px")
			Meteor.call('updateMatteWidth', (ui.value / 100), function(error) {
				if (error)
					console.log(error.message)
			});
		}
	});
}

Template.galleryEdit.helpers({
	'wall_finish' : function() {
		var user_object = Meteor.user();
		var key_array = Object.keys(user_object.profile.gallery_finishes.owned.wall_finishes);
		var finish_array = [];
		for (var i=0; i < key_array.length; i++) {
			var finish_id = key_array[i];
			var finish_object = user_object.profile.gallery_finishes.owned.wall_finishes[finish_id];
			finish_object.finish_id = finish_id;
			finish_array.push(finish_object);
		}
		return finish_array;
	},

	'floor_finish' : function() {
		var user_object = Meteor.user();
		var key_array = Object.keys(user_object.profile.gallery_finishes.owned.floor_finishes);
		var finish_array = [];
		for (var i=0; i < key_array.length; i++) {
			var finish_id = key_array[i];
			var finish_object = user_object.profile.gallery_finishes.owned.floor_finishes[finish_id];
			finish_object.finish_id = finish_id;
			finish_array.push(finish_object);
		}
		return finish_array;
	},
})