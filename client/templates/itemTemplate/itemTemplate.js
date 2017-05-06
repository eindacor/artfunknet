var div_size_tracker = new Tracker.Dependency;
var sought_tracker = new Tracker.Dependency;
var checklist_data_tracker = new Tracker.Dependency;
var display_details_tracker = new Tracker.Dependency;
var permanent_details_tracker = new Tracker.Dependency;
var card_container_width;
var card_container_height;
var sought_status = {};
var checklist_data;
var global_perm = false;
var display_details_map = {};
var permanent_details_map = {};

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
	display_details_map = {};
	permanent_details_map = {};
	checklist_data = undefined;
	if ($('.card-container').length != 0) {
		card_container_height = $('.card-container').css('height').replace("px", "");
		card_container_width = $('.card-container').css('width').replace("px", ""); 
		div_size_tracker.changed();
	}

	sought_status = {};
}

// reconstruct itemTemplate DOM to avoid rerendering of entire itemSet
updateItemTemplate = function(item_id, delay) {
	setTimeout(function() {
		var item_object = items.findOne(item_id);
		var target_container = $("[data-item_id='" + item_object._id + "']").find('.card-container');

		if (target_container) {
			target_container.find('#dynamic-value-stat').text("estimated value: " + getMoneyValue(item_object.values.actual));	
			target_container.find('#dynamic-xp-stat').text("xp rating: ");
			target_container.find('#dynamic-xp-stat').append('<span style="color: ' + getHTMLColorFromValue(item_object.xp_rating) + '">' + item_object.xp_rating.toFixed(2) * 100 + '</span>')
			target_container.find('#dynamic-roll-count-stat').text("roll count: " + item_object.roll_count);

			if (item_object.active_unique_attribute) {
				target_container.find('.flavor-text').text('"' + unique_attributes.findOne({'code': item_object.active_unique_attribute}).flavor_text + '"');
			}

			var all_attributes = item_object.attributes.unlocked.concat(item_object.attributes.locked.concat(item_object.attributes.special));

			for (var i=0; i<target_container.find('.attribute-area i').length; i++) {
				var new_attribute = all_attributes[i];
				var dom_attribute = target_container.find('.attribute-area i:eq(' + i + ')');

				var dom_description = dom_attribute.data().attribute_description;
				if (new_attribute.description != dom_description) {
					dom_attribute.attr('data-attribute_description', new_attribute.description)

					var class_count = dom_attribute[0].classList.length;
					var previous_icon = dom_attribute[0].classList[class_count - 1];
					dom_attribute.removeClass(previous_icon);
					dom_attribute.addClass(new_attribute.icon);
				}

				if (item_object.status == "permanent") {
					if (!dom_attribute.hasClass('permanent'))
						dom_attribute.addClass('permanent');
				}

				else if (dom_attribute.hasClass('permanent'))
					dom_attribute.removeClass('permanent');

				var dom_value = dom_attribute.data().attribute_value;
				if (new_attribute.value != dom_value) {
					dom_attribute.attr('data-attribute_value', new_attribute.value);
					dom_attribute.attr('style', 'color: ' + getHTMLColorFromValue(new_attribute.value));
				}
			}

			var dynamic_xp_wrapper = target_container.find('.dynamic-xp-rating');
			dynamic_xp_wrapper.empty();
			dynamic_xp_wrapper.append('<p><span style="color: ' + getHTMLColorFromValue(item_object.xp_rating) + '">' + item_object.xp_rating.toFixed(2) * 100 + '</span></p>')

			target_container.remove('.status-mask');

			updateItemActions(item_object);
		}
	}, delay == undefined ? 0 : delay)
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
	//TODO replace below status methods with more elegant solution -> DOM modification from updatestatus
	'permanentStatus' : function(item_id) {
		var item_object = items.findOne(item_id);
		if (item_object)
			return item_object.status == "permanent";
	},

	'displayedStatus': function(item_id) {
		var item_object = items.findOne(item_id);
		if (item_object)
			return item_object.status == "displayed";
	},

	'auctionedStatus': function(item_id) {
		var item_object = items.findOne(item_id);
		if (item_object)
			return item_object.status == "auctioned";
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

	'checklist_info': function(item_data) {
		checklist_data_tracker.depend();

		if (checklist_data == undefined) {
			checklist_data = Meteor.user().profile.checklists.owned;
			checklist_data_tracker.changed();
		}

		else {
			var checklist_object;
			if (checklist_data[item_data.artwork_data.rarity] != undefined) {
				if (checklist_data[item_data.artwork_data.rarity][item_data.artwork_id] != undefined) {
					checklist_object = checklist_data[item_data.artwork_data.rarity][item_data.artwork_id]
				}
			}

			return checklist_object;
		}
	},

	'hide_mask': function(item_data) {
		return item_data.status != "permanent" && item_data.status != "displayed" && item_data.status != "auctioned";
	},

	'display_details': function(item_id) {
		display_details_tracker.depend();
		if (display_details_map[item_id] == undefined) {
			Meteor.call('getDisplayDetails', item_id, function(error, result) {
				if (error)
					console.log(error)

				else {
					display_details_map[item_id] = result;
					display_details_tracker.changed();
				}
			})
		}
		
		return display_details_map[item_id];
	},

	'permanent_details': function(item_id) {
		permanent_details_tracker.depend();
		if (permanent_details_map[item_id] == undefined) {
			Meteor.call('getPermanentDetails', item_id, function(error, result) {
				if (error)
					console.log(error)

				else {
					permanent_details_map[item_id] = result;
					permanent_details_tracker.changed();
				}
			})
		}
		
		return permanent_details_map[item_id];
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
