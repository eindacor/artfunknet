var ticket_holder_tracker = new Tracker.Dependency;
var entry_fee_tracker = new Tracker.Dependency;
var gallery_avatars_tracker = new Tracker.Dependency;
var player_levels_tracker = new Tracker.Dependency;
var can_buy_all_favorites_tracker = new Tracker.Dependency;
var attribute_sort_tracker = new Tracker.Dependency;
var entry_fees = {};
var gallery_avatars = {};
var can_buy_all_favorites = undefined;
var player_levels = {};
var attribute_sort_array = [];
var sort_object = {'sort': ["score", "desc"]};
var gallery_query = {};
var current_page = 1;
var total_pages = 1;
var galleries_per_page = 10;
var gallery_array = [];
var favorite_values = ["any", "only", "none"];
var favorite_value = "any";

var getPlayerLevels = function(owner_id) {
	Meteor.call('getPlayerLevels', owner_id, function(error, result) {
		if (error) {
			console.log(error);
		}
		else {
			player_levels[owner_id] = result;
			player_levels_tracker.changed();
		}
	});
}

var getGalleryAvatar = function(owner_id) {
	Meteor.call('getGalleryAvatar', owner_id, function(error, result) {
		if (error) {
			console.log(error.message);
		}
		else {
			gallery_avatars[owner_id] = result;
			gallery_avatars_tracker.changed();
		}
	});
}

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

var getCanBuyAllFavorites = function() {
	Meteor.call('getCanBuyAllFavorites', function(error, result) {
		if (error)
			console.log(error);

		else {
			can_buy_all_favorites = result;
			can_buy_all_favorites_tracker.changed();
		}
	})
}

var generateSearchTermArray = function(search_terms) {
	var or_array = [];

	for (var i=0; i<search_terms.length; i++) {
		var term = search_terms[i];
		or_array.push({'owner': {'$regex': term, '$options': 'i'}});
	}

	return or_array;
}

var updateGalleryQuery = function() {
	var sort_array = [];

	for (var i=0; i<attribute_sort_array.length; i++) {
		var key_string = "published_procs." + attribute_sort_array[i];
		sort_array.push([key_string, "desc"]);
	}

	var default_order = $('#order-selector').val();

	sort_array.push([default_order, "desc"]);

	sort_object = {'sort': sort_array};

	var terms_entered = commaSeparatedValuesToArray($('#search-area').val());
	var search_term_array = generateSearchTermArray(terms_entered);

	gallery_query = {'tutorial': {$ne: true}, 'visible': true, 'score': {$gt: 0}};
	if (search_term_array.length > 0) {
		gallery_query['$or'] = search_term_array;
	}

	if (favorite_value == "only") {
		gallery_query._id = {'$in': Meteor.user().profile.favorite_galleries};
	}
	else if (favorite_value == "none") {
		gallery_query._id = {'$nin': Meteor.user().profile.favorite_galleries};
	}

	var all_gallery_array;
	var player_interface = new PlayerIF(Meteor.user());
	if (player_interface.tutorialMode()) {
		all_gallery_array = galleries.find({'tutorial': true, 'score': {$gt: 0}}, {sort: {'score': -1}}).fetch();
	}
	else all_gallery_array = galleries.find(gallery_query, sort_object).fetch();

	var total_returned = all_gallery_array.length;

	if (total_returned <= galleries_per_page) {
        current_page = 1;
        total_pages = 1;
    }

    else {
        total_pages = Math.floor(total_returned / galleries_per_page) + 1;

        if (total_returned < ((current_page - 1) * galleries_per_page) + 1) {
            current_page = total_pages;
        }
    }

    var skip = (current_page - 1) * galleries_per_page;

    gallery_array = all_gallery_array.slice(skip, skip + galleries_per_page)

	attribute_sort_tracker.changed();
}

Template.galleries.helpers({
	'gallery': function() {
		attribute_sort_tracker.depend();
		return gallery_array;
	},

	'canBuyAllFavorites': function() {
		can_buy_all_favorites_tracker.depend();
		if (can_buy_all_favorites == undefined) {
			getCanBuyAllFavorites();
		}

		return can_buy_all_favorites;
	},

	'sort_attribute': function() {
		attribute_sort_tracker.depend();
		var sort_attributes = [];
		for (var i=0; i<attribute_sort_array.length; i++) {
			sort_attributes.push(attributes.findOne(attribute_sort_array[i]));
		}

		return sort_attributes;
	},

	'unsort_attribute': function() {
		attribute_sort_tracker.depend();
		return attributes.find({'_id': {$nin: attribute_sort_array}, 'active': true});
	},

	'show_sorted': function() {
		attribute_sort_tracker.depend();
		return attribute_sort_array.length > 0;
	},

	'show_unsorted': function() {
		attribute_sort_tracker.depend();
		return true;
	},

	'current_page': function() {
		attribute_sort_tracker.depend();
		return current_page;
	},

	'total_pages': function() {
		attribute_sort_tracker.depend();
		return total_pages;
	},

	'favorite_value': function() {
		attribute_sort_tracker.depend();
		return favorite_value;
	}
})

