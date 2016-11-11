var checklist_tracker = new Tracker.Dependency;
var count_tracker = new Tracker.Dependency;
var page_tracker = new Tracker.Dependency;
var checklist_object = undefined;
var rarity_shown = "common";
var count_object = undefined;

var items_found = 0;
var current_page = 0;
var items_per_page = 20;

var getChecklistByRarity = function(rarity) {
	Meteor.call('getChecklistByRarity', rarity, function(error, result) {
		if (error)
			console.log(error.message)

		else {
			checklist_object = result;
			checklist_tracker.changed();
		}
	})
}

var getChecklistCounts = function(rarity) {
	Meteor.call('getChecklistCounts', rarity, function(error, result) {
		if (error)
			console.log(error.message)

		else {
			count_object = result;
			count_tracker.changed();
		}
	})
}

Template.checklist.helpers({
	'checklist_counts': function() {
		count_tracker.depend();
		if (count_object == undefined) {
			getChecklistCounts(rarity_shown);
		}

		else return count_object;
	},

	'checklist_data': function() {
		checklist_tracker.depend();
		if (checklist_object == undefined) {
			getChecklistByRarity(rarity_shown);
		}

		else return checklist_object;
	},

	'rarity': function() {
		return ['common', 'uncommon', 'rare', 'legendary', 'masterpiece'];
	},

	'artwork': function() {
		checklist_tracker.depend();
		items_found = artworks.find({'active': true, 'rarity': rarity_shown}).count();

		if (current_page * items_per_page >= items_found) {
			if (items_found % items_per_page == 0) {
				if (items_found == 0)
					current_page = 0;

				else current_page = Math.floor(items_found / items_per_page) - 1;
			}

			else current_page = Math.floor(items_found / items_per_page);
		}

		page_tracker.changed();

		return artworks.find({'active': true, 'rarity': rarity_shown}, {skip: items_per_page * current_page, limit: items_per_page, sort: {'artist': 1}});
	},

	'category': function() {
		return ['owned', 'seen', 'displayed'];
		// return ['owned', 'seen', 'displayed', 'purchased', 'sold', 'auctioned'];
	},

	'fulfilled': function(artwork_id, category) {
		try {
			checklist_tracker.depend();
			if (checklist_object == undefined) {
				return false;
			}

	  		else {
	  			var fulfilled_object = checklist_object[category][rarity_shown][artwork_id];

	  			if (fulfilled_object)
	  				return fulfilled_object;

	  			else return false;
	  		}
	  	}

	  	catch(error)
	  	{
	  		console.log(category)
	  		console.log(checklist_object[category]);
	  		console.log(checklist_object);
	  		console.log(error.message);
	  	}
	},

	'page_info': function() {
		page_tracker.depend();
		return {
			'current_page': current_page + 1,
			'total_pages': Math.ceil(items_found / items_per_page + (items_found % items_per_page == 0 && items_found != 0 ? 1 : 0))
		}
	},

	'selected': function(rarity) {
		checklist_tracker.depend();
		return rarity == rarity_shown;
	}
});

Template.checklist.events({
	'click .rarity-tab': function(element) {
		rarity_shown = $(element.target).data().rarity;
		checklist_object = undefined;
		count_object = undefined;
		getChecklistCounts(rarity_shown);
		getChecklistByRarity(rarity_shown);
	},

	'click #auctions-page-right': function() {
		if (items_found > (current_page * items_per_page) + items_per_page) {
			current_page++;
			checklist_object = undefined;
			getChecklistByRarity(rarity_shown);
		}
	},

	'click #auctions-page-left': function() {
		if (current_page > 0) {
			current_page--;
			checklist_object = undefined;
			getChecklistByRarity(rarity_shown);
		}
	},

	'click .category-row' : function(element) {
		var artwork_id = $(element.target).closest('.category-row').data('artwork_id');
		console.log(artwork_id);
		var artwork_object = artworks.findOne(artwork_id);
		console.log(artwork_object);
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "imageOnlyModal", 
			'modal_data': {
				'artwork_data': artwork_object
			}
		}, $('body')[0]);
	},
})

Template.checklist.rendered = function() {
	current_page = 0;
	checklist_object = undefined;
	count_object = undefined;
	getChecklistCounts(rarity_shown);
	getChecklistByRarity(rarity_shown);
}