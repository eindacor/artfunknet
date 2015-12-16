var drop_count = 6;
// var drop_frequency = 86400000 //once per day
//var drop_frequency = 60000 //once per minute
//var drop_frequency = 3600000 //once per hour
//var drop_frequency = 7200000 //once every 2 hours
var drop_frequency = 10800000 //once every 3 hours
// var drop_frequency = 1000 //once per second

Template.randomDrop.helpers({
	'drop': function() {
		return items.find({'owner': Meteor.userId(), 'status': 'unclaimed'});
	},

	'dailyDropEnabled' : function() {
		if (Meteor.user()) {
			var last_drop = Meteor.user().profile.last_drop;
			return (moment(Session.get('now')) - moment(last_drop) > drop_frequency);
		}

		else return false;
	},

	'dailyDropText' : function(enabled) {
		if (enabled)
			return "get daily drop!";

		else if (Meteor.user()) {
			var last_drop = Meteor.user().profile.last_drop;
			var remaining = drop_frequency - (moment(Session.get('now'))  - moment(last_drop));
			return getCountdownString(remaining);
		}
	},

	'full' : function() {
		if (Meteor.userId() && Meteor.user())
			return items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale']}}).count() >= Meteor.user().profile.inventory_cap;

		else return false;
	},

	'has_unclaimed' : function() {
		return items.find({
			'owner': Meteor.userId(),
            'status': "unclaimed", 
            'foil': false, 
            'seasonal': false, 
            'lottery': 0,
            'artwork_data.rarity': {$in: ['common', 'uncommon', 'rare']}
		}).count();
	}
})

Template.randomDrop.events ({
	'click #drop-button.enabled' :function() {
		Modal.show("dropAnimationModal");
	},

	'click #sell-all' : function() {
		Meteor.call('getSellAllAmount', function(error, result) {
			if (error)
				console.log(error.message);

			else {
				Blaze.renderWithData(Template.modalTemplate, {
					'modal_name': "sellAllModal", 
					'modal_data': {
						'sell_amount': result
					}
				}, $('body')[0]);
			}
		})
	}
})

Template.randomDrop.rendered = function() {
	this.handle = Meteor.setInterval((function() {
		Session.set('now', moment().toISOString());
	}), 1000);

	if (Meteor.user() && Meteor.user().profile.tutorials.loot) {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tutorialModal", 
			'modal_data': {
				'tutorial_name': "loot",
				'next': undefined,
				'activate': undefined,
				'image_filename': "tutorial/daily_drop.png",
				'message': "This is the loot section! Whenever you recieve new paintings, they will show up here for you to claim. If you don't claim the items within 10 minutes, they'll disappear forever. Every 3 hours you're given a few random paintings to add to your collection, called the 'daily drop'. Click the button to see your items!"
			}
		}, $('body')[0]);
	}
};

Template.randomDrop.destroyed = function() {
	Meteor.clearInterval(this.handle);
};
