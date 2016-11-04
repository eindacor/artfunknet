var auction_house_tracker = new Tracker.Dependency;
var page_tracker = new Tracker.Dependency;
var auctions = [];
var tags = [];
var locked_attributes = [];
var standard_attributes = [];
var sorter = "artwork_data.title";
var ascending = 1;
var status_filter = {'status': {$in: ['claimed', 'displayed', 'permanent', 'auctioned']}};
var rarity_filter =  {'artwork_data.rarity': {$in: ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};

var lottery_filter = {'lottery': {$ne: undefined}};
var foil_filter = {'foil': {$ne: undefined}};
var seasonal_filter = {'seasonal': {$ne: undefined}};
var original_filter = {'original': {$ne: undefined}};
var standard_filter = {};
var items_found = 0;
var current_page = 0;
var items_per_page = 10;

var auction_data = undefined;

var getAuctions = function() {
	var sorter_object = {};
	sorter_object[sorter] = ascending;

	var filter_array = [
		lottery_filter, 
		foil_filter, 
		seasonal_filter, 
		original_filter,
		standard_filter,
		status_filter,
		rarity_filter
	];

	var base_filter = {
		'owner': Meteor.userId()
	}

	if (tags.length > 0) {
		base_filter.tags = {"$in": tags};
	}

	filter_array.push(base_filter);

	Meteor.call('getPublicAuctions', {'sort': sorter_object}, {'$and': filter_array}, current_page * items_per_page, items_per_page, function(error, result) {
		if (error)
			console.log(error.message);

		else {
			auction_data = result;
			auction_house_tracker.changed();
		}
	})
}

Template.auctions.helpers({
	'auctionData' : function() {
		auction_house_tracker.depend();
		if (auction_data == undefined) {
			getAuctions();
			return [];
		}

		else return auction_data;
	},

	'refreshAuctions' : function() {
		if (Session.get("refresh_auctions")) {
			Session.set("refresh_auctions", undefined);
			auction_data = undefined;
			auction_house_tracker.changed();
		}
	}
});

Template.auctions.rendered = function() {
	auctions = [];
	getAuctions();
}