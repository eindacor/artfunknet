var auction_house_tracker = new Tracker.Dependency;
var page_tracker = new Tracker.Dependency;
var current_section_tracker = new Tracker.Dependency;
// var locked_attributes = [];
// var standard_attributes = [];
var sorter = "expiration";
var ascending = 1;
// var rarity_filter =  {'item_data.rarity': {$in: ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};
// var exclusivity_filter = {};

// var lottery_filter = {'item_data.lottery': {$ne: null}};
// var foil_filter = {'item_data.foil': {$ne: null}};
// var seasonal_filter = {'item_data.seasonal': {$ne: null}};
// var original_filter = {'item_data.original': {$ne: null}};
// var standard_filter = {};
var items_found = 0;
var current_page = 0;
var items_per_page = 100;
var watched_auction_data = undefined;
var player_auction_data = undefined;
var current_section = "info";

var getWatchingAndWinningAuctions = function(user_id) {
	var sorter_object = {};
	sorter_object[sorter] = ascending;
	var user_object = Meteor.user();
	var winning_and_watching = user_object.profile.auction_data.winning.concat(user_object.profile.auction_data.watching);

	var filter_array = [
		{'_id': {$in: winning_and_watching}}
	];

	// var base_filter = {}
	// filter_array.push(base_filter);

	Meteor.call('getPlayerAuctions', sorter_object, filter_array, current_page * items_per_page, items_per_page, "all", function(error, result) {
		if (error)
			console.log(error.message);

		else {
			watched_auction_data = result.auction_data;
			auction_house_tracker.changed();
		}
	})
}

var getPlayerAuctions = function(user_id) {
	var sorter_object = {};
	sorter_object[sorter] = ascending;
	var user_object = Meteor.user();

	var filter_array = [
		{'seller': user_object.profile.screen_name}
	];

	// var base_filter = {}
	// filter_array.push(base_filter);

	Meteor.call('getPlayerAuctions', sorter_object, filter_array, current_page * items_per_page, items_per_page, "all", function(error, result) {
		if (error)
			console.log(error.message);

		else {
			player_auction_data = result.auction_data;
			auction_house_tracker.changed();
		}
	})
}

Template.dashboard.helpers({
	'watchedAuctionData' : function() {
		auction_house_tracker.depend();
		if (watched_auction_data == undefined) {
			getWatchingAndWinningAuctions(Meteor.userId());
			return [];
		}

		else return watched_auction_data;
	},

	'playerAuctionData' : function() {
		auction_house_tracker.depend();
		if (player_auction_data == undefined) {
			getPlayerAuctions(Meteor.userId());
			return [];
		}

		else return player_auction_data;
	},

	'refreshAuctions' : function() {
		if (Session.get("refresh_auctions")) {
			Session.set("refresh_auctions", undefined);
			var watched_auction_data = undefined;
			var player_auction_data = undefined;
			auction_house_tracker.changed();
		}
	},

	'userData' : function() {
		if (Meteor.user()) {
			var user_object = Meteor.user();

			var has_watched_auctions = user_object.profile.auction_data.winning.length > 0 || user_object.profile.auction_data.watching.length > 0;
			var has_player_auctions = auctions.findOne({'seller' : user_object.profile.screen_name}) != undefined;
			var has_auctioneer = Meteor.user().profile.market_expert.expiration > moment()._d.toISOString();

			var data_object = {
				'screen_name' : user_object.profile.screen_name,
				'bank_balance' : getCommaSeparatedValue(user_object.profile.bank_balance),
				'display_count' : items.find({'owner' : user_object._id, 'status' : 'displayed'}).count(),
				'inventory_count' : items.find({'owner' : user_object._id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}}).count(),
				'slots_available' : user_object.profile.inventory_cap + user_object.profile.expansion_slots - items.find({'owner' : user_object._id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}, 'original': {$ne: true}, 'vintage': {$ne: true}}).count(),
				'has_items': items.find({'owner' : user_object._id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}}).count(),
				'original_count' : items.find({'owner' : user_object._id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}, 'original': true}).count(),
				'vintage_items': items.find({'owner' : user_object._id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}, 'vintage': true}).count(),
				'has_watched_auctions' : has_watched_auctions,
				'has_player_auctions' : has_player_auctions,
				'has_auctions': has_watched_auctions || has_player_auctions,
				'alert_count' : alerts.find({'user_id' : user_object._id}).count(),
				'private_count' : items.find({'owner' : user_object._id, 'status' : 'permanent'}).count(),
				'display_max' : user_object.profile.display_cap,
				'inventory_max' : user_object.profile.inventory_cap,
				'expansion_slots' : user_object.profile.expansion_slots,
				'max_total' : user_object.profile.inventory_cap + user_object.profile.expansion_slots,
				'private_max' : user_object.profile.pc_cap,
				'entry_fee' : user_object.profile.entry_fee,
				'ticket_max' : user_object.profile.ticket_cap,
				'completed_quests': user_object.profile.completed_quests,
				'auctioned_items': auctions.find({'seller': user_object.profile.screen_name}).count(),
				'winning_auctions': user_object.profile.auction_data.winning.length,
				'auction_cap': Math.floor(user_object.profile.auction_cap * (has_auctioneer ? 1.5 : 1)),
				'vintage_count': user_object.profile.vintage_count
			}

			return data_object;
		}

		else return {};
	},

	'current_section': function() {
		current_section_tracker.depend();
		return current_section;
	}
})

