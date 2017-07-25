var ticket_holder_tracker = new Tracker.Dependency;
var entry_fee_tracker = new Tracker.Dependency;
var gallery_avatars_tracker = new Tracker.Dependency;
var player_levels_tracker = new Tracker.Dependency;
var can_buy_all_favorites_tracker = new Tracker.Dependency;
var entry_fees = {};
var gallery_avatars = {};
var can_buy_all_favorites = undefined;
var player_levels = {};

var getPlayerLevels = function(owner_id) {
	Meteor.call('getPlayerLevels', owner_id, function(error, result) {
		if (error)
			console.log(error)

		else {
			player_levels[owner_id] = result;
			player_levels_tracker.changed();
		}
	});
}

var getGalleryAvatar = function(owner_id) {
	Meteor.call('getGalleryAvatar', owner_id, function(error, result) {
		if (error)
			console.log(error)

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

Template.galleries.helpers({
	'gallery': function() {
		return galleries.find({'score': {$gt: 0}}, {sort: {'score': -1}});
	},

	'canBuyAllFavorites': function() {
		can_buy_all_favorites_tracker.depend();
		if (can_buy_all_favorites == undefined) {
			getCanBuyAllFavorites();
		}

		return can_buy_all_favorites;
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
	can_buy_all_favorites = undefined
	Session.set('galleries_ascending', true);
	Session.set('galleries_sort', "profile.screen_name");

	refreshTutorial("galleries");
}