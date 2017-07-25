var galleryContentTracker = new Tracker.Dependency;
var wall_padding_tracker = new Tracker.Dependency;
var entry_fee_tracker = new Tracker.Dependency;
var entry_fees = {};
var current_screen_name = undefined;
var timer;

var getEntryFee = function(owner_id) {
	Meteor.call('getEntryFee', owner_id, function(error, result) {
		if (error)
			console.log(error.message)

		else {
			entry_fees[owner_id] = result;
			entry_fee_tracker.changed();
		}
	})
}

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
			gallery_data = result;
			galleryContentTracker.changed();
		}
	});
}

var setPadding = function() {
	if (gallery_data) {
		$('.wall-wash').css('padding-bottom', Math.floor(gallery_data.finish_data.offset_from_floor) + "px");
		$('.wall-wash').css('padding-top', Math.floor(gallery_data.finish_data.offset_from_floor) + "px");
		$('.plackard p').css('font-size', Math.ceil(gallery_data.finish_data.pixels_per_centimeter) + "px");
		$('#gallery-wall').css('display', 'block');
		wall_padding_tracker.changed();
	}
}

var interactWithNPC = function() {

}

Template.userGallery.helpers({
	'rgbString' : function(color) {
		return getRGBString(color);
	},

	'setPadding': function() {
		setTimeout(function() {
			wall_padding_tracker.depend()
			if ($('.wall-wash').length > 0) {
				setPadding();
			}
		}, 200)		
	},

	'galleryData': function(screen_name) {
		galleryContentTracker.depend();
		if (current_screen_name == undefined) {
			current_screen_name = screen_name;
		}

		else if (current_screen_name != screen_name) {
			current_screen_name = screen_name;
			gallery_data = undefined;
		}	

		if (gallery_data === undefined) {
			setGallery(screen_name, this);
		}

		return gallery_data;
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
			var tickets_maxed = gallery_tickets.find({'ticketholder': Meteor.userId()}).count() >= Meteor.user().profile.ticket_cap;
			var insufficient_funds = gallery_object.entry_fee > viewer_object.profile.bank_balance;
			var paid = gallery_tickets.findOne({'ticketholder': Meteor.userId(), 'gallery_owner': gallery_object.owner_id}) != undefined;

			return {
				'tickets_maxed' : tickets_maxed,
				'paid' : paid || screen_name == viewer_object.profile.screen_name,
				'pay_fee_enabled' : !insufficient_funds && !tickets_maxed,
				'price_tier' : gallery_object.entry_fee,
				'screen_name' : screen_name,
				'owner_id' : gallery_object.owner_id
			}
		}

		else return {};
	},

	'npc' : function(owner_id) {
		return npcs.find({'owner_id' : owner_id});
	},

	'already_met': function(npc_object) {
		return npc_object.players_met.indexOf(Meteor.userId()) != -1;
	},

	'canEdit' : function(screen_name) {
		return Meteor.user().profile.screen_name === screen_name;
	},

	'entryFee' : function(tier, owner_id) {
		entry_fee_tracker.depend();
		if (entry_fees[owner_id] == undefined) {
			getEntryFee(owner_id);
		}

		else if (entry_fees[owner_id] == -1) {
			getEntryFee(owner_id);
		}

		else return getCommaSeparatedValue(entry_fees[owner_id]);
	},

	'wall_finish_filename': function() {
		galleryContentTracker.depend();
		if (current_screen_name && current_screen_name == Meteor.user().profile.screen_name)
			return gallery_finishes.findOne(Meteor.user().profile.gallery_finishes.active.wall_finish).filename;

		else {	
			return gallery_data.finish_data.wall_filename;
		}
	},

	'floor_finish_filename': function() {
		galleryContentTracker.depend();
		if (current_screen_name && current_screen_name == Meteor.user().profile.screen_name)
			return gallery_finishes.findOne(Meteor.user().profile.gallery_finishes.active.floor_finish).filename;

		else {
			return gallery_data.finish_data.floor_filename;
		}
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

	'change #frame-color-selector' : function(element) {
		$('.item').css('border-color', $(element.target)[0].value);
		Meteor.call('updateFrameColor', $(element.target)[0].value, function(error) {
			if (error)
				console.log(error.message)
		});
	},

	'click #enter-button.enabled' : function(element) {
		var owner_id = element.target.dataset.owner_id;
		Meteor.call('purchaseTicket', owner_id, function(error) {
			if (error)
				console.log(error.message);

			else if (Meteor.user().profile.tutorials.other_gallery) {
				Blaze.renderWithData(Template.modalTemplate, {
					'modal_name': "tutorialModal", 
					'modal_data': {
						'tutorial_name': "other_gallery",
						'next': undefined,
						'activate': "reroll",
						'image_filename': "tutorial/npc_area.png",
						'message': "Here you can see all of the works this player has on display and in his/her permanent collection. You can also see what special visitors are currently in that gallery, and interact with them by clicking on the icons. When you're finished checking out this gallery, head back to the 'Home' section to learn more about painting attributes."
					}
				}, $('body')[0]);
			}
		})
	},

	'mousedown .npc.enabled' : function(element) {
		var npc_id = element.target.dataset.npc_id;
		if (element.which == 1) {
			timer = moment();
			Meteor.call('interactWithNPC', npc_id, function(error, interaction_object) {
				if (error)
					console.log(error.message);

				else {
					try {
						if (interaction_object == undefined) {
							return;
						}

						if (Meteor.user().profile.settings.show_npc_modals) {
							Session.set('npc_interaction', interaction_object);
							switch(interaction_object.type) {
								case "collector_bonus": 
									Blaze.renderWithData(Template.modalTemplate, {
										'modal_name': "collectorOfferModal", 
										'modal_data': {
											'interaction_object': interaction_object
										}
									}, $('body')[0]);
									break;
								case "historian_bonus":
									Modal.show("historianModal");
									break;
								case "art_expert_bonus": 
									if (interaction_object.knowledge_object != undefined) {
										Blaze.renderWithData(Template.modalTemplate, {
											'modal_name': "artExpertKnowledgeModal", 
											'modal_data': {
												'interaction_object': interaction_object
											}
										}, $('body')[0]);
										break;
									}
								default: 
									Blaze.renderWithData(Template.modalTemplate, {
										'modal_name': "standardNPCMessageModal", 
										'modal_data': {
											'interaction_object': interaction_object
										}
									}, $('body')[0]);
									break;
							}
						}
					}

					catch(error) {
						console.log(error.message);
					}
				}
			})
		}

		else if (element.which == 3) {
			Meteor.call('ignoreNPC', npc_id, function(error) {
				if (error)
					console.log(error)
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

	'mousedown .window-crop' : function(element) {
		click_location = Number(element.screenX);
		original_offset = Number($('.rendered-scene').css('margin-left').replace("px", ""));

		offset_max = 0;
		var overall_width = 0;
		for (var i=0; i < $('.painting-container').length; i++) {
			overall_width += Number($('.painting-container:eq(' + i + ')').css('width').replace("px", ""));
			overall_width += Number($('.painting-container:eq(' + i + ')').css('margin-right').replace("px", ""));
			overall_width += Number($('.painting-container:eq(' + i + ')').css('margin-left').replace("px", ""));
		}

		overall_width += Number($('.wall-wash').css('padding-left').replace("px", ""));
		overall_width += Number($('.wall-wash').css('padding-right').replace("px", ""));

		offset_max = overall_width - $('.window-crop').width();
	},

	'mousemove .window-crop' : function(element) {
		if (click_location !== undefined && original_offset !== undefined) {
			var movement = click_location - Number(element.screenX);
			var new_offset = original_offset - movement;
			if (new_offset < 0 && new_offset > offset_max * -1) {
				$('.rendered-scene').css('margin-left', new_offset + "px");
			}
		}
	},

	'mouseup .window-crop' : function(element) {
		click_location = undefined;
		original_offset = undefined;
	},

	'click .wall-finish-container' : function(element) {
		var container = $(element.target).closest('.wall-finish-container');
		var finish_id = container.data().gallery_finish_id;
		var source = container.find('.wall-finish-thumbnail')[0].src;
		
		$('#gallery-wall').css('background', source);
		$('#gallery-wall').css('background-size', "200px 200px");

		Meteor.call('setActiveFinish', finish_id, "wall", function(error) {
			if (error)
				console.log(error.message)

			else galleryContentTracker.changed();
		})
	},

	'click .floor-finish-container' : function(element) {
		var container = $(element.target).closest('.floor-finish-container');
		var finish_id = container.data().gallery_finish_id;
		var source = container.find('.floor-finish-thumbnail')[0].src;

		$('#gallery-floor').css('background', source);
		$('#gallery-floor').css('background-size', "400px 200px");

		Meteor.call('setActiveFinish', finish_id, "floor", function(error) {
			if (error)
				console.log(error.message)

			else galleryContentTracker.changed();
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

Template.userGallery.rendered = function() {
	entry_fees = {};

	$('.template-userGallery').contextmenu(function() {
		return false;
	});

	// if (Meteor.user() && this.data.screen_name == Meteor.user().profile.screen_name && Meteor.user().profile.tutorials.my_gallery) 
	// {
	// 	Blaze.renderWithData(Template.modalTemplate, {
	// 		'modal_name': "tutorialModal", 
	// 		'modal_data': {
	// 			'tutorial_name': "my_gallery",
	// 			'next': undefined,
	// 			'activate': "galleries",
	// 			'image_filename': "tutorial/menu_galleries.png",
	// 			'message': "Here you can see all of the works you have on display and in your permanent collection. You can also customize the look of your gallery as you unlock more finishes. When you're done admiring your new space, click on the 'Galleries' menu button to see what other players are showing."
	// 		}
	// 	}, $('body')[0]);
	// }

	var own_gallery = Meteor.user() && this.data.screen_name == Meteor.user().profile.screen_name;
	var player_interface = new PlayerIF(Meteor.user());
	if ((player_interface.readyForTutorial("player_gallery") && !own_gallery) || (player_interface.readyForTutorial("my_gallery") && own_gallery)) {
		Meteor.call('changeTutorialStep', true, function(error) {
			if (error) {
				console.log(error)
			}

			else {
				buildTutorialContents();
			}
		})
	}
}

Template.galleryItem.helpers({
	'calcWidth' : function(data) {
		if (data)
			return Math.floor(data.painting_info.artwork_data.width * Number(data.finish_data.pixels_per_centimeter));
	},

	'calcHeight' : function(data) {
		if (data)
			return Math.floor(data.painting_info.artwork_data.height * Number(data.finish_data.pixels_per_centimeter));
	},

	'calcMargin' : function(data) {
		if (data)
			return Math.floor(80 * Number(data.finish_data.pixels_per_centimeter));
	},

	'plackardData' : function(data) {
		if (data)
			return {'text_height': Math.floor(data.finish_data.pixels_per_centimeter * 2)};

	},

	'shimmer' : function(data) {
		return data.painting_info.foil || data.painting_info.seasonal || data.painting_info.lottery || data.painting_info.original;
	}
});

Template.galleryItem.events({
	'click .item' : function(element) {
		var item_id = $(element.target).closest('.painting-container').data().item_id;
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "fullViewModal", 
			'modal_data': {
				'item_object': items.findOne(item_id)
			}
		}, $('body')[0]);
	},

	'mousedown .item' : function(element) {
		element.stopPropagation();
	},
});

Template.galleryEdit.rendered = function() {
	$('#wall-base-selector').val(Meteor.user().profile.gallery_finishes.wall_base);
	$('#frame-color-selector').val(Meteor.user().profile.gallery_finishes.frame_color);

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
		return gallery_finishes.find({'type': "wall finish"});
	},

	'floor_finish' : function() {
		return gallery_finishes.find({'type': "floor finish"});
	},
})