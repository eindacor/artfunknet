var current_user_id = Meteor.userId();
display_value_tracker = new Tracker.Dependency;
var display_values;

Template.playerInfo.rendered = function() {
	display_values = undefined;
}

Template.playerInfo.events({
	'change .price-selector' : function() {
		var entry_fee = $('.price-selector').val();
		Meteor.call('updateEntryFee', entry_fee, function(error) {
			if (error)
				console.log(error.message);
		});
	},

	'click #vintage-mode': function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "vintageModal", 
			'modal_data': undefined
		}, $('body')[0]);
	}
});

Template.playerInfo.helpers({
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
			'xp_goal' : 0
		}
	},

	'user_object': function() {
		return Meteor.user()
	},

	'display_count': function() {
		return items.find({'owner' : current_user_id, 'status' : 'displayed'}).count();
	},

	'inventory_count': function() {
		return items.find({'owner' : current_user_id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}}).count();
	},

	'slots_available': function() {
		return Meteor.user().profile.inventory_cap + (Meteor.user().profile.vintage_count * 2) + Meteor.user().profile.expansion_slots - items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}, 'original': {$ne: true}, 'vintage': {$ne: true}}).count();
	},

	'original_count': function() {
		return items.find({'owner' : current_user_id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}, 'original': true}).count();
	},

	'vintage_count': function() {
		return items.find({'owner' : current_user_id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}, 'vintage': true}).count();
	},

	'permanent_count': function() {
		return items.find({'owner' : current_user_id, 'status' : 'permanent'}).count();
	},

	'max_total': function() {
		return Meteor.user().profile.inventory_cap + Meteor.user().profile.expansion_slots;
	},

	'auctioned_items': function() {
		auctions.find({'seller': Meteor.user().profile.screen_name}).count();
	},

	'auction_cap': function() {
		var has_auctioneer = Meteor.user().profile.market_expert.expiration > moment()._d.toISOString();
		Math.floor(Meteor.user().profile.auction_cap * (has_auctioneer ? 1.5 : 1))
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

	'display_values': function() {
		var gallery_object = galleries.findOne({'owner_id': Meteor.userId()});
		try  {
			return {
				'value': gallery_object.value,
				'earnings_per_hour': gallery_object.earnings_per_hour
			}
		}

		catch (error) { 
			return {
				'gallery_value': 0,
				'earnings_per_hour': 0
			}
		}
	},

	'ticket' : function() {
		return gallery_tickets.find({'ticketholder': Meteor.userId()});
	},

	'max_level': function() {
		return Meteor.user().profile.level >= 50;
	},

	'unselected': function(current_tier) {
		var tier_array = ["free", "low", "medium", "high", "outrageous"];
		tier_array.splice(tier_array.indexOf(current_tier), 1);
		return tier_array;
	},

	'npcs_met': function(quality) {
		return Meteor.user().profile.npcs_met[quality];
	},

	'npc_quality': function() {
		return ["bronze", "silver", "gold", "platinum"];
	},

	'npc_max_meetings': function(quality) {
		return npc_max_map[quality];
	}
})

Template.playerInfo.rendered = function() {
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
}