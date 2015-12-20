Template.dashboard.helpers({
	'userData' : function() {
		if (Meteor.user()) {
			var user_object = Meteor.user();
			var data_object = {
				'screen_name' : user_object.profile.screen_name,
				'bank_balance' : getCommaSeparatedValue(user_object.profile.bank_balance),
				'display_count' : items.find({'owner' : Meteor.userId(), 'status' : 'displayed'}).count(),
				'inventory_count' : items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale']}}).count(),
				'auction_count' : items.find({'owner' : Meteor.userId(), 'status' : 'auctioned'}).count(),
				'alert_count' : alerts.find({'user_id' : Meteor.userId()}).count(),
				'private_count' : items.find({'owner' : Meteor.userId(), 'status' : 'permanent'}).count(),
				'display_max' : user_object.profile.display_cap,
				'inventory_max' : user_object.profile.inventory_cap,
				'auction_max' : user_object.profile.auction_cap,
				'private_max' : user_object.profile.pc_cap,
				'entry_fee' : "$" + getCommaSeparatedValue(user_object.profile.entry_fee),
				'ticket_max' : user_object.profile.ticket_cap,
			}

			return data_object;
		}

		else return {};
	},

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
					'xp_goal' : getCommaSeparatedValue(xp_data.goal)
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
	}
});

Template.dashboard.rendered = function() {
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
				'activate': undefined,
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
