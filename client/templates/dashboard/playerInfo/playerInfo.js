var current_user_id = Meteor.userId();
display_value_tracker = new Tracker.Dependency;
var display_values;
var craft_target = 0;
var craft_type = undefined;
var revised_knowledge = undefined;
var craft_tracker = new Tracker.Dependency;

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
	},

	'click .craft-up': function(event) {
		craft_type = $(event.target).data().knowledge_type;
		craft_target++;
		craft_tracker.changed();
		revised_knowledge = getRevisedKnowledgeFromTargetValue(craft_type, craft_target, Meteor.user().profile.knowledge);
	},

	'click .craft-down': function(event) {	
		craft_target = Math.max(0, craft_target - 1);
		if (craft_target == 0) {
			craft_type = undefined;
			revised_knowledge = undefined;
		}

		else {
			craft_type = $(event.target).data().knowledge_type;
			revised_knowledge = getRevisedKnowledgeFromTargetValue(craft_type, craft_target, Meteor.user().profile.knowledge);
		}

		craft_tracker.changed();
	},

	'click #submit-conversion': function() {
		Meteor.call('convertKnowledge', craft_type, craft_target, function(error) {
			if (error)
				console.log(error)

			else {
				craft_type = undefined;
				craft_target = 0;
				revised_knowledge = undefined;
				craft_tracker.changed();
			}
		})
	},

	'click i.lottery-eligible-true': function(event) {
		Meteor.call('setPlayerSetting', "lottery_eligible", false, function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click i.lottery-eligible-false': function(event) {
		Meteor.call('setPlayerSetting', "lottery_eligible", true, function(error) {
			if (error)
				console.log(error.message);
		})
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

	'gallery_values': function() {
		var gallery_object = galleries.findOne({'owner_id': Meteor.userId()});
		try  {
			return {
				'value': gallery_object.value,
				'earnings_per_hour': gallery_object.earnings_per_hour,
				'xp_per_hour': gallery_object.xp_per_hour
			}
		}

		catch (error) { 
			return {
				'gallery_value': 0,
				'earnings_per_hour': 0,
				'xp_per_hour': 0
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
	},

	'knowledge': function() {
		craft_tracker.depend();
		var knowledge_array = [];
		var user_object = Meteor.user();
		var crafting_enabled = craft_type != undefined;
		for (var i=0; i<knowledge_types.length; i++) {
			var knowledge_type = knowledge_types[i];
			var this_type_is_crafting_target = crafting_enabled && knowledge_type == craft_type;
			knowledge_array.push({
				'color': artwork_rarities[i],
				'amount': user_object.profile.knowledge[knowledge_types[i]],
				'name': knowledge_type.replace("_", " "),
				'type': knowledge_type,
				'can_increase_craft': (!crafting_enabled || this_type_is_crafting_target) && (craft_target + 1) <= getMaxCraftable(knowledge_type, Meteor.user().profile.knowledge),
				'can_decrease_craft': (!crafting_enabled || this_type_is_crafting_target) && craft_target != 0,
				'revised_amount': revised_knowledge == undefined ? undefined : revised_knowledge[knowledge_type],
				'crafting': crafting_enabled
			})
		}

		return knowledge_array;
	},

	'crafting_enabled': function() {
		craft_tracker.depend();
		return revised_knowledge != undefined;
	},

	'visitor_ignore_proc_count': function() {
		return Meteor.user().profile.visitor_ignore_proc_count;
	},

	'visitor_ignore_coefficient': function() {
		return 1 - Meteor.user().profile.visitor_ignore_coefficient;
	},

	'forgery_contract_count': function() {
		return forgery_contracts.find({'owner_id': Meteor.userId()}).count();
	},

	'forgery_contract_cap': function() {
		return Meteor.user().profile.forgery_contract_cap;
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