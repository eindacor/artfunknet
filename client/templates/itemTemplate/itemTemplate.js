var div_size_tracker = new Tracker.Dependency;
var sought_tracker = new Tracker.Dependency;
var display_details_tracker = new Tracker.Dependency;
var card_container_width;
var card_container_height;
var sought_status = {};
var global_perm = false;
var display_details_map = {};
var permanent_details_map = {};
var item_interface = undefined;

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
	//TODO replace below status methods with more elegant solution -> DOM modification from updatestatus
	'displayedStatus': function(item_object) {
		if (item_object)
			return item_object.status == "displayed";
	},

	'auctionedStatus': function(item_object) {
		if (item_object)
			return item_object.status == "auctioned";
	},

	'repairingStatus': function(item_object) {
		if (item_object)
			return item_object.repairing;
	},

	'isOwner' : function(owner_id) {
		return Meteor.userId() == owner_id;
	},

	'showDetails': function(item_object) {
		return item_object.level != undefined;
	},

	'hide_mask': function(item_object) {
		return !item_object.permanent && item_object.status != "displayed" && item_object.status != "auctioned";
	},

	'display_details': function(item_object) {
		try {
			display_details_tracker.depend();
			if (display_details_map[item_object._id] == undefined) {
				Meteor.call('getDisplayDetails', item_object, function(error, result) {
					if (error)
						console.log(error)

					else {
						display_details_map[item_object._id] = result;
						display_details_tracker.changed();
					}
				})
			}
			
			return display_details_map[item_object._id];
		}
		catch (error) {
			console.log(error.message);
		}
	}
})

Template.itemInfo.events({
	'click .card-container' : function(element) {
		var target = $(element.target);
		var item_id = target.closest('.card-container').data('item_id');
		if ($('.template-modalTemplate').length == 0) {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "fullViewModal", 
				'modal_data': {
					'item_object': items.findOne(item_id)
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

	'click .level-indicator': function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('rerollModal');
	}

})
