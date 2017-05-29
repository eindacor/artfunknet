var ticket_holder_tracker = new Tracker.Dependency;
var entry_fee_tracker = new Tracker.Dependency;
var gallery_avatars_tracker = new Tracker.Dependency;
var can_buy_all_favorites_tracker = new Tracker.Dependency;
var entry_fees = {};
var gallery_avatars = {};
var can_buy_all_favorites = undefined;

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

			else can_buy_all_favorites_tracker.changed();
		})
	}
})

Template.galleryCard.helpers({
	'galleryInfo' : function(gallery_object) {
		try {
			var attribute_array = [];
			var gallery_details = gallery_object.attribute_values;
			var attribute_ids = Object.keys(gallery_object.attribute_values);

			for (var i=0; i < attribute_ids.length; i++) {
				var attribute_object = attributes.findOne(attribute_ids[i]);
				attribute_object.value = gallery_object.attribute_values[attribute_ids[i]];
				attribute_object.proc = Math.floor(100 * gallery_object.procs[attribute_ids[i]]);
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

	if (Meteor.user().profile.tutorials.galleries) 
	{
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tutorialModal", 
			'modal_data': {
				'tutorial_name': "galleries",
				'next': undefined,
				'activate': "other_gallery",
				'image_filename': "tutorial/gallery_select.png",
				'message': "Here you'll find all of the galleries created by other players, including information about the contents of each. The ratings in the 'Attributes' section indicate what kinds of special visitors are likely to show up in that gallery. Pick a gallery with an entry fee you can afford, click on that row, and pay to enter the gallery."
			}
		}, $('body')[0]);
	}
}