Template.dashboard.events({
	'mouseover .ticket-button i' : function(element) {
		var owner_name = element.target.dataset.owner_name;
		var expiration_string = element.target.dataset.expiration_string;
		setFootnote("Visit gallery of " + owner_name + ". Expires " + expiration_string + ".", Math.floor(Math.random() * 100000));
	},

	'click #edit-fee' : function() {
		Modal.show('entryFeeModal');
	},

	'change #entry-fee' : function() {
		console.log($('#entry-fee').data().uiSlider.options.value);
	},

	'change .price-selector' : function() {
		var entry_fee = $('.price-selector').val();
		Meteor.call('updateEntryFee', entry_fee, function(error) {
			if (error)
				console.log(error.message);
		});
	},

	'click #toggle-details' : function() {
		Session.set('toggle_auction_details', true);
	},

	'click #refresh-auctions': function() {
		watched_auction_data = undefined;
		player_auction_data = undefined;
		auction_house_tracker.changed();
	},

	'click #vintage-mode': function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "vintageModal", 
			'modal_data': undefined
		}, $('body')[0]);
	},

	'click .dash-icon': function(event) {
		current_section = $(event.target).data().section_name;
		current_section_tracker.changed();
	}
});

Template.dashboard.rendered = function() {
	sorter = "expiration";
	ascending = 1;
	items_found = 0;
	current_page = 0;
	items_per_page = 100;
	watched_auction_data = undefined;
	player_auction_data = undefined;
	auction_house_tracker.changed();

	$('#entry-fee').slider({
		'value': Meteor.user().profile.entry_fee,
		'max': 100000,
		'min': 0,
		'change': function(event, ui) {
			Meteor.call('updateEntryFee', ui.value - (ui.value % 1000), function(error) {
				if (error)
					console.log(error.message)
			});
		}
	});

	if (Meteor.user().profile.tutorials.welcome) {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tutorialModal", 
			'modal_data': {
				'tutorial_name': "welcome",
				'next': undefined,
				'activate': "loot",
				'image_filename': "tutorial/menu_loot.png",
				'message': "Welcome to Artfunkel, an art collecting game for those poor people that can't afford to buy a Monet in real life. Let's start by getting you some paintings! Click on the 'Loot' icon in the menu."
			}
		}, $('body')[0]);
	}

	else if (Meteor.user().profile.tutorials.attributes && items.findOne({'owner': Meteor.userId(), 'status': "claimed"})) {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tutorialModal", 
			'modal_data': {
				'tutorial_name': "attributes",
				'next': {
					'tutorial_name': "xp_rating",
					'next': {
						'tutorial_name': "display",
						'next': {
							'tutorial_name': "permanent",
							'next': undefined,
							'activate': "gallery",
							'image_filename': "tutorial/permanent.png",
							'message': "You can also add an item to your permanent collection, where it will generate experience each hour based on its XP Rating. Items in your permanent collection do not attract any special visitors or make any money, so the work's rarity and value don't matter. It's meant to be a place to show works that you enjoy regardless of their stats/attributes. Try putting one of your items on Display, and add another item to your Permanent Collection.",
						},
						'activate': undefined,
						'image_filename': "tutorial/display.png",
						'message': "There are 2 ways to include your items in your gallery. One way is to Display the work, which earns you money and experience. Items on display also attract special visitors to your gallery based on that item's attributes.",
					},
					'activate': undefined,
					'image_filename': "tutorial/xp_rating.png",
					'message': "Items also have an XP Rating. This value determines how much experience you get from including it in your gallery.",
				},
				'activate': undefined,
				'image_filename': "tutorial/attributes.png",
				'message': "Each item has attributes, which are located in the lower left. When a painting is put on display, these attributes determine what kind of special visitors will come to your gallery. We'll talk more about special visitors a bit later..."
			}
		}, $('body')[0]);
	}

	else if (Meteor.user().profile.tutorials.reroll) {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tutorialModal", 
			'modal_data': {
				'tutorial_name': "reroll",
				'next': {
					'tutorial_name': "reroll_menu",
					'next': {
						'tutorial_name': "reroll_menu_2",
						'next': {
							'tutorial_name': "finished",
							'next': undefined,
							'activate': undefined,
							'image_filename': "tutorial/finished.png",
							'message': "Now that you know the basics of Artfunkel, you're free to expand your collection and build your fortune! Get new paintings by collecting your daily drop regularly, meeting special visitors, buying crates from the store, or visiting the auction house. Thanks for playing!"
						},
						'activate': undefined,
						'image_filename': "tutorial/reroll_menu3.png",
						'message': "Rerolling the attribute changes the type of bonus, and generates a new rating. Every time you reroll a value or an attribute, the 'reroll count' increases, along with the reroll cost."
					},
					'activate': undefined,
					'image_filename': "tutorial/reroll_menu2.png",
					'message': "For each attribute, you can modify the value, or the attribute itself. Rerolling the value generates a new rating at random, which could be more or less than what you started with."
				},
				'activate': undefined,
				'image_filename': "tutorial/reroll.png",
				'message': "Often times you'll want to meet specific kinds of special visitors. A good way to do this is to optimize the attributes of your own paintings to be a specific type or a higher rating."
			}
		}, $('body')[0]);
	}
}

