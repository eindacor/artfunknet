var auction_house_tracker = new Tracker.Dependency;
var page_tracker = new Tracker.Dependency;
var item_count_tracker = new Tracker.Dependency;
var search_terms = [];
var sorter = "expiration";
var ascending = 1;
var rarity_filter =  {'item_data.rarity': {$in: ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};
var exclusivity_filter = {};

var lottery_filter = {'item_data.lottery': {$ne: null}};
var foil_filter = {'item_data.foil': {$ne: null}};
var seasonal_filter = {'item_data.seasonal': {$ne: null}};
var original_filter = {'item_data.original': {$ne: null}};
var standard_filter = {};
var items_found = 0;
var current_page = 0;
var items_per_page = 10;
var quest_status = "all";
var auction_data = undefined;

var generateQueryFromSearchTerms = function() {
	if (search_terms.length == 0)
		return undefined;

	var or_array = [];

	for (var i=0; i<search_terms.length; i++) {
		var term = search_terms[i];
		var term_array = [
			{'item_data.artist': {$regex: term, $options: 'i'}},
			{'item_data.title': {$regex: term, $options: 'i'}}
		]
		or_array = or_array.concat(term_array);
	}
	var or_object = {$or: or_array};
	return or_object;
}

var getAuctions = function() {
	var sorter_object = {};
	sorter_object[sorter] = ascending;

	var filter_array = [
		lottery_filter, 
		foil_filter, 
		seasonal_filter, 
		original_filter,
		standard_filter,
		rarity_filter,
		exclusivity_filter
	];

	var base_filter = {}

	filter_array.push(base_filter);

	var search_term_query = generateQueryFromSearchTerms();
	if (search_term_query != undefined) {
		filter_array.push(search_term_query);
	}

	var current_page_before_refresh = current_page;
	if (items_found == 0 && current_page_before_refresh != 0) {
		current_page = 0;
	}

	else if (current_page_before_refresh * items_per_page >= items_found) {
		if (items_found % items_per_page == 0) {
			if (items_found == 0)
				current_page = 0;

			else current_page = Math.floor(items_found / items_per_page) - 1;
		}

		else current_page = Math.floor(items_found / items_per_page);
	}

	page_tracker.changed();

	Meteor.call('getAuctions', sorter_object, filter_array, current_page * items_per_page, items_per_page, quest_status, function(error, result) {
		if (error)
			console.log(error);

		else {
			if (auction_data == result)
				return;

			auction_data = result;
			auction_house_tracker.changed();
		}
	})
}

Template.auctions.helpers({
	'itemCount': function() {
		item_count_tracker.depend();
		var filter_array = [
			lottery_filter, 
			foil_filter, 
			seasonal_filter, 
			original_filter,
			standard_filter,
			rarity_filter,
			exclusivity_filter
		];

		var base_filter = {}
		filter_array.push(base_filter);

		Meteor.call('getAuctionCount', filter_array, quest_status, function(error, result) {
			if (error)
				console.log(error);

			else {
				items_found = result;
				getAuctions();
			}
		})
	},

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
			item_count_tracker.changed();
		}

		return true;
	},

	'current_page': function() {
		page_tracker.depend();
		return current_page + 1;
	},

	'total_pages': function() {
		page_tracker.depend();
		return Math.floor(items_found / items_per_page) + (items_found % items_per_page == 0 && items_found != 0 ? 0 : 1);
	},

	'has_auctioneer': function() {
		return Meteor.user().profile.market_expert.expiration > moment()._d.toISOString();
	}
});

