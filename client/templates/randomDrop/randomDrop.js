var drop_count = 6;
// var drop_frequency = 86400000 //once per day
//var drop_frequency = 60000 //once per minute
//var drop_frequency = 3600000 //once per hour
//var drop_frequency = 7200000 //once every 2 hours
var drop_frequency = 10800000 //once every 3 hours
// var drop_frequency = 1000 //once per second

Template.randomDrop.helpers({
	'item_set_statuses': function() {
		return ['unclaimed', 'won'];
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

	'has_unclaimed' : function() {
		return items.findOne({
			'owner': Meteor.userId(),
            'status': {$in: ["unclaimed", "won"]}
		}) != undefined;
	},

	'show_daily_drop': function() {
		var player_interface = new PlayerIF(Meteor.user());
		return !player_interface.tutorialMode();
	}
})

Template.randomDrop.events ({
	'click #drop-button.enabled' :function() {
		Meteor.call('giveDailyDrop', function(error, returned_rarity) {
			if (error)
				console.log(error.message);

			else {
				updateItemArray();
			}
		})
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
	},

	'click #donate-all' : function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "donateAllModal", 
			'modal_data': {
				'donation_reward': undefined,
				'purchase': false
			}
		}, $('body')[0]);
	},

	'click #archive-all' : function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "archiveAllModal", 
			'modal_data': {
				'donation_reward': undefined,
				'purchase': false
			}
		}, $('body')[0]);
	}
})

Template.randomDrop.rendered = function() {
	this.handle = Meteor.setInterval((function() {
		Session.set('now', moment().toISOString());
	}), 1000);
};

Template.randomDrop.destroyed = function() {
	Meteor.clearInterval(this.handle);
};
