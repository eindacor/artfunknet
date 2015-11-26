var drop_count = 6;
// var drop_frequency = 86400000 //once per day
//var drop_frequency = 60000 //once per minute
//var drop_frequency = 3600000 //once per hour
//var drop_frequency = 7200000 //once every 2 hours
var drop_frequency = 10800000 //once every 3 hours
// var drop_frequency = 1000 //once per second

Template.randomDrop.helpers({
	'drop': function() {
		return items.find({'owner': Meteor.userId(), 'status': 'unclaimed'}).fetch();
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
		var valid_rarities = ["common", "uncommon", "rare"];

		var potential_items = items.find({
			'owner': Meteor.userId(),
            'status': "unclaimed", 
            'foil': false, 
            'seasonal': false, 
            'lottery': false
        }).fetch();

        for (var i=0; i<potential_items.length; i++) {
        	if (valid_rarities.indexOf(artworks.findOne(potential_items[i].artwork_id).rarity) != -1)
        		return true;
        }

        return false;
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
};

Template.randomDrop.destroyed = function() {
	Meteor.clearInterval(this.handle);
};