Template.auctions.events({
	'keyup #search-selector': function(event) {
		var entered = $('#search-selector').val();
		search_keywords = commaSeparatedValuesToArray($('#search-selector').val());
		auction_data = undefined;
		item_count_tracker.changed();
	}, 

	'keydown #search-selector': function(event) {
		if (event.keyCode == 13) {
			$('#search-selector').blur();
			event.preventDefault();
		}
	},

	'change #sort-selector': function(event) {
		var sort_target = $(event.target).val();

		switch(sort_target) {
			case "remaining": sorter = "expiration"; break;
			case "current bid": sorter = "current_bid"; break;
			case "seller": sorter = "seller"; break;
			case "artist": sorter = "item_data.artist"; break;
			case "date": sorter = "item_data.date"; break;
			case "foil": sorter = "item_data.foil"; break;
			case "lottery": sorter = "item_data.lottery"; break;
			case "seasonal": sorter = "item_data.seasonal"; break;
			case "medium": sorter = "item_data.medium"; break;
			case "rarity": sorter = "item_data.rarity_value"; break;
			case "title": sorter = "item_data.title"; break;
			case "condition": sorter = "item_data.condition"; break;
			case "roll count": sorter = "item_data.roll_count"; break;
			case "level": sorter = "item_data.level"; break;
			default: sorter = "item_data.title"; break;
		}

		auction_data = undefined;
		item_count_tracker.changed();
	},

	'change #order-selector': function(event) {
		ascending = Number($(event.target).val());
		auction_data = undefined;
		item_count_tracker.changed();;
	}, 

	'change #card-type-checkbox': function() {
		 for (var i=0; i<$('input[type=checkbox].type-select').length; i++) {
		 	var checked = $('input[type=checkbox].type-select:eq(' + i + ')')[0].checked
		 	switch($('input[type=checkbox].type-select:eq(' + i + ')').val()) {
		 		case "standard": 		
		 			if (checked)
		 				standard_filter = {};

		 			else standard_filter = {$or: [{'item_data.foil': {$ne: false}}, {'item_data.seasonal': {$ne: false}}, {'item_data.original': {$ne: false}}, {'item_data.lottery': {$nin: [0, null, false]}}]};

		 			break;

		 		case "foil":
		 			if (checked)
		 				foil_filter = {'item_data.foil': {$ne: null}};

		 			else foil_filter = {'item_data.foil': false};

		 			break;

		 		case "seasonal":
		 			if (checked)
		 				seasonal_filter = {'item_data.seasonal': {$ne: null}};

		 			else seasonal_filter = {'item_data.seasonal': false};

		 			break;

		 		case "original":
		 			if (checked)
		 				original_filter = {'item_data.original': {$ne: null}};

		 			else original_filter = {'item_data.original': false};

		 			break;

		 		case "lottery":
		 			if (checked)
		 				lottery_filter = {'item_data.lottery': {$ne: null}};

		 			else lottery_filter = {'item_data.lottery': {$in: [0, null, false]}};

		 			break;

		 		default: break;
		 	}
		 }

		auction_data = undefined;
		item_count_tracker.changed();
	},

	'change #card-rarity-checkbox': function() {
		var valid_rarities = [];
		for (var i=0; i<$('input[type=checkbox].rarity-select').length; i++) {
		 	var checked = $('input[type=checkbox].rarity-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		valid_rarities.push($('input[type=checkbox].rarity-select:eq(' + i + ')').val())
		}

		rarity_filter = {'item_data.rarity': {$in: valid_rarities}};

		auction_data = undefined;
		item_count_tracker.changed();
	},

	'change #exclusivity-checkbox': function() {
		var valid_exclusivity = [];
		for (var i=0; i<$('input[type=checkbox].exclusivity-select').length; i++) {
		 	var checked = $('input[type=checkbox].exclusivity-select:eq(' + i + ')')[0].checked;
		 	if (checked) {
		 		var value = $('input[type=checkbox].exclusivity-select:eq(' + i + ')').val();
		 		valid_exclusivity.push(value == "public" ? "public" : Meteor.userId());
		 	}
		}

		exclusivity_filter = {'viewer': {$in: valid_exclusivity}};

		auction_data = undefined;
		item_count_tracker.changed();
	},

	'click #toggle-filters': function(element) {
		var target = $(element.target);
		if (target.hasClass('af-color')) {
			target.removeClass('af-color');
			$('.all-filters').css('display', 'none');
		}

		else {
			target.addClass('af-color');
			$('.all-filters').css('display', 'block');
		}
	},

	'click #auctions-page-right': function() {
		if (items_found > (current_page * items_per_page) + items_per_page) {
			current_page++;
			auction_data = undefined;
			item_count_tracker.changed();
		}
	},

	'click #auctions-page-left': function() {
		if (current_page > 0) {
			current_page--;
			auction_data = undefined;
			item_count_tracker.changed();
		}
	},

	'change #page-count-select': function() {
		items_per_page = Number($('#page-count-select').val());
		auction_data = undefined;
		item_count_tracker.changed();
	},

	'click input:radio[name=quest-status]': function(event) {
		quest_status = event.target.value;
		auction_data = undefined;
		item_count_tracker.changed();
	},

	'keyup #search-field': function(event) {
		search_terms = commaSeparatedValuesToArray($('#search-field').val());
		auction_data = undefined;
		item_count_tracker.changed();
	}, 

	'keydown #search-field': function(event) {
		if (event.keyCode == 13) {
			$('#tag-selector').blur();
			event.preventDefault();
		}
	},
})

Template.auctions.rendered = function() {
	sorter = "expiration";
	ascending = 1;
	rarity_filter =  {'item_data.rarity': {$in: ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};
	exclusivity_filter = {'viewer': {$in: ["public", Meteor.userId()]}};
	lottery_filter = {'item_data.lottery': {$ne: null}};
	foil_filter = {'item_data.foil': {$ne: null}};
	seasonal_filter = {'item_data.seasonal': {$ne: null}};
	original_filter = {'item_data.original': {$ne: null}};
	standard_filter = {};
	items_found = 0;
	current_page = 0;
	items_per_page = 10;
	quest_status = "all";
	auction_data = {};
	getAuctions();
	var search_terms = [];
}


// DATA USED IN myAuctions TEMPLATE BELOW

var watched_auctions = undefined;
var player_auctions = undefined;
var my_auctions_tracker = new Tracker.Dependency;

var getWatchingAndWinningAuctions = function(user_id) {
	Meteor.call('getWatchedAndWinningAuctions', function(error, result) {
		if (error)
			console.log(error);

		else {
			watched_auctions = result;
			my_auctions_tracker.changed();
		}
	})
}

var getPlayerAuctions = function(user_id) {
	Meteor.call('getPlayerAuctions', function(error, result) {
		if (error)
			console.log(error);

		else {
			player_auctions = result;
			my_auctions_tracker.changed();
		}
	})
}

Template.myAuctions.helpers({
	'watchedAuctionData' : function() {
		my_auctions_tracker.depend();
		if (watched_auctions == undefined) {
			getWatchingAndWinningAuctions(Meteor.userId());
			return [];
		}

		else return watched_auctions;
	},

	'playerAuctionData' : function() {
		my_auctions_tracker.depend();
		if (player_auctions == undefined) {
			getPlayerAuctions(Meteor.userId());
		}

		else return player_auctions;
	},

	'refreshAuctions' : function() {
		if (Session.get("refresh_auctions")) {
			Session.set("refresh_auctions", undefined);
			watched_auctions = undefined;
			player_auctions = undefined;
			my_auctions_tracker.changed();
		}
	}
})

Template.myAuctions.events({
	'click #refresh-auctions': function() {
		watched_auctions = undefined;
		player_auctions = undefined;
		my_auctions_tracker.changed();
	}
})

Template.myAuctions.rendered = function() {
	watched_auctions = undefined;
	player_auctions = undefined;
	my_auctions_tracker.changed();
}