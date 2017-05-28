var ticket_holder_tracker = new Tracker.Dependency;
var entry_fee_tracker = new Tracker.Dependency;
var entry_fees = {};

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

Template.galleries.helpers({
	'gallery': function() {
		return galleries.find({'score': {$gt: 0}});
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
	}
})

Template.galleryCard.events({
	'click .can-enter.enter-button' : function(element) {
		console.log(element);
		var owner = $(element.target).data().owner;
		Router.go('/user/' + owner);	
	},

	'click .can-enter.purchase-and-enter-button' : function(element) {
		var owner = $(element.target).data().owner;
		Meteor.call('purchaseTicket', owner, function(result, error) {
			if (error)
				console.log(error.message);

			else {
				Router.go('/user/' + owner);
			}
		})
	},

	'click .can-enter.purchase-button' : function(element) {
		var owner = $(element.target).data().owner;
		Meteor.call('purchaseTicket', owner, function(result, error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .favorite-button': function(element) {
		var gallery_id = $(element.target).data().gallery_id;
		Meteor.call('toggleFavoriteGallery', gallery_id, function(result, error) {
			if (error)
				console.log(error.message);
		})
	}
})

Template.galleryTable.helpers({
	'header' : function(table_data) {
		var header_array = [
			{ 'text' : 'owner', 'sort_id' : 'owner', 'table_id' : table_data.table_id  },
			{ 'text' : 'attributes', 'sort_id' : undefined, 'table_id' : table_data.table_id  },
			{ 'text' : 'entry fee', 'sort_id' : 'entry_fee', 'table_id' : table_data.table_id  },
			{ 'text' : 'ticket-holders', 'sort_id' : undefined, 'table_id' : table_data.table_id  },
		];

		return header_array;
	},

	'gallery': function() {
		return galleries.find();
	},

	'galleryData' : function() {
		var table_id = "galleries";

		var sort_query = {};

		if (Session.get(table_id + '_sort')) {
			var asc = (Session.get(table_id + '_ascending') ? 1 : -1);
		    sort_query[Session.get(table_id + '_sort')] = asc;
		}

		var gallery_array = galleries.find( {'score': {$ne : 0}}, { sort: sort_query } ).fetch();
		
		return {
			'table_data' : {
				'gallery' : gallery_array,
				'table_id' : table_id,
			}
		}
	},

	'currentTicketHolders' : function(owner_id) {
		return getCommaSeparatedValue(gallery_tickets.find({'gallery_owner': owner_id}).count());
	}
});

Template.galleryTable.events({
	'mouseover .gallery-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_id;
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_description;
		var hover_string = "level " + value + " " + description;
		setFootnote(hover_string, 4);
	},

	'click .gallery-row' : function(element) {
		var owner = $(element.target).closest('.gallery-row').data().owner;
		Router.go('/user/' + owner);	
	}
})

Template.galleryHeaderTemplate.helpers({
	'sorted' : function() {
		var table_id = this.table_id;
		return {
			'sort' : Session.get(table_id + '_sort') == this.sort_id,
			'ascending' : Session.get(table_id + '_ascending')
		}
	}
})

Template.galleryHeaderTemplate.events({
	'click th': function(element) {
		var sort = $(element.target).closest('.table-header').data('sort');
		var table_id = $(element.target).closest('.gallery-table').data('table_id');

		if (sort && Session.get(table_id + '_sort')) {
			var ascending = (Session.get(table_id + '_sort') != sort ? true : !Session.get(table_id + '_ascending'));
			Session.set(table_id + '_ascending', ascending);
			Session.set(table_id + '_sort', sort);
		}
	}
})

Template.galleries.rendered = function() {
	entry_fees = {};
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