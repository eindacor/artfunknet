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

var getPlayerLevels = function(owner_id) {
	Meteor.call('getPlayerLevels', owner_id, function(error, result) {
		if (error) {}
		else {
			player_levels[owner_id] = result;
			player_levels_tracker.changed();
		}
	});
}

var getGalleryAvatar = function(owner_id) {
	Meteor.call('getGalleryAvatar', owner_id, function(error, result) {
		if (error) {}
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
	//var attribute_list
	//attribute_sort_array = [];
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

	attribute_sort_tracker.changed();
}

Template.galleries.helpers({
	'favorite_gallery': function() {
		attribute_sort_tracker.depend();
		var favorite_query = JSON.parse(JSON.stringify(gallery_query));
		favorite_query['_id'] = {'$in': Meteor.user().profile.favorite_galleries};
		var player_interface = new PlayerIF(Meteor.user());
		if (player_interface.tutorialMode()) {
			return [];
		}
		else return galleries.find(favorite_query, sort_object);
	},

	'gallery': function() {
		attribute_sort_tracker.depend();
		var standard_query = JSON.parse(JSON.stringify(gallery_query));
		standard_query['_id'] = {'$nin': Meteor.user().profile.favorite_galleries};
		var player_interface = new PlayerIF(Meteor.user());
		if (player_interface.tutorialMode()) {
			return galleries.find({'tutorial': true, 'score': {$gt: 0}}, {sort: {'score': -1}});
		}
		else return galleries.find(standard_query, sort_object);
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

	refreshTutorial("galleries");

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