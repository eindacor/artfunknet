Template.randomDrop.helpers({
	'item_set_statuses': function() {
		return ['unclaimed', 'won'];
	},

	'dailyDropEnabled' : function() {
		if (Meteor.user()) {
			var last_drop = Meteor.user().profile.last_drop;
			return (moment(Session.get('now')) - moment(last_drop) > ONE_DAY);
		}

		else return false;
	},

	'dailyDropText' : function(enabled) {
		if (enabled)
			return "get daily drop!";

		else if (Meteor.user()) {
			var last_drop = Meteor.user().profile.last_drop;
			var remaining = ONE_DAY - (moment(Session.get('now'))  - moment(last_drop));
			return getCountdownString(remaining);
		}
	},

	'has_unclaimed' : function() {
		return items.findOne({
			'owner': Meteor.userId(),
            'status': {$in: ["unclaimed", "won"]}
		}) != undefined;
	}
})

Template.randomDrop.events ({
	'click #drop-button.enabled' :function() {
		Meteor.call('giveDailyDrop', function(error, returned_rarity) {
			if (error)
				console.log(error);

			else {
				updateItemArray();
			}
		})
	},

	'click #sell-all' : function() {
		Meteor.call('getSellAllAmount', function(error, result) {
			if (error)
				console.log(error);

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