Template.info.helpers({
	'xpData' : function() {
		Meteor.call('getXPData', Meteor.user().profile.level, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				var xp_data = result;
				var completion = (Meteor.user().profile.xp / xp_data.goal) * 100;
				var xp_object = {
					'xp_completion' : Math.floor(completion) > 100 ? 100 : Math.floor(completion),
					'xp_remaining' : getCommaSeparatedValue(xp_data.goal - Meteor.user().profile.xp),
					'current_level' : Meteor.user().profile.level,
					'current_xp' : getCommaSeparatedValue(Meteor.user().profile.xp),
					'xp_goal' : getCommaSeparatedValue(xp_data.goal),
					'tickets': Meteor.user().profile.lottery_tickets
				};

				Session.set('xp_data', xp_object);
			}
		});

		if (Session.get('xp_data'))
			return Session.get('xp_data');

		else return {
			'xp_completion' : 0,
			'xp_remaining' : 0,
			'current_level' : 0
		}
	},

	'collection_value' : function() {
		Meteor.call('getCollectionValue', Meteor.userId(), function(error, result) {
			if (error)
				console.log(error.message);

			else Session.set('collection_value', result);
		});

		if (Session.get('collection_value') !== undefined)
			return getCommaSeparatedValue(Session.get('collection_value'));

		else return "";
	},

	'display_value' : function() {
		Meteor.call('getExhibitionValue', Meteor.userId(), function(error, result) {
			if (error)
				console.log(error.message);

			else Session.set('display_value', result);
		});

		if (Session.get('display_value') !== undefined)
			return getCommaSeparatedValue(Session.get('display_value'));

		else return "";
	},

	'ticket' : function() {
		return gallery_tickets.find({'ticketholder': Meteor.userId()});
	},

	'ticketData' : function(ticket_object) {
		var gallery_object = galleries.findOne({'owner_id' : ticket_object.gallery_owner});
		if (gallery_object) {
			var unmet_npcs = npcs.findOne({'owner_id': gallery_object.owner_id, 'players_met': {$ne: Meteor.userId()}});

			if (gallery_object) {
				var displayed_object = {
					'owner_name' : gallery_object.owner,
					'owner_id' : ticket_object.gallery_owner,
					'expiration_string' : getTimeString(moment(ticket_object.expiration)),
					'unmet_npcs' : (unmet_npcs != undefined)
				}

				return displayed_object;
			}

			else return {};
		}
	},

	'max_level': function() {
		return Meteor.user().profile.level >= 50;
	},

	'tokens': function() {
		return Meteor.user().profile.xp;
	},

	'unselected': function(current_tier) {
		var tier_array = ["free", "low", "medium", "high", "outrageous"];
		tier_array.splice(tier_array.indexOf(current_tier), 1);
		return tier_array;
	},

})
