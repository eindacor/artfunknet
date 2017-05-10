var current_section_tracker = new Tracker.Dependency;
var current_section = "profile";

Template.dashboard.helpers({
	'screen_name': function() {
		return Meteor.user().profile.screen_name;
	},

	'vintage_level': function() {
		return Meteor.user().profile.vintage_count
	},

	'current_section': function() {
		current_section_tracker.depend();
		return current_section;
	},

	'setSection': function(section_name) {
		current_section = section_name;
	}
})

Template.dashboard.rendered = function() {
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
					'tutorial_name': "level",
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