Template.galleries.events({
	'click #buy-all-favorites-button': function() {
		Meteor.call('buyAllFavorites', function(error, result) {
			if (error)
				console.log(error);

			else {
				can_buy_all_favorites = undefined;
				can_buy_all_favorites_tracker.changed();
				updateGalleryQuery();
			}
		})
	},

	'click #toggle-filters': function(element) {
		var target = $('#toggle-filters');
		if (target.hasClass('af-color')) {
			target.removeClass('af-color');
			$('.all-filters').css('display', 'none');
		}

		else {
			target.addClass('af-color');
			$('.all-filters').css('display', 'block');
		}
	},

	'change #order-selector': function(element) {
		updateGalleryQuery();
	},

	'keyup #search-area': function(event) {
		updateGalleryQuery();
	}, 

	'keydown #search-area': function(event) {
		if (event.keyCode == 13) {
			$('#search-area').blur();
			event.preventDefault();
		}
	},

	'click #galleries-page-right': function() {
		var prior_current = current_page;
		current_page = Math.min(current_page + 1, total_pages);
		if (prior_current != current_page)
			updateGalleryQuery();
	},

	'click #galleries-page-left': function() {
		var prior_current = current_page;
		current_page = Math.max(current_page - 1, 1);
		if (prior_current != current_page)
			updateGalleryQuery();
	},

	'mousedown .favorite-value': function(element) {
		var value = $(element.target).attr('data-favorite_value');
		var new_value_index;
		if (element.which == 1) {
			new_value_index = favorite_values.indexOf(value) == favorite_values.length - 1 ? 0 : favorite_values.indexOf(value) + 1;
		}
		else if (element.which == 3) {
			new_value_index = favorite_values.indexOf(value) == 0 ? favorite_values.length - 1 : favorite_values.indexOf(value) - 1;
		}
		
		var new_value = favorite_values[new_value_index];
		favorite_value = new_value;
		updateGalleryQuery();
	}
})

Template.galleryCard.helpers({
	'galleryInfo' : function(gallery_object) {
		try {
			var attribute_array = [];
			var attribute_ids = Object.keys(gallery_object.published_procs);

			for (var i=0; i < attribute_ids.length; i++) {
				var attribute_object = attributes.findOne(attribute_ids[i]);
				attribute_object.proc = gallery_object.published_procs[attribute_ids[i]];
				attribute_array.push(attribute_object);
			}

			gallery_object.attribute = attribute_array;
			gallery_object.price_tier = gallery_object.entry_fee;
			gallery_object.paid = Meteor.userId() == gallery_object.owner_id || gallery_tickets.findOne({'ticketholder': Meteor.userId(), 'gallery_owner': gallery_object.owner_id}) != undefined;
			return gallery_object;
		}

		catch(error) {
			console.log(error);
			return {};
		}
	},

	'canEnter': function(gallery_object) {
		return Math.random() < .5;
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

	'favorite': function(gallery_id) {
		return Meteor.user().profile.favorite_galleries.indexOf(gallery_id) != -1;
	},

	'currentTicketHolders' : function(owner_id) {
		return gallery_tickets.find({'gallery_owner': owner_id}).count();
	},

	'canPurchaseTicket': function() {
		return gallery_tickets.find({'ticketholder': Meteor.userId()}).count() < Meteor.user().profile.ticket_cap;
	},

	'avatar_image': function(owner_id) {
		gallery_avatars_tracker.depend();
		if (gallery_avatars[owner_id] == undefined) {
			getGalleryAvatar(owner_id);
		}

		return gallery_avatars[owner_id];
	},

	'playerIsNotOwner': function(owner_id) {
		return owner_id != Meteor.userId();
	},

	'player_levels': function(owner_id) {
		player_levels_tracker.depend();
		if (player_levels[owner_id] == undefined) {
			getPlayerLevels(owner_id);
		}

		return player_levels[owner_id];
	}
})

Template.galleryCard.events({
	'click .can-enter.enter-button' : function(element) {
		var owner_screen_name = $(element.target).data().owner_screen_name;
		Router.go('/user/' + owner_screen_name);	
	},

	'click .can-enter.purchase-and-enter-button' : function(element) {
		var gallery_id = $(element.target).data().gallery_id;
		var owner_screen_name = $(element.target).data().owner_screen_name;
		Meteor.call('purchaseTicket', gallery_id, function(result, error) {
			if (error)
				console.log(error.message);

			else {
				Router.go('/user/' + owner_screen_name);
			}
		})
	},

	'click .can-enter.purchase-button' : function(element) {
		var gallery_id = $(element.target).data().gallery_id;
		Meteor.call('purchaseTicket', gallery_id, function(result, error) {
			if (error)
				console.log(error.message);

			else {
				can_buy_all_favorites = undefined;
				can_buy_all_favorites_tracker.changed();
			}
		})
	},

	'click .favorite-button': function(element) {
		var gallery_id = $(element.target).data().gallery_id;
		Meteor.call('toggleFavoriteGallery', gallery_id, function(result, error) {
			if (error)
				console.log(error.message);

			else {
				can_buy_all_favorites = undefined;
				can_buy_all_favorites_tracker.changed();
			}
		})
	}
})

Template.galleries.rendered = function() {
	entry_fees = {};
	gallery_avatars = {};
	can_buy_all_favorites = undefined;
	sort_object = {'sort': ["score", "desc"]};
	gallery_query = {};

	current_page = 1;
	total_pages = 1;
	galleries_per_page = 10;
	gallery_array = [];
	favorite_value = "any"

	attribute_sort_array = [];
	updateGalleryQuery();
}

Template.attributeSort.helpers({
	'sorted_by': function(attribute_id) {
		attribute_sort_tracker.depend();
		return attribute_sort_array.indexOf(attribute_id) != -1;
	}
})

Template.attributeSort.events({
	'click .action-icon': function(event) {
		if ($(event.target).data().action == "add") {
			attribute_sort_array.push($(event.target).data().attribute_id);
		}
		else {
			attribute_sort_array.splice(attribute_sort_array.indexOf($(event.target).data().attribute_id), 1);
		}

		updateGalleryQuery();
	}
